"""Persisted sequential ComfyUI batches. No GPU work runs in the HTTP handler."""
import asyncio
import copy
import json
import re
import time
from pathlib import Path


def videos(history):
    rows=[]
    for output in history.get("outputs",{}).values():
        for key in ("images","videos","gifs"):
            for row in output.get(key,[]) or []:
                if isinstance(row,dict) and re.search(r"\.(mp4|mov|webm|mkv)$",row.get("filename",""),re.I):
                    row={**row,"type":"output"}
                    if row not in rows: rows.append(row)
    def original(row):
        return any(part.endswith("_original") for part in (row.get("subfolder","")+"/"+row["filename"]).replace("\\","/").split("/"))
    return [r for r in rows if not original(r)],[r for r in rows if original(r)]


class BatchJobs:
    def __init__(self,directory,call,merge=None,interval=1.5):
        self.directory=Path(directory)
        self.call=call
        self.merge=merge
        self.interval=interval
        self.jobs={}
        self.tasks={}
        self.directory.mkdir(parents=True,exist_ok=True)
        for path in self.directory.glob("*.json"):
            try:
                job=json.loads(path.read_text(encoding="utf-8"))
                if job.get("id")!=path.stem or not re.fullmatch(r"[a-f0-9]{32}",path.stem): continue
                if job.get("state") in ("running","merging","queued"):
                    job["state"]="paused"
                    job["error"]="服务器重启，点击继续后台批次；已提交任务不会重新提交"
                self.jobs[job["id"]]=job
            except (OSError,ValueError,TypeError): continue

    def save(self,job):
        job["updated"]=time.time()
        target=self.directory/(job["id"]+".json")
        temp=target.with_suffix(".tmp")
        temp.write_text(json.dumps(job,ensure_ascii=False),encoding="utf-8")
        temp.replace(target)

    def status(self,key):
        if key not in self.jobs: raise ValueError("后台批次不存在")
        source=self.jobs[key]
        return {**{k:copy.deepcopy(v) for k,v in source.items() if k!="items"},"items":[{k:copy.deepcopy(v) for k,v in item.items() if k not in ("prompt","workflow")} for item in source["items"]]}

    def list(self,page_id=None):
        return [self.status(j["id"]) for j in sorted(self.jobs.values(),key=lambda j:j["created"],reverse=True) if page_id is None or j.get("pageId")==page_id]

    def start(self,payload):
        if not isinstance(payload,dict): raise ValueError("批次格式错误")
        key=payload.get("id")
        if not isinstance(key,str) or not re.fullmatch(r"[a-f0-9]{32}",key): raise ValueError("批次ID无效")
        if key in self.jobs: return self.status(key) # idempotent browser retry
        items=payload.get("items")
        if not isinstance(items,list) or not 1<=len(items)<=200: raise ValueError("每批支持1—200段")
        page_id=payload.get("pageId")
        if not isinstance(page_id,str) or not page_id or len(page_id)>200: raise ValueError("缺少页面ID")
        if any(j["state"] in ("running","queued","merging","paused") and j.get("pageId")==page_id for j in self.jobs.values()): raise ValueError("此页面已有未结束批次，请先查询、继续或停止")
        clean=[]; ids=set()
        for item in items:
            if not isinstance(item,dict) or not isinstance(item.get("prompt"),dict) or not item["prompt"] or len(item["prompt"])>2000: raise ValueError("执行图无效")
            group=item.get("groupId")
            if not isinstance(group,str) or not group or group in ids: raise ValueError("分段ID缺失或重复")
            ids.add(group)
            clean.append({"groupId":group,"label":str(item.get("label",group))[:200],"prompt":copy.deepcopy(item["prompt"]),"workflow":copy.deepcopy(item.get("workflow",{})),"state":"pending"})
        job={"id":key,"pageId":page_id,"created":time.time(),"state":"queued","stop":False,"autoMerge":bool(payload.get("autoMerge")),"items":clean}
        self.jobs[key]=job;self.save(job);self.launch(job)
        return self.status(key)

    def launch(self,job):
        if job["id"] not in self.tasks or self.tasks[job["id"]].done():
            self.tasks[job["id"]]=asyncio.create_task(self.run(job))

    def stop(self,key):
        job=self.jobs.get(key)
        if not job: raise ValueError("后台批次不存在")
        job["stop"]=True
        if job["state"]=="paused": job["state"]="stopped"
        self.save(job);return self.status(key)

    def resume(self,key):
        job=self.jobs.get(key)
        if not job or job["state"]!="paused": raise ValueError("只有暂停的批次可继续；失败批次请检查后新建")
        if any(i["state"]=="submitting" and not i.get("promptId") for i in job["items"]): raise ValueError("有任务提交结果不确定，请先检查ComfyUI队列，停止此批次后重新选择剩余分段，避免重复生成")
        job["stop"]=False;job["state"]="queued";job.pop("error",None);self.save(job);self.launch(job)
        return self.status(key)

    async def run(self,job):
        try:
            job["state"]="running";self.save(job)
            for item in job["items"]:
                if item["state"]=="done": continue
                if job["stop"] and not item.get("promptId"): break
                if not item.get("promptId"):
                    item["state"]="submitting";self.save(job)
                    try:
                        data=await self.call("POST","/prompt",{"prompt":item["prompt"],"extra_data":{"extra_pnginfo":{"workflow":item["workflow"]}}})
                    except Exception:
                        job["state"]="paused";job["error"]="提交结果不确定，已暂停；请检查ComfyUI队列，禁止自动重试";self.save(job);return
                    if not data.get("prompt_id"):
                        item["state"]="error";raise ValueError("ComfyUI拒绝执行图："+str(data.get("error",data))[:1800])
                    item["promptId"]=data["prompt_id"];item["state"]="queued";self.save(job)
                missing=0
                while True:
                    history=(await self.call("GET","/history/"+item["promptId"])).get(item["promptId"])
                    if history:
                        if not history.get("status",{}).get("completed") or history["status"].get("status_str")!="success":
                            item["state"]="error";raise ValueError(item["label"]+"生成失败："+str(history.get("status",{}).get("messages",[]))[-1800:])
                        item["videos"],item["originalVideos"]=videos(history)
                        if not item["videos"]: item["state"]="error";raise ValueError(item["label"]+"未返回视频")
                        item["state"]="done";self.save(job);break
                    queue=await self.call("GET","/queue")
                    running=any(str(r[1])==item["promptId"] for r in queue.get("queue_running",[]))
                    queued=running or any(str(r[1])==item["promptId"] for r in queue.get("queue_pending",[]))
                    old_state=item["state"]
                    item["state"]="running" if running else "queued"
                    missing=0 if queued else missing+1
                    if missing>=5: raise ValueError("任务不在队列且无历史结果，停止后续提交；不会自动重提")
                    if old_state!=item["state"]: self.save(job)
                    await asyncio.sleep(self.interval)
            if not job["stop"] and job["autoMerge"] and len(job["items"])>1:
                clips=[]
                for item in job["items"]:
                    if len(item.get("videos",[]))!=1: raise ValueError("成片不唯一，无法自动合并")
                    clips.extend(item["videos"])
                if not self.merge: raise ValueError("服务器没有合并接口")
                job["state"]="merging";self.save(job)
                job["mergedVideo"]=await self.merge(clips)
            job["state"]="stopped" if job["stop"] else "done"
        except asyncio.CancelledError:
            job["state"]="paused";job["error"]="服务中断，可恢复查询已提交任务"
            raise
        except Exception as error:
            job["state"]="error";job["error"]=str(error)
        finally:
            self.save(job)
