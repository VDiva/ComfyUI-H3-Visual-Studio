from pathlib import Path
import ast,asyncio,hashlib,importlib.util,io,json,tempfile,types,urllib.error
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_test',root/'model_download.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
content=b'verified';digest=hashlib.sha256(content).hexdigest()
model={'key':'models/vae/test','name':'test','category':'vae','url':'https://huggingface.co/o/r/resolve/main/test','size':None}
metadata=json.dumps({'sha':'pinned','siblings':[{'rfilename':'test','size':len(content),'lfs':{'sha256':digest}}]}).encode()
for mode in ['official','xiangongyun']:
 for failure in [None,'network','hash','metadata']:
  with tempfile.TemporaryDirectory() as temp:
   calls=[]
   def request(source,req,timeout):
    calls.append(source)
    if failure=='network':raise urllib.error.URLError('offline')
    if '/api/' in req.full_url:return io.BytesIO(b'{}' if failure=='metadata' else metadata)
    return io.BytesIO(b'x'*len(content) if failure=='hash' else content)
   d=m.Downloads(lambda _:temp,opener=lambda req,timeout:request('official',req,timeout),sleeper=lambda _:None)
   d.internal_opener=lambda req,timeout:request('xiangongyun',req,timeout)
   d.configure_source(mode);d.jobs[model['key']]={};d.run(model)
   assert calls and set(calls)=={mode},(mode,failure,calls)
   assert d.jobs[model['key']]['state']==('done' if failure is None else 'error'),d.jobs
   d.pool.shutdown()
print('PASS strict source selection, no hidden fallback on network/metadata/hash failures')
d=m.Downloads(lambda _:'.');d.pool.shutdown();d.pool=types.SimpleNamespace(submit=lambda *a:None)
m.load_catalog=lambda:[model,{**model,'key':'models/vae/second','name':'second'}]
d.configure_source('official');d.start([model['key']]);d.configure_source('xiangongyun');d.start(['models/vae/second'])
assert d.jobs[model['key']]['source_mode']=='official'
assert d.jobs['models/vae/second']['source_mode']=='xiangongyun'
d.jobs[model['key']]['state']='error';d.start([model['key']]);assert d.jobs[model['key']]['source_mode']=='xiangongyun'
try:d.configure_source('https://arbitrary.invalid');raise AssertionError('arbitrary source accepted')
except ValueError:pass
print('PASS queued jobs retain source, new/retried jobs snapshot selection, invalid mode rejection')
# Exercise the real HTTP handler without importing a running ComfyUI server.
tree=ast.parse((root/'__init__.py').read_text(encoding='utf-8-sig'))
handler=next(item for item in ast.walk(tree) if isinstance(item,ast.AsyncFunctionDef) and item.name=='configure_model_source');handler.decorator_list=[]
class Request:
 def __init__(self,payload):self.payload=payload
 async def json(self):return self.payload
with tempfile.TemporaryDirectory() as temp:
 path=Path(temp)/'download-source.local.json'
 env={'downloads':d,'Downloads':m.Downloads,'source_config_path':path,'json':json,'ensure_update_idle':lambda:None,
      'web':types.SimpleNamespace(json_response=lambda data,status=200:(status,data))}
 exec(compile(ast.Module(body=[handler],type_ignores=[]),'__init__.py','exec'),env)
 status,data=asyncio.run(env['configure_model_source'](Request({'mode':'official'})))
 assert status==200 and data['source_mode']=='official'
 restarted=m.Downloads(lambda _:'.');restarted.configure_source(json.loads(path.read_text())['mode']);assert restarted.source_mode=='official';restarted.pool.shutdown()
 assert asyncio.run(env['configure_model_source'](Request({'mode':'invalid'})))[0]==400
 assert json.loads(path.read_text())['mode']=='official'
print('PASS source HTTP validation, persisted configuration and restart restoration')
