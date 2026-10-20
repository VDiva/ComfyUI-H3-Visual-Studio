"""Comfy node adapter for Director's H3 3D latent upscale and condition resizing."""
from .director_latent_upscale import ensure_latent_upscale_folder, list_h3_latent_upscale_models, upscale_h3_video_latent
from .latent_streams import _streams_from_latent, _repack_av_streams

ensure_latent_upscale_folder()

class H3DirectorLatentUpscale:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required':{'samples':('LATENT',),'positive':('CONDITIONING',),'model_name':(list_h3_latent_upscale_models(),),'width':('INT',{'default':1344,'min':32,'max':4096,'step':32}),'height':('INT',{'default':736,'min':32,'max':4096,'step':32}),'source_width':('INT',{'default':864,'min':32,'max':4096,'step':32}),'source_height':('INT',{'default':480,'min':32,'max':4096,'step':32}),'enable_chunking':('BOOLEAN',{'default':False})}}
    RETURN_TYPES=('LATENT','CONDITIONING')
    RETURN_NAMES=('samples','positive')
    FUNCTION='upscale'
    CATEGORY='MiniMax H3/Visual Studio'

    def upscale(self,samples,positive,model_name,width,height,source_width,source_height,enable_chunking=False):
        import torch
        import comfy.model_management as mm
        from .director_condition_resize import resize_positive_spatial
        if width<source_width or height<source_height or any(v%32 for v in (width,height,source_width,source_height)):
            raise ValueError('H3 latent放大目标必须不小于原画布，且按32像素对齐')
        parts=list(_streams_from_latent(samples))
        video=parts[0]
        if not torch.is_tensor(video) or video.ndim!=5 or video.shape[1]!=24:
            raise ValueError('需要官方H3的24通道视频latent，不能用成片视频代替')
        mm.throw_exception_if_processing_interrupted()
        # Reserve room through ComfyUI before the upstream fp32 network is staged.
        device=mm.get_torch_device()
        mm.free_memory(2*1024**3+video.numel()*4*32,device)
        lifted=upscale_h3_video_latent({'samples':video},target_width=width,target_height=height,source_width=source_width,source_height=source_height,model_name=model_name,enable_latent_chunking=enable_chunking)['samples']
        mm.throw_exception_if_processing_interrupted()
        resized=resize_positive_spatial(positive,video.shape[-2],video.shape[-1],lifted.shape[-2],lifted.shape[-1])
        parts[0]=lifted
        result=dict(samples)
        result['samples']=_repack_av_streams(parts,samples)
        result.pop('noise_mask',None)
        return (result,resized)
