"""Allowlisted model downloads; workers never execute downloaded files."""
from pathlib import Path
import time
from collections import deque
import urllib.error, urllib.parse, socket, errno, http.client, ssl
import re, json, threading, concurrent.futures, urllib.request, hashlib, os, shutil
BACKEND_VERSION = "0.5.13"
CATALOG_PATH = Path(__file__).parent / "model-catalog.json"
DMAD_MODEL = {
    "key": "models/loras/dmad_minimax_h3_4step_full_critic_comfyui.safetensors",
    "category": "loras", "name": "dmad_minimax_h3_4step_full_critic_comfyui.safetensors",
    "url": "https://huggingface.co/ZhengmingYu/DMAD/resolve/main/minimax_h3/dmad_minimax_h3_4step_full_critic_comfyui.safetensors",
    "source": "https://huggingface.co/ZhengmingYu/DMAD", "size": None, "sha256": None,
}
def load_catalog():
    rows = json.loads(CATALOG_PATH.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list): raise ValueError("模型下载清单必须是数组")
    # Fixed, trusted fallback for installations whose external catalog predates DMAD.
    rows = [row for row in rows if row.get("key") != DMAD_MODEL["key"]]
    return [dict(DMAD_MODEL)] + rows
CATALOG = load_catalog()

def installed_voice_models(directory):
    installed=[]
    for row in load_catalog():
        if row.get('category')!='qwen-voice':continue
        try:
            root=Path(directory('qwen-voice')).resolve()
            file=(root/row['name']).resolve()
            if file.is_relative_to(root) and file.is_file() and file.stat().st_size==row['size']:
                installed.append(row['key'])
        except (OSError,KeyError,TypeError):pass
    return installed


class DownloadStopped(Exception):
    pass
def download_error(error, stage):
    prefix="["+stage+"] "
    if isinstance(error, urllib.error.HTTPError):
        reasons={401:"下载源要求登录，请在云端配置HF_TOKEN",403:"下载源拒绝访问，可能需要授权或签名链接失效",404:"下载源找不到此模型文件或版本",429:"下载源请求限流，请稍后重试"}
        return prefix+"HTTP "+str(error.code)+"："+reasons.get(error.code,"下载服务异常，请稍后重试")
    if isinstance(error,(TimeoutError,socket.timeout)) or isinstance(error,urllib.error.URLError) and isinstance(error.reason,(TimeoutError,socket.timeout)):
        return prefix+"云端连接或读取超时（连续60秒无响应，不是整个下载只能60秒）；请检查云端网络后重试"
    if isinstance(error,urllib.error.URLError):
        return prefix+"云端网络连接失败："+str(error.reason)
    if isinstance(error,OSError) and error.errno==errno.ENOSPC:
        return prefix+"云端磁盘已满，请释放模型所在磁盘空间"
    if isinstance(error,OSError) and error.errno==errno.EROFS:
        return prefix+"模型目录或断点文件指向只读存储；请检查挂载及符号链接，切换下载源不能解决"
    if isinstance(error,PermissionError):
        return prefix+"云端目录没有写入权限，请检查模型目录挂载权限"
    if isinstance(error,OSError) and error.errno in {errno.EXDEV,errno.EOPNOTSUPP,errno.ENOSYS}:
        return prefix+"模型已下载，但存储挂载不支持硬链接安装，请更换支持硬链接的模型目录"
    return prefix+str(error)

class DownloadRate:
    def __init__(self, clock=time.monotonic):
        self.clock=clock;self.started=clock();self.last_received=self.started;self.samples=deque()
    def add(self, count):
        now=self.clock();self.last_received=now;self.samples.append((now,count))
        self.value(now)
    def value(self, now=None):
        now=self.clock() if now is None else now
        while self.samples and self.samples[0][0] <= now-5: self.samples.popleft()
        elapsed=min(5,max(0,now-self.started))
        return sum(count for _,count in self.samples)/elapsed if elapsed>=0.25 else 0

def proxy_opener(address):
    if address:
        parsed=urllib.parse.urlsplit(address)
        if parsed.scheme not in {"http","https"} or not parsed.hostname or not parsed.port or parsed.username or parsed.password or parsed.path not in {"","/"} or parsed.query or parsed.fragment:
            raise ValueError("请填写HTTP代理地址及端口，如http://127.0.0.1:7890；使用Clash的HTTP或Mixed端口，不支持SOCKS或带密码地址")
        return urllib.request.build_opener(urllib.request.ProxyHandler({"http":address,"https":address})).open
    return urllib.request.build_opener(urllib.request.ProxyHandler()).open

def detect_proxy(candidates=None, connector=socket.create_connection, validate=None):
    if candidates is None:
        system=urllib.request.getproxies()
        candidates=[(system[k],"系统/环境代理") for k in ["https","http"] if system.get(k)]
        candidates += [("http://127.0.0.1:"+str(port),"本机HTTP/Mixed端口") for port in [7890,7897,7892,10809,8080]]
    if validate is None:
        def validate(address):
            with proxy_opener(address)(urllib.request.Request("https://huggingface.co/api/models/Comfy-Org/Qwen-Image-2.1",method="HEAD"),timeout=6) as response:
                return getattr(response,"status",200)==200
    seen=set()
    for address,source in candidates:
        if "://" not in address: address="http://"+address
        if address in seen: continue
        seen.add(address)
        try:
            parsed=urllib.parse.urlsplit(address)
            proxy_opener(address)  # Validate scheme, credentials and explicit port.
            with connector((parsed.hostname,parsed.port),timeout=0.4): pass
            if validate(address): return {"address":address,"source":source,"message":"已验证代理可连接Hugging Face"}
        except Exception:
            continue
    return {"address":"","source":"自动检测","message":"未找到可访问下载站的HTTP代理，使用系统默认连接；请确认云端Clash已启动"}

class Downloads:
    SOURCE_MODES=('auto','xiangongyun','official')
    def __init__(self, directory, invalidate=lambda: None, opener=urllib.request.urlopen, sleeper=time.sleep):
        self.directory, self.invalidate, self.opener = directory, invalidate, opener
        self.internal_opener=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
        self.sleeper=sleeper
        self.proxy_address=""
        self.source_mode='auto'
        self.auto_proxy="";self.proxy_message="等待自动检测";self.proxy_checked=0
        self.auto_enabled=opener is urllib.request.urlopen
        self.jobs = {}; self.rates = {}; self.lock = threading.Lock()
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="h3-model")
    @staticmethod
    def source_failure(error):
        if isinstance(error, urllib.error.HTTPError):
            return error.code in {404, 408, 429, 500, 502, 503, 504}
        if isinstance(error, urllib.error.URLError):
            return True
        return isinstance(error, (TimeoutError, ConnectionError, http.client.HTTPException)) or (
            isinstance(error, OSError) and error.errno in {
                errno.ECONNRESET, errno.ECONNREFUSED, errno.ETIMEDOUT,
                errno.ENETUNREACH, errno.EHOSTUNREACH,
            }) or isinstance(error, ssl.SSLError)

    def open_source(self, request, key, timeout=60):
        self.check_stopped(key)
        # Try the cloud mirror directly first; only official requests use proxy
        # detection and HF credentials. The first real request is the probe.
        parsed=urllib.parse.urlsplit(request.full_url)
        if parsed.scheme != "https" or parsed.netloc != "huggingface.co":
            return self.opener(request, timeout=timeout)
        with self.lock:
            mode=self.jobs[key].get('source_mode',self.source_mode)
            official=mode=='official' or (mode=='auto' and self.jobs[key].get("download_source")=="official")
            available=self.jobs[key].get("mirror_available",False)
        if not official:
            self.update(key, download_source="xiangongyun")
            url=urllib.parse.urlunsplit(("http", "hf.x-gpu.com", parsed.path, parsed.query, ""))
            headers={k:v for k,v in request.header_items()
                     if k.lower() not in {"authorization", "proxy-authorization", "cookie"}}
            try:
                response=self.internal_opener(urllib.request.Request(url, headers=headers,
                                             method=request.get_method()), timeout=timeout if available else min(timeout,8))
                self.update(key,mirror_available=True)
                return response
            except Exception as error:
                if mode=='xiangongyun':raise
                if not (self.source_failure(error) or isinstance(error,urllib.error.HTTPError)):
                    raise
                self.update(key, download_source="official",reset_mirror_prefix=True,
                            error="仙宫云线路不可用，切换Hugging Face官方源")
        self.auto_detect_proxy()
        self.check_stopped(key)
        return self.opener(request, timeout=timeout)

    def configure_source(self, mode):
        if mode not in self.SOURCE_MODES:raise ValueError('下载源请选择auto、xiangongyun或official')
        with self.lock:self.source_mode=mode
        return mode

    def configure_proxy(self, address):
        if not isinstance(address,str): raise ValueError("代理地址格式错误")
        address=address.strip()
        opener=proxy_opener(address)
        self.opener=opener;self.proxy_address=address;self.proxy_checked=0;self.auto_proxy="";self.auto_enabled=True
        return self.proxy_info()
    def auto_detect_proxy(self, force=False):
        if self.proxy_address or not self.auto_enabled: return self.proxy_info()
        if not force and time.monotonic()-self.proxy_checked<300: return self.proxy_info()
        self.proxy_message="正在自动检测系统代理及本机Clash端口…"
        result=detect_proxy()
        self.auto_proxy=result["address"];self.proxy_message=result["message"]
        self.opener=proxy_opener(self.auto_proxy)
        self.proxy_checked=time.monotonic()
        return self.proxy_info()
    def proxy_info(self):
        effective=self.proxy_address or self.auto_proxy
        if not effective:
            raw=urllib.request.getproxies().get("https") or urllib.request.getproxies().get("http") or ""
            parsed=urllib.parse.urlsplit(raw if "://" in raw else "http://"+raw)
            if parsed.hostname:
                effective=(parsed.scheme or "http")+"://"+parsed.hostname+(":"+str(parsed.port) if parsed.port else "")
        return {"configured":self.proxy_address,"effective":effective,"mode":"explicit" if self.proxy_address else "auto","message":self.proxy_message}
    def status(self):
        with self.lock:
            result={}
            for key, job in self.jobs.items():
                value=dict(job)
                speed=self.rates[key].value() if job.get("state")=="downloading" and key in self.rates else 0
                value["speed_bps"]=speed
                value["idle_seconds"]=max(0,self.rates[key].clock()-self.rates[key].last_received) if job.get("state")=="downloading" and key in self.rates else 0
                value["eta_seconds"]=(max(0,job["total"]-job.get("bytes",0))/speed if job.get("total") and speed>0 else None)
                result[key]=value
            return result
    def update(self, key, **values):
        with self.lock:
            if self.jobs[key].get('stop_requested') and values.get('state') in {'queued','connecting','downloading','verifying','retrying'}:values['state']='stopping'
            self.jobs[key].update(values)
    def check_stopped(self,key):
        with self.lock:
            if self.jobs[key].get('stop_requested'):raise DownloadStopped()
    def stop(self, keys=None):
        if keys is not None and (not isinstance(keys,list) or not keys or any(not isinstance(k,str) for k in keys)):raise ValueError('请选择要停止的下载')
        with self.lock:
            if keys is not None and any(k not in self.jobs for k in keys):raise ValueError('下载任务不存在')
            for key in (keys if keys is not None else list(self.jobs)):
                job=self.jobs[key]
                if job.get('state') in {'queued','connecting','downloading','verifying','retrying','stopping'}:
                    job.update(stop_requested=True,state='stopping',error='正在停止；等待当前网络读写返回，断点将保留')
        return self.status()
    def start(self, keys):
        if not isinstance(keys,list) or not keys or len(keys)>32: raise ValueError("请选择模型")
        catalog={m["key"]:m for m in load_catalog()}
        if any(not isinstance(k,str) or k not in catalog for k in keys): raise ValueError("模型没有已核实的下载地址，不能自动下载")
        for key in dict.fromkeys(keys):
            with self.lock:
                if self.jobs.get(key,{}).get("state") in {"queued","connecting","downloading","verifying","retrying","stopping"}: continue
                self.rates.pop(key,None)
                self.jobs[key]={"state":"queued","bytes":0,"total":catalog[key]["size"],"error":"","source_mode":self.source_mode}
            self.pool.submit(self.run,catalog[key])
        return self.status()
    def run(self, model, _official=False):
        key=model["key"];part=None;stage="准备目录"
        try:
            self.check_stopped(key)
            root=Path(self.directory(model["category"])).resolve();root.mkdir(parents=True,exist_ok=True)
            target=(root/model["name"]).resolve()
            if not target.is_relative_to(root): raise ValueError("模型路径越界")
            if target.exists(): raise ValueError("目标文件已存在，未覆盖；请先检查已有文件")

            target.parent.mkdir(parents=True,exist_ok=True)
            part=target.with_name(target.name+".h3download.part")
            headers={"User-Agent":"H3-Visual-Studio"}
            token=os.environ.get("HF_TOKEN")
            if token: headers["Authorization"]="Bearer "+token
            with self.lock:
                mode=self.jobs[key].setdefault('source_mode',self.source_mode)
            self.update(key,state="connecting",download_source="official" if _official or mode=='official' else "xiangongyun",mirror_available=False,reset_mirror_prefix=False)
            # Resolve exact repository metadata in the cloud, where download happens.
            repo, filepath = model["url"].split("https://huggingface.co/",1)[1].split("/resolve/main/",1)
            stage="获取模型信息"
            for metadata_attempt in range(2):
                self.check_stopped(key)
                try:
                    with self.open_source(urllib.request.Request("https://huggingface.co/api/models/"+repo+"?blobs=true",headers=headers),key,timeout=60) as meta:
                        metadata=json.load(meta)
                    entry=next((s for s in metadata.get("siblings",[]) if s.get("rfilename")==filepath),{})
                    lfs=entry.get("lfs",{});expected=lfs.get("sha256");size=entry.get("size") or lfs.get("size")
                    algorithm='sha256'
                    if not expected and model.get('category')=='qwen-voice':
                        expected=entry.get('blobId');algorithm='git-sha1'
                    pattern=r'[a-f0-9]{40}' if algorithm=='git-sha1' else r'[a-f0-9]{64}'
                    if not isinstance(expected,str) or not re.fullmatch(pattern,expected) or not isinstance(size,int) or size<=0 or not isinstance(metadata.get('sha'),str) or not metadata['sha']:raise ValueError("下载源未返回版本、大小/SHA256，无法校验，未下载")
                    break
                except (ValueError,TypeError,AttributeError,OSError,http.client.HTTPException) as error:
                    if mode!='auto' or self.jobs[key].get('download_source')!='xiangongyun' or metadata_attempt:raise
                    self.update(key,download_source='official',error='仙宫云模型信息不可用，切换官方源')
            metadata_source=self.jobs[key].get('download_source')
            self.check_stopped(key)
            self.update(key,reset_mirror_prefix=False)
            marker=part.with_name(part.name+".json")
            identity={"sha256":expected,"size":size}
            if algorithm!='sha256':identity['algorithm']=algorithm
            try: compatible=json.loads(marker.read_text())==identity
            except (OSError,ValueError): compatible=False
            if not compatible or part.exists() and part.stat().st_size>size:
                part.unlink(missing_ok=True)
            marker.write_text(json.dumps(identity),encoding="utf-8")
            offset=part.stat().st_size if part.exists() else 0
            if shutil.disk_usage(root).free < size-offset+1024**3: raise ValueError("磁盘空间不足（需额外预留1GB）")
            url="https://huggingface.co/"+repo+"/resolve/"+metadata["sha"]+"/"+filepath
            self.update(key,total=size,bytes=offset)
            stage="下载模型文件"
            for attempt in range(1,5):
                self.check_stopped(key)
                offset=part.stat().st_size if part.exists() else 0
                if offset and self.jobs[key].get('reset_mirror_prefix'):
                    part.unlink(missing_ok=True);offset=0
                    self.update(key,bytes=0,reset_mirror_prefix=False)
                if offset==size: break
                try:
                    request_headers=dict(headers)
                    if offset: request_headers["Range"]="bytes="+str(offset)+"-"
                    with self.open_source(urllib.request.Request(url,headers=request_headers),key,timeout=60) as response:
                        # A failed mirror stream may contain bytes from another
                        # mirror artifact. Never concatenate that prefix with HF.
                        if self.jobs[key].get('reset_mirror_prefix') and offset:
                            part.unlink(missing_ok=True)
                            self.update(key,bytes=0,reset_mirror_prefix=False)
                            continue
                        self.update(key,reset_mirror_prefix=False)
                        status=getattr(response,"status",200)
                        if status==206:
                            content_range=response.headers.get("Content-Range","")
                            match=re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",content_range)
                            if not match or int(match[1])!=offset or int(match[3])!=size: raise ValueError("下载源续传位置不一致，保留临时文件")
                        elif status==200:
                            offset=0  # Server ignored Range: restart rather than append corrupt data.
                        else: raise ValueError("下载响应异常："+str(status))
                        with self.lock: self.rates[key]=DownloadRate()
                        self.update(key,state="downloading",bytes=offset,attempt=attempt,error="")
                        with part.open("ab" if status==206 else "wb") as out:
                            # read1 returns available network data instead of waiting to fill a large read buffer.
                            read=getattr(response,"read1",response.read)
                            while True:
                                self.check_stopped(key)
                                chunk=read(64*1024)
                                self.check_stopped(key)
                                if not chunk: break
                                if offset+len(chunk)>size: raise ValueError("下载源返回的数据超过模型大小")
                                out.write(chunk);offset+=len(chunk)
                                with self.lock:
                                    self.rates[key].add(len(chunk));self.jobs[key]["bytes"]=offset
                    if offset!=size: raise ConnectionError(f"传输提前结束：已收到{offset}字节，应为{size}字节")
                    break
                except (OSError,urllib.error.URLError,http.client.HTTPException) as error:
                    self.check_stopped(key)
                    if isinstance(error,urllib.error.HTTPError) and error.code not in {408,429,500,502,503,504}: raise
                    if isinstance(error,OSError) and error.errno in {errno.ENOSPC,errno.EACCES,errno.EROFS,errno.EPERM}: raise
                    if mode=='auto' and self.source_failure(error):
                        was_mirror=self.jobs[key].get('download_source')=='xiangongyun'
                        self.update(key,download_source="official",reset_mirror_prefix=was_mirror)
                    if attempt==4: raise ConnectionError("自动重试4次仍失败；已保留断点，点击重试可继续。"+str(error)) from error
                    self.update(key,state="retrying",attempt=attempt,error=download_error(error,stage))
                    self.sleeper(min(2**attempt,8))
            stage="校验文件"
            self.check_stopped(key)
            self.update(key,state="verifying")
            digest=hashlib.sha1() if algorithm=='git-sha1' else hashlib.sha256()
            if algorithm=='git-sha1':digest.update(('blob '+str(size)+'\0').encode())
            with part.open("rb") as downloaded:
                while chunk:=downloaded.read(4*1024*1024):
                    self.check_stopped(key)
                    digest.update(chunk)
            if part.stat().st_size!=size: raise ValueError("下载文件不完整，已保留断点")
            self.check_stopped(key)
            actual=digest.hexdigest()
            self.update(key,expected_sha256=expected,actual_sha256=actual,revision=metadata['sha'],metadata_source=metadata_source)
            if actual!=expected:
                # Keep evidence until the next retry. This marker prevents
                # resuming a known-bad full file or installing it as a model.
                marker.write_text(json.dumps({**identity,'verification_failed':True,'actual_sha256':actual}),encoding='utf-8')
                if mode=='auto' and not _official and (metadata_source=='xiangongyun' or self.jobs[key].get('download_source')=='xiangongyun'):
                    self.update(key,state='retrying',download_source='official',error='仙宫云文件校验失败，改从官方重新下载')
                    self.run(model,_official=True)
                    return
                raise ValueError("完整文件SHA256校验失败，文件已保留待检查，未安装；重试会重新下载。预期="+expected+"；实际="+actual)
            # Never overwrite files created by another downloader while this job was running.
            stage="安装模型文件"
            with self.lock:
                if self.jobs[key].get('stop_requested'):raise DownloadStopped()
                os.link(part,target);part.unlink();marker.unlink(missing_ok=True);part=None
                self.jobs[key].update(state='done')
            self.invalidate()
            self.update(key,state="done")
        except DownloadStopped:
            self.update(key,state='stopped',error='已停止，断点已保留；点击继续下载可续传')
        except Exception as error:
            with self.lock:stopped=self.jobs[key].get('stop_requested',False)
            self.update(key,state='stopped' if stopped else 'error',error='已停止，断点已保留；点击继续下载可续传' if stopped else download_error(error,stage))
        finally:
            pass  # Verified-identity partial files survive failures and server restarts.
