"""Disable duplicate AICG3D installations; run inside the retained plugin.

Default: report only. --apply moves duplicates outside custom_nodes, without deletion.
SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import argparse
import json
import re
import shutil
import urllib.request
from datetime import datetime


def duplicates(plugin):
    plugin = plugin.resolve()
    found = []
    for candidate in plugin.parent.iterdir():
        if not candidate.is_dir() or candidate.resolve() == plugin:
            continue
        metadata = candidate / "pyproject.toml"
        if not metadata.is_file() or not (candidate / "__init__.py").is_file():
            continue
        content = metadata.read_text(encoding="utf-8-sig")
        if re.search(r'^name\s*=\s*[\"\']aicg3d-h3-suite[\"\']\s*$', content, re.M):
            found.append(candidate)
    return sorted(found)


def repair(plugin, apply=False):
    plugin = plugin.resolve()
    if plugin.parent.name != "custom_nodes":
        raise ValueError("Place this plugin directly in ComfyUI/custom_nodes before running this script.")
    required = plugin / "aicg3d_h3easy" / "final_sequence_packed.py"
    if not required.is_file():
        raise ValueError("Retained plugin is missing final_sequence_packed.py; update it first.")
    found = duplicates(plugin)
    backup = plugin.parent.parent / "disabled_custom_nodes" / datetime.now().strftime("aicg3d-%Y%m%d-%H%M%S-%f")
    for source in found:
        if source.is_symlink():
            raise ValueError(f"Duplicate is a symlink; inspect manually: {source}")
        if source.resolve().parent != plugin.parent:
            raise ValueError(f"Duplicate resolves outside custom_nodes: {source}")
    if apply and found:
        backup.mkdir(parents=True, exist_ok=False)
    for source in found:
        target = backup / source.name
        print(f"{'MOVE' if apply else 'WOULD MOVE'} {source} -> {target}")
        if apply:
            shutil.move(str(source), str(target))
    print(f"Retained: {plugin}")
    print(f"Duplicates: {len(found)}")
    if apply:
        print("Restart ComfyUI, then hard-refresh the browser. No files were deleted.")
    return found


def check_server(url):
    with urllib.request.urlopen(url.rstrip("/") + "/object_info", timeout=20) as response:
        nodes = json.load(response)
    for name in ("AICG3D_H3FinalSequenceCombine", "AICG3D_H3FinalHighResUpscalePacked"):
        print(f"{name}: {'LOADED' if name in nodes else 'MISSING'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check-server", metavar="URL")
    args = parser.parse_args()
    if args.check_server:
        check_server(args.check_server)
    else:
        repair(Path(__file__).resolve().parents[1], args.apply)
