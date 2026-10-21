from pathlib import Path
import gzip,hashlib,importlib.util,io,json,os,tempfile,time,types,zipfile
from unittest.mock import patch
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('h3_proxy',root/'proxy_core.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Downloads:
 def __init__(self):self.proxy_address='http://127.0.0.1:7890';self.calls=[]
 def configure_proxy(self,address):self.proxy_address=address;self.calls.append(address)
class Process:
 def __init__(self,*args,**kwargs):self.args=args;self.kwargs=kwargs;self.code=None;self.stopped=False
 def poll(self):return self.code
 def terminate(self):self.stopped=True;self.code=0
 def wait(self,timeout):return self.code
 def kill(self):self.code=-1
class Response(io.BytesIO):
 def __init__(self,data):super().__init__(data);self.headers={'Content-Length':str(len(data))}
secret_url='https://subscription.example/profile?token=PRIVATE_TEST_TOKEN'
for invalid in ['file:///etc/passwd','ftp://example.com/a','https://u:p@example.com/a','https://example.com/#secret','https://example.com/\n']:
 try:m.subscription_url(invalid);raise AssertionError('invalid URL accepted')
 except ValueError:pass
assert m.subscription_url(secret_url)==secret_url
with tempfile.TemporaryDirectory() as temp:
 d=Downloads();saved=[];core=m.ProxyCore(temp,d,save_proxy=saved.append,popen=Process,sleeper=lambda _:None)
 try:
  # Verify the real installer using a checked, mock official archive. It never
  # runs a fixture executable and never contacts a real subscription provider.
  binary=b'MZ fake executable';archive=io.BytesIO()
  if os.name=='nt':
   with zipfile.ZipFile(archive,'w') as z:z.writestr('mihomo.exe',binary)
   packed=archive.getvalue();name='fixture.zip'
  else:packed=gzip.compress(binary);name='fixture.gz'
  digest=hashlib.sha256(packed).hexdigest()
  def opener(request,timeout):
   assert request.full_url.startswith(('https://github.com/MetaCubeX/mihomo/','https://raw.githubusercontent.com/MetaCubeX/mihomo/'))
   return Response(b'GNU GENERAL PUBLIC LICENSE fixture' if request.full_url.endswith('/LICENSE') else packed)
  core.opener=opener
  with patch.dict(m.ASSETS,{('Test','amd64'):(name,digest)}),patch.object(m.platform,'system',return_value='Test'),patch.object(m.platform,'machine',return_value='AMD64'):core.install()
  assert Path(core.executable()).read_bytes()==binary
  assert (core.root/'LICENSE-Mihomo').is_file()
  before=Path(core.executable()).read_bytes()
  with patch.dict(m.ASSETS,{('Test','amd64'):(name,'0'*64)}),patch.object(m.platform,'system',return_value='Test'),patch.object(m.platform,'machine',return_value='AMD64'):
   try:core.install();raise AssertionError('bad hash installed')
   except ValueError:pass
  assert Path(core.executable()).read_bytes()==before
  core.start_action({'action':'subscribe','url':secret_url})
  for _ in range(100):
   if not core.busy:break
   time.sleep(.01)
  assert core.settings['subscription']==secret_url
  api_calls=[]
  def api(path,method='GET',data=None,**kwargs):
   api_calls.append((path,method,data))
   if method=='GET':return {'all':['node A','node B'],'now':core.selected or 'node A'}
   return {}
  core._api=api;core.start()
  assert core.snapshot()['running'] and d.proxy_address.startswith('http://127.0.0.1:')
  assert core.snapshot()['download_attached'] is True
  assert core.secret and core.secret not in json.dumps(core.snapshot())
  assert 'PRIVATE_TEST_TOKEN' not in json.dumps(core.snapshot())
  assert secret_url not in str(core.process.args) and core.process.kwargs.get('shell') is None
  assert not any(key.upper() in {'HF_TOKEN','GITHUB_TOKEN','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','SAFE_PATHS'} for key in core.process.kwargs['env'])
  config=core.config();assert config['allow-lan'] is False and config['bind-address']=='127.0.0.1'
  assert not config['tun']['enable'] and not config['dns']['enable']
  assert config['rules']==['DOMAIN,hf.x-gpu.com,DIRECT','MATCH,H3Download']
  assert config['proxy-providers']['H3Subscription']['url']==secret_url
  core.select('node B');assert core.selected=='node B'
  core.stop();assert d.proxy_address=='http://127.0.0.1:7890'
  core.start();managed=d.proxy_address
  # A manual user override is not overwritten when the managed core stops.
  d.configure_proxy('http://127.0.0.1:9999');assert core.snapshot()['download_attached'] is False
  core.stop();assert d.proxy_address=='http://127.0.0.1:9999'
  core.start();core.process.code=1;assert not core.snapshot()['running'];assert d.proxy_address=='http://127.0.0.1:9999'
  core.start();managed=d.proxy_address
  # Simulated server restart: do not re-use a stale managed localhost endpoint.
  restarted=m.ProxyCore(temp,d,save_proxy=saved.append,popen=Process,sleeper=lambda _:None)
  assert not restarted.snapshot()['running'] and d.proxy_address=='http://127.0.0.1:9999';restarted.close()
  core.stop()
  # Installer/config/subscription files remain outside public status and repo.
  if os.name!='nt':assert (core.root.stat().st_mode&0o777)==0o700
  try:core.start_action({'action':'subscribe','url':'file:///secret'});raise AssertionError('invalid action accepted')
  except ValueError:pass
  core.busy=True
  try:core.start_action({'action':'stop'});raise AssertionError('concurrent action accepted')
  except ValueError:pass
  core.busy=False
 finally:core.close()
print('PASS core installer integrity/license, secret-free status, subscription persistence, loopback config, node selection, owned process lifecycle, proxy restore/manual override and restart recovery')
