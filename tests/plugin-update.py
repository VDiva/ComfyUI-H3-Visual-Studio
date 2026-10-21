from pathlib import Path
import importlib.util,io,json,tempfile,urllib.error,zipfile
from unittest.mock import patch
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('h3_update_test',root/'plugin_update.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SHA='a'*40
assert m.REPOSITORY=='VDiva/ComfyUI-H3-Visual-Studio'

def package(version='0.13.1',subdir='',extra=None,omit=()):
 data=io.BytesIO()
 files={'__init__.py':'VALUE="new"','version.json':json.dumps({'project':m.PROJECT,'version':version}),'web/studio-runtime.mjs':'export const version="new";','web/global-entry.js':'// new','model-catalog.json':'[]','new.py':'VALUE=1',**(extra or {})}
 for name in m.REQUIRED:files.setdefault(name,'# fixture' if name.endswith('.py') else '// fixture' if name.endswith('.mjs') else 'fixture')
 files['director_core/source-manifest.json']=json.dumps({'director/executor_core.py':'0'*64})
 files['director_core/source-normalized-manifest.json']='{}'
 with zipfile.ZipFile(data,'w') as z:
  for name,text in files.items():
   if name not in omit:z.writestr('ComfyUI-H3-Visual-Studio-'+SHA+'/'+(subdir+'/' if subdir else '')+name,text)
 return data.getvalue()
class Response(io.BytesIO):
 def __init__(self,data):super().__init__(data);self.headers={'Content-Length':str(len(data))}
 def __enter__(self):return self
 def __exit__(self,*args):self.close()
class GitHub:
 def __init__(self,version='0.13.1',subdir=''):self.version=version;self.subdir=subdir;self.data=package(version,subdir,{'download-proxy.json':'evil','models/user.bin':'evil'})
 def __call__(self,request,timeout=60):
  url=request.full_url
  if url=='https://api.github.com/repos/'+m.REPOSITORY:return Response(b'{"default_branch":"main"}')
  if '/commits/' in url:return Response(json.dumps({'sha':SHA}).encode())
  if 'raw.githubusercontent.com' in url:
   expected=SHA+'/'+(self.subdir+'/' if self.subdir else '')+'version.json'
   if not url.endswith(expected):raise urllib.error.HTTPError(url,404,'not found',{},None)
   return Response(json.dumps({'project':m.PROJECT,'version':self.version}).encode())
  assert url=='https://codeload.github.com/'+m.REPOSITORY+'/zip/'+SHA
  return Response(self.data)
def local(parent):
 folder=Path(parent)/m.PROJECT;folder.mkdir();(folder/'version.json').write_text(json.dumps({'project':m.PROJECT,'version':'0.13.0'}));(folder/'__init__.py').write_text('VALUE="old"');(folder/'download-proxy.json').write_text('local proxy');(folder/'ffmpeg').mkdir();(folder/'ffmpeg/ffmpeg').write_text('local executable');(folder/'models').mkdir();(folder/'models/user.bin').write_text('user weights');return folder

def ready(updater):
 updater.check();updater.worker.join(5);assert updater.snapshot()['state']=='available',updater.snapshot()
for layout in ('',m.PROJECT):
 with tempfile.TemporaryDirectory() as tmp:
  folder=local(tmp);updater=m.PluginUpdater(folder,opener=GitHub(subdir=layout));ready(updater);updater.install(SHA);updater.worker.join(5);s=updater.snapshot();assert s['state']=='restart_required',s
  assert (folder/'__init__.py').read_text()=='VALUE="new"';assert (folder/'download-proxy.json').read_text()=='local proxy';assert (folder/'ffmpeg/ffmpeg').read_text()=='local executable';assert (folder/'models/user.bin').read_text()=='user weights';assert (Path(s['backup'])/'__init__.py').read_text()=='VALUE="old"';assert Path(s['backup']).name.endswith('.disabled')
  again=m.PluginUpdater(folder,opener=GitHub(subdir=layout));again.check();again.worker.join(5);assert again.snapshot()['state']=='current'
with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);updater=m.PluginUpdater(folder,opener=GitHub(),busy=lambda:'generation is running');ready(updater)
 try:updater.install(SHA);raise AssertionError('busy install')
 except ValueError as e:assert 'generation' in str(e)
with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);updater=m.PluginUpdater(folder,opener=GitHub());ready(updater)
 rename=Path.rename
 def fail_stage(self,target):
  if self.name.startswith('.h3-update-stage-'):raise OSError('simulated Windows file lock')
  return rename(self,target)
 with patch.object(Path,'rename',fail_stage):updater.install(SHA);updater.worker.join(5)
 assert updater.snapshot()['state']=='error';assert (folder/'__init__.py').read_text()=='VALUE="old"';assert not list(Path(tmp).glob('.h3-update-*'))
with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);updater=m.PluginUpdater(folder,opener=GitHub(version='0.12.0'));updater.check();updater.worker.join(5);assert updater.snapshot()['available']==False
with tempfile.TemporaryDirectory() as tmp:
 for bad in ('../escape.py','web/../../escape.py','/absolute.py','C:/escape.py'):
  data=package(extra={bad:'bad'})
  try:m.unpack(data,Path(tmp)/'stage','');raise AssertionError('path accepted '+bad)
  except ValueError:pass
with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);updater=m.PluginUpdater(folder,opener=GitHub(version='0.13.0'));ready(updater);assert '尚未同步' in updater.snapshot()['message']
print('PASS root/nested repositories, check/install, immutable SHA, configuration/model/FFmpeg preservation, disabled backup, idempotence, downgrade and busy blocking, rollback and malicious paths')

with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);calls=[]
 def busy_later():calls.append(1);return 'new task started' if len(calls)>1 else None
 updater=m.PluginUpdater(folder,opener=GitHub(),busy=busy_later);ready(updater);updater.install(SHA);updater.worker.join(5);assert updater.snapshot()['state']=='error';assert (folder/'__init__.py').read_text()=='VALUE="old"'
with tempfile.TemporaryDirectory() as tmp:
 folder=local(tmp);github=GitHub();github.data=package('0.99.0');updater=m.PluginUpdater(folder,opener=github);ready(updater);updater.install(SHA);updater.worker.join(5);assert updater.snapshot()['state']=='error';assert (folder/'__init__.py').read_text()=='VALUE="old"'
print('PASS task-start race recheck and downloaded manifest mismatch keep original plugin intact')

assert not m.preserved('tests/.fixtures/官方采样API基线.json')
assert m.preserved('tests/.fixtures/private.json')
for missing in ['director_bridge.py','director_core/director/executor_core.py','LICENSE']:
 with tempfile.TemporaryDirectory() as tmp:
  try:m.unpack(package(omit=(missing,)),Path(tmp),'');raise AssertionError('incomplete package accepted: '+missing)
  except ValueError:pass
with tempfile.TemporaryDirectory() as tmp:
 try:m.unpack(package(extra={'director_core/lib/broken.py':'def broken('}),Path(tmp),'');raise AssertionError('nested syntax error accepted')
 except SyntaxError:pass
print('PASS missing Director/license rejection, nested Python validation and allowlisted test fixtures')
