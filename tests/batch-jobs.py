import asyncio,sys,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from batch_jobs import BatchJobs

class Comfy:
 def __init__(self): self.submitted=[];self.history={};self.fail=False;self.payloads=[]
 async def __call__(self,method,path,payload=None):
  if path=='/prompt':
   self.payloads.append(payload)
   if self.fail: raise OSError('network disconnected after send')
   key=str(len(self.submitted)+1);self.submitted.append(key);return {'prompt_id':key}
  if path.startswith('/history/'):return {k:v for k,v in self.history.items() if k==path.split('/')[-1]}
  return {'queue_running':[[0,k,{}] for k in self.submitted if k not in self.history],'queue_pending':[]}
 def complete(self,key,success=True):self.history[key]={'status':{'completed':True,'status_str':'success' if success else 'error'},'outputs':{'1':{'images':[{'filename':key+'.mp4','subfolder':'video'},{'filename':'original.mp4','subfolder':'video/group_original'}]}}}

def payload(key='a'*32):return {'id':key,'pageId':'page','clientId':'browser-session','autoMerge':True,'items':[{'groupId':str(i),'prompt':{'1':{'class_type':'SaveVideo','inputs':{}}}} for i in range(2)]}
async def until(fn):
 for _ in range(200):
  if fn():return
  await asyncio.sleep(.005)
 raise AssertionError('timed out')
async def main():
 with tempfile.TemporaryDirectory() as temp:
  c=Comfy();merged=[]
  async def merge(rows):merged.extend(rows);return {'filename':'merged.mp4'}
  jobs=BatchJobs(temp,c,merge,interval=.001);job=jobs.start(payload());assert 'prompt' not in job['items'][0];jobs.start(payload())
  await until(lambda:len(c.submitted)==1);assert len(c.submitted)==1;assert c.payloads[0]['client_id']=='browser-session'
  c.complete('1');await until(lambda:len(c.submitted)==2);assert jobs.status(job['id'])['items'][0]['originalVideos']
  c.complete('2');await jobs.tasks[job['id']];assert jobs.status(job['id'])['state']=='done';assert len(merged)==2
  restored=BatchJobs(temp,c,merge);assert restored.status(job['id'])['mergedVideo']['filename']=='merged.mp4'
 with tempfile.TemporaryDirectory() as temp:
  c=Comfy();jobs=BatchJobs(temp,c,interval=.001);job=jobs.start(payload());await until(lambda:len(c.submitted)==1)
  jobs.stop(job['id']);c.complete('1');await jobs.tasks[job['id']];assert len(c.submitted)==1;assert jobs.status(job['id'])['state']=='stopped'
 with tempfile.TemporaryDirectory() as temp:
  c=Comfy();jobs=BatchJobs(temp,c,interval=.001);job=jobs.start(payload());await until(lambda:len(c.submitted)==1)
  jobs.tasks[job['id']].cancel()
  try:await jobs.tasks[job['id']]
  except asyncio.CancelledError:pass
  restored=BatchJobs(temp,c,interval=.001);restored.resume(job['id']);c.complete('1');await until(lambda:len(c.submitted)==2);c.complete('2');restored.jobs[job['id']]['autoMerge']=False;await restored.tasks[job['id']];assert c.submitted==['1','2']
 with tempfile.TemporaryDirectory() as temp:
  c=Comfy();c.fail=True;jobs=BatchJobs(temp,c,interval=.001);job=jobs.start(payload());await jobs.tasks[job['id']];assert jobs.status(job['id'])['state']=='paused'
  try:jobs.resume(job['id']);raise AssertionError('unsafe retry')
  except ValueError:pass
  jobs.stop(job['id']);assert jobs.status(job['id'])['state']=='stopped'
 with tempfile.TemporaryDirectory() as temp:
  c=Comfy();jobs=BatchJobs(temp,c,interval=.001);job=jobs.start(payload());await until(lambda:len(c.submitted)==1);c.complete('1',False);await jobs.tasks[job['id']];assert len(c.submitted)==1;assert jobs.status(job['id'])['state']=='error'
 print('PASS sequential background execution, idempotent start, originals, auto merge, persistence, stop, restart recovery, uncertain submission and failure halt')
asyncio.run(main())
