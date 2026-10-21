export function formatSpeed(value){const n=Math.max(0,Number(value)||0);return n>=1048576?(n/1048576).toFixed(2)+' MiB/s':n>=1024?(n/1024).toFixed(1)+' KiB/s':n.toFixed(0)+' B/s';}
export function formatEta(seconds){if(!Number.isFinite(seconds)||seconds<0)return '估算中';const n=Math.ceil(seconds);return n>=3600?Math.floor(n/3600)+'小时'+Math.floor(n%3600/60)+'分':n>=60?Math.floor(n/60)+'分'+n%60+'秒':n+'秒';}
export function modelDownloader({api,container,log,recheck}){
 let missing=[],timer=null,lastJobs={},rechecking=false,disposed=false;
 let proxyEditor=null,sourceEditor=null,sourceSelect=null,sourceSaving=false;
 const sourceLabels={auto:'自动（仙宫云优先）',xiangongyun:'仅仙宫云',official:'仅官方（Hugging Face）'};
 const fetchStatus=async()=>{const response=await api.fetchApi('/h3_visual_studio/models');if(!response.ok)throw Error('下载服务不可用，请更新云端插件并重启');return response.json();};
 async function start(keys){try{const response=await api.fetchApi('/h3_visual_studio/models/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})});const data=await response.json();if(!response.ok)throw Error(data.error||'下载启动失败');log('云端已开始顺序下载，完成后会重新检查模型。');await refresh();}catch(error){log(error.message);}}
 function paint(data){
  container.replaceChildren();
  const backend=document.createElement('div');backend.textContent='下载组件0.5.11 · '+(sourceLabels[data.source_mode]||sourceLabels.auto)+' · 后台版本：'+(data.backend_version||'旧版（未返回版本号）')+' · 已收录'+data.catalog.length+'个模型';container.append(backend);
  const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0';
  const refreshButton=document.createElement('button');refreshButton.textContent='刷新下载进度';refreshButton.onclick=()=>refresh();toolbar.append(refreshButton);
  if(!sourceEditor){
   sourceEditor=document.createElement('label');sourceEditor.textContent='下载源 ';sourceSelect=document.createElement('select');sourceSelect.id='download-source';sourceSelect.setAttribute('aria-label','模型下载源');
   for(const [value,text] of Object.entries(sourceLabels)){const option=document.createElement('option');option.value=value;option.textContent=text;sourceSelect.append(option);}
   sourceSelect.onchange=async()=>{const mode=sourceSelect.value,previous=sourceSelect.dataset.saved||'auto';sourceSaving=true;sourceSelect.disabled=true;
    try{const response=await api.fetchApi('/h3_visual_studio/models/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});const result=await response.json();if(!response.ok)throw Error(result.error||'保存下载源失败');sourceSelect.dataset.saved=result.source_mode;log('下载源已保存：'+sourceLabels[result.source_mode]+'。新下载和重试生效，已提交任务保持原选择。');}
    catch(error){sourceSelect.value=previous;log(error.message);}finally{sourceSaving=false;await refresh();}
   };sourceEditor.append(sourceSelect);
  }
  if(!sourceSaving){sourceSelect.value=data.source_mode||'auto';sourceSelect.dataset.saved=sourceSelect.value;sourceSelect.disabled=!data.source_mode;sourceSelect.title=data.source_mode?'仅指定源模式不会自动切换其他线路':'请更新插件后端以启用手动切换下载源';}
  const sourceHelp=document.createElement('small');sourceHelp.textContent='新下载/重试生效；已提交任务保持原选择';toolbar.append(sourceEditor,sourceHelp);container.append(toolbar);
  if(!proxyEditor){proxyEditor=document.createElement('div');proxyEditor.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0';const field=document.createElement('input');field.id='download-proxy';field.placeholder='Clash HTTP/Mixed代理，例如http://127.0.0.1:7890';field.style.width='360px';field.value=data.proxy?.configured||'';const save=document.createElement('button');save.textContent='保存下载代理';const status=document.createElement('span');status.id='download-proxy-status';save.onclick=async()=>{try{const response=await api.fetchApi('/h3_visual_studio/models/proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:field.value})});const result=await response.json();if(!response.ok)throw Error(result.error);log('代理配置已保存。正在传输的连接需等待重连后生效；失败任务请点击重试。');await refresh();}catch(error){log(error.message);}};const detect=document.createElement('button');detect.textContent='重新自动检测代理';detect.onclick=async()=>{detect.disabled=true;log('正在检测云端系统代理和Clash端口…');try{const response=await api.fetchApi('/h3_visual_studio/models/proxy/detect',{method:'POST'});const result=await response.json();if(!response.ok)throw Error(result.error||'代理检测失败');field.value='';log(result.proxy.message+(result.proxy.effective?' · '+result.proxy.effective:''));await refresh();}catch(error){log(error.message);}finally{detect.disabled=false;}};proxyEditor.append(detect,field,save,status);}
  proxyEditor.querySelector('#download-proxy-status').textContent='代理设置：'+(data.proxy?.effective||'未检测到系统代理，可能直连')+' · '+(data.proxy?.message||'下载开始前会自动检测Clash代理');container.append(proxyEditor);
  const catalog=new Map(data.catalog.map(m=>[m.key,m]));
  const keys=missing.filter(k=>catalog.has(k));
  if(keys.length){const all=document.createElement('button');all.textContent='下载全部缺失模型（云端）';all.onclick=()=>start(keys);container.append(all);}
  for(const key of new Set([...missing,...Object.keys(data.jobs)])){
   const model=catalog.get(key),job=data.jobs[key];const row=document.createElement('div');row.style.margin='8px 0';
   const text=document.createElement('span');const state={retrying:'网络中断，自动重试',queued:'排队中',connecting:'连接下载源',downloading:'下载中',verifying:'校验中',done:'已安装',error:'失败'};
   text.textContent=key+(job?' · '+state[job.state]+' '+(job.total?((job.bytes||0)/job.total*100).toFixed(1)+'%':(job.bytes||0)+'字节')+(job.state==='downloading'?' · '+(typeof job.speed_bps==='number'?formatSpeed(job.speed_bps):'速度数据未返回，请更新云端后台并重启')+(job.idle_seconds>=5?' · 已'+Math.floor(job.idle_seconds)+'秒未收到数据，等待下载源响应':'')+' · 剩余'+formatEta(job.eta_seconds):'')+(job.error?' · '+job.error:''):'');if(job?.download_source)text.textContent+=' · 线路：'+(job.download_source==='xiangongyun'?'仙宫云内网（直连）':'Hugging Face 官方');row.append(text);
   if(job){const bar=document.createElement('progress');bar.style.cssText='display:block;width:100%;height:12px;margin-top:5px';bar.max=job.total||1;if(job.total)bar.value=Math.min(job.total,job.bytes||0);if(job.state==='done')bar.value=bar.max;row.append(bar);}
   if(model){const link=document.createElement('a');link.href=model.source;link.target='_blank';link.rel='noopener';link.textContent=' 来源 ';row.append(link);
    if(!job||job.state==='error'){const button=document.createElement('button');button.textContent=job?'重试':'下载';button.onclick=()=>start([key]);row.append(button);}
   }else row.append(document.createTextNode(' · 当前后台未返回此模型下载地址；请确认更新同名插件的model_download.py、__init__.py及model-catalog.json并重启ComfyUI后端。'));
   container.append(row);
  }
 }
 async function refresh(){
  if(disposed)return;
  clearTimeout(timer);try{const data=await fetchStatus();paint(data);
   const done=Object.entries(data.jobs).some(([k,v])=>v.state==='done'&&lastJobs[k]?.state!=='done');lastJobs=data.jobs;
   if(done&&!rechecking){rechecking=true;try{await recheck();}finally{rechecking=false;}}
   if(Object.values(data.jobs).some(j=>['queued','connecting','downloading','verifying','retrying'].includes(j.state))&&container.isConnected)timer=setTimeout(refresh,1000);
  }catch(error){container.textContent='下载进度查询失败：'+error.message+'。3秒后自动重试；不会重新提交下载任务。';if(!disposed&&container.isConnected)timer=setTimeout(refresh,3000);}
 }
 return {resume:refresh,async install(report){missing=report.missing;const data=await fetchStatus();const known=new Set(data.catalog.map(m=>m.key));const keys=missing.filter(k=>known.has(k));if(keys.length)await start(keys);else if(!missing.length)log('所需模型已齐全，无需下载。');else log('这些模型尚未匹配到下载地址：'+missing.join('、'));const unavailable=missing.filter(k=>!known.has(k));if(unavailable.length)log('已提交可下载模型；以下模型未匹配到来源：'+unavailable.join('、'));},async show(report){missing=report.missing;await refresh();},dispose(){disposed=true;clearTimeout(timer);}};
}
