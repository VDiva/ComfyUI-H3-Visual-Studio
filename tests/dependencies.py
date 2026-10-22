import importlib.util, tempfile, subprocess, sys, json, io, zipfile
from pathlib import Path
from unittest.mock import patch
r=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('dependencies',r/'dependencies.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
env={'python':'3.12','platform':'Windows','machine':'AMD64','torch':'2.8.0+cu128','cuda':'12.8','gpu':'RTX4060Ti','capability':[8,9],'triton':False}
assert m.triton_requirement(env)=='triton-windows>=3.4.0,<3.5';assert m.sage_block(env)=='';assert m.sage_block({**env,'gpu':''})
assert m.triton_requirement({**env,'platform':'Linux','machine':'x86_64','torch':'2.6.0'})=='triton>=3.2,<3.3'
assert m.sage_block({**env,'torch':'2.99'})
calls=[]
def runner(cmd,**kwargs):
 calls.append((cmd,kwargs));return subprocess.CompletedProcess(cmd,0,'installed','')
with tempfile.TemporaryDirectory() as temp,patch.object(m,'find_module',return_value=False):
 manager=m.DependencyManager(temp,lambda:{},env=lambda:env,runner=runner)
 manager.start(['sageattention','sageattention']);manager.pool.shutdown(wait=True)
 assert next(item for item in manager.snapshot()['items'] if item['key']=='sageattention')['job']['state']=='restart_required',manager.snapshot()
 pip=[cmd for cmd,kw in calls if '-m' in cmd and 'pip' in cmd][0]
 assert pip[0]==sys.executable and '--only-binary=:all:' in pip and '--constraint' in pip
 assert 'triton-windows>=3.4.0,<3.5' in pip and 'sageattention==1.0.6' in pip
 try:manager.start(['arbitrary-package']);raise AssertionError('unknown package accepted')
 except ValueError:pass
 bad=io.BytesIO()
 with zipfile.ZipFile(bad,'w') as z:z.writestr('repo/../escape.txt','bad')
 try:m.extract_repository(bad.getvalue(),Path(temp)/'unzip');raise AssertionError('traversal accepted')
 except ValueError:pass
 archive=io.BytesIO()
 with zipfile.ZipFile(archive,'w') as z:z.writestr('repo/__init__.py','# test');z.writestr('repo/requirements.txt','pillow')
 def opener(url,timeout):return io.BytesIO(json.dumps({'sha':'a'*40}).encode() if 'api.github.com' in url else archive.getvalue())
 manager=m.DependencyManager(temp,lambda:{},opener=opener,env=lambda:env,runner=runner)
 manager.start(['kjnodes']);manager.pool.shutdown(wait=True)
 assert (Path(temp)/'ComfyUI-KJNodes/__init__.py').is_file()
 assert manager.jobs['kjnodes']['state']=='restart_required'
 existing=(Path(temp)/'ComfyUI-KJNodes/__init__.py').read_text()
 try:manager.start(['kjnodes']);raise AssertionError('existing plugin overwritten')
 except ValueError:pass
 assert (Path(temp)/'ComfyUI-KJNodes/__init__.py').read_text()==existing
print('PASS dependency checks, platform/Torch compatibility, fixed pip allowlist, current interpreter, locked dependencies, duplicate queue, KJ archive and no-overwrite/path guards; no real installation performed')

for key in ('qwen3_tts','exact_audio_lock'):
 with tempfile.TemporaryDirectory() as temp:
  archive=io.BytesIO()
  with zipfile.ZipFile(archive,'w') as z:
   z.writestr('repo/__init__.py','# node');z.writestr('repo/install.py','# installer');z.writestr('repo/requirements.txt','av>=14.2.0')
  requests=[];runs=[]
  def fetch(url,timeout):
   requests.append(url);return io.BytesIO(json.dumps({'sha':'b'*40}).encode() if 'api.github.com' in url else archive.getvalue())
  def execute(cmd,**kwargs):
   runs.append((cmd,kwargs));return subprocess.CompletedProcess(cmd,0,'complete','')
  manager=m.DependencyManager(temp,lambda:{},opener=fetch,proxy=lambda:'http://127.0.0.1:7890',env=lambda:env,runner=execute)
  manager.start([key]);manager.pool.shutdown(wait=True)
  target=Path(temp)/m.PACKAGES[key]['directory'];assert (target/'__init__.py').is_file();assert manager.jobs[key]['state']=='restart_required',manager.jobs
  assert m.PACKAGES[key]['repo'] in requests[0] and requests[1].endswith('/'+'b'*40)
  if key=='qwen3_tts':
   cmd,options=runs[0];assert cmd==[sys.executable,str(target/'install.py')];assert options['cwd']==str(target);assert options['env']['QWEN3_TTS_SKIP_MODEL_DOWNLOAD']=='1';assert options['env']['HTTPS_PROXY']=='http://127.0.0.1:7890';assert len(runs)==1
  else:assert '-r' in runs[0][0] and str(target/'requirements.txt') in runs[0][0] and '--constraint' in runs[0][0]
  manager.jobs[key]={'state':'error'};requests.clear();manager.install(key);assert not requests;assert manager.jobs[key]['state']=='restart_required'
print('PASS voice node pinned sources, isolated installer in final path, proxy forwarding, no duplicate model downloads, constrained ExactAudioLock deps and retry without overwrite')
