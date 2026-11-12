"""Execution-scoped Director acceleration, using public ComfyUI patcher APIs.

No AICG3D code or frontend is imported. Tensor dependencies are lazy so policy
and lifecycle tests can run without a ComfyUI installation.
"""
from __future__ import annotations

from collections import OrderedDict
from contextvars import ContextVar
from functools import wraps
import hashlib
import logging
import math
import time

log = logging.getLogger("ComfyUI-MiniMaxH3-Director.performance")
_CURRENT = ContextVar("director_performance", default=None)
RESIDENCY = ("legacy", "cache", "keep", "unload")
ATTENTION = ("inherit", "auto", "sage", "sage3", "flash", "comfy_kitchen_int8", "pytorch")


def performance_inputs():
    # Appended after existing widget inputs: old positional workflows stay valid.
    return {
        "model_residency": (list(RESIDENCY), {"default": "legacy", "tooltip": "段间策略：legacy=旧开关行为；cache=仅清缓存；keep=保留模型与缓存；unload=卸载模型。仅在段间清理开关开启时生效，二采前强制清理不受影响。"}),
        "attention_backend": (list(ATTENTION), {"default": "inherit", "tooltip": "inherit 保持输入 MODEL 补丁；auto 优先已注册 Sage，否则不修改。实际结果写入日志，不自动安装依赖。"}),
        "reference_encode_cache_mb": ("INT", {"default": 256, "min": 0, "max": 2048, "step": 64, "tooltip": "同一次运行内复用完全相同的 VAE 编码，图片/音频/视频共用 CPU LRU 上限；0 关闭。运行结束释放。"}),
        "motion_cache": ("BOOLEAN", {"default": False, "tooltip": "实验性一采预测复用，可能改变动作、口型和细节。仅普通一采、CFG=1、无负面条件、>=8步、euler/res_multistep启用。二采/脸修/SelfLift跳过。"}),
        "motion_cache_threshold": ("FLOAT", {"default": 0.02, "min": 0.001, "max": 0.2, "step": 0.005, "tooltip": "实验性运动缓存：归一化 latent 变化阈值，越大越激进。预热4次、保留末2次、最多连续复用1次。"}),
    }


def normalize_config(values=None):
    values = values or {}
    def finite(name, default):
        try:
            value = float(values.get(name, default))
            return value if math.isfinite(value) else default
        except (TypeError, ValueError):
            return default
    residency = str(values.get("model_residency", "legacy"))
    attention = str(values.get("attention_backend", "inherit"))
    return {
        "model_residency": residency if residency in RESIDENCY else "legacy",
        "attention_backend": attention if attention in ATTENTION else "inherit",
        "reference_encode_cache_mb": max(0, min(2048, int(finite("reference_encode_cache_mb", 0)))),
        "motion_cache": values.get("motion_cache", False) in (True, 1, "true", "True"),
        "motion_cache_threshold": max(0.001, min(0.2, finite("motion_cache_threshold", 0.02))),
    }


def result_fingerprint(values=None):
    config = normalize_config(values)
    result = {}
    if config["attention_backend"] != "inherit":
        result["attention_backend"] = config["attention_backend"]
    if config["motion_cache"]:
        result.update(motion_cache_version=1, motion_cache_threshold=config["motion_cache_threshold"])
    return result


class ByteLRU:
    def __init__(self, limit):
        self.limit = max(0, int(limit))
        self.used = 0
        self.items = OrderedDict()

    def get(self, key):
        item = self.items.get(key)
        if item is None:
            return None
        self.items.move_to_end(key)
        return item[0]

    def put(self, key, value, size):
        if size > self.limit or self.limit == 0:
            return
        old = self.items.pop(key, None)
        if old:
            self.used -= old[1]
        while self.used + size > self.limit:
            _, (_, evicted) = self.items.popitem(last=False)
            self.used -= evicted
        self.items[key] = (value, size)
        self.used += size

    def clear(self):
        self.items.clear()
        self.used = 0


def tensor_digest(tensor):
    import torch
    data = tensor.detach().contiguous().cpu()
    # uint8 view also supports bfloat16, which NumPy cannot represent directly.
    raw = data.view(torch.uint8).numpy()
    digest = hashlib.sha256(memoryview(raw).cast("B")).hexdigest()
    return (tuple(tensor.shape), str(tensor.dtype), str(tensor.device), digest)


class EncodeProxy:
    """Delegate all VAE behavior, memoizing only deterministic encode calls."""
    def __init__(self, vae, state):
        self._vae, self._state = vae, state

    def __getattr__(self, name):
        return getattr(self._vae, name)

    def encode(self, pixels, *args, **kwargs):
        import torch
        if not torch.is_tensor(pixels) or args or kwargs:
            return self._vae.encode(pixels, *args, **kwargs)
        started = time.perf_counter()
        key = (id(self._vae), tensor_digest(pixels))
        self._state.hash_seconds += time.perf_counter() - started
        cached = self._state.encodes.get(key)
        if cached is not None:
            self._state.encode_hits += 1
            tensor, device = cached
            return tensor.to(device=device, copy=True)
        self._state.encode_misses += 1
        started = time.perf_counter()
        encoded = self._vae.encode(pixels)
        self._state.encode_seconds += time.perf_counter() - started
        if torch.is_tensor(encoded):
            size = encoded.numel() * encoded.element_size()
            if size <= self._state.encodes.limit:
                self._state.encodes.put(key, (encoded.detach().to(device="cpu", copy=True), encoded.device), size)
        return encoded


class PerformanceState:
    def __init__(self, config):
        self.config = normalize_config(config)
        self.encodes = ByteLRU(self.config["reference_encode_cache_mb"] * 1024 * 1024)
        self.proxies = {}
        self.attention_models = {}
        self.retained_patchers = []
        self.notes = []
        self.encode_hits = self.encode_misses = 0
        self.encode_seconds = self.hash_seconds = self.cleanup_seconds = 0.0

    def note(self, message):
        if message not in self.notes:
            self.notes.append(message)
            log.info("Director performance: %s", message)

    def vae(self, vae):
        if vae is None or self.encodes.limit == 0:
            return vae
        return self.proxies.setdefault(id(vae), EncodeProxy(vae, self))

    def attention(self, model):
        choice = self.config["attention_backend"]
        if choice == "inherit":
            self.note("attention=inherit (input MODEL / ComfyUI backend unchanged)")
            return model
        if id(model) in self.attention_models:
            return self.attention_models[id(model)][1]
        from comfy.ldm.modules import attention
        options = ("sage", "sage3") if choice == "auto" else (choice,)
        key, function = None, None
        for option in options:
            try:
                function = attention.get_attention_function(option, None)
            except Exception as exc:
                log.debug("Attention backend %s is unavailable: %s", option, exc)
                function = None
            if function is not None:
                key = option
                break
        if function is None or not hasattr(model, "set_model_optimized_attention"):
            self.note(f"attention={choice} unavailable; input backend retained")
            self.attention_models[id(model)] = (model, model)
            return model
        patched = model.clone()
        patched.set_model_optimized_attention(function)
        self.attention_models[id(model)] = (model, patched)
        self.note(f"attention requested={choice}, effective={key}")
        return patched

    def summary(self):
        return (f"Performance: residency={self.config['model_residency']}; "
                f"VAE encode cache hits={self.encode_hits} misses={self.encode_misses}; "
                f"hash={self.hash_seconds:.2f}s encode={self.encode_seconds:.2f}s "
                f"cleanup={self.cleanup_seconds:.2f}s; " + "; ".join(self.notes))


def current_performance():
    return _CURRENT.get()


def conditioning_vae(vae):
    state = current_performance()
    return state.vae(vae) if state else vae


def performance_execution(function):
    @wraps(function)
    def run(plan, *args, **kwargs):
        config = kwargs.pop("runtime_performance", None)
        state = PerformanceState(config)
        plan.performance_fingerprint = result_fingerprint(config)
        token = _CURRENT.set(state)
        started = time.perf_counter()
        try:
            output = function(plan, *args, **kwargs)
            summary = state.summary() + f"; total={time.perf_counter() - started:.2f}s"
            log.info(summary)
            # executor's report is the fourth output; keep the return contract.
            output = list(output)
            output[3] += "\n" + summary
            return tuple(output)
        finally:
            # Keep live patchers reachable from the graph MODEL when leaving
            # models resident; ComfyUI LoadedModel otherwise only has weakrefs.
            try:
                model = kwargs.get("model")
                if model is not None and state.retained_patchers:
                    try:
                        # Bound cross-run retention for long timelines with many
                        # per-group LoRAs. Normal segment reuse is execution-scoped.
                        model._director_resident_patchers = list({id(m): m for m in state.retained_patchers}.values())[-8:]
                    except (AttributeError, TypeError):
                        log.warning("MODEL cannot retain resident patchers; next execution may reload them")
            finally:
                state.encodes.clear()
                state.proxies.clear()
                state.attention_models.clear()
                _CURRENT.reset(token)
    return run


def between_segment_policy(unload):
    state = current_performance()
    policy = state.config["model_residency"] if state else "legacy"
    return (False, False) if policy == "keep" else (True, False if policy == "cache" else True if policy == "unload" else unload)


def prepare_sampling_model(model):
    state = current_performance()
    return state.attention(model) if state else model


class MotionReuse:
    """Experimental velocity reuse, reset for each first-pass sampler call.

    This is deliberately not a claim of TeaCache equivalence. Both AV streams
    participate in the metric; no hidden-block monkey-patching is performed.
    """
    def __init__(self, steps, threshold):
        self.steps, self.threshold = int(steps), float(threshold)
        self.calls = self.skipped = self.consecutive = 0
        self.previous = self.velocity = self.signature = self.last_time = None

    def __call__(self, executor, x, timestep, context, *args, **kwargs):
        import torch
        if not isinstance(x, (list, tuple)) or len(x) != 2 or not all(torch.is_tensor(t) for t in x) or not torch.is_tensor(context):
            return executor(x, timestep, context, *args, **kwargs)
        stamp = float(timestep.flatten()[0].item())
        signature = tuple((tuple(t.shape), str(t.dtype), str(t.device)) for t in x)
        signature += (tuple(context.shape),)
        probes = [t.detach().reshape(-1)[::16].float().clone() for t in x]
        progress_ok = 4 <= self.calls < self.steps - 2
        monotonic = self.last_time is not None and stamp < self.last_time
        reusable = progress_ok and monotonic and self.signature == signature and self.velocity is not None and self.consecutive < 1
        if reusable:
            changes = [float((a - b).abs().mean().div(b.abs().mean().clamp_min(1e-6)).item()) for a, b in zip(probes, self.previous)]
            reusable = all(math.isfinite(change) and change <= self.threshold for change in changes)
        self.calls += 1
        self.last_time = stamp
        self.previous, self.signature = probes, signature
        if reusable:
            self.skipped += 1
            self.consecutive += 1
            return [v.clone() for v in self.velocity]
        self.consecutive = 0
        result = executor(x, timestep, context, *args, **kwargs)
        if isinstance(result, (tuple, list)) and len(result) == 2 and all(torch.is_tensor(t) for t in result):
            self.velocity = [t.detach().clone() for t in result]
        else:
            self.velocity = None
        return result

    def clear(self):
        self.previous = self.velocity = None


def install_motion_reuse(model, *, allowed, steps, cfg, negative, sampler_name):
    state = current_performance()
    if not state or not state.config["motion_cache"]:
        return model, None
    if not allowed or steps < 8 or negative or abs(float(cfg) - 1.0) > 1e-6 or sampler_name not in ("euler", "res_multistep"):
        state.note("MotionCache bypassed: requires plain first-pass CFG=1, >=8 steps, euler/res_multistep")
        return model, None
    if not hasattr(model, "add_wrapper_with_key"):
        state.note("MotionCache unavailable: ModelPatcher wrapper API missing")
        return model, None
    from comfy.patcher_extension import WrappersMP
    patched = model.clone()
    reuse = MotionReuse(steps, state.config["motion_cache_threshold"])
    patched.add_wrapper_with_key(WrappersMP.DIFFUSION_MODEL, "director_motion_reuse", reuse)
    return patched, reuse
