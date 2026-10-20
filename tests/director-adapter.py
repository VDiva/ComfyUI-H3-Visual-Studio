"""Contract checks without GPU: actual adapter, mocked tensor/network boundary."""
import importlib, sys, types
from pathlib import Path
root=Path(__file__).resolve().parents[1]
pkg=types.ModuleType('h3test');pkg.__path__=[str(root)];sys.modules['h3test']=pkg
class Tensor:
    def __init__(self,shape): self.shape=shape;self.ndim=len(shape)
    def numel(self): return 100
torch=types.ModuleType('torch');torch.is_tensor=lambda x:isinstance(x,Tensor);sys.modules['torch']=torch
calls=[]
mm=types.ModuleType('comfy.model_management');mm.throw_exception_if_processing_interrupted=lambda:None;mm.get_torch_device=lambda:'cpu';mm.free_memory=lambda *a:calls.append(('memory',a))
comfy=types.ModuleType('comfy');comfy.__path__=[];comfy.model_management=mm;sys.modules['comfy']=comfy;sys.modules['comfy.model_management']=mm
class Nested:
    is_nested=True
    def __init__(self,parts):self.parts=parts
    def unbind(self):return self.parts
nt=types.ModuleType('comfy.nested_tensor');nt.NestedTensor=Nested;sys.modules['comfy.nested_tensor']=nt
vendor=types.ModuleType('h3test.director_latent_upscale');vendor.ensure_latent_upscale_folder=lambda:None;vendor.list_h3_latent_upscale_models=lambda:['test.safetensors']
def lift(video,**kw):
    calls.append(('lift',kw));return {'samples':Tensor((1,24,5,46,84))}
vendor.upscale_h3_video_latent=lift;sys.modules[vendor.__name__]=vendor
cond=types.ModuleType('h3test.director_condition_resize')
cond.resize_positive_spatial=lambda positive,*dims:('resized',positive,dims)
sys.modules[cond.__name__]=cond
adapter=importlib.import_module('h3test.latent_upscale').H3DirectorLatentUpscale()
audio=object();video=Tensor((1,24,5,30,54));original={'samples':Nested((video,audio)),'noise_mask':'old','metadata':'keep'}
out,positive=adapter.upscale(original,['positive'],'test.safetensors',1344,736,864,480,True)
assert out['samples'].parts[1] is audio
assert original['samples'].parts[0] is video and original['noise_mask']=='old'
assert out['metadata']=='keep' and 'noise_mask' not in out
assert positive==('resized',['positive'],(30,54,46,84))
assert calls[-1][1]['enable_latent_chunking'] is True
assert calls[-1][1]['model_name']=='test.safetensors'
try:adapter.upscale(original,[],'test.safetensors',608,320,864,480)
except ValueError:pass
else:raise AssertionError('downscale accepted')
for name in ['director_latent_upscale.py','director_condition_resize.py','latent_upscale.py','latent_streams.py','__init__.py']:
    compile((root/name).read_text(encoding='utf-8-sig'),name,'exec')
print('PASS actual adapter AV/audio preservation, resized conditions, chunking, size guard and Python syntax; GPU inference not exercised')
