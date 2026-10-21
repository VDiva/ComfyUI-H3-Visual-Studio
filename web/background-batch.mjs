export function backgroundBatch({api,getPage,persist,onUpdate,log}){
 let disposed=false,timer=null,checking=false;
 const active=s=>['queued','running','merging'].includes(s);
 async function request(path,options){const r=await api.fetchApi('/h3_visual_studio/batches'+path,options);let data;try{data=await r.json();}catch{throw Error('后台批次接口不可用，请完整更新插件并重启ComfyUI');}if(!r.ok)throw Error(data.error||'后台批次请求失败');return data;}
 function apply(page,job){page.batch={id:job.id,state:job.state,error:job.error,updated:job.updated};for(const item of job.items){const group=[...page.groups,...(page.comparison?.groups||[])].find(g=>g.id===item.groupId);if(group&&item.state!=='pending')group.job={...group.job,state:item.state,promptId:item.promptId,videos:item.videos||[],originalVideos:item.originalVideos||[]};}if(job.mergedVideo)page.mergedVideo=job.mergedVideo;persist();onUpdate(page,job);}
 function schedule(){clearTimeout(timer);if(!disposed)timer=setTimeout(()=>void query(),1800);}
 async function query({discover=false}={}){if(disposed||checking)return;checking=true;const page=getPage();try{
  let job;if(discover||!page.batch?.id){const data=await request('?pageId='+encodeURIComponent(page.pageId));job=data.jobs?.[0];}else job=await request('/'+page.batch.id);
  if(job){apply(page,job);if(active(job.state))schedule();}else if(page.batch){apply(page,{id:page.batch.id,state:'missing',items:[],error:'服务器未找到此批次，可检查队列后重新选择分段'});}
 }catch(e){log(e.message+'；稍后可查询后台批次');if(active(page.batch?.state))schedule();}finally{checking=false;}}
 return {async start(items,{autoMerge=false}={}){const page=getPage();const id=crypto.randomUUID().replaceAll('-','');page.batch={id,state:'submitting'};persist();let job;
   try{job=await request('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,pageId:page.pageId,items,autoMerge,clientId:api.clientId||undefined})});}catch(error){page.batch={id,state:'unknown',error:'提交结果不确定，请查询后台批次，勿重复提交'};persist();throw error;}
   apply(page,job);schedule();return job;},query,async action(action){const page=getPage();if(!page.batch?.id)return;const job=await request('/'+page.batch.id+'/'+action,{method:'POST'});apply(page,job);if(active(job.state))schedule();},dispose(){disposed=true;clearTimeout(timer);},get active(){return ['submitting','unknown','paused',...['queued','running','merging']].includes(getPage().batch?.state);}};
}
