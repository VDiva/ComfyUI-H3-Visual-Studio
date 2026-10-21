"""H3 progressive Euler sampling. Low prefix -> clean-latent lift -> high tail.
Transition follows the Director SelfLift approach (Apache-2.0):
https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director/tree/main/director/selflift
Independent adapter for this plugin; no dependency on the Director installation.
"""
import math
from .director_latent_upscale import list_h3_latent_upscale_models

def split_steps(steps, high_steps):
    if not isinstance(high_steps,int) or steps<2 or not 1<=high_steps<steps:
        raise ValueError("SelfLift高清步数需大于0且小于总步数")
    return steps-high_steps

def low_canvas(width,height,scale):
    if not math.isfinite(scale) or not 0.25<=scale<1: raise ValueError("SelfLift低清宽高比例需为0.25—0.95")
    low_w=max(32,round(width*scale/32)*32);low_h=max(32,round(height*scale/32)*32)
    if low_w>=width or low_h>=height: raise ValueError("SelfLift低清画布需小于目标画布")
    return low_w,low_h

class H3SelfLiftSampler:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required":{"model":("MODEL",),"positive":("CONDITIONING",),"noise":("NOISE",),"sigmas":("SIGMAS",),"latent_image":("LATENT",),"model_name":(list_h3_latent_upscale_models(),),"width":("INT",{"default":1344,"min":64,"max":4096,"step":32}),"height":("INT",{"default":736,"min":64,"max":4096,"step":32}),"low_scale":("FLOAT",{"default":0.65,"min":0.25,"max":0.95,"step":0.05}),"high_steps":("INT",{"default":2,"min":1,"max":99}),"chunking":("BOOLEAN",{"default":True})}}
    RETURN_TYPES=("LATENT","LATENT")
    RETURN_NAMES=("output","denoised_output")
    FUNCTION="sample"
    CATEGORY="MiniMax H3/Visual Studio"

    def sample(self,model,positive,noise,sigmas,latent_image,model_name,width,height,low_scale,high_steps,chunking):
        import torch
        import comfy.samplers, comfy.sample, comfy.utils, comfy.model_management as mm
        import latent_preview
        from .director_condition_resize import resize_av_video,resize_positive_spatial
        from .director_latent_upscale import upscale_h3_video_latent
        from .latent_streams import _streams_from_latent,_repack_av_streams
        steps=len(sigmas)-1;k=split_steps(steps,high_steps)
        low_w,low_h=low_canvas(width,height,low_scale)
        if any(v%32 for v in (width,height)): raise ValueError("目标宽高需按32像素对齐")
        if latent_image.get("noise_mask") is not None: raise ValueError("当前SelfLift不支持带noise_mask的局部重绘或续接latent")
        parts=list(_streams_from_latent(latent_image));video=parts[0]
        if not torch.is_tensor(video) or video.ndim!=5 or video.shape[1]!=24 or tuple(video.shape[-2:])!=(height//16,width//16): raise ValueError("SelfLift需要目标画布大小的H3 24通道视频latent")
        if not bool(torch.isfinite(sigmas).all()) or not bool((sigmas[:-1]>=sigmas[1:]).all()) or float(sigmas[k])<=0 or float(sigmas[-1])!=0: raise ValueError("SelfLift需要递减且切点非零的SIGMAS")
        low=resize_av_video(latent_image,low_h//16,low_w//16,"bilinear")
        low_positive=resize_positive_spatial(positive,height//16,width//16,low_h//16,low_w//16,"bilinear")
        def guider(cond):
            g=comfy.samplers.CFGGuider(model);g.inner_set_conds({"positive":cond});g.set_cfg(1.0);return g
        sampler=comfy.samplers.sampler_object("euler")
        captured={};low_preview=latent_preview.prepare_callback(model,k)
        def callback(step,x0,x,total):
            captured.update(x0=x0,x=x)
            low_preview(step,x0,x,total)
        mm.throw_exception_if_processing_interrupted()
        guider(low_positive).sample(noise.generate_noise(low),low["samples"],sampler,sigmas[:k+1],callback=callback,disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,seed=noise.seed)
        if "x0" not in captured: raise RuntimeError("SelfLift未收到低清采样状态，停止执行")
        def unpack(value,template):
            if getattr(value,"is_nested",False):return list(value.unbind())
            templates=list(_streams_from_latent(template))
            if len(templates)>1:return list(comfy.utils.unpack_latents(value,[p.shape for p in templates]))
            return [value]
        x0=unpack(captured["x0"],low);state=unpack(captured["x"],low)
        if len(x0)!=len(parts) or len(state)!=len(parts):raise RuntimeError("SelfLift音视频状态数量不匹配")
        # Upscaler operates on storage/VAE-space clean video, not noisy sample state.
        fmt=model.get_model_object("latent_format")
        clean=fmt.process_out(x0[0].float()).to(x0[0])
        mm.free_memory(2*1024**3+clean.numel()*4*32,mm.get_torch_device())
        lifted=upscale_h3_video_latent({"samples":clean},target_width=width,target_height=height,source_width=low_w,source_height=low_h,model_name=model_name,enable_latent_chunking=chunking)["samples"]
        clean_high=fmt.process_in(lifted.float()).to(x0[0])
        sampling=model.get_model_object("model_sampling");previous=sigmas[k-1];current=sigmas[k]
        video_noise=comfy.sample.prepare_noise(clean_high,(int(noise.seed)+1)%(1<<64),latent_image.get("batch_index")).to(clean_high)
        high_state=sampling.noise_scaling(previous.to(clean_high.device),video_noise,clean_high)
        def euler(x,denoised):return x+(x-denoised.to(x))*((current-previous)/previous).to(x)
        transitioned=[euler(high_state,clean_high)]+[euler(x,d) for x,d in zip(state[1:],x0[1:])]
        resume=[sampling.inverse_noise_scaling(current.to(p.device),p) for p in transitioned]
        packed=_repack_av_streams(resume,latent_image)
        resume_storage=model.model.process_latent_out(packed)
        high=dict(latent_image);high["samples"]=resume_storage
        del captured,low,x0,state,clean,lifted,clean_high,video_noise,transitioned,resume,packed
        mm.throw_exception_if_processing_interrupted()
        high_guide=guider(positive);high_x0={};high_callback=latent_preview.prepare_callback(model,high_steps,high_x0)
        output=high_guide.sample(_repack_av_streams([torch.zeros_like(p) for p in _streams_from_latent(high)],high),high["samples"],sampler,sigmas[k:],callback=high_callback,disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,seed=noise.seed)
        if not all(bool(torch.isfinite(p).all()) for p in _streams_from_latent({"samples":output})): raise RuntimeError("SelfLift输出出现非有限数值，请关闭渐进一采或调整参数后重试")
        result=dict(latent_image);result["samples"]=output.to(mm.intermediate_device())
        # Full remaining schedule ends at zero; output is the final clean latent.
        return result,result.copy()
