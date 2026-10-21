"""Check vendored-source integrity and retained distribution notices."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1]
core=root/'director_core'
license=(root/'LICENSE').read_bytes()
assert license==(core/'LICENSE').read_bytes()
assert b'Apache License' in license and b'Version 2.0' in license
assert (root/'NOTICE').is_file() and (core/'UPSTREAM_README.md').is_file()
manifest=json.loads((core/'source-manifest.json').read_text(encoding='utf-8-sig'))
modified=[]
for name,digest in manifest.items():
 path=core/name
 assert path.is_file(),name
 if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:modified.append(name)
assert modified==['director/refine_pack.py'],modified
assert 'Modified by H3 Visual Studio' in (core/modified[0]).read_text(encoding='utf-8-sig')
for name in ['selflift.py','latent_upscale.py','director_latent_upscale.py','director_condition_resize.py','web/official-import.mjs','ffmpeg/ffmpeg','ffmpeg/ffmpeg.exe']:
 assert not (root/name).exists(),name
for file in (root/'web').iterdir():
 if file.suffix not in {'.js','.mjs'}:continue
 text=file.read_text(encoding='utf-8-sig')
 for ref in re.findall(r"(?:from\s+|import\s*)['\"](\./[^'\"]+)",text):
  assert (file.parent/ref.split('?')[0]).is_file(),(file.name,ref)
 assert 'finishApi' not in text and 'selfLiftApi' not in text,file.name
print('PASS retained Apache license, attribution, modified-source notice, source integrity and removal of obsolete code/binaries')
