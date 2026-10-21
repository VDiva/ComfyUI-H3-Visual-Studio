"""Disk-based FFmpeg concat. No torch or GPU decoding."""
from pathlib import Path
import os, stat, subprocess, tempfile, uuid, threading, re, shutil
_LOCK = threading.Lock()

def ensure_executable(candidate):
    if os.name == "nt" or os.access(candidate, os.X_OK):
        return
    try:
        candidate.chmod(stat.S_IMODE(candidate.stat().st_mode) | 0o111)
    except OSError as error:
        raise ValueError(f"无法自动为内置FFmpeg添加执行权限：{candidate}；请检查文件所有权和目录是否只读") from error
    if not os.access(candidate, os.X_OK):
        raise ValueError(f"内置FFmpeg仍不可执行：{candidate}；请检查磁盘是否以noexec挂载，或改放到允许执行的目录")


def ffmpeg_path():
    base = Path(__file__).resolve().parent / "ffmpeg"
    candidate = base / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not candidate.is_file():
        system = shutil.which("ffmpeg")
        if system:
            return system
        try:
            import imageio_ffmpeg
            resolved = imageio_ffmpeg.get_ffmpeg_exe()
            if Path(resolved).is_file():
                return resolved
        except (ImportError, RuntimeError, OSError):
            pass
        raise ValueError("缺少FFmpeg，请在依赖页安装imageio-ffmpeg，或在服务器安装FFmpeg")
    if not candidate.resolve().is_relative_to(base.resolve()):
        raise ValueError("内置FFmpeg路径越界，未修改权限")
    ensure_executable(candidate)
    return str(candidate)

def resolve_clip(root, row):
    if not isinstance(row, dict) or row.get("type", "output") != "output":
        raise ValueError("仅允许合并output目录内的视频")
    name = row.get("filename", "")
    if not name or Path(name).name != name or "\\" in name:
        raise ValueError("视频文件名无效")
    subfolder = row.get("subfolder", "")
    if not isinstance(subfolder, str) or any(c in name + subfolder for c in "\r\n\x00"):
        raise ValueError("视频路径包含无效字符")
    target = (root / subfolder / name).resolve()
    if not target.is_relative_to(root) or not target.is_file() or target.suffix.lower() not in {".mp4", ".mov", ".mkv", ".webm"}:
        raise ValueError("视频不存在或路径越界")
    return target

def merge(output_root, payload):
    root = Path(output_root).resolve()
    rows = payload.get("clips", [])
    if not isinstance(rows, list) or not 2 <= len(rows) <= 1000:
        raise ValueError("请选择2—1000个已完成视频")
    clips = [resolve_clip(root, row) for row in rows]
    exe = ffmpeg_path()
    signatures = []
    for clip in clips:
        probe = subprocess.run([exe, "-nostdin", "-hide_banner", "-i", str(clip)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        text = probe.stderr.decode("utf-8", "replace")
        streams = []
        for line in text.splitlines():
            if "Stream #" in line and ("Video:" in line or "Audio:" in line):
                value = re.sub(r"^.*?(Video:|Audio:)", r"\1", line)
                value = re.sub(r",?\s*\d+ kb/s", "", value)
                streams.append(value.strip())
        if not any(v.startswith("Video:") for v in streams):
            raise ValueError("无法读取视频编码信息")
        signatures.append(streams)
    if any(s != signatures[0] for s in signatures[1:]):
        raise ValueError("各段编码、尺寸、帧率或音轨不一致，请统一生成参数后合并；未进行有损转码")
    if not _LOCK.acquire(blocking=False):
        raise ValueError("已有合并任务运行，请稍后重试")
    try:
        directory = root / "H3_Merged"
        directory.mkdir(exist_ok=True)
        token = uuid.uuid4().hex
        final = directory / (token + ".mp4")
        temporary = directory / (token + ".partial.mp4")
        # ffconcat filenames are independently escaped; subprocess never uses a shell.
        with tempfile.TemporaryDirectory(prefix="h3_merge_") as temp:
            manifest = Path(temp) / "clips.txt"
            manifest.write_text("".join("file '" + str(p).replace("\\", "/").replace("'", "'\\''") + "'\n" for p in clips), encoding="utf-8")
            args = [exe, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest), "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", str(temporary)]
            try:
                result = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=3600, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                if result.returncode or not temporary.is_file() or temporary.stat().st_size == 0:
                    raise ValueError("FFmpeg合并失败；请确认各段分辨率、帧率、编码及音轨一致：" + result.stderr.decode("utf-8", "replace")[-1500:])
                temporary.replace(final)
            finally:
                temporary.unlink(missing_ok=True)
        return {"filename":final.name, "subfolder":"H3_Merged", "type":"output"}
    finally:
        _LOCK.release()
