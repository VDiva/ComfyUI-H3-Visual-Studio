"""Register the separately licensed, bundled AICG3D nodes in this plugin."""
from pathlib import Path
import importlib
import sys

PREFIXES = ("aicg3d", "aicg3d_h3easy", "aicg3d_h3goohai", "aicg3d_sparktts")
REQUIRED = ("AICG3D_H3FinalSequenceCombine", "AICG3D_H3FinalHighResUpscalePacked")


def load_bundled_nodes(bundle):
    bundle = Path(bundle).resolve()
    if not (bundle / "aicg3d/registry.py").is_file():
        raise RuntimeError(f"Bundled AICG3D sources are missing: {bundle}")
    # Never silently reuse another installation's absolute-import namespace.
    for name, module in list(sys.modules.items()):
        if name.split(".")[0] not in PREFIXES:
            continue
        filename = getattr(module, "__file__", None)
        if filename and not Path(filename).resolve().is_relative_to(bundle):
            raise RuntimeError(
                f"Duplicate AICG3D installation already imported {filename}. "
                "Move standalone comfyui-AICG3D and aicg3d-h3-suite outside custom_nodes, then restart ComfyUI."
            )
    path = str(bundle)
    added = path not in sys.path
    before = set(sys.modules)
    if added:
        # Upstream has deferred absolute imports during execution as well as startup.
        sys.path.insert(0, path)
    try:
        registry = importlib.import_module("aicg3d.registry")
        mappings, display = registry.build()
        missing = [name for name in REQUIRED if name not in mappings]
        if missing:
            raise RuntimeError(f"Bundled AICG3D registry is incomplete: {missing}")
        return mappings, display
    except Exception:
        for name in set(sys.modules) - before:
            if name.split(".")[0] in PREFIXES:
                sys.modules.pop(name, None)
        if added:
            sys.path.remove(path)
        raise
