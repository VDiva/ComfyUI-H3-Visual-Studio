"""Explicit, fixed-repository plugin updates with staging, backup and rollback."""
from pathlib import Path, PurePosixPath
import base64, copy, hashlib, io, json, os, re, shutil, stat, subprocess, tempfile, threading, time, urllib.error, urllib.parse, urllib.request, uuid, zipfile

REPOSITORY="VDiva/comfy-ui-h3-visual-studio"
REPOSITORY_URL="https://gitee.com/"+REPOSITORY
API_URL="https://gitee.com/api/v5/repos/"+REPOSITORY
PROJECT="ComfyUI-H3-Visual-Studio"
STATE_FILE=".h3-update-state.json"
MAX_ARCHIVE=512*1024**2
MAX_UNPACKED=1536*1024**2
REQUIRED=("__init__.py","version.json","web/studio-runtime.mjs","web/global-entry.js","web/execution-health.mjs","model-catalog.json",
          "director_bridge.py","proxy_core.py","requirements.txt","web/project.mjs","web/director-core.mjs","web/proxy-core.mjs","web/workflow-template.mjs",
          "LICENSE","NOTICE","NOTICE-Director.md","director_core/LICENSE","director_core/__init__.py",
          "director_core/source-manifest.json","director_core/source-normalized-manifest.json",
          "director_core/nodes/director.py","director_core/director/executor_core.py")

def version_tuple(value):
    if not isinstance(value,str) or not re.fullmatch(r"\d+\.\d+\.\d+",value):raise ValueError("version.json版本必须为数字格式，如0.13.0")
    return tuple(map(int,value.split(".")))

def manifest(data):
    if not isinstance(data,dict) or data.get("project")!=PROJECT:raise ValueError("不是H3工作室的version.json，未覆盖插件")
    version_tuple(data.get("version"))
    return data

def preserved(name):
    parts=PurePosixPath(name).parts
    if len(parts)==3 and parts[:2]==('tests','.fixtures') and parts[2] in {'官方采样API基线.json','官方可视化工作流.json'}:return False
    return not parts or any(p.startswith('.') or p in {"__pycache__","models","input","output","user","venv","node_modules"} for p in parts) or parts[0]=="download-proxy.json" or parts[-1].endswith('.local.json')

def unpack(data,destination,subdir):
    destination=Path(destination).resolve()
    total=0;seen=set();managed=[]
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries=archive.infolist()
        if not entries or len(entries)>15000:raise ValueError("更新包文件数量无效")
        roots=set()
        for item in entries:
            name=item.filename
            parts=PurePosixPath(name).parts
            if not parts or name.startswith('/') or '\\' in name or ':' in name or any(p in ('.','..') for p in parts) or any(ord(c)<32 for c in name):raise ValueError("更新包含越界路径")
            if stat.S_ISLNK(item.external_attr>>16):raise ValueError("更新包含符号链接，未安装")
            roots.add(parts[0])
        if len(roots)!=1:raise ValueError("更新包必须有一个仓库根目录")
        prefix=next(iter(roots))+'/' + (subdir.rstrip('/')+'/' if subdir else '')
        for item in entries:
            if not item.filename.startswith(prefix):continue
            name=item.filename[len(prefix):].rstrip('/')
            if not name:continue
            total+=item.file_size
            if total>MAX_UNPACKED:raise ValueError("更新包解压内容过大")
            if preserved(name):continue
            folded=name.casefold()
            if folded in seen:raise ValueError("更新包含重复文件名")
            seen.add(folded)
            target=destination/name
            if not target.resolve().is_relative_to(destination):raise ValueError("更新包路径越界")
            if item.is_dir():target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with archive.open(item) as source,target.open('wb') as output:shutil.copyfileobj(source,output)
            managed.append(name)
    if any(not (destination/name).is_file() for name in REQUIRED):raise ValueError("更新包缺少插件源码、web目录或version.json，请上传完整插件")
    info=manifest(json.loads((destination/'version.json').read_text(encoding='utf-8-sig')))
    sources=json.loads((destination/'director_core/source-manifest.json').read_text(encoding='utf-8-sig'))
    if not isinstance(sources,dict) or not sources:raise ValueError("更新包缺少Director源码清单")
    for name in sources:
        if not isinstance(name,str) or '\\' in name or ':' in name:raise ValueError("Director源码清单路径无效")
        relative=PurePosixPath(name)
        target=(destination/'director_core'/name).resolve()
        if relative.is_absolute() or '..' in relative.parts or not name.endswith('.py') or not target.is_relative_to((destination/'director_core').resolve()):raise ValueError("Director源码清单路径无效")
        if not target.is_file():raise ValueError("更新包缺少Director源码："+name)
    for path in destination.rglob('*.py'):compile(path.read_text(encoding='utf-8-sig'),str(path),'exec')
    catalog=json.loads((destination/'model-catalog.json').read_text(encoding='utf-8-sig'))
    if not isinstance(catalog,list):raise ValueError("更新包模型清单无效")
    return info,managed

class PluginUpdater:
    def __init__(self,root,opener=urllib.request.urlopen,busy=lambda:None,prepare=lambda:None,before_install=lambda:None):
        self.root=Path(root).resolve();self.opener=opener;self.busy=busy;self.prepare=prepare;self.before_install=before_install
        self.lock=threading.RLock();self.candidate=None;self.worker=None
        self.current=manifest(json.loads((self.root/'version.json').read_text(encoding='utf-8-sig')))
        self.state={"state":"idle","message":"点击检查更新，从指定Gitee仓库获取最新提交"}
    def snapshot(self):
        with self.lock:return {"repository":REPOSITORY,"current_version":self.current['version'],**copy.deepcopy(self.state)}
    def update(self,**values):
        with self.lock:self.state.update(values)
    @property
    def updating(self):return self.snapshot()['state'] in {'downloading','validating','installing'}
    @property
    def restart_required(self):return self.snapshot()['state']=='restart_required'
    def running(self):return self.snapshot()['state'] in {'checking','downloading','validating','installing'}
    def fetch(self,url,limit=2*1024**2):
        # URLs are constructed only from this fixed repository and validated SHA.
        headers={"User-Agent":"H3-Visual-Studio-Updater","Accept":"application/json"}
        token=os.environ.get('GITEE_TOKEN')
        if token:url+=('&' if '?' in url else '?')+urllib.parse.urlencode({'access_token':token})
        try:
            with self.opener(urllib.request.Request(url,headers=headers),timeout=60) as response:
                data=response.read(limit+1)
            if len(data)>limit:raise ValueError("Gitee响应过大")
            return json.loads(data)
        except urllib.error.HTTPError as error:
            if error.code==404:raise ValueError("Gitee仓库、版本文件尚未公开或路径不存在，请先上传完整插件和version.json") from error
            if error.code==409:raise ValueError("Gitee仓库还没有提交，请先上传完整插件") from error
            if error.code in (401,403,429):raise ValueError("Gitee未授权或请求受限；私有仓库需在云端设置GITEE_TOKEN，限流时稍后重试") from error
            raise
    def check(self):
        with self.lock:
            if self.running() or self.restart_required:raise ValueError("正在检查/更新，或更新完成等待重启")
            self.state={"state":"checking","message":"正在检查Gitee默认分支"};self.candidate=None
            self.worker=threading.Thread(target=self._check,daemon=True);self.worker.start()
        return self.snapshot()
    def _check(self):
        try:
            self.prepare()
            repo=self.fetch(API_URL)
            branch=repo.get('default_branch')
            if not isinstance(branch,str) or not branch:raise ValueError("仓库尚无默认分支或尚未上传文件")
            commit=self.fetch(API_URL+'/commits/'+urllib.parse.quote(branch,safe=''))
            sha=commit.get('sha','')
            if not re.fullmatch(r'[a-f0-9]{40}',sha):raise ValueError("Gitee提交信息无效")
            remote=None;subdir=''
            for prefix in ('',PROJECT+'/'):
                try:
                    file=self.fetch(API_URL+'/contents/'+prefix+'version.json?ref='+sha,131072)
                    if file.get('encoding')!='base64' or not isinstance(file.get('content'),str):raise ValueError('Gitee版本文件编码无效')
                    data=base64.b64decode(file['content'])
                    if len(data)>65536:raise ValueError('Gitee版本文件过大')
                    content=json.loads(data.decode('utf-8-sig'))
                    remote=manifest(content);subdir=prefix.rstrip('/');break
                except ValueError as error:
                    if '路径不存在' not in str(error):raise
            if remote is None:raise ValueError("仓库根目录或插件子目录缺少version.json，请将插件完整上传")
            try:installed=json.loads((self.root/STATE_FILE).read_text(encoding='utf-8'))
            except (OSError,ValueError):installed={}
            newer=version_tuple(remote['version'])>version_tuple(self.current['version'])
            same=version_tuple(remote['version'])==version_tuple(self.current['version'])
            available=newer or (same and installed.get('commit')!=sha)
            reason='发现可更新版本' if newer else '远端提交尚未同步，可更新到此提交' if available else '当前已是最新提交' if same else '远端版本低于本地，未提供降级'
            candidate={"commit":sha,"version":remote['version'],"subdir":subdir}
            with self.lock:
                self.candidate=candidate
                self.state={"state":"available" if available else "current","available":available,"remote_version":remote['version'],"commit":sha,"commit_url":REPOSITORY_URL+'/commit/'+sha,"message":reason,"checked":time.time()}
        except Exception as error:self.update(state='error',available=False,message=str(error))
    def install(self,sha):
        with self.lock:
            if self.running() or self.restart_required:raise ValueError("正在更新或等待重启")
            if not self.candidate or sha!=self.candidate['commit'] or not self.state.get('available'):raise ValueError("请先检查更新，并选择检查到的提交")
            reason=self.busy()
            if reason:raise ValueError(reason)
            selected=copy.deepcopy(self.candidate)
            self.state.update(state='downloading',message='正在下载已检查的固定提交',bytes=0,total=0,speed=0,available=False)
            self.worker=threading.Thread(target=self._install,args=(selected,),daemon=True);self.worker.start()
        return self.snapshot()
    def _cleanup(self,path):
        path=Path(path)
        if path.parent.resolve()!=self.root.parent or not path.name.startswith('.h3-update-') or not path.name.endswith('.disabled'):raise ValueError("暂存清理路径无效")
        if path.exists():shutil.rmtree(path)
    def _git_archive(self, commit):
        git=shutil.which('git')
        if not git:raise ValueError('Gitee压缩包不可用，请在ComfyUI服务器安装Git后重试')
        self.update(message='Gitee压缩包不可用，正在通过Git下载已锁定提交')
        env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'Never'}
        with tempfile.TemporaryDirectory(prefix='.h3-gitee-',dir=self.root.parent) as tmp:
            checkout=Path(tmp)/'repo'
            archive=Path(tmp)/'source.zip'
            commands=([git,'init','--quiet',str(checkout)],
                      [git,'-C',str(checkout),'fetch','--quiet','--depth=1',REPOSITORY_URL+'.git',commit],
                      [git,'-C',str(checkout),'archive','--format=zip','--prefix='+PROJECT+'-'+commit+'/',
                       '--output='+str(archive),'FETCH_HEAD'])
            for command in commands:
                try:subprocess.run(command,env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=180)
                except (subprocess.SubprocessError,OSError) as error:
                    raise ValueError('无法通过Git获取Gitee更新，请检查服务器Git、网络及仓库访问权限') from error
            if archive.stat().st_size>MAX_ARCHIVE:raise ValueError('更新压缩包超过512MB')
            return archive.read_bytes()

    def _install(self,selected):
        token=uuid.uuid4().hex
        incoming=self.root.parent/('.h3-update-source-'+token+'.disabled')
        stage=self.root.parent/('.h3-update-stage-'+token+'.disabled')
        backup=self.root.parent/('.h3-update-rollback-'+token+'.disabled')
        moved=False
        try:
            self.prepare()
            headers={"User-Agent":"H3-Visual-Studio-Updater"}
            archive_url=REPOSITORY_URL+'/repository/archive/'+selected['commit']+'.zip'
            if os.environ.get('GITEE_TOKEN'):archive_url+='?'+urllib.parse.urlencode({'access_token':os.environ['GITEE_TOKEN']})
            started=time.monotonic();payload=bytearray()
            with self.opener(urllib.request.Request(archive_url,headers=headers),timeout=60) as response:
                total=int(response.headers.get('Content-Length',0) or 0)
                if total>MAX_ARCHIVE:raise ValueError("更新压缩包超过512MB")
                while True:
                    chunk=response.read(1024**2)
                    if not chunk:break
                    payload.extend(chunk)
                    if len(payload)>MAX_ARCHIVE:raise ValueError("更新压缩包超过512MB")
                    self.update(bytes=len(payload),total=total,speed=len(payload)/max(.01,time.monotonic()-started))
            if total and len(payload)!=total:raise ValueError("更新包下载不完整，未覆盖插件")
            if not zipfile.is_zipfile(io.BytesIO(payload)):
                payload=bytearray(self._git_archive(selected['commit']))
                self.update(bytes=len(payload),total=len(payload),speed=len(payload)/max(.01,time.monotonic()-started))
            self.update(state='validating',message='正在检查更新包结构与Python语法')
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:expanded=sum(item.file_size for item in archive.infolist())
            if expanded>MAX_UNPACKED:raise ValueError("更新包解压内容过大")
            old_size=sum(p.stat().st_size for p in self.root.rglob('*') if p.is_file() and not p.is_symlink())
            if shutil.disk_usage(self.root.parent).free < expanded*2+old_size+256*1024**2:raise ValueError("磁盘空间不足，需要暂存更新包及保留旧插件")
            incoming.mkdir()
            info,managed=unpack(bytes(payload),incoming,selected['subdir'])
            if info['version']!=selected['version']:raise ValueError("更新包版本与检查结果不一致")
            # Keep the proxy alive for every Gitee request, then stop an owned
            # core before copying/swapping its executable and private settings.
            self.before_install()
            self.update(state='installing',message='正在替换插件并保留本地配置，完成后清理旧版本')
            shutil.copytree(self.root,stage,symlinks=True)
            try:previous=json.loads((self.root/STATE_FILE).read_text(encoding='utf-8')).get('managed',[])
            except (OSError,ValueError):previous=[]
            for name in previous:
                path=stage/name
                if isinstance(name,str) and not preserved(name) and name not in managed and path.resolve().is_relative_to(stage.resolve()) and path.is_file():path.unlink()
            for name in managed:
                target=stage/name
                if not target.resolve().is_relative_to(stage.resolve()) or target.is_symlink():raise ValueError("本地同名路径为越界链接，未更新")
                target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(incoming/name,target)
            (stage/STATE_FILE).write_text(json.dumps({"commit":selected['commit'],"version":info['version'],"managed":managed,"installed":time.time()},ensure_ascii=False),encoding='utf-8')
            reason=self.busy()
            if reason:raise ValueError(reason+'；未替换插件，请任务结束后重新检查')
            self.root.rename(backup);moved=True
            try:stage.rename(self.root)
            except Exception:
                backup.rename(self.root);moved=False
                raise
            self.current=info
            message='更新完成，旧版本已清理，请重启ComfyUI后强制刷新浏览器'
            try:self._cleanup(backup)
            except OSError:message='更新完成，但旧版本临时目录清理失败：'+str(backup)+'；请重启ComfyUI后删除该目录'
            self.update(state='restart_required',message=message,backup=None,installed_commit=selected['commit'])
        except Exception as error:
            message=str(error)
            if moved and not self.root.exists():message+='；自动恢复未完成，请从备份目录恢复：'+str(backup)
            self.update(state='error',message=message,available=False,backup=str(backup) if backup.exists() else None)
        finally:
            for path in (incoming,stage):
                if path.exists():
                    try:self._cleanup(path)
                    except OSError:pass
