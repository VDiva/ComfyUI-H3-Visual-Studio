"""Visual project metadata only. Sampling is performed by official ComfyUI nodes."""
import json

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

def register_video_processing():
    if PromptServer is None: return
    from aiohttp import web
    import folder_paths
    from .video_process import VideoJobs
    jobs=VideoJobs(folder_paths.get_output_directory())
    @PromptServer.instance.routes.post("/h3_visual_studio/process")
    async def start_video_process(request):
        try: return web.json_response(jobs.start(await request.json()))
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
