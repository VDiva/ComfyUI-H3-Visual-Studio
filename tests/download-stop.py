import hashlib,importlib.util,io,json,tempfile,threading,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('download',Path(__file__).resolve().parents[1]/'model_download.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
content=b'a'*65536+b'b'*65536;digest=hashlib.sha256(content).hexdigest()
def model(name):return dict(key='models/vae/'+name,category='vae',name=name,url='https://huggingface.co/o/r/resolve/main/'+name,size=None)
models=[model('a.safetensors'),model('b.safetensors')];m.load_catalog=lambda:models
waiting=threading.Event();release=threading.Event();calls=[]
class Stream(io.BytesIO):
 status=200;headers={}
 def read1(self,n):
  if self.tell():waiting.set();assert release.wait(5)
  return self.read(n)
def opener(request,timeout):
 calls.append(request.full_url)
 if '/api/' in request.full_url:return io.BytesIO(json.dumps({'sha':'revision','siblings':[{'rfilename':x['name'],'size':len(content),'lfs':{'sha256':digest}} for x in models]}).encode())
 if request.get_header('Range'):
  assert request.get_header('Range')=='bytes=65536-'
  response=io.BytesIO(content[65536:]);response.status=206;response.headers={'Content-Range':f'bytes 65536-{len(content)-1}/{len(content)}'};return response
 return Stream(content)
with tempfile.TemporaryDirectory() as temp:
 d=m.Downloads(lambda _:temp,opener=opener);d.configure_source('official');d.start([x['key'] for x in models]);assert waiting.wait(5)
 d.stop();assert all(x['state']=='stopping' for x in d.status().values())
 # A start during cancellation cannot replace the active job or enqueue duplicates.
 d.start([models[0]['key']]);release.set()
 deadline=time.monotonic()+5
 while any(x['state']=='stopping' for x in d.status().values()) and time.monotonic()<deadline:time.sleep(.01)
 assert all(x['state']=='stopped' for x in d.status().values()),d.status()
 assert len(calls)==2 and not list(Path(temp).glob('*.safetensors'))
 assert (Path(temp)/(models[0]['name']+'.h3download.part')).read_bytes()==content[:65536]
 d.start([models[0]['key']]);d.pool.shutdown(wait=True)
 assert d.status()[models[0]['key']]['state']=='done',d.status()
 assert (Path(temp)/models[0]['name']).read_bytes()==content
 assert d.status()[models[1]['key']]['state']=='stopped'
 try:d.stop(['unknown']);raise AssertionError('unknown accepted')
 except ValueError:pass
print('PASS active/queued stop, no automatic retries/install, duplicate-start guard, partial preservation and verified Range resume')
