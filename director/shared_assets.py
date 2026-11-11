"""Resolve project-library IDs into per-segment model slots without loading unused media."""
from copy import deepcopy
import re

TOKEN = re.compile(r"@(?P<cn>图片|音频|视频)(?P<cnid>[1-9]\d*)(?!\d)|<(?P<en>Picture|Audio|Video)\s+(?P<enid>[1-9]\d*)>", re.I)
KINDS = {"图片": "images", "picture": "images", "音频": "audios", "audio": "audios", "视频": "videos", "video": "videos"}
FIELDS = {"images": ("refs", "imageFile", "Picture", 9), "audios": ("refAudios", "audioFile", "Audio", 3), "videos": ("refVideos", "videoFile", "Video", 3)}

def resolve_shared_assets(timeline):
    library = (timeline.get("global") or {}).get("assetLibrary")
    if library is None:
        return timeline
    result = deepcopy(timeline)
    global_block = result.setdefault("global", {})
    common = str(global_block.get("prompt") or "") if global_block.get("commonEnabled") else ""
    maps = {}
    for kind, (_, field, _, _) in FIELDS.items():
        maps[kind] = {}
        for item in library.get(kind, []):
            index = int(item["index"])
            if index < 0 or index in maps[kind] or not item.get(field):
                raise ValueError(f"公共素材库 {kind} 编号重复或文件缺失：{index + 1}")
            maps[kind][index] = item
    for number, segment in enumerate(result.get("segments", []), 1):
        prompt = "\n\n".join(s for s in (common, str(segment.get("prompt") or "")) if s)
        slots = {kind: {} for kind in FIELDS}
        for field, _, _, _ in FIELDS.values():
            segment[field] = []
        def replace(match):
            kind = KINDS[(match.group("cn") or match.group("en")).lower()]
            original = int(match.group("cnid") or match.group("enid")) - 1
            field, _, label, limit = FIELDS[kind]
            if original not in maps[kind]:
                raise ValueError(f"分段 {number} 引用了缺失的 {label} {original + 1}")
            if original not in slots[kind]:
                if len(slots[kind]) >= limit:
                    raise ValueError(f"分段 {number} 超过模型 {label} 参考数量上限 {limit}；请拆分镜头")
                slot = len(slots[kind])
                slots[kind][original] = slot
                media = dict(maps[kind][original])
                media["index"] = slot
                segment[field].append(media)
            return f"<{label} {slots[kind][original] + 1}>"
        segment["prompt"] = TOKEN.sub(replace, prompt)
    result["_sharedAssetsResolved"] = True
    global_block.pop("assetLibrary", None)
    global_block["prompt"] = ""
    global_block["commonEnabled"] = False
    for field, _, _, _ in FIELDS.values():
        global_block[field] = []
    return result
