"""CPU-only contract tests. TinyTensor is a test double, not GPU validation."""
from array import array
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('director_performance_tested', ROOT/'director/performance.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class TinyTensor:
    def __init__(self, values, shape=None, device='cpu'):
        self.values=list(values); self.shape=tuple(shape or (len(self.values),)); self.device=device; self.dtype='float32'
    def __len__(self): return len(self.values)
    def detach(self): return self
    def contiguous(self): return self
    def cpu(self): return self.to(device='cpu')
    def view(self, dtype): return self
    def numpy(self): return array('d', self.values)
    def clone(self): return TinyTensor(self.values, self.shape, self.device)
    def to(self, device='cpu', copy=False): return TinyTensor(self.values,self.shape,device)
    def numel(self): return len(self.values)
    def element_size(self): return 8
    def reshape(self,*shape): return self
    def flatten(self): return self
    def float(self): return self
    def __getitem__(self,key):
        v=self.values[key]; return TinyTensor(v if isinstance(key,slice) else [v])
    def __sub__(self,other): return TinyTensor([a-b for a,b in zip(self.values,other.values)])
    def abs(self): return TinyTensor([abs(v) for v in self.values])
    def mean(self): return TinyTensor([sum(self.values)/len(self.values)])
    def div(self,other): return TinyTensor([v/other.values[0] for v in self.values])
    def clamp_min(self,v): return TinyTensor([max(x,v) for x in self.values])
    def item(self): return self.values[0]

TORCH = types.SimpleNamespace(is_tensor=lambda t:isinstance(t,TinyTensor),uint8='uint8')

class PerformanceTests(unittest.TestCase):
    def test_lru_bound_and_recency(self):
        c=p.ByteLRU(10); c.put('a','a',4); c.put('b','b',4); c.get('a'); c.put('c','c',4)
        self.assertIsNone(c.get('b')); self.assertEqual(c.get('a'),'a'); self.assertEqual(c.used,8)
        c.put('large','large',11); self.assertEqual(c.used,8)
        c.clear(); self.assertEqual(c.used,0)

    def test_defaults_and_invalid_values(self):
        self.assertEqual(p.normalize_config()['model_residency'],'legacy')
        c=p.normalize_config({'model_residency':'garbage','reference_encode_cache_mb':float('inf'),'motion_cache_threshold':float('nan'),'motion_cache':'false'})
        self.assertEqual(c['model_residency'],'legacy'); self.assertEqual(c['reference_encode_cache_mb'],0)
        self.assertFalse(c['motion_cache']); self.assertEqual(c['motion_cache_threshold'],.02)

    def test_cache_fingerprint_only_result_settings(self):
        self.assertEqual(p.result_fingerprint({'model_residency':'keep','reference_encode_cache_mb':512}),{})
        self.assertNotEqual(p.result_fingerprint({'attention_backend':'sage'}),{})
        self.assertIn('motion_cache_version',p.result_fingerprint({'motion_cache':True}))

    def test_policy_is_scoped(self):
        self.assertEqual(p.between_segment_policy(True),(True,True))
        for key,expected in [('cache',(True,False)),('keep',(False,False)),('unload',(True,True))]:
            token=p._CURRENT.set(p.PerformanceState({'model_residency':key}))
            try:self.assertEqual(p.between_segment_policy(False),expected)
            finally:p._CURRENT.reset(token)

    def test_execution_releases_cache_and_context_on_exception(self):
        states=[]
        @p.performance_execution
        def fail(plan,**kwargs):
            state=p.current_performance(); states.append(state); state.encodes.put('a','value',1)
            raise RuntimeError('test failure')
        with self.assertRaisesRegex(RuntimeError,'test failure'):
            fail(types.SimpleNamespace(),runtime_performance={'reference_encode_cache_mb':1})
        self.assertIsNone(p.current_performance()); self.assertEqual(states[0].encodes.used,0)

    def test_report_and_resident_clone_lifetime(self):
        clone=object(); model=types.SimpleNamespace(); plan=types.SimpleNamespace()
        @p.performance_execution
        def run(plan,**kwargs):
            p.current_performance().retained_patchers.extend([clone,clone])
            return (1,2,3,'report',5)
        out=run(plan,model=model,runtime_performance={'model_residency':'cache'})
        self.assertIn('Performance:',out[3]); self.assertEqual(out[4],5)
        self.assertEqual(model._director_resident_patchers,[clone]); self.assertIsNone(p.current_performance())

    def test_encode_content_key_and_mutation_isolation(self):
        class VAE:
            def __init__(self):self.calls=0
            def encode(self,x):self.calls+=1; return TinyTensor([v*2 for v in x.values])
        with patch.dict(sys.modules,{'torch':TORCH}):
            vae=VAE(); state=p.PerformanceState({'reference_encode_cache_mb':1}); proxy=state.vae(vae)
            x=TinyTensor([1,2]); out=proxy.encode(x); out.values[0]=999
            hit=proxy.encode(TinyTensor([1,2])); self.assertEqual(hit.values,[2,4]); hit.values[0]=555
            self.assertEqual(proxy.encode(x).values,[2,4]); self.assertEqual(vae.calls,1)
            x.values[0]=3; proxy.encode(x); self.assertEqual(vae.calls,2)
            proxy.encode(TinyTensor([3,2],shape=(1,2))); self.assertEqual(vae.calls,3)
            self.assertEqual(state.encode_hits,2)
            self.assertIs(state.vae(vae),proxy)

    def test_explicit_backend_clones_and_auto_falls_back(self):
        class Model:
            def clone(self):return Model()
            def set_model_optimized_attention(self,function):self.function=function
        attention=types.SimpleNamespace(get_attention_function=lambda key,default: 'sage-fn' if key=='sage' else None)
        modules={'comfy':types.ModuleType('comfy'),'comfy.ldm':types.ModuleType('comfy.ldm'),'comfy.ldm.modules':types.ModuleType('comfy.ldm.modules')}
        modules['comfy.ldm.modules'].attention=attention
        with patch.dict(sys.modules,modules):
            original=Model(); state=p.PerformanceState({'attention_backend':'auto'}); patched=state.attention(original)
            self.assertIsNot(patched,original); self.assertEqual(patched.function,'sage-fn'); self.assertFalse(hasattr(original,'function'))
            self.assertIs(state.attention(original),patched)
            missing=p.PerformanceState({'attention_backend':'flash'}); self.assertIs(missing.attention(original),original)

    def test_motion_warmup_end_and_no_consecutive_reuse(self):
        with patch.dict(sys.modules,{'torch':TORCH}):
            reuse=p.MotionReuse(10,.02); calls=[]
            def execute(x,t,c,*a,**k):calls.append(t.item()); return [s.clone() for s in x]
            for i in range(10): reuse(execute,[TinyTensor([1]*32),TinyTensor([2]*32)],TinyTensor([1000-i*50]),TinyTensor([1]))
            self.assertEqual(reuse.skipped,2); self.assertEqual(len(calls),8)
            self.assertEqual(calls[:4],[1000,950,900,850]); self.assertEqual(calls[-2:],[600,550])
            reuse.clear(); self.assertIsNone(reuse.velocity)

    def test_motion_large_change_and_repeated_sigma_never_reuse(self):
        with patch.dict(sys.modules,{'torch':TORCH}):
            reuse=p.MotionReuse(12,.02); calls=[]
            def execute(x,t,c,*a,**k): calls.append(1); return [s.clone() for s in x]
            for i in range(12): reuse(execute,[TinyTensor([2**i]*32),TinyTensor([2**i]*32)],TinyTensor([100]),TinyTensor([1]))
            self.assertEqual(reuse.skipped,0); self.assertEqual(len(calls),12)

    def test_motion_guard_short_cfg_and_stage(self):
        state=p.PerformanceState({'motion_cache':True}); token=p._CURRENT.set(state)
        try:
            model=object()
            for allowed,steps,cfg in [(True,4,1),(False,20,1),(True,20,2)]:
                result,cache=p.install_motion_reuse(model,allowed=allowed,steps=steps,cfg=cfg,negative=[],sampler_name='euler')
                self.assertIs(result,model); self.assertIsNone(cache)
        finally:p._CURRENT.reset(token)

    def test_real_cleanup_function_respects_policy_but_forced_unload_wins(self):
        package=types.ModuleType('perf_fixture'); package.__path__=[str(ROOT/'director')]
        calls=[]
        mm=types.ModuleType('comfy.model_management')
        mm.current_loaded_models=[]
        for name in ('cleanup_models_gc','unload_all_models','cleanup_models','soft_empty_cache'):
            setattr(mm,name,lambda name=name:calls.append(name))
        comfy=types.ModuleType('comfy'); comfy.model_management=mm
        mods={'perf_fixture':package,'perf_fixture.performance':p,'comfy':comfy,'comfy.model_management':mm}
        with patch.dict(sys.modules,mods):
            spec=importlib.util.spec_from_file_location('perf_fixture.vram_cleanup',ROOT/'director/vram_cleanup.py')
            cleanup=importlib.util.module_from_spec(spec); spec.loader.exec_module(cleanup)
            state=p.PerformanceState({'model_residency':'cache'}); token=p._CURRENT.set(state)
            try:
                cleanup.cleanup_segment_vram(between_segments=True)
                self.assertNotIn('unload_all_models',calls)
                self.assertIn('soft_empty_cache',calls)
                calls.clear(); cleanup.cleanup_segment_vram(unload_models=True)
                self.assertIn('unload_all_models',calls)
                calls.clear(); state.config['model_residency']='keep'
                cleanup.cleanup_segment_vram(between_segments=True)
                self.assertEqual(calls,[])
            finally:p._CURRENT.reset(token)

    def test_sampling_bridge_uses_model_clone_and_preserves_output(self):
        package=types.ModuleType('sampling_fixture'); package.__path__=[str(ROOT/'director')]
        class Model:
            def __init__(self):self.wrappers=[]
            def clone(self):
                clone=Model(); clone.__dict__.update(self.__dict__); clone.wrappers=list(self.wrappers); return clone
            def set_model_optimized_attention(self,fn):self.attention=fn
            def add_wrapper_with_key(self,*args):self.wrappers.append(args)
        class Shift:
            @staticmethod
            def execute(model,*args):return (model.clone(),)
        class Guider:
            @staticmethod
            def execute(model,*args):return (types.SimpleNamespace(model=model),)
        seen=[]
        class Sampler:
            @staticmethod
            def execute(noise,guider,sampler,sigmas,latent):seen.append(guider.model); return (latent,)
        class Select:
            @staticmethod
            def execute(*args):return (object(),)
        nodes=types.ModuleType('comfy_extras.nodes_custom_sampler')
        for name,value in dict(BasicGuider=Guider,CFGGuider=Guider,BasicScheduler=Select,KSamplerSelect=Select,RandomNoise=Select,SamplerCustomAdvanced=Sampler).items():setattr(nodes,name,value)
        h3=types.ModuleType('comfy_extras.nodes_minimax_h3'); h3.MiniMaxH3SigmaShift=Shift
        attention=types.SimpleNamespace(get_attention_function=lambda key,default:'sage-fn')
        modules={'sampling_fixture':package,'sampling_fixture.performance':p,'torch':TORCH,'comfy_extras':types.ModuleType('comfy_extras'),'comfy_extras.nodes_custom_sampler':nodes,'comfy_extras.nodes_minimax_h3':h3,'comfy':types.ModuleType('comfy'),'comfy.ldm':types.ModuleType('comfy.ldm'),'comfy.ldm.modules':types.ModuleType('comfy.ldm.modules'),'comfy.patcher_extension':types.ModuleType('comfy.patcher_extension')}
        modules['comfy.ldm.modules'].attention=attention
        modules['comfy.patcher_extension'].WrappersMP=types.SimpleNamespace(DIFFUSION_MODEL='diffusion_model')
        with patch.dict(sys.modules,modules):
            spec=importlib.util.spec_from_file_location('sampling_fixture.core_sampling',ROOT/'director/core_sampling.py')
            core=importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
            state=p.PerformanceState({'attention_backend':'auto','model_residency':'cache','motion_cache':True}); token=p._CURRENT.set(state)
            try:
                original=Model(); latent={'samples':'unchanged'}
                result=core.sample_single_stage(model=original,positive=[],negative=[],latent=latent,seed=1,cfg=1,steps=10,sampler_name='euler',scheduler='simple',sigmas=TinyTensor(range(11)),allow_motion_cache=True)
                self.assertIs(result,latent); self.assertFalse(hasattr(original,'attention')); self.assertEqual(original.wrappers,[])
                self.assertEqual(seen[0].attention,'sage-fn'); self.assertEqual(len(seen[0].wrappers),1)
                self.assertIsNone(seen[0].wrappers[0][2].velocity)
                self.assertIn(seen[0],state.retained_patchers)
            finally:p._CURRENT.reset(token)

if __name__=='__main__':unittest.main()
