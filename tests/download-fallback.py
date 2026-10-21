import importlib.util, io, json, hashlib, tempfile, urllib.request, urllib.error, errno
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("downloads",root/"model_download.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
body=b"verified model";digest=hashlib.sha256(body).hexdigest()
model={"key":"models/vae/test","category":"vae","name":"test","url":"https://huggingface.co/owner/repo/resolve/main/test"}
meta=json.dumps({"sha":"pinned","siblings":[{"rfilename":"test","size":len(body),"lfs":{"sha256":digest}}]}).encode()
for fail_metadata in (True,False):
 with tempfile.TemporaryDirectory() as temp:
  official=[];internal=[]
  def upstream(req,timeout):
   official.append(req.full_url)
   if '/api/' in req.full_url and not fail_metadata:return io.BytesIO(meta)
   raise TimeoutError("offline")
  def mirror(req,timeout):
   internal.append(req)
   assert req.full_url.startswith('http://hf.x-gpu.com/')
   assert req.get_header('Authorization') is None
   return io.BytesIO(meta if '/api/' in req.full_url else body)
  d=m.Downloads(lambda _:temp,opener=upstream,sleeper=lambda _:None)
  d.internal_opener=mirror;d.jobs[model['key']]={};d.run(model)
  assert d.status()[model['key']]['state']=='done',d.status()
  assert (Path(temp)/'test').read_bytes()==body
  assert any('/resolve/pinned/test' in r.full_url for r in internal)
  assert len(official)==(1 if fail_metadata else 2)
  d.pool.shutdown()
d=m.Downloads(lambda _:'.',opener=lambda *a,**k:None)
d.jobs['test']={};seen=[]
def failure(req,timeout):raise ConnectionResetError('reset')
d.opener=failure
d.internal_opener=lambda req,timeout:seen.append(req) or io.BytesIO()
d.open_source(urllib.request.Request('https://huggingface.co/o/r/resolve/abc/f',headers={'Authorization':'Bearer secret','Range':'bytes=10-','Cookie':'private'}),'test')
assert seen[0].get_header('Authorization') is None and seen[0].get_header('Cookie') is None
assert seen[0].get_header('Range')=='bytes=10-'
for error in (OSError(errno.EROFS,'readonly'),OSError(errno.ENOSPC,'full'),urllib.error.HTTPError('url',401,'auth',{},None),urllib.error.HTTPError('url',403,'auth',{},None)):
 assert not d.source_failure(error)
assert '只读' in m.download_error(OSError(errno.EROFS,'readonly'),'download')
d.pool.shutdown()
print('PASS metadata/file fallback, pinned revision, verified installation, credentials stripped, Range preserved, disk/auth errors excluded')
