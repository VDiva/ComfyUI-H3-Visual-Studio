"""Allowlisted dependency inspection and background installation for the current ComfyUI Python."""
from pathlib import Path
import importlib.util, importlib.metadata, sys, platform, subprocess, os, json, threading, concurrent.futures, tempfile, urllib.request, zipfile, io, shutil
PACKAGES={
 "qwen3_tts":{"label":"Qwen3-TTS配音节点与独立环境","node":"Qwen3TTSVoiceDesign","nodes":["Qwen3TTSVoiceDesign","Qwen3TTSVoiceClone"],"repo":"shinrali/ComfyUI-Qwen3-TTS","directory":"ComfyUI-Qwen3-TTS","reason":"声音设计、角色固定声线配音"},
 "exact_audio_lock":{"label":"H3 ExactAudioLock对白锁定节点","node":"MiniMaxH3DialogueAudioLock","nodes":["MiniMaxH3DialogueAudioLock","MiniMaxH3DialogueAudioFinalize"],"repo":"badgids/ComfyUI-H3-ExactAudioLock","directory":"ComfyUI-H3-ExactAudioLock","reason":"正式配音对白时间锁定与音轨恢复"},
 "opencv":{"label":"Director视频读取","module":"cv2","pip":["opencv-python-headless>=4.8"],"reason":"导演台内核视频解码"},
 "scenedetect":{"label":"Director镜头分析","module":"scenedetect","pip":["scenedetect>=0.6.4,<0.8"],"reason":"导演台镜头分析"},
 "imageio_ffmpeg":{"label":"FFmpeg Python运行库","module":"imageio_ffmpeg","pip":["imageio-ffmpeg"],"reason":"FFmpeg备用执行文件"},
 "spandrel":{"label":"图像超分模型加载库","module":"spandrel","pip":["spandrel"],"reason":"RealESRGAN模型加载"},
 "safetensors":{"label":"Safetensors模型读取","module":"safetensors","pip":["safetensors"],"reason":"模型权重读取"},
 "sageattention":{"label":"SageAttention V1 / 匹配的Triton","module":"sageattention","pip":["sageattention==1.0.6"],"reason":"可选KJ SageAttention加速"},
 "kjnodes":{"label":"ComfyUI-KJNodes节点包","node":"PathchSageAttentionKJ","reason":"可选SageAttention模型补丁"},
}

def find_module(name):
 try:return importlib.util.find_spec(name) is not None
 except (ImportError,ValueError):return False

def environment():
 info={"python":platform.python_version(),"python_executable":sys.executable,"platform":platform.system(),"machine":platform.machine(),"torch":"","cuda":"","gpu":"","capability":None,"triton":find_module("triton")}
 try:
  import torch
  info.update(torch=torch.__version__,cuda=torch.version.cuda or "")
  if torch.cuda.is_available():info.update(gpu=torch.cuda.get_device_name(0),capability=list(torch.cuda.get_device_capability(0)))
 except Exception as error:info["error"]=str(error)
 return info

def triton_requirement(env):
    pair=tuple(map(int,env.get('torch','').split('+')[0].split('.')[:2]))
    versions={(2,4):1,(2,5):1,(2,6):2,(2,7):3,(2,8):4,(2,9):5,(2,10):6}
    minor=versions.get(pair)
    if minor is None:raise ValueError('未收录当前Torch对应的Triton版本，不自动更换核心环境')
    if env.get('platform') not in {'Windows','Linux'} or env.get('machine','').lower() not in {'amd64','x86_64'}:raise ValueError('当前平台未配置可自动安装的Triton wheel')
    if env['platform']=='Windows':
        if minor<2:raise ValueError('此旧版Windows Torch需要额外编译工具，请先更新兼容环境')
        return 'triton-windows>=3.'+str(minor)+('.0.post13' if minor==2 else '.0')+',<3.'+str(minor+1)
    return 'triton>=3.'+str(minor)+',<3.'+str(minor+1)

def sage_block(env):
 if not env.get("cuda") or not env.get("gpu"):return "未检测到可用CUDA GPU，不能安装此GPU加速依赖"
 try:
  if tuple(map(int,env["torch"].split('+')[0].split('.')[:2]))<(2,3):return "SageAttention需要PyTorch 2.3或以上；本安装器不会自动更换PyTorch"
  if not env.get('triton'):triton_requirement(env)
 except (ValueError,KeyError) as error:return str(error)
 if (env.get("capability") or [0])[0]<8:return "当前GPU架构不符合此加速方案"
 return ""

def extract_repository(data,destination):
 destination=Path(destination).resolve();destination.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  total=0
  for item in z.infolist():
   parts=item.filename.split('/')[1:]
   if not parts or not any(parts):continue
   if any(p in {'.','..'} for p in parts) or '\\' in item.filename or item.filename.startswith('/') or ':' in item.filename or (item.external_attr>>16)&0o170000==0o120000:raise ValueError("节点包包含无效路径")
   target=destination.joinpath(*parts).resolve()
   if not target.is_relative_to(destination):raise ValueError("节点包路径越界")
   total+=item.file_size
   if total>512*1024**2:raise ValueError("节点包解压内容过大")
   if item.is_dir():target.mkdir(parents=True,exist_ok=True)
   else:
    target.parent.mkdir(parents=True,exist_ok=True)
    with z.open(item) as src,target.open('wb') as out:shutil.copyfileobj(src,out)

class DependencyManager:
 def __init__(self,custom_root,nodes,opener=urllib.request.urlopen,proxy=lambda:'',env=environment,runner=subprocess.run):
  self.root=Path(custom_root).resolve();self.nodes=nodes;self.opener=opener;self.proxy=proxy;self.env=env;self.runner=runner;self.jobs={};self.lock=threading.Lock();self.pool=concurrent.futures.ThreadPoolExecutor(max_workers=1,thread_name_prefix='h3-dependencies');self.cached_env=None
 def snapshot(self,refresh=False):
  if self.cached_env is None or refresh:self.cached_env=self.env()
  with self.lock:jobs={k:dict(v) for k,v in self.jobs.items()}
  rows=[]
  for key,item in PACKAGES.items():
   installed=item.get('node') in self.nodes() if item.get('node') else find_module(item['module'])
   if item.get('nodes'):installed=all(n in self.nodes() for n in item['nodes'])
   if key=='qwen3_tts':installed=installed and any((self.root/item['directory']/p).is_file() for p in ('.venv/bin/python','.venv/Scripts/python.exe'))
   job=jobs.get(key,{})
   if job.get('state')=='error' and key!='kjnodes':installed=False
   blocked=sage_block(self.cached_env) if key=='sageattention' and not installed else ''
   exists=(self.root/'ComfyUI-KJNodes').exists() if key=='kjnodes' else False
   if exists and not installed:blocked='节点目录已存在但未加载，请重启ComfyUI或检查启动日志；不会覆盖现有目录'
   rows.append({"key":key,"label":item['label'],"reason":item['reason'],"installed":installed,"can_install":not installed and not blocked and job.get('state') not in {'queued','installing','restart_required'},"blocked":blocked,"job":job})
  return {"environment":self.cached_env,"items":rows,"restart_required":any(j.get('state')=='restart_required' for j in jobs.values())}
 def start(self,keys):
  if not isinstance(keys,list) or not keys or len(keys)>len(PACKAGES) or any(not isinstance(k,str) or k not in PACKAGES for k in keys):raise ValueError('未知依赖或安装清单无效')
  rows={r['key']:r for r in self.snapshot()['items']}
  for key in dict.fromkeys(keys):
   row=rows[key]
   if row['installed']:continue
   if row['blocked']:raise ValueError(row['label']+'：'+row['blocked'])
  for key in dict.fromkeys(keys):
   if rows[key]['installed']:continue
   with self.lock:
    if self.jobs.get(key,{}).get('state') in {'queued','installing','restart_required'}:continue
    self.jobs[key]={"state":"queued","log":"等待安装"}
   self.pool.submit(self.install,key)
  return self.snapshot()
 def update(self,key,**values):
  with self.lock:self.jobs[key].update(values)
 def pip(self,key,args,work):
  constraints=Path(work)/'constraints.txt';lines=[]
  for package in ['torch','torchvision','torchaudio','triton','triton-windows','numpy']:
   try:lines.append(package+'=='+importlib.metadata.version(package))
   except importlib.metadata.PackageNotFoundError:pass
  constraints.write_text('\n'.join(lines),encoding='utf-8')
  cmd=[sys.executable,'-m','pip','install','--disable-pip-version-check','--no-input','--only-binary=:all:','--constraint',str(constraints),*args]
  env=dict(os.environ);address=self.proxy()
  if address:env.update(HTTP_PROXY=address,HTTPS_PROXY=address)
  self.update(key,log='正在使用ComfyUI Python安装依赖（禁止源码编译，锁定现有Torch等核心版本）…')
  result=self.runner(cmd,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=1200,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  self.update(key,log=((result.stdout or '')+'\n'+(result.stderr or ''))[-12000:])
  if result.returncode:raise ValueError('pip安装失败，详见安装日志；未自动升级Torch或编译GPU扩展')
 def install_voice_node(self,key,work):
  item=PACKAGES[key];target=self.root/item['directory']
  if not target.exists():
   with self.opener('https://api.github.com/repos/'+item['repo']+'/commits/main',timeout=60) as response:revision=json.load(response)['sha']
   if not isinstance(revision,str) or len(revision)!=40 or any(c not in '0123456789abcdef' for c in revision):raise ValueError('节点版本信息无效')
   self.update(key,log='正在下载固定版本节点：'+item['repo']+' @ '+revision)
   with self.opener('https://codeload.github.com/'+item['repo']+'/zip/'+revision,timeout=60) as response:data=response.read(256*1024**2+1)
   if len(data)>256*1024**2:raise ValueError('节点包过大')
   stage=Path(work)/item['directory'];extract_repository(data,stage)
   required='install.py' if key=='qwen3_tts' else 'requirements.txt'
   if not (stage/'__init__.py').is_file() or not (stage/required).is_file():raise ValueError('节点包结构不完整')
   self.root.mkdir(parents=True,exist_ok=True)
   staging=self.root/('.h3-voice-'+key)
   if staging.exists():raise ValueError('节点暂存目录已存在，请检查上次安装')
   shutil.copytree(stage,staging)
   try:
    if target.exists():raise ValueError('安装期间节点目录已出现，未覆盖')
    staging.rename(target)
   finally:
    if staging.exists() and staging.resolve().is_relative_to(self.root):shutil.rmtree(staging)
  if key=='qwen3_tts':
   installer=target/'install.py'
   if not installer.is_file():raise ValueError('已有Qwen节点缺少install.py，请检查节点来源')
   env=dict(os.environ);address=self.proxy()
   if address:env.update(HTTP_PROXY=address,HTTPS_PROXY=address,http_proxy=address,https_proxy=address)
   env['QWEN3_TTS_SKIP_MODEL_DOWNLOAD']='1'
   self.update(key,log='正在安装Qwen独立环境，复用ComfyUI Torch；模型请在配音模型卡片下载…')
   result=self.runner([sys.executable,str(installer)],cwd=str(target),env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=2400,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   self.update(key,log=((result.stdout or '')+'\n'+(result.stderr or ''))[-12000:])
   if result.returncode:raise ValueError('Qwen独立环境安装失败，节点源码已保留，可重试安装；详见日志')
  else:
   requirements=target/'requirements.txt'
   if not requirements.is_file():raise ValueError('已有ExactAudioLock节点缺少requirements.txt')
   self.pip(key,['-r',str(requirements)],work)

 def install(self,key):
  self.update(key,state='installing',log='正在准备依赖…')
  try:
   with tempfile.TemporaryDirectory(prefix='h3-dependencies-') as work:
    if PACKAGES[key].get('repo'):
     self.install_voice_node(key,work)
    elif key=='kjnodes':
     target=self.root/'ComfyUI-KJNodes'
     if target.exists():raise ValueError('节点目录已存在，未覆盖；请重启或检查启动日志')
     with self.opener('https://api.github.com/repos/kijai/ComfyUI-KJNodes/commits/main',timeout=60) as response:revision=json.load(response)['sha']
     if len(revision)!=40 or any(c not in '0123456789abcdef' for c in revision):raise ValueError('节点版本信息无效')
     self.update(key,log='正在下载固定版本KJNodes：'+revision)
     with self.opener('https://codeload.github.com/kijai/ComfyUI-KJNodes/zip/'+revision,timeout=60) as response:data=response.read(256*1024**2+1)
     if len(data)>256*1024**2:raise ValueError('节点包过大')
     stage=Path(work)/'ComfyUI-KJNodes';extract_repository(data,stage)
     requirements=stage/'requirements.txt'
     if requirements.exists():self.pip(key,['-r',str(requirements)],work)
     self.root.mkdir(parents=True,exist_ok=True)
     # Publish only after dependencies succeeded; never replace an existing plugin.
     staging=self.root/('.h3-kjnodes-'+revision[:12])
     if staging.exists():raise ValueError('安装暂存目录已存在，请检查上次安装')
     shutil.copytree(stage,staging)
     try:
      if target.exists():raise ValueError('安装期间目标目录已出现，未覆盖')
      staging.rename(target)
     finally:
      if staging.exists() and staging.resolve().is_relative_to(self.root):shutil.rmtree(staging)
    else:
     specs=list(PACKAGES[key]['pip'])
     if key=='sageattention' and not self.cached_env.get('triton'):specs.insert(0,triton_requirement(self.cached_env))
     self.pip(key,specs,work)
     importlib.invalidate_caches()
     module=PACKAGES[key]['module'];check=self.runner([sys.executable,'-c','import '+module],capture_output=True,text=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
     if check.returncode:raise ValueError('已安装但导入检查失败：'+(check.stderr or '')[-2000:])
   self.update(key,state='restart_required',log=self.jobs[key].get('log','')+'\n安装完成，请重启ComfyUI再检查；未验证GPU内核运行。')
  except Exception as error:
   with self.lock:previous=self.jobs[key].get('log','')
   self.update(key,state='error',log=previous+'\n'+str(error))
