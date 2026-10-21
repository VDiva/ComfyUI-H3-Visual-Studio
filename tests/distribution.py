"""Check vendored-source integrity and retained distribution notices."""
from pathlib import Path
import hashlib,json,re,ast
root=Path(__file__).resolve().parents[1]
release=json.loads((root/'version.json').read_text(encoding='utf-8-sig'))['version']
assert (root/'README.md').read_text(encoding='utf-8-sig').splitlines()[0].endswith(' '+release)
assert 'v'+release+'</span>' in (root/'web/studio-runtime.mjs').read_text(encoding='utf-8-sig')
core=root/'director_core'
license=(root/'LICENSE').read_bytes()
assert license==(core/'LICENSE').read_bytes()
assert b'Apache License' in license and b'Version 2.0' in license
assert (root/'NOTICE').is_file() and (core/'UPSTREAM_README.md').is_file()
manifest=json.loads((core/'source-manifest.json').read_text(encoding='utf-8-sig'))
normalized=json.loads((core/'source-normalized-manifest.json').read_text(encoding='utf-8-sig'))
assert set(normalized)==set(manifest)-{'director/refine_pack.py'}
for name,digest in manifest.items():
 path=core/name
 assert path.is_file(),name
 if name in normalized:
  assert hashlib.sha256(path.read_bytes().replace(b'\r\n',b'\n')).hexdigest()==normalized[name],name
assert 'Modified by H3 Visual Studio' in (core/'director/refine_pack.py').read_text(encoding='utf-8-sig')
for name in ['selflift.py','latent_upscale.py','director_latent_upscale.py','director_condition_resize.py','web/official-import.mjs','ffmpeg/ffmpeg','ffmpeg/ffmpeg.exe']:
 assert not (root/name).exists(),name
for file in (root/'web').iterdir():
 if file.suffix not in {'.js','.mjs'}:continue
 text=file.read_text(encoding='utf-8-sig')
 for cached in re.findall(r'\?v=(\d+\.\d+\.\d+)',text):assert cached==release,(file.name,cached,release)
 for ref in re.findall(r"(?:from\s+|import\s*)['\"](\./[^'\"]+)",text):
  assert (file.parent/ref.split('?')[0]).is_file(),(file.name,ref)
 assert 'finishApi' not in text and 'selfLiftApi' not in text,file.name
for file in root.rglob('*.py'):
 for item in ast.walk(ast.parse(file.read_text(encoding='utf-8-sig'))):
  if not isinstance(item,ast.ImportFrom) or not item.level or not item.module:continue
  base=file.parent
  for _ in range(item.level-1):base=base.parent
  target=base.joinpath(*item.module.split('.'))
  assert target.with_suffix('.py').is_file() or target.is_dir(),(str(file),item.module)
for file in root.rglob('*.json'):json.loads(file.read_text(encoding='utf-8-sig'))
print('PASS retained licenses, source integrity, Python relative imports, JSON files and obsolete-code removal')
