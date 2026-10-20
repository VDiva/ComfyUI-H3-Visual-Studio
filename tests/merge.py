from pathlib import Path
import tempfile, subprocess, importlib.util
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("merge_video",root/"merge_video.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temp:
    out=Path(temp)
    for i,color in enumerate(["red","blue"]):
        subprocess.run([m.ffmpeg_path(),"-nostdin","-v","error","-f","lavfi","-i",f"color=c={color}:s=64x64:r=24:d=0.5","-f","lavfi","-i","sine=frequency=440:duration=0.5","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",str(out/f"{i}.mp4")],check=True)
    rows=[{"filename":f"{i}.mp4","type":"output"} for i in range(2)]
    result=m.merge(out,{"clips":rows})
    target=out/result["subfolder"]/result["filename"]
    assert target.is_file() and target.stat().st_size>0
    probe=subprocess.run([m.ffmpeg_path(),"-i",str(target)],capture_output=True).stderr.decode()
    assert "00:00:01." in probe and "Audio:" in probe
    assert all((out/f"{i}.mp4").exists() for i in range(2))
    for row in [{"filename":"../escape.mp4"},{"filename":"0.mp4","type":"input"},{"filename":"0.mp4","subfolder":"../"}]:
        try:m.resolve_clip(out.resolve(),row);raise AssertionError("unsafe path accepted")
        except ValueError:pass
    try:m.merge(out,{"clips":rows[:1]});raise AssertionError("one clip accepted")
    except ValueError:pass
    subprocess.run([m.ffmpeg_path(),"-nostdin","-v","error","-f","lavfi","-i","color=c=red:s=128x64:r=24:d=0.5","-c:v","libx264",str(out/"different.mp4")],check=True)
    try:m.merge(out,{"clips":[rows[0],{"filename":"different.mp4"}]});raise AssertionError("mismatch accepted")
    except ValueError:pass
print("PASS real FFmpeg concat with audio, duration, original retention, path guard, missing selection and incompatible streams")
