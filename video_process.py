"""Disk-based video finishing jobs. Fixed FFmpeg filters, original audio stream, no GPU."""
from pathlib import Path
import math
import re
import subprocess
import tempfile
import threading
import time
import uuid
from .merge_video import ffmpeg_path, resolve_clip

def options(payload):
    if not isinstance(payload,dict): raise ValueError("请求格式错误")
    mp=payload.get("megapixels",1)
    if isinstance(mp,bool) or not isinstance(mp,(int,float)) or not math.isfinite(mp) or not 0.1<=mp<=2 or abs(mp*10-round(mp*10))>1e-7:
        raise ValueError("目标须为0.1—2.0 MP，每0.1一档")
    denoise=payload.get("denoise","light")
    sharpen=payload.get("sharpen","light")
    if denoise not in {"off","light","medium"} or sharpen not in {"off","light"}: raise ValueError("无效的视频处理强度")
    return {"megapixels":float(mp),"denoise":denoise,"sharpen":sharpen}

def probe(exe,clip):
    p=subprocess.run([exe,"-nostdin","-hide_banner","-i",str(clip)],capture_output=True,timeout=30,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
    text=p.stderr.decode("utf-8","replace")
    line=next((s for s in text.splitlines() if "Video:" in s),"")
    match=re.search(r"(?:,|\s)(\d{2,5})x(\d{2,5})(?:[\s,\[]|$)",line)
    duration=re.search(r"Duration: (\d+):(\d+):([\d.]+)",text)
    if not match or not duration: raise ValueError("无法读取视频尺寸或时长")
    width,height=map(int,match.groups())
    rotation=re.search(r"rotation of\s+(-?[\d.]+)",text)
    if rotation and round(float(rotation.group(1)))%180: width,height=height,width
    seconds=int(duration[1])*3600+int(duration[2])*60+float(duration[3])
    if seconds<=0: raise ValueError("视频时长无效")
    return width,height,seconds

def video_filter(width,height,settings):
    ratio=width/height
    tw=max(32,round(math.sqrt(settings["megapixels"]*1e6*ratio)/32)*32)
    th=max(32,round(math.sqrt(settings["megapixels"]*1e6/ratio)/32)*32)
    if tw<width or th<height: raise ValueError("目标小于原视频，请提高目标MP；此入口不自动缩小原片")
    filters=[]
    if settings["denoise"]!="off": filters.append("hqdn3d=1.0:0.8:1.5:1.0" if settings["denoise"]=="light" else "hqdn3d=2:1.5:3:2")
    filters.extend([f"scale={tw}:{th}:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2",f"pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2", "setsar=1"])
    if settings["sharpen"]=="light": filters.append("unsharp=5:5:0.35:3:3:0")
    return ",".join(filters),tw,th

class VideoJobs:
    def __init__(self,output_root):
        self.root=Path(output_root).resolve()
        self.lock=threading.RLock()
        self.jobs={}
        self.processes={}
        self.cancelled=set()
        self.worker=threading.Lock()

    def start(self,payload):
        settings=options(payload)
        clip=resolve_clip(self.root,payload.get("clip"))
        ffmpeg_path()
        with self.lock:
            if any(j["state"] in {"queued","running"} for j in self.jobs.values()): raise ValueError("已有视频处理任务运行，请等待或取消后重试")
            # Keep bounded status history; never delete the user's exported videos.
            if len(self.jobs)>=256: self.jobs.pop(next(iter(self.jobs)))
            token=uuid.uuid4().hex
            self.jobs[token]={"id":token,"state":"queued","progress":0,"source":payload["clip"],"settings":settings,"created":time.time()}
        threading.Thread(target=self._run,args=(token,clip,settings),daemon=True).start()
        return self.status(token)

    def status(self,token):
        with self.lock:
            if token not in self.jobs: raise ValueError("任务不存在，服务器重启后请重新处理；已导出文件仍保留")
            return dict(self.jobs[token])

    def cancel(self,token):
        with self.lock:
            self.status(token)
            if self.jobs[token]["state"] not in {"queued","running"}: return self.status(token)
            self.cancelled.add(token)
            process=self.processes.get(token)
            if process is not None and process.poll() is None: process.terminate()
        return self.status(token)

    def _update(self,token,**kwargs):
        with self.lock: self.jobs[token].update(kwargs)

    def _run(self,token,clip,settings):
        directory=self.root/"H3_Processed"
        temporary=directory/(token+".partial.mp4")
        final=directory/(token+".mp4")
        process=None
        try:
            with self.worker:
                if token in self.cancelled: raise InterruptedError("已取消")
                self._update(token,state="running")
                exe=ffmpeg_path()
                width,height,seconds=probe(exe,clip)
                vf,tw,th=video_filter(width,height,settings)
                self._update(token,input_size=[width,height],output_size=[tw,th],duration=seconds,method="FFmpeg降噪/Lanczos插值/轻锐化，非AI超分")
                directory.mkdir(exist_ok=True)
                args=[exe,"-nostdin","-hide_banner","-loglevel","error","-y","-i",str(clip),"-map","0:v:0","-map","0:a:0?","-vf",vf,"-c:v","libx264","-preset","slow","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-fps_mode","passthrough","-movflags","+faststart","-progress","pipe:1","-nostats",str(temporary)]
                with tempfile.TemporaryFile() as errors:
                    process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=errors,text=True,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                    with self.lock:
                        self.processes[token]=process
                        if token in self.cancelled: process.terminate()
                    watchdog=threading.Timer(3600,process.kill)
                    watchdog.daemon=True
                    watchdog.start()
                    try:
                        for line in process.stdout:
                            if line.startswith("out_time_us="):
                                try: self._update(token,progress=min(0.99,max(0,int(line.split("=",1)[1])/1e6/seconds)))
                                except ValueError: pass
                        code=process.wait(timeout=10)
                    finally: watchdog.cancel()
                    if token in self.cancelled: raise InterruptedError("已取消")
                    if code or not temporary.is_file() or not temporary.stat().st_size:
                        errors.seek(0)
                        raise ValueError("视频处理失败："+errors.read().decode("utf-8","replace")[-1800:])
                temporary.replace(final)
                self._update(token,state="done",progress=1,video={"filename":final.name,"subfolder":"H3_Processed","type":"output"})
        except InterruptedError:
            self._update(token,state="cancelled",error="用户取消，原片保留")
        except Exception as error:
            self._update(token,state="error",error=str(error))
        finally:
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            temporary.unlink(missing_ok=True)
            with self.lock:
                self.processes.pop(token,None)
                self.cancelled.discard(token)
