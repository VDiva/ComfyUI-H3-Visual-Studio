"""CPU-only schedule/grid validation, without claiming inference coverage."""
import sys,types,importlib
from pathlib import Path
pkg=types.ModuleType('selftest');pkg.__path__=[str(Path(__file__).resolve().parents[1])];sys.modules['selftest']=pkg
vendor=types.ModuleType('selftest.director_latent_upscale');vendor.list_h3_latent_upscale_models=lambda:['model.safetensors'];sys.modules[vendor.__name__]=vendor
m=importlib.import_module('selftest.selflift')
assert m.split_steps(8,2)==6
assert m.split_steps(4,2)==2
assert m.low_canvas(1344,736,0.65)==(864,480)
for args in [(1,1),(8,8),(8,0)]:
 try:m.split_steps(*args);raise AssertionError('bad split accepted')
 except ValueError:pass
for scale in [0,1,float('nan')]:
 try:m.low_canvas(1344,736,scale);raise AssertionError('bad scale accepted')
 except ValueError:pass
assert 'model_name' in m.H3SelfLiftSampler.INPUT_TYPES()['required']
print('PASS SelfLift grid, sigma split invariants, invalid settings and node schema (GPU inference not tested)')
