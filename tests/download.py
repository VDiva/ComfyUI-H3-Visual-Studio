import importlib.util, tempfile, json, hashlib, io
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("download",root/"model_download.py");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
# These tests exercise the official transfer path after an unavailable mirror.
import urllib.error
class OfficialDownloads(m.Downloads):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs)
  def offline(*args,**kwargs):raise urllib.error.URLError('mirror unavailable in official-path test')
  self.internal_opener=offline
m.Downloads=OfficialDownloads
content=b"test model data";digest=hashlib.sha256(content).hexdigest()
model={"key":"models/vae/test.safetensors","category":"vae","name":"test.safetensors","url":"https://huggingface.co/owner/repo/resolve/main/test.safetensors","size":None,"sha256":None}
m.CATALOG=[model]
m.load_catalog=lambda:m.CATALOG
def opener(request,timeout):
 if '/api/models/' in request.full_url:return io.BytesIO(json.dumps({"sha":"revision","siblings":[{"rfilename":"test.safetensors","size":len(content),"lfs":{"sha256":digest}}]}).encode())
 assert '/resolve/revision/' in request.full_url
 return io.BytesIO(content)
with tempfile.TemporaryDirectory() as temp:
 manager=m.Downloads(lambda category:temp,opener=opener,sleeper=lambda _:None)
 manager.start([model['key'],model['key']]);manager.pool.shutdown(wait=True)
 assert manager.status()[model['key']]['state']=='done'
 target=Path(temp)/model['name'];assert target.read_bytes()==content
 manager.jobs[model['key']]={};manager.run(model);assert manager.status()[model['key']]['state']=='error';assert target.read_bytes()==content
 try:manager.start(['../../bad']);raise AssertionError('unknown accepted')
 except ValueError:pass
 target.unlink()
 def bad(request,timeout):
  if '/api/models/' in request.full_url:return opener(request,timeout)
  return io.BytesIO(b'x'*len(content))
 manager.opener=bad;manager.run(model);assert manager.status()[model['key']]['state']=='error';assert not target.exists();assert not list(Path(temp).glob('*.part'))
print('PASS pinned-revision download, SHA256/size verification, progress, duplicate queue, unknown-key rejection, no overwrite and corrupt-file cleanup')

clock=[0.0];rate=m.DownloadRate(lambda:clock[0]);clock[0]=1;rate.add(1024);assert rate.value()==1024
clock[0]=2;rate.add(1024);assert rate.value()==1024
clock[0]=7;assert rate.value()==0
manager.jobs['rate']={'state':'downloading','bytes':2048,'total':4096};manager.rates['rate']=m.DownloadRate(lambda:clock[0]);clock[0]=8;manager.rates['rate'].add(1024)
status=manager.status()['rate'];assert status['speed_bps']==1024 and status['eta_seconds']==2
manager.jobs['rate']['state']='done';assert manager.status()['rate']['speed_bps']==0 and manager.status()['rate']['eta_seconds'] is None
print('PASS recent download speed, stall decay, ETA and non-download state reset')

import urllib.error
assert 'HTTP 403' in m.download_error(urllib.error.HTTPError('url',403,'forbidden',{},None),'下载模型文件')
assert '60秒' in m.download_error(TimeoutError(),'获取模型信息')
assert '磁盘已满' in m.download_error(OSError(28,'full'),'下载模型文件')
print('PASS actionable failure stages and HTTP, timeout, disk error descriptions')

with tempfile.TemporaryDirectory() as temp:
 calls=[]
 class Response(io.BytesIO):
  status=206
  headers={'Content-Range':f'bytes 5-{len(content)-1}/{len(content)}'}
 def resume(request,timeout):
  if '/api/models/' in request.full_url:return opener(request,timeout)
  calls.append(request.get_header('Range'));return Response(content[5:])
 manager=m.Downloads(lambda category:temp,opener=resume,sleeper=lambda _:None)
 part=Path(temp)/(model['name']+'.h3download.part');part.write_bytes(content[:5]);part.with_name(part.name+'.json').write_text(json.dumps({'sha256':digest,'size':len(content)}))
 manager.jobs[model['key']]={};manager.run(model)
 assert manager.status()[model['key']]['state']=='done',manager.status()
 assert calls==['bytes=5-'];assert (Path(temp)/model['name']).read_bytes()==content
 manager.pool.shutdown()
with tempfile.TemporaryDirectory() as temp:
 count=[0]
 def interrupted(request,timeout):
  if '/api/models/' in request.full_url:return opener(request,timeout)
  count[0]+=1
  return io.BytesIO(content[:5] if count[0]==1 else content)
 manager=m.Downloads(lambda category:temp,opener=interrupted,sleeper=lambda _:None);manager.internal_opener=interrupted;manager.jobs[model['key']]={};manager.run(model)
 assert manager.status()[model['key']]['state']=='done';assert count[0]==2
 assert (Path(temp)/model['name']).read_bytes()==content
 manager.pool.shutdown()
print('PASS HTTP Range resume, matching content range, early EOF retry and Range-ignored restart without data duplication')

clock=[0.0];rate=m.DownloadRate(lambda:clock[0]);clock[0]=1;rate.add(10);assert rate.last_received==1
clock[0]=10;manager.jobs['idle']={'state':'downloading','bytes':10,'total':100};manager.rates['idle']=rate
assert manager.status()['idle']['idle_seconds']==9 and manager.status()['idle']['speed_bps']==0
print('PASS stalled stream reports seconds since last data instead of ambiguous zero speed')

import threading,http.server
from unittest.mock import patch
seen=[]
class Proxy(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  seen.append(self.path);self.send_response(200);self.end_headers();self.wfile.write(b'proxy reached')
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',0),Proxy);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with patch('urllib.request.proxy_bypass',return_value=False):
  op=m.proxy_opener('http://127.0.0.1:'+str(server.server_port))
  with op('http://model-download.invalid/test',timeout=3) as response:assert response.read()==b'proxy reached'
 assert seen==['http://model-download.invalid/test']
 for invalid in ['socks5://127.0.0.1:7890','http://user:pass@127.0.0.1:7890','http://localhost']:
  try:m.proxy_opener(invalid);raise AssertionError('invalid proxy accepted')
  except ValueError:pass
finally:server.shutdown();server.server_close()
print('PASS explicit proxy routes requests through local HTTP proxy and rejects unsupported configuration')

class Connection:
 def __enter__(self):return self
 def __exit__(self,*args):pass
attempts=[]
def connect(address,timeout):
 attempts.append(address)
 if address[1]==7890:raise ConnectionRefusedError()
 return Connection()
result=m.detect_proxy([('http://127.0.0.1:7890','first'),('http://127.0.0.1:7897','clash')],connector=connect,validate=lambda address:address.endswith(':7897'))
assert result['address']=='http://127.0.0.1:7897' and len(attempts)==2
result=m.detect_proxy([('http://127.0.0.1:7897','open but unusable')],connector=connect,validate=lambda _:False)
assert result['address']==''
manager=m.Downloads(lambda _:'.',opener=opener)
manager.auto_enabled=True
with patch.object(m,'detect_proxy',return_value={'address':'http://127.0.0.1:7897','message':'verified'} ) as detect:
 assert manager.auto_detect_proxy()['effective']=='http://127.0.0.1:7897'
 manager.auto_detect_proxy();assert detect.call_count==1
 manager.configure_proxy('http://127.0.0.1:7890');manager.auto_detect_proxy();assert detect.call_count==1
manager.pool.shutdown()
print('PASS automatic port fallback, proxy connectivity validation, detection cache and manual override')
