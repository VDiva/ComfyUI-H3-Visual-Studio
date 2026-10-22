import sys, tempfile, json, io, hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import model_download as m
for kind in ('Base','VoiceDesign'):
 rows=[r for r in m.load_catalog() if '/Qwen3-TTS-12Hz-1.7B-'+kind+'/' in r['key']]
 assert len(rows)==11
 assert any(r['name'].endswith('speech_tokenizer/model.safetensors') for r in rows)
 assert all(r['url'].startswith('https://huggingface.co/Qwen/') for r in rows)
content=b'{"model_type":"test"}'
blob=hashlib.sha1(('blob '+str(len(content))+'\0').encode()+content).hexdigest()
model=dict(key='models/qwen-voice/Test/config.json',category='qwen-voice',name='Test/config.json',url='https://huggingface.co/Qwen/Test/resolve/main/config.json')
def opener(request,timeout):
 if '/api/models/' in request.full_url:return io.BytesIO(json.dumps(dict(sha='pinned',siblings=[dict(rfilename='config.json',size=len(content),blobId=blob)])).encode())
 assert '/resolve/pinned/config.json' in request.full_url
 return io.BytesIO(content)
with tempfile.TemporaryDirectory() as temp:
 d=m.Downloads(lambda _:temp,opener=opener);d.configure_source('official');d.jobs[model['key']]={};d.run(model)
 assert d.status()[model['key']]['state']=='done',d.status()
 assert (Path(temp)/'Test/config.json').read_bytes()==content
 (Path(temp)/'Test/config.json').unlink()
 def corrupt(request,timeout):
  return opener(request,timeout) if '/api/models/' in request.full_url else io.BytesIO(b'x'*len(content))
 d.opener=corrupt;d.run(model);assert d.status()[model['key']]['state']=='error';assert not (Path(temp)/'Test/config.json').exists()
 d.pool.shutdown()
print('PASS both complete TTS manifests, nested directories, pinned small-file Git blob verification and corruption rejection')
