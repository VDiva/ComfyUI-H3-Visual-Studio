"""Visual project metadata only. Sampling is performed by official ComfyUI nodes."""
import json
video_processing_jobs = None

def ensure_update_idle():
    updater=globals().get("plugin_updater")
    if updater and (updater.updating or updater.restart_required):
        raise ValueError("插件正在更新或已更新等待重启，请重启ComfyUI后再提交任务")

class H3VisualProject:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"project_json": ("STRING", {"default": "{}", "multiline": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("project_json",)
    FUNCTION = "read_project"
    CATEGORY = "MiniMax H3/Visual Studio"
    DESCRIPTION = "Public media and shot editor. Use its panel to queue official MiniMax H3 requests."
    def read_project(self, project_json):
        value = json.loads(project_json)
        if not isinstance(value, dict):
            raise ValueError("Project JSON must be an object")
        return (project_json,)

from .frame_upscale import H3FrameUpscale,H3PreserveImages,H3PreserveLatent
NODE_CLASS_MAPPINGS = {"H3VisualProject": H3VisualProject,"H3FrameUpscale":H3FrameUpscale,"H3PreserveImages":H3PreserveImages,"H3PreserveLatent":H3PreserveLatent}
NODE_DISPLAY_NAME_MAPPINGS = {"H3VisualProject": "H3 可视化工作室（官方流程）","H3FrameUpscale":"H3 逐帧模型超分"}
WEB_DIRECTORY = "./web"
from .latent_upscale import H3DirectorLatentUpscale
NODE_CLASS_MAPPINGS['H3DirectorLatentUpscale']=H3DirectorLatentUpscale
NODE_DISPLAY_NAME_MAPPINGS['H3DirectorLatentUpscale']='H3 Director 3D latent放大'

def register_video_processing():
    global video_processing_jobs
    if PromptServer is None: return
    from aiohttp import web
    import folder_paths
    from .video_process import VideoJobs
    jobs=VideoJobs(folder_paths.get_output_directory())
    video_processing_jobs=jobs
    @PromptServer.instance.routes.post("/h3_visual_studio/process")
    async def start_video_process(request):
        try:
            ensure_update_idle()
            return web.json_response(jobs.start(await request.json()))
        except (ValueError,TypeError,OSError) as error: return web.json_response({"error":str(error)},status=400)
    @PromptServer.instance.routes.get("/h3_visual_studio/process/{job_id}")
    async def video_process_status(request):
        try: return web.json_response(jobs.status(request.match_info["job_id"]))
        except ValueError as error: return web.json_response({"error":str(error)},status=404)
    @PromptServer.instance.routes.post("/h3_visual_studio/process/{job_id}/cancel")
    async def cancel_video_process(request):
        try: return web.json_response(jobs.cancel(request.match_info["job_id"]))
        except ValueError as error: return web.json_response({"error":str(error)},status=404)

# Optional only when imported inside a running ComfyUI server.
try:
    from server import PromptServer
except ImportError:
    PromptServer = None
register_video_processing()
if PromptServer is not None:
    import asyncio
    from aiohttp import web
    import folder_paths
    from .merge_video import merge

    @PromptServer.instance.routes.post("/h3_visual_studio/merge")
    async def merge_videos(request):
        try:
            ensure_update_idle()
            payload = await request.json()
            if not isinstance(payload, dict):
                raise ValueError("请求格式错误")
            video = await asyncio.to_thread(merge, folder_paths.get_output_directory(), payload)
            return web.json_response({"video": video})
        except (ValueError, OSError, TimeoutError) as error:
            return web.json_response({"error": str(error)}, status=400)
        except Exception:
            return web.json_response({"error":"合并失败，请检查服务器日志及FFmpeg安装"}, status=500)

if PromptServer is not None:
    from .model_download import Downloads, load_catalog, BACKEND_VERSION
    def model_directory(category):
        paths = folder_paths.get_folder_paths(category)
        return paths[0] if paths else str(__import__('pathlib').Path(folder_paths.models_dir) / category)
    def invalidate_models():
        # ComfyUI rescans changed directory mtimes on the next get_filename_list call.
        cache = getattr(folder_paths, "filename_list_cache", None)
        if isinstance(cache, dict): cache.clear()
    downloads = Downloads(model_directory, invalidate_models)

    @PromptServer.instance.routes.get("/h3_visual_studio/models")
    async def model_download_status(request):
        return web.json_response({"catalog": load_catalog(), "backend_version": BACKEND_VERSION, "jobs": downloads.status(), "proxy":downloads.proxy_info()})

    @PromptServer.instance.routes.post("/h3_visual_studio/models/download")
    async def start_model_download(request):
        try:
            ensure_update_idle()
            payload = await request.json()
            if not isinstance(payload, dict): raise ValueError("请求格式错误")
            return web.json_response({"jobs":downloads.start(payload.get("keys"))})
        except (ValueError, TypeError) as error:
            return web.json_response({"error":str(error)},status=400)

if PromptServer is not None:
    from pathlib import Path
    proxy_config_path=Path(__file__).parent / "download-proxy.json"
    try:
        if proxy_config_path.is_file(): downloads.configure_proxy(json.loads(proxy_config_path.read_text(encoding="utf-8")).get("address",""))
    except (ValueError,OSError):
        pass

    @PromptServer.instance.routes.post("/h3_visual_studio/models/proxy")
    async def configure_model_proxy(request):
        try:
            payload=await request.json()
            if not isinstance(payload,dict): raise ValueError("代理配置格式错误")
            result=downloads.configure_proxy(payload.get("address",""))
            proxy_config_path.write_text(json.dumps({"address":result["configured"]}),encoding="utf-8")
            return web.json_response({"proxy":result})
        except (ValueError,OSError) as error:
            return web.json_response({"error":str(error)},status=400)

if PromptServer is not None:
    @PromptServer.instance.routes.post("/h3_visual_studio/models/proxy/detect")
    async def detect_model_proxy(request):
        # Explicit manual overrides can be cleared by this auto-detect action.
        downloads.configure_proxy("")
        result=await asyncio.to_thread(downloads.auto_detect_proxy, True)
        proxy_config_path.write_text(json.dumps({"address":""}),encoding="utf-8")
        return web.json_response({"proxy":result})

if PromptServer is not None:
    from .folder_zip import template_zip
    @PromptServer.instance.routes.post("/h3_visual_studio/template/zip")
    async def download_folder_template(request):
        try:
            data=template_zip(await request.json())
            return web.Response(body=data,content_type="application/zip",headers={"Content-Disposition":"attachment; filename=h3-folder-template.zip"})
        except (ValueError,TypeError,AttributeError) as error:
            return web.json_response({"error":str(error)},status=400)

from .selflift import H3SelfLiftSampler
NODE_CLASS_MAPPINGS["H3SelfLiftSampler"]=H3SelfLiftSampler
NODE_DISPLAY_NAME_MAPPINGS["H3SelfLiftSampler"]="H3 SelfLift 渐进一采"

if PromptServer is not None:
    from .dependencies import DependencyManager
    import nodes as comfy_nodes
    custom_paths=folder_paths.get_folder_paths('custom_nodes')
    dependency_manager=DependencyManager(custom_paths[0] if custom_paths else str(Path(__file__).resolve().parent.parent),lambda:comfy_nodes.NODE_CLASS_MAPPINGS,opener=lambda *a,**kw:downloads.opener(*a,**kw),proxy=lambda:downloads.proxy_info().get('effective',''))
    @PromptServer.instance.routes.get('/h3_visual_studio/dependencies')
    async def dependency_status(request):
        return web.json_response(await asyncio.to_thread(dependency_manager.snapshot,request.query.get('refresh')=='1'))
    @PromptServer.instance.routes.post('/h3_visual_studio/dependencies/install')
    async def install_dependencies(request):
        try:
            ensure_update_idle()
            if PromptServer.instance.prompt_queue.get_tasks_remaining()>0:raise ValueError('请等待ComfyUI生成队列结束后再安装运行依赖')
            payload=await request.json()
            if not isinstance(payload,dict):raise ValueError('安装清单格式错误')
            await asyncio.to_thread(downloads.auto_detect_proxy)
            return web.json_response(await asyncio.to_thread(dependency_manager.start,payload.get('keys')))
        except (ValueError,TypeError) as error:return web.json_response({'error':str(error)},status=400)

# Background batches use only this server's loopback ComfyUI API, never a client URL.
if PromptServer is not None:
    from aiohttp import ClientSession, ClientTimeout
    from .batch_jobs import BatchJobs
    batch_connection={}
    async def batch_call(method,path,payload=None):
        if not batch_connection: raise ValueError("后台执行地址尚未初始化")
        async with ClientSession(trust_env=False,timeout=ClientTimeout(total=120)) as session:
            async with session.request(method,batch_connection["url"]+path,json=payload,ssl=False) as response:
                data=await response.json()
                if response.status>=500: raise ValueError("ComfyUI暂时不可用")
                return data
    async def batch_merge(clips):
        return await asyncio.to_thread(merge,folder_paths.get_output_directory(),{"clips":clips})
    batches=BatchJobs(Path(folder_paths.get_output_directory())/"H3_Studio_Batches",batch_call,batch_merge)
    def batch_connect(request):
        host,port,*_=request.transport.get_extra_info("sockname")
        loopback="[::1]" if ":" in host else "127.0.0.1"
        batch_connection["url"]=("https" if request.secure else "http")+"://"+loopback+":"+str(port)
    @PromptServer.instance.routes.get("/h3_visual_studio/batches")
    async def list_batches(request):
        return web.json_response({"jobs":batches.list(request.query.get("pageId"))})
    @PromptServer.instance.routes.post("/h3_visual_studio/batches")
    async def start_batch(request):
        try:
            ensure_update_idle()
            batch_connect(request)
            return web.json_response(batches.start(await request.json()))
        except (ValueError,TypeError,OSError) as error:
            return web.json_response({"error":str(error)},status=400)
    @PromptServer.instance.routes.get("/h3_visual_studio/batches/{batch_id}")
    async def batch_status(request):
        try: return web.json_response(batches.status(request.match_info["batch_id"]))
        except ValueError as error: return web.json_response({"error":str(error)},status=404)
    @PromptServer.instance.routes.post("/h3_visual_studio/batches/{batch_id}/{action}")
    async def batch_action(request):
        try:
            batch_connect(request)
            action=request.match_info["action"]
            if action=="resume":ensure_update_idle()
            if action not in ("stop","resume"): raise ValueError("不支持的批次操作")
            return web.json_response(getattr(batches,action)(request.match_info["batch_id"]))
        except (ValueError,OSError) as error: return web.json_response({"error":str(error)},status=400)

if PromptServer is not None:
    from .plugin_update import PluginUpdater
    from .merge_video import _LOCK as merge_lock
    def plugin_busy_reason():
        if PromptServer.instance.prompt_queue.get_tasks_remaining()>0:return "请等待ComfyUI生成队列结束后再更新插件"
        if any(j.get('state') in {'queued','running','merging','paused'} for j in list(batches.jobs.values())):return "请先完成或停止后台批次，再更新插件"
        if merge_lock.locked():return "FFmpeg正在合并，请完成后再更新插件"
        if video_processing_jobs and any(j.get('state') in {'queued','running'} for j in list(video_processing_jobs.jobs.values())):return "视频处理尚未完成，请稍后更新"
        if any(j.get('state') not in {'done','error'} for j in list(downloads.jobs.values())):return "模型正在下载，请完成后再更新插件"
        if any(j.get('state') in {'queued','installing'} for j in list(dependency_manager.jobs.values())):return "依赖正在安装，请完成后再更新插件"
        return None
    plugin_updater=PluginUpdater(Path(__file__).resolve().parent,opener=lambda *a,**kw:downloads.opener(*a,**kw),busy=plugin_busy_reason,prepare=lambda:downloads.auto_detect_proxy())
    @PromptServer.instance.routes.get('/h3_visual_studio/plugin-update')
    async def plugin_update_status(request):return web.json_response(plugin_updater.snapshot())
    @PromptServer.instance.routes.post('/h3_visual_studio/plugin-update/check')
    async def check_plugin_update(request):
        try:return web.json_response(plugin_updater.check())
        except ValueError as error:return web.json_response({'error':str(error)},status=400)
    @PromptServer.instance.routes.post('/h3_visual_studio/plugin-update/install')
    async def install_plugin_update(request):
        try:
            payload=await request.json()
            if not isinstance(payload,dict):raise ValueError('更新请求格式错误')
            return web.json_response(plugin_updater.install(payload.get('commit')))
        except (ValueError,OSError) as error:return web.json_response({'error':str(error)},status=400)
