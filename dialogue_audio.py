"""Qwen3-TTS adapters and execution-scoped ExactAudioLock integration.
External nodes are optional and imported only when the dubbing mode is used.
"""
from contextvars import ContextVar
from pathlib import Path
import json, math, shutil, uuid, wave

DIALOGUE_CONTEXT = ContextVar("h3_studio_dialogue", default=None)
REQUIRED_NODES = ("Qwen3TTSVoiceClone", "MiniMaxH3DialogueAudioLock", "MiniMaxH3DialogueAudioFinalize")

def node_class(name):
    import nodes
    value = nodes.NODE_CLASS_MAPPINGS.get(name)
    if value is None:
        package='Qwen3-TTS配音节点与独立环境' if name.startswith('Qwen3TTS') else 'H3 ExactAudioLock对白锁定节点'
        raise ValueError(f"缺少节点 {name}；请到工作室→模型与下载→运行模块与节点依赖，下载安装{package}，完成后重启ComfyUI。模型权重下载不能代替节点安装")
    return value

def unpack(output):
    if hasattr(output, "args"):
        return output.args
    if isinstance(output, dict):
        return output["result"]
    return output

def batch_audio(batch):
    import torch, folder_paths
    root = Path(batch["root"]).resolve()
    temp = Path(folder_paths.get_temp_directory()).resolve()
    files = [Path(f).resolve() for f in batch.get("files", [])]
    if root == temp or not root.is_relative_to(temp) or len(files) != 1 or not files[0].is_relative_to(root):
        raise ValueError("Qwen配音输出无效，正式流程要求单条音频")
    try:
        with wave.open(str(files[0]), "rb") as wav:
            if wav.getsampwidth() != 2 or wav.getcomptype() != "NONE":
                raise ValueError("Qwen输出需为PCM16 WAV，请检查配音节点版本")
            channels, rate = wav.getnchannels(), wav.getframerate()
            data = bytearray(wav.readframes(wav.getnframes()))
        samples = torch.frombuffer(data, dtype=torch.int16).float().div(32768).reshape(-1, channels).T.unsqueeze(0).contiguous()
        return {"waveform": samples, "sample_rate": rate}
    finally:
        shutil.rmtree(root)

def run_qwen(kind, **kwargs):
    cls = node_class(kind)
    if getattr(cls, "RETURN_TYPES", ()) != ("QWEN3_TTS_AUDIO_BATCH",):
        raise ValueError("Qwen节点接口不匹配：本工作流使用 shinrali/ComfyUI-Qwen3-TTS（独立运行环境版）")
    import comfy.model_management as mm
    mm.unload_all_models()
    mm.soft_empty_cache()
    return batch_audio(unpack(cls().generate(**kwargs))[0])

class H3VoiceDesign:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"multiline": True}), "instruct": ("STRING", {"multiline": True}), "language": (["Japanese", "Chinese", "English", "Auto"],), "seed": ("INT", {"default": 666, "min": 0, "max": 0xFFFFFFFF})}}
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "generate"
    CATEGORY = "MiniMax H3/配音"
    def generate(self, text, instruct, language, seed):
        return (run_qwen("Qwen3TTSVoiceDesign", text=text, instruct=instruct, language=language, candidate_count=1, seed=seed),)

class H3QwenClone:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"reference_audio": ("AUDIO",), "text": ("STRING", {"multiline": True}), "language": (["Japanese", "Chinese", "English", "Auto"],), "seed": ("INT", {"default": 666, "min": 0, "max": 0xFFFFFFFF})}}
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "generate"
    CATEGORY = "MiniMax H3/配音"
    def generate(self, reference_audio, text, language, seed):
        if not text.strip():
            raise ValueError("对白不能为空")
        return (run_qwen("Qwen3TTSVoiceClone", reference_audio=reference_audio, text=text, language=language, seed=seed),)

class H3SaveVoice:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"audio": ("AUDIO",), "filename_prefix": ("STRING", {"default": "H3_Voices/角色声音"})}}
    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "MiniMax H3/配音"
    def save(self, audio, filename_prefix):
        import folder_paths
        prefix = str(filename_prefix).replace("\\", "/")
        if not prefix or any(x in ("", ".", "..") for x in prefix.split("/")) or any(c in prefix for c in ':<>"|?*'):
            raise ValueError("配音输出名称须为安全相对路径")
        base = Path(folder_paths.get_output_directory()).resolve()
        target = (base / (prefix + "_" + uuid.uuid4().hex[:8] + ".wav")).resolve()
        if not target.is_relative_to(base):
            raise ValueError("输出必须在ComfyUI output内")
        waveform = audio["waveform"].detach().cpu().float()
        if waveform.ndim != 3 or waveform.shape[0] != 1:
            raise ValueError("配音保存要求单条AUDIO")
        target.parent.mkdir(parents=True, exist_ok=True)
        pcm = waveform[0].T.clamp(-1, 1).mul(32767).round().short().contiguous().numpy().tobytes()
        with wave.open(str(target), "wb") as wav:
            wav.setnchannels(waveform.shape[1]); wav.setsampwidth(2); wav.setframerate(int(audio["sample_rate"])); wav.writeframes(pcm)
        return {"ui": {"audio": [{"filename": target.name, "subfolder": target.parent.relative_to(base).as_posix(), "type": "output"}]}, "result": ()}

def validate_events(timeline, audios):
    rows = json.loads(timeline) if isinstance(timeline, str) else timeline
    if not isinstance(rows, list) or len(rows) > 64:
        raise ValueError("对白时间表必须为数组且不超过64句")
    result = []
    previous_end = 0.0
    for i, row in enumerate(rows):
        start, end = float(row["start"]), float(row["end"])
        if not math.isfinite(start + end) or start < previous_end - 1e-6 or end <= start:
            raise ValueError(f"第{i+1}句对白时间窗重叠或无效")
        audio = audios.get(f"audio_{i}")
        if not isinstance(audio, dict) or int(audio.get("sample_rate", 0)) <= 0:
            raise ValueError(f"第{i+1}句缺少有效配音")
        seconds = audio["waveform"].shape[-1] / int(audio["sample_rate"])
        if seconds > end - start + 1e-6:
            raise ValueError(f"第{i+1}句配音长{seconds:.2f}秒，超过预留{end-start:.2f}秒；请调整台词时段或换更短配音，不会截断或自动加速")
        previous_end = end
        result.append({"audio": audio, "start_frame": int(math.floor(start * 24 + 0.5)), "gain_db": 0.0, "label": str(row.get("speaker", "")) + f"/{i+1}"})
    return result

class H3PrepareDialogue:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"timeline_json": ("STRING", {"multiline": True})}, "optional": {f"audio_{i}": ("AUDIO",) for i in range(64)}}
    RETURN_TYPES = ("H3_STUDIO_DIALOGUE",)
    FUNCTION = "prepare"
    CATEGORY = "MiniMax H3/配音"
    def prepare(self, timeline_json, **audios):
        for name in REQUIRED_NODES[1:]:
            node_class(name)
        return ({"events": validate_events(timeline_json, audios)},)

def apply_dialogue_lock(positive, latent):
    context = DIALOGUE_CONTEXT.get()
    if context is None:
        return positive, latent
    events = context["events"]
    if not events:
        return positive, latent
    vae = context["audio_vae"]
    packed = {f"timed_audio_{i}": event for i, event in enumerate(events)}
    output = node_class("MiniMaxH3DialogueAudioLock").execute(av_latent=latent, audio_vae=vae, timed_audios=packed, mix_policy="prevent_clipping", overflow_policy="error", protect_before_ms=200, protect_after_ms=250, feather_ms=100)
    locked, reference, manifest = unpack(output)
    context["reference"], context["manifest"] = reference, manifest
    from comfy_extras.nodes_minimax_h3 import MiniMaxH3AddGuide
    for event in events:
        positive = unpack(MiniMaxH3AddGuide.execute(positive=positive, latent=locked, frame_idx=event["start_frame"], audio_vae=vae, audio=event["audio"]))[0]
    return positive, locked

def finalize_dialogue(audio):
    context = DIALOGUE_CONTEXT.get()
    if context is None or not context.get("events"):
        return audio
    if "manifest" not in context:
        raise ValueError("配音锁定未执行，禁止静默输出未锁定音轨")
    return unpack(node_class("MiniMaxH3DialogueAudioFinalize").execute(generated_audio=audio, dialogue_reference_audio=context["reference"], dialogue_lock_manifest=context["manifest"]))[0]

NODE_CLASS_MAPPINGS = {cls.__name__: cls for cls in (H3VoiceDesign, H3QwenClone, H3SaveVoice, H3PrepareDialogue)}
NODE_DISPLAY_NAME_MAPPINGS = {"H3VoiceDesign": "H3角色声线设计（额外试听）", "H3QwenClone": "H3固定声线配音（直接生成）", "H3SaveVoice": "H3试听WAV保存与播放", "H3PrepareDialogue": "H3对白时间表（自动锁定）"}


def voice_status():
    """Read-only status; never install packages or download weights implicitly."""
    import importlib, folder_paths
    errors = []
    for name in REQUIRED_NODES:
        try: node_class(name)
        except ValueError as error: errors.append(str(error))
    models = []
    try:
        cls = node_class("Qwen3TTSVoiceClone")
        module = importlib.import_module(cls.__module__)
        runtime = module.runtime_python(module.ROOT / ".venv")
        if not runtime.is_file(): errors.append("Qwen独立环境未安装，请运行该节点包的install.py")
        root = Path(folder_paths.models_dir) / "qwen-voice"
        for model_id in module.MODEL_IDS.values():
            if "Base" not in model_id: continue
            found = module.resolve_model_dir(root, model_id)
            models.append({"id": model_id, "path": str(root / model_id.split('/')[-1]), "installed": bool(found)})
            if not found: errors.append("缺少完整配音模型目录：" + model_id)
    except (ValueError, AttributeError, ImportError) as error:
        errors.append(str(error))
    return {"ready": not errors, "errors": list(dict.fromkeys(errors)), "models": models}
