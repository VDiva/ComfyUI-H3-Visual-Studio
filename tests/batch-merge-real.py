import sys,asyncio,tempfile,subprocess,importlib.util
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from batch_jobs import BatchJobs
from merge_video import merge,ffmpeg_path
async def main():
 with tempfile.TemporaryDirectory() as temp:
  out=Path(temp);sub=out/'video';sub.mkdir();submitted=[]
  for i in range(1,9):
   for original,size in [(True,'64x64'),(False,'128x64')]:
    name=f"group_{i:03d}{'_original' if original else ''}_00002_.mp4"
    subprocess.run([ffmpeg_path(),'-nostdin','-v','error','-f','lavfi','-i',f'color=c=red:s={size}:r=24:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(sub/name)],check=True)
  async def call(method,url,payload=None):
   if url=='/prompt':submitted.append(payload);return {'prompt_id':str(len(submitted))}
   if url.startswith('/history/'):
    i=int(url.rsplit('/',1)[-1]);return {str(i):{'status':{'completed':True,'status_str':'success'},'outputs':{'save':{'videos':[{'filename':f'group_{i:03d}_original_00002_.mp4','subfolder':'video'},{'filename':f'group_{i:03d}_00002_.mp4','subfolder':'video'}]}}}}
   return {}
  async def combine(clips):return await asyncio.to_thread(merge,out,{'clips':clips})
  jobs=BatchJobs(out/'jobs',call,combine,interval=.001)
  payload={'id':'c'*32,'pageId':'test','items':[{'groupId':str(i),'prompt':{'1':{'class_type':'SaveVideo','inputs':{}}}} for i in range(8)]}
  job=jobs.start(payload);await jobs.tasks[job['id']];result=jobs.status(job['id']);assert result['state']=='done',result.get('error');assert result['autoMerge'] is True
  video=result['mergedVideo'];assert (out/video['subfolder']/video['filename']).is_file();assert len(submitted)==8;assert all(len(i['videos'])==1 for i in result['items'])
  old=jobs.jobs[job['id']];old['state']='error';old['error']='成片不唯一，无法自动合并'
  for i in old['items']:i['videos']+=i.pop('originalVideos')
  jobs.retry_merge(job['id']);await jobs.tasks[job['id']];assert jobs.status(job['id'])['state']=='done',jobs.status(job['id']);assert len(submitted)==8
  print('PASS real eight-segment auto merge creates final MP4; old ambiguous-result batch retries merge without any GPU resubmission')
asyncio.run(main())
