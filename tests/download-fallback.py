import importlib.util,io,json,hashlib,tempfile,urllib.request,urllib.error,errno,os
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('downloads',root/'model_download.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
body=b'verified model';digest=hashlib.sha256(body).hexdigest()
model={'key':'models/vae/test','category':'vae','name':'test','url':'https://huggingface.co/owner/repo/resolve/main/test'}
meta=json.dumps({'sha':'pinned','siblings':[{'rfilename':'test','size':len(body),'lfs':{'sha256':digest}}]}).encode()
for scenario in ['mirror_ok','metadata_timeout','file_404','metadata_html','metadata_missing_hash','file_eof','file_corrupt','mirror_403']:
 with tempfile.TemporaryDirectory() as temp:
  calls=[];detect=[]
  def official(req,timeout):
   calls.append(('official',req.full_url,timeout))
   assert req.get_header('Authorization')=='Bearer secret'
   return io.BytesIO(meta if '/api/' in req.full_url else body)
  def mirror(req,timeout):
   calls.append(('mirror',req.full_url,timeout))
   assert req.full_url.startswith('http://hf.x-gpu.com/')
   assert not any(k.lower() in {'authorization','proxy-authorization','cookie'} for k,v in req.header_items())
   if '/api/' in req.full_url:
    if scenario=='metadata_timeout':raise TimeoutError('offline')
    if scenario=='metadata_html':return io.BytesIO(b'<html>login</html>')
    if scenario=='metadata_missing_hash':return io.BytesIO(b'{}')
    if scenario=='mirror_403':raise urllib.error.HTTPError(req.full_url,403,'denied',{},None)
    return io.BytesIO(meta)
   assert '/resolve/pinned/test' in req.full_url
   if scenario=='file_404':raise urllib.error.HTTPError(req.full_url,404,'missing',{},None)
   if scenario=='file_eof':return io.BytesIO(body[:5])
   if scenario=='file_corrupt':return io.BytesIO(b'x'*len(body))
   return io.BytesIO(body)
  d=m.Downloads(lambda _:temp,opener=official,sleeper=lambda _:None);d.internal_opener=mirror
  d.auto_detect_proxy=lambda:detect.append('detect')
  d.jobs[model['key']]={}
  with patch.dict(os.environ,{'HF_TOKEN':'secret'}):d.run(model)
  assert d.status()[model['key']]['state']=='done',(scenario,d.status())
  assert (Path(temp)/'test').read_bytes()==body
  assert calls[0][0]=='mirror' and calls[0][2]==8,(scenario,calls)
  if scenario=='mirror_ok':
   assert len(calls)==2 and not detect,calls
   assert calls[1][0]=='mirror' and calls[1][2]==60
   assert d.status()[model['key']]['download_source']=='xiangongyun'
  else:
   assert any(c[0]=='official' for c in calls) and detect,(scenario,calls)
   first=next(i for i,c in enumerate(calls) if c[0]=='official')
   assert all(c[0]=='official' for c in calls[first:]),calls
   assert d.status()[model['key']]['download_source']=='official'
  d.pool.shutdown()
print('PASS mirror-first success, lazy proxy detection, timeout/404/403/invalid metadata/EOF/SHA fallback, pinned revision and verified installation')

d=m.Downloads(lambda _:'.',opener=lambda *a,**k:io.BytesIO());d.jobs['test']={};seen=[]
d.internal_opener=lambda req,timeout:seen.append(req) or io.BytesIO()
d.open_source(urllib.request.Request('https://huggingface.co/o/r/resolve/abc/f',headers={'Authorization':'Bearer secret','Range':'bytes=10-','Cookie':'private'}),'test')
assert seen[0].get_header('Authorization') is None and seen[0].get_header('Cookie') is None
assert seen[0].get_header('Range')=='bytes=10-'
for error in [OSError(errno.EROFS,'readonly'),OSError(errno.ENOSPC,'full')]:
 def failure(req,timeout):raise error
 d.internal_opener=failure;d.jobs['test']={}
 try:d.open_source(urllib.request.Request('https://huggingface.co/o/r/resolve/abc/f'),'test');raise AssertionError('disk error hidden')
 except OSError as actual:assert actual is error
assert '只读' in m.download_error(OSError(errno.EROFS,'readonly'),'download')
d.pool.shutdown()
print('PASS mirror strips credentials, preserves Range, and does not hide local disk errors')
