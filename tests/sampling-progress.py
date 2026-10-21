"""Exercise real sampler callback wiring without GPU or model downloads."""
import importlib.util,sys,types
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('core',Path(__file__).resolve().parents[1]/'director_core/director/core_sampling.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
inner=[];events=[]
class Guider:
 def sample(self,noise,latent,sampler,sigmas,**kwargs):
  for step in range(len(sigmas)-1):kwargs['callback'](step,None,None,len(sigmas)-1)
  return latent
guider=Guider();original=guider.sample
class Basic:
 @staticmethod
 def execute(*args):return (guider,)
class Value:
 @staticmethod
 def execute(*args):return (object(),)
class Sampler:
 @staticmethod
 def execute(noise,guide,sampler,sigmas,latent):
  return (guide.sample(noise,latent,sampler,sigmas,callback=lambda *args:inner.append(args[0])),)
custom=types.ModuleType('comfy_extras.nodes_custom_sampler')
for name,value in dict(BasicGuider=Basic,CFGGuider=Basic,BasicScheduler=Value,KSamplerSelect=Value,RandomNoise=Value,SamplerCustomAdvanced=Sampler).items():setattr(custom,name,value)
torch=types.SimpleNamespace(is_tensor=lambda _:False,tensor=lambda x,**kw:x,float32=object())
h3=types.SimpleNamespace(MiniMaxH3SigmaShift=Value)
with patch.dict(sys.modules,{'torch':torch,'comfy_extras':types.ModuleType('comfy_extras'),'comfy_extras.nodes_custom_sampler':custom,'comfy_extras.nodes_minimax_h3':h3}):
 out=core.sample_single_stage(model=object(),positive=[],negative=[],latent={'samples':'unchanged'},seed=1,cfg=1,steps=4,sampler_name='euler',scheduler='beta',sigmas=[1,.75,.5,.25,0],apply_shift=False,on_phase=lambda phase,value:events.append((phase,value)))
assert events==[('sample',0),('sample',.25),('sample',.5),('sample',.75),('sample',1),('sample',1)],events
assert inner==[0,1,2,3] and guider.sample==original and out=={'samples':'unchanged'}
print('PASS actual step callbacks without previews, original callback preserved, sampler restored and unchanged result')
