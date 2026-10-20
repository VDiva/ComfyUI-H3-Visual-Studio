"""Sequential frame SR using ComfyUI's installed image upscaler; no silent fallback."""
class H3PreserveImages:
    @classmethod
    def INPUT_TYPES(cls): return {"required":{"images":("IMAGE",),"saved_video":("VIDEO",)}}
    RETURN_TYPES=("IMAGE",)
    FUNCTION="keep"
    CATEGORY="MiniMax H3/Visual Studio"
    def keep(self,images,saved_video): return (images,)

class H3PreserveLatent:
    @classmethod
    def INPUT_TYPES(cls): return {"required":{"samples":("LATENT",),"saved_video":("VIDEO",)}}
    RETURN_TYPES=("LATENT",)
    FUNCTION="keep"
    CATEGORY="MiniMax H3/Visual Studio"
    def keep(self,samples,saved_video): return (samples,)

class H3FrameUpscale:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required":{"images":("IMAGE",),"upscale_model":("UPSCALE_MODEL",),"width":("INT",{"default":1344,"min":32,"max":4096,"step":32}),"height":("INT",{"default":736,"min":32,"max":4096,"step":32})},"optional":{"megapixels":("FLOAT",{"default":0,"min":0,"max":2,"step":0.1})}}
    RETURN_TYPES=("IMAGE",)
    FUNCTION="upscale"
    CATEGORY="MiniMax H3/Visual Studio"
    def upscale(self, images, upscale_model, width, height, megapixels=0):
        import torch
        import comfy.utils
        import comfy.model_management
        from comfy_extras.nodes_upscale_model import ImageUpscaleWithModel
        if megapixels:
            import math
            if not math.isfinite(megapixels) or not 0.1<=megapixels<=2 or abs(megapixels*10-round(megapixels*10))>1e-7: raise ValueError("无效的超分目标MP")
            ratio=images.shape[2]/images.shape[1]
            width=max(32,round(math.sqrt(megapixels*1e6*ratio)/32)*32)
            height=max(32,round(math.sqrt(megapixels*1e6/ratio)/32)*32)
            if width<images.shape[2] or height<images.shape[1]: raise ValueError("目标小于原视频，请提高目标MP")
        if not len(images) or width%32 or height%32 or width<32 or height<32 or width>4096 or height>4096:
            raise ValueError("无效的超分目标尺寸或空视频")
        import time
        from server import PromptServer
        from comfy_execution.utils import get_executing_context
        context=get_executing_context()
        started=time.monotonic()
        def report_frames(done):
            if context is not None:
                PromptServer.instance.send_sync("h3_frame_progress", {"prompt_id":context.prompt_id,"node":context.node_id,"value":done,"max":len(images),"elapsed":time.monotonic()-started})
        result=[]
        report_frames(0)
        node=ImageUpscaleWithModel()
        for i in range(len(images)):
            comfy.model_management.throw_exception_if_processing_interrupted()
            value=node.upscale(upscale_model, images[i:i+1])
            value=value.args[0] if hasattr(value,"args") else value[0]
            value=comfy.utils.common_upscale(value.movedim(-1,1),width,height,"lanczos","disabled").movedim(1,-1)
            result.append(value.clamp(0,1).cpu())
            report_frames(i+1)
        return (torch.cat(result,dim=0),)
