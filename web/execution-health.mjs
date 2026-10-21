export function executionFailure(detail={}){
 const raw=String(detail.exception_message||detail.error||''),kind=String(detail.exception_type||'');
 if(/out.of.memory|OutOfMemory|exceed allowed memory/i.test(raw+' '+kind))return '显存不足：当前任务无法继续。请降低目标MP或片段时长；若服务已退出，先重启ComfyUI。';
 if(/CUDA|AcceleratorError|device.side.assert/i.test(raw+' '+kind))return 'CUDA执行异常：当前任务已停止。请查看ComfyUI日志；必要时重启服务，并检查注意力加速和运行库兼容性。';
 return '任务执行失败：'+(raw||kind||'后端没有返回具体原因，请查看ComfyUI日志');
}

export function mountExecutionHealth({api,container,isBusy,owns=()=>true,onUnavailable=()=>{},onRecovered=()=>{},interval=5000,timeout=8000}){
 const box=container.ownerDocument.createElement('div');box.id='execution-health';box.setAttribute('role','alert');box.style.cssText='border:2px solid #ed6868;background:#402029;color:#ffe2e2;padding:12px;border-radius:8px;white-space:pre-wrap;flex-shrink:0';box.hidden=true;container.append(box);
 let disposed=false,pending=false,failures=0,lost=false,controller=null,timeoutId=null;
 const show=text=>{box.textContent=text;box.hidden=false;};
 async function check(){
  if(disposed||pending||!isBusy())return;
  pending=true;controller=new AbortController();timeoutId=setTimeout(()=>controller?.abort(),timeout);
  try{
   const response=await api.fetchApi('/system_stats',{signal:controller.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();if(!data||!data.system||!Array.isArray(data.devices))throw Error('服务返回异常');
   failures=0;
   if(lost){lost=false;show('ComfyUI连接已恢复。请点击“查询已提交任务”核对结果；不会自动重新提交生成。');onRecovered();}
  }catch(error){
   if(disposed)return;
   failures++;
   if(failures>=2){
    const reason='ComfyUI服务失联，任务状态未知，可能已崩溃退出。\n已暂停进度计时；最后收到的百分比不代表仍在运行。\n连接检查：'+(error.name==='AbortError'?'请求超时':error.message)+'。浏览器无法读取已退出进程的最终报错，不能仅凭失联确定原因。\n请查看服务器ComfyUI日志：out of memory表示显存不足；CUDA / Fatal Python error表示运行异常。确认服务退出后重启，再查询任务，勿重复提交。';
    show(reason);if(!lost){lost=true;onUnavailable('服务失联，可能已崩溃；进度计时已暂停，请查看红色提示和ComfyUI日志');}
   }
  }finally{clearTimeout(timeoutId);timeoutId=null;controller=null;pending=false;}
 }
 const failed=e=>{if(disposed||!isBusy()||!owns(e.detail?.prompt_id))return;const reason=executionFailure(e.detail);show(reason);onUnavailable(reason);};
 const reconnect=()=>void check();
 const started=e=>{if(!disposed&&isBusy()&&owns(e.detail?.prompt_id)){box.hidden=true;failures=0;lost=false;}};
 api.addEventListener('execution_error',failed);api.addEventListener('reconnecting',reconnect);api.addEventListener('execution_start',started);
 const timer=setInterval(()=>void check(),interval);
 return {check,dispose(){disposed=true;clearInterval(timer);clearTimeout(timeoutId);controller?.abort();api.removeEventListener('execution_error',failed);api.removeEventListener('reconnecting',reconnect);api.removeEventListener('execution_start',started);box.remove();}};
}
