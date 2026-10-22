import importlib.util, pathlib, sys, types, json, ast
spec=importlib.util.spec_from_file_location('dialogue_audio',pathlib.Path(__file__).resolve().parents[1]/'dialogue_audio.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Wave:
 def __init__(self,n):self.shape=(1,1,n)
audio={'waveform':Wave(32000),'sample_rate':32000}
rows=[{'speaker':'S3','start':.6,'end':2}]
events=m.validate_events(rows,{'audio_0':audio});assert events[0]['start_frame']==14
for timeline,clips in [([{'start':0,'end':.5}],{'audio_0':audio}),([{'start':float('nan'),'end':2}],{'audio_0':audio}),(rows,{})]:
 try:m.validate_events(timeline,clips)
 except ValueError:pass
 else:raise AssertionError('invalid audio accepted')
class Output:
 def __init__(self,*args):self.args=args
calls=[]
class Lock:
 @classmethod
 def execute(cls,**kw):calls.append(('lock',kw));return Output({'locked':True},audio,'manifest')
class Final:
 @classmethod
 def execute(cls,**kw):calls.append(('final',kw));return Output('approved-waveform')
class Guide:
 @classmethod
 def execute(cls,**kw):calls.append(('guide',kw));return Output(kw['positive']+['guided'])
sys.modules['nodes']=types.SimpleNamespace(NODE_CLASS_MAPPINGS={'MiniMaxH3DialogueAudioLock':Lock,'MiniMaxH3DialogueAudioFinalize':Final})
sys.modules['comfy_extras']=types.ModuleType('comfy_extras');sys.modules['comfy_extras.nodes_minimax_h3']=types.SimpleNamespace(MiniMaxH3AddGuide=Guide)
assert m.apply_dialogue_lock(['base'],{'raw':1})==(['base'],{'raw':1});assert m.finalize_dialogue('generated')=='generated'
token=m.DIALOGUE_CONTEXT.set({'events':events,'audio_vae':'vae'})
try:
 for _ in range(2):
  p,z=m.apply_dialogue_lock(['base'],{'raw':1});assert z['locked'];assert p==['base','guided'];assert m.finalize_dialogue('generated')=='approved-waveform'
finally:m.DIALOGUE_CONTEXT.reset(token)
assert [c[0] for c in calls].count('lock')==2;assert m.finalize_dialogue('next-job')=='next-job'
for _,kw in [c for c in calls if c[0]=='lock']:assert kw['overflow_policy']=='error' and kw['mix_policy']=='prevent_clipping'
root=pathlib.Path(__file__).resolve().parents[1]
for name in ['dialogue_audio.py','director_bridge.py','__init__.py','director_core/director/core_sampling.py','director_core/director/executor_core.py']:ast.parse((root/name).read_text(encoding='utf8'))
assert 'apply_dialogue_lock(positive, latent)' in (root/'director_core/director/core_sampling.py').read_text(encoding='utf8')
assert 'audio = finalize_dialogue(audio)' in (root/'director_core/director/executor_core.py').read_text(encoding='utf8')
print('PASS duration guard, 24fps positioning, re-lock each pass, event guide, final approved waveform, context isolation and Python syntax')
