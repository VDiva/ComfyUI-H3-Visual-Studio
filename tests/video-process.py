from pathlib import Path
import importlib.util
import subprocess
import sys
import tempfile
import time
import hashlib
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('h3_video_test',root/'__init__.py',submodule_search_locations=[str(root)])
package=importlib.util.module_from_spec(spec);sys.modules[spec.name]=package;spec.loader.exec_module(package)
from h3_video_test.video_process import VideoJobs,options,video_filter,probe
from h3_video_test.merge_video import ffmpeg_path
exe=ffmpeg_path()
def wait(jobs,job):
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        row=jobs.status(job['id'])
        if row['state'] not in {'queued','running'}: return row
        time.sleep(0.05)
    raise AssertionError('processing timeout')
def audio_hash(p):
    return hashlib.sha256(subprocess.run([exe,'-nostdin','-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','adts','pipe:1'],capture_output=True,check=True).stdout).hexdigest()
def frames(p):
    out=subprocess.run([exe,'-nostdin','-v','error','-i',str(p),'-map','0:v:0','-f','framemd5','pipe:1'],capture_output=True,check=True).stdout.decode()
    return len([line for line in out.splitlines() if line and not line.startswith('#')])
with tempfile.TemporaryDirectory() as temp:
    directory=Path(temp);original=directory/'source.mp4'
    subprocess.run([exe,'-nostdin','-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-shortest',str(original)],check=True)
    checksum=hashlib.sha256(original.read_bytes()).hexdigest();jobs=VideoJobs(directory)
    payload={'clip':{'filename':'source.mp4','type':'output'},'megapixels':0.2,'denoise':'light','sharpen':'light'}
    row=wait(jobs,jobs.start(payload));assert row['state']=='done',row
    target=directory/row['video']['subfolder']/row['video']['filename'];assert target.is_file()
    assert probe(exe,target)[:2]==(608,320);assert frames(original)==frames(target)==24
    assert audio_hash(original)==audio_hash(target),'audio packet content changed'
    assert checksum==hashlib.sha256(original.read_bytes()).hexdigest(),'original overwritten'
    assert not list((directory/'H3_Processed').glob('*.partial.mp4'))
    for invalid in [0,2.1,0.15,True,float('nan')]:
        try: options({'megapixels':invalid});raise AssertionError('invalid MP accepted')
        except ValueError: pass
    for clip in [{'filename':'../source.mp4'},{'filename':'source.mp4','type':'input'},{'filename':'source.mp4','subfolder':'../'}]:
        try: jobs.start({**payload,'clip':clip});raise AssertionError('unsafe path accepted')
        except ValueError: pass
    try: video_filter(1920,1080,options({'megapixels':0.4}));raise AssertionError('downscale accepted')
    except ValueError: pass
    # Cancellation while queued must retain the source and produce no partial result.
    jobs.worker.acquire()
    pending=jobs.start(payload);jobs.cancel(pending['id']);jobs.worker.release();cancelled=wait(jobs,pending);assert cancelled['state']=='cancelled',cancelled
    assert not list((directory/'H3_Processed').glob('*.partial.mp4'))
print('PASS real FFmpeg finishing: output size, all frames, unchanged stereo audio packets, original retention, path/parameter guards and cancellation cleanup')
