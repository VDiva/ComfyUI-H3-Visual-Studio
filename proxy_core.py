"""Own a loopback-only Mihomo process; no core code or binaries are bundled.

Official assets/digests: https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.32
Mihomo is a separate GPL-3.0 executable. See NOTICE; no subscription is returned
to the browser, used as a shell argument, or sent to a conversion service.
"""
from pathlib import Path
import atexit,concurrent.futures,gzip,hashlib,io,json,os,platform,secrets,shutil,socket,subprocess,threading,time,urllib.parse,urllib.request,zipfile

VERSION='v1.19.32'
ASSETS={
 ('Linux','amd64'):('mihomo-linux-amd64-compatible-'+VERSION+'.gz','ba3ce607747a07f948fc35780e108a4a7c7f552a38b9bd4d115f313ebcb89c20'),
 ('Linux','arm64'):('mihomo-linux-arm64-'+VERSION+'.gz','9dd862e28b46ff7d775f169cceebc28deccaa0a9e804237d421cd2571e0caba0'),
 ('Windows','amd64'):('mihomo-windows-amd64-compatible-'+VERSION+'.zip','974a4d7ad69aed27aa2e8f91d61113573c14dadb14562c63e58effabf59816f0'),
 ('Windows','arm64'):('mihomo-windows-arm64-'+VERSION+'.zip','7a4f6e58af9a120920935f2150cf642d945085fdb3e753314505b334234e1d1e'),
}
GROUP='H3Download';PROVIDER='H3Subscription'

def subscription_url(value):
 if not isinstance(value,str) or len(value)>8192 or any(ord(c)<32 for c in value):raise ValueError('订阅地址无效')
 parsed=urllib.parse.urlsplit(value.strip())
 if parsed.scheme not in {'http','https'} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:raise ValueError('请填写HTTP/HTTPS订阅链接，使用Clash/Mihomo兼容格式')
 return value.strip()

def free_port():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));return sock.getsockname()[1]

class ProxyCore:
 def __init__(self,root,downloads,save_proxy=lambda address:None,opener=None,popen=subprocess.Popen,sleeper=time.sleep):
  self.root=Path(root).resolve()/'.h3-mihomo';self.downloads=downloads;self.save_proxy=save_proxy
  self.opener=opener or (lambda *a,**kw:downloads.opener(*a,**kw));self.popen=popen;self.sleep=sleeper
  self.direct=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
  self.lock=threading.RLock();self.pool=concurrent.futures.ThreadPoolExecutor(max_workers=1,thread_name_prefix='h3-proxy')
  self.process=None;self.secret='';self.control=0;self.port=0;self.previous='';self.settings={};self.nodes=[];self.selected='';self.state='stopped';self.message='先安装内核并保存订阅，再开启代理';self.busy=False;self.progress=0;self.closing=False
  try:self.settings=json.loads((self.root/'settings.local.json').read_text(encoding='utf-8'))
  except (OSError,ValueError):pass
  if not isinstance(self.settings,dict):self.settings={}
  # A previous ComfyUI process cannot own our current child process. Restore
  # its saved proxy instead of leaving downloads pointing at a dead listener.
  if self.settings.get('managed_proxy')==downloads.proxy_address and downloads.proxy_address:
   self._set_proxy(self.settings.get('previous_proxy',''))
  atexit.register(self.close)

 def _write(self,path,data):
  self.root.mkdir(parents=True,exist_ok=True)
  try:self.root.chmod(0o700)
  except OSError:pass
  temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
  try:temp.chmod(0o600)
  except OSError:pass
  temp.replace(path)

 def _set_proxy(self,address):
  self.save_proxy(address);self.downloads.configure_proxy(address)

 def executable(self):
  own=self.root/('mihomo.exe' if os.name=='nt' else 'mihomo')
  return str(own) if own.is_file() else shutil.which('mihomo')

 def snapshot(self):
  with self.lock:
   if self.process is not None and self.process.poll() is not None:
    self.process=None;self._restore();self.state='error';self.message='代理内核已退出，请检查订阅或重新开启'
   return {'state':self.state,'busy':self.busy,'message':self.message,'installed':bool(self.executable()),'version':VERSION,
           'subscribed':bool(self.settings.get('subscription')),'running':self.process is not None,
           'nodes':list(self.nodes),'selected':self.selected,'progress':self.progress,
           'download_attached':self.process is not None and self.downloads.proxy_address==self.address,
           'download_source':getattr(self.downloads,'source_mode','auto'),
           'proxy':self.address if self.process is not None else ''}

 @property
 def address(self):return 'http://127.0.0.1:'+str(self.port)

 def start_action(self,payload):
  if not isinstance(payload,dict):raise ValueError('请求格式错误')
  action=payload.get('action')
  if action not in {'install','subscribe','start','stop','refresh','select','test'}:raise ValueError('代理操作无效')
  value=payload.get('url','') if action=='subscribe' else payload.get('name','')
  if action=='subscribe':value=subscription_url(value)
  if action=='select' and (not isinstance(value,str) or value not in self.nodes):raise ValueError('请选择当前订阅中的节点')
  with self.lock:
   if self.busy or self.closing:raise ValueError('代理操作尚未完成，请稍候')
   self.busy=True;self.message='正在处理代理操作…';self.progress=0
  self.pool.submit(self._action,action,value)
  return self.snapshot()

 def _action(self,action,value):
  try:
   if action=='install':self.install()
   elif action=='subscribe':
    if self.process is not None:raise ValueError('请先停止代理，再更换订阅')
    self.settings['subscription']=value;self._write(self.root/'settings.local.json',self.settings);self.message='订阅已保存，点击开启代理加载节点'
   elif action=='start':self.start()
   elif action=='stop':self.stop();self.message='代理已停止，下载代理已恢复'
   elif action=='refresh':
    self._api('/providers/proxies/'+PROVIDER,'PUT',timeout=30);self._nodes();self.message='订阅已更新'
   elif action=='select':self.select(value);self.message='已切换节点：'+value
   elif action=='test':
    if self.process is None:raise ValueError('请先开启代理')
    began=time.monotonic();op=urllib.request.build_opener(urllib.request.ProxyHandler({'https':self.address})).open
    with op(urllib.request.Request('https://huggingface.co/api/models/Comfy-Org/MiniMax-H3',method='HEAD'),timeout=12) as response:
     if response.status!=200:raise ValueError('代理测试失败，请切换节点')
    self.message='所选节点可连接Hugging Face，约'+str(round((time.monotonic()-began)*1000))+' ms；此测试不代表模型文件下载成功。请选官方源并重试失败项，已建立的下载连接不会切换'
  except ValueError as error:self.message=str(error)
  except Exception:self.message='操作失败：请检查网络、订阅兼容性或节点可用性；订阅链接不会显示在错误中'
  finally:
   with self.lock:self.busy=False

 def install(self):
  if self.process is not None:raise ValueError('请先停止代理，再安装内核')
  machine=platform.machine().lower();arch='amd64' if machine in {'x86_64','amd64'} else 'arm64' if machine in {'aarch64','arm64'} else machine
  asset=ASSETS.get((platform.system(),arch))
  if not asset:raise ValueError('一键安装支持Windows/Linux的x64与ARM64；其他平台请在PATH安装mihomo')
  name,digest=asset;url='https://github.com/MetaCubeX/mihomo/releases/download/'+VERSION+'/'+name
  self.message='正在从Mihomo官方发布页下载安装内核…'
  with self.opener(urllib.request.Request(url,headers={'User-Agent':'H3-Visual-Studio'}),timeout=30) as response:
   content=bytearray();total=int(response.headers.get('Content-Length') or 0)
   while chunk:=response.read(256*1024):
    content.extend(chunk)
    if len(content)>80*1024**2:raise ValueError('内核下载包超出大小限制')
    self.progress=min(99,round(len(content)/total*100)) if total else 0
  if hashlib.sha256(content).hexdigest()!=digest:raise ValueError('Mihomo内核SHA256校验失败，未安装')
  if name.endswith('.gz'):
   with gzip.GzipFile(fileobj=io.BytesIO(content)) as archive:binary=archive.read(180*1024**2+1)
  else:
   with zipfile.ZipFile(io.BytesIO(content)) as archive:
    entries=[entry for entry in archive.infolist() if not entry.is_dir() and entry.filename.endswith('.exe')]
    if len(entries)!=1 or entries[0].file_size>180*1024**2:raise ValueError('Mihomo压缩包结构异常')
    binary=archive.read(entries[0])
  if not binary or len(binary)>180*1024**2:raise ValueError('Mihomo内核大小异常')
  self.root.mkdir(parents=True,exist_ok=True)
  # Fetch and retain the unmodified upstream license alongside the independent
  # installed executable; binaries and subscription state never enter the repo.
  with self.opener(urllib.request.Request('https://raw.githubusercontent.com/MetaCubeX/mihomo/'+VERSION+'/LICENSE'),timeout=20) as response:license_text=response.read(100000)
  if b'GNU GENERAL PUBLIC LICENSE' not in license_text:raise ValueError('未获取到Mihomo原始许可证，未安装')
  target=self.root/('mihomo.exe' if os.name=='nt' else 'mihomo');temp=target.with_name(target.name+'.tmp')
  temp.write_bytes(binary);temp.chmod(0o700)
  (self.root/'LICENSE-Mihomo').write_bytes(license_text)
  self._write(self.root/'installation.local.json',{'version':VERSION,'url':url,'sha256':digest,'source':'https://github.com/MetaCubeX/mihomo/tree/'+VERSION})
  temp.replace(target);self.progress=100;self.message='Mihomo内核已安装，可以开启代理'

 def config(self):
  return {'mixed-port':self.port,'allow-lan':False,'bind-address':'127.0.0.1','mode':'rule','log-level':'silent','ipv6':False,
          'external-controller':'127.0.0.1:'+str(self.control),'secret':self.secret,'find-process-mode':'off',
          'geo-auto-update':False,'tun':{'enable':False},'dns':{'enable':False},
          'profile':{'store-selected':False},'proxy-providers':{PROVIDER:{'type':'http','url':self.settings['subscription'],
          'path':'./subscription.yaml','interval':86400,'size-limit':10*1024**2,'proxy':'DIRECT','header':{'User-Agent':['clash.meta']},'health-check':{'enable':False}}},
          'proxy-groups':[{'name':GROUP,'type':'select','use':[PROVIDER]}],'rules':['DOMAIN,hf.x-gpu.com,DIRECT','MATCH,'+GROUP]}

 def _api(self,path,method='GET',data=None,timeout=5):
  if self.process is None:raise ValueError('请先开启代理')
  headers={'Authorization':'Bearer '+self.secret,'Content-Type':'application/json'}
  request=urllib.request.Request('http://127.0.0.1:'+str(self.control)+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
  with self.direct(request,timeout=timeout) as response:
   raw=response.read(2*1024**2);return json.loads(raw) if raw else {}

 def _nodes(self):
  data=self._api('/proxies/'+GROUP);names=data.get('all',[])
  self.nodes=[name for name in names if isinstance(name,str) and len(name)<=512][:2000];self.selected=data.get('now','')
  return self.nodes

 def select(self,name):
  if name not in self.nodes:raise ValueError('订阅节点不存在，请刷新订阅')
  self._api('/proxies/'+GROUP,'PUT',{'name':name});self.selected=name;self.settings['selected']=name;self._write(self.root/'settings.local.json',self.settings)

 def start(self):
  if self.process is not None:raise ValueError('代理已经运行')
  executable=self.executable()
  if not executable:raise ValueError('请先点击安装Mihomo内核')
  if not self.settings.get('subscription'):raise ValueError('请先保存Clash/Mihomo兼容订阅')
  self.secret=secrets.token_urlsafe(32);self.port=free_port();self.control=free_port()
  while self.control==self.port:self.control=free_port()
  self._write(self.root/'config.local.json',self.config());self.message='正在启动代理并加载订阅节点…'
  previous=self.downloads.proxy_address
  try:
   environment={key:value for key,value in os.environ.items() if key.upper() not in {'HF_TOKEN','HUGGING_FACE_HUB_TOKEN','GITHUB_TOKEN','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SAFE_PATHS'} and not key.upper().startswith(('CLASH_','MIHOMO_'))}
   self.process=self.popen([executable,'-d',str(self.root),'-f',str(self.root/'config.local.json')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),env=environment)
   deadline=time.monotonic()+30
   for _ in range(100):
    if time.monotonic()>deadline:break
    if self.process.poll() is not None:raise ValueError('代理内核启动失败，请检查订阅格式或端口占用')
    try:
     if self._nodes():break
    except Exception:pass
    self.sleep(.25)
   if not self.nodes:raise ValueError('未能加载订阅节点，请使用Clash/Mihomo兼容订阅并检查订阅站连接')
   selected=self.settings.get('selected');self.select(selected if selected in self.nodes else self.nodes[0])
   self.previous=previous;self.settings.update(previous_proxy=previous,managed_proxy=self.address);self._write(self.root/'settings.local.json',self.settings)
   self._set_proxy(self.address);self.state='running';self.message='代理已开启，插件的官方源下载将使用所选节点'
  except Exception:self.stop();raise

 def _restore(self):
  managed=self.settings.get('managed_proxy')
  if managed and self.downloads.proxy_address==managed:self._set_proxy(self.settings.get('previous_proxy',''))

 def stop(self):
  process=self.process
  if process is not None:
   if process.poll() is None:
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
   self.process=None
  self._restore();self.state='stopped';self.nodes=[];self.selected=''

 def close(self):
  if self.closing:return
  self.closing=True
  self.pool.shutdown(wait=True,cancel_futures=True)
  try:self.stop()
  except Exception:pass
