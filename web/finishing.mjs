import {MEGAPIXELS} from './resolution.mjs?v=0.6.0';
import {modelReport,assertModels} from './model-check.mjs?v=0.6.0';
export const defaultFinishing=()=>({refine:false,steps:8,denoise:0.15,passes:1,upscale:'off',megapixels:1,model:''});
export function finishingSettings(raw={}){
 const s={...defaultFinishing(),...raw};
 if(typeof s.refine!=='boolean'||!['off','lanczos','model'].includes(s.upscale))throw Error('精修模式无效');
 if(!Number.isInteger(s.steps)||s.steps<1||s.steps>30||!Number.isInteger(s.passes)||s.passes<1||s.passes>3||!Number.isFinite(s.denoise)||s.denoise<0.01||s.denoise>0.5)throw Error('精修步数1—30、次数1—3、强度0.01—0.5');
 if(!MEGAPIXELS.includes(s.megapixels))throw Error('精修目标须为0.1—2.0 MP，每0.1一档');
 if(s.upscale==='model'&&(!s.model||typeof s.model!=='string'))throw Error('请先选择已安装的超分模型（models/upscale_models）');
 return s;
}
export function targetCanvas(width,height,mp){const ratio=width/height;return {width:Math.round(Math.sqrt(mp*1e6*ratio)/32)*32,height:Math.round(Math.sqrt(mp*1e6/ratio)/32)*32};}
// Independent stock-node composition inspired by Director's separation of refine and upscale.
// Refinement stays on the original H3 canvas. Audio always uses the first pass.
export function finishApi(prompt,raw,width,height){
 const s=finishingSettings(raw);if(!s.refine&&s.upscale==='off')return prompt;
 const entries=Object.entries(prompt),find=type=>{const found=entries.filter(([,n])=>n.class_type===type);if(found.length!==1)throw Error('精修需要唯一节点 '+type);return found[0];};
 const [,create]=find('CreateVideo'),[,save]=find('SaveVideo'),[,decode]=find('VAEDecode');
 const originalImages=structuredClone(create.inputs.images),audio=structuredClone(create.inputs.audio);
 let next=Math.max(0,...Object.keys(prompt).map(Number).filter(Number.isFinite));const add=(class_type,inputs)=>{const id=String(++next);prompt[id]={class_type,inputs};return [id,0];};
 const originalVideo=add('CreateVideo',{...structuredClone(create.inputs),images:originalImages,audio});
 const retained=add('SaveVideo',{...structuredClone(save.inputs),video:originalVideo,filename_prefix:save.inputs.filename_prefix+'_original/clip'});
 if(s.refine){
  const [sampleId,sample]=find('SamplerCustomAdvanced');
  if(String(decode.inputs.samples?.[0])!==sampleId)throw Error('精修只支持官方H3采样直接接视频解码的工作流');
  const scheduler=prompt[String(sample.inputs.sigmas?.[0])];
  if(scheduler?.class_type!=='BasicScheduler')throw Error('精修需要BasicScheduler提供模型');
  let latent=add('H3PreserveLatent',{samples:[sampleId,0],saved_video:retained});
  for(let i=0;i<s.passes;i++){
   const sigmas=add('BasicScheduler',{model:structuredClone(scheduler.inputs.model),scheduler:scheduler.inputs.scheduler,steps:s.steps,denoise:s.denoise});
   latent=add('SamplerCustomAdvanced',{...structuredClone(sample.inputs),latent_image:latent,sigmas});
  }
  // Use a separate decode, so the original video remains genuinely pre-refine.
  create.inputs.images=add('VAEDecode',{...structuredClone(decode.inputs),samples:latent});
 }
 if(!s.refine)create.inputs.images=add('H3PreserveImages',{images:originalImages,saved_video:retained});
 if(s.upscale!=='off'){
  const target=targetCanvas(width,height,s.megapixels);
  if(target.width<width||target.height<height)throw Error('放大目标小于原始尺寸，请提高目标MP或关闭放大');
  if(s.upscale==='model'){
   const model=add('UpscaleModelLoader',{model_name:s.model});
   create.inputs.images=add('H3FrameUpscale',{images:create.inputs.images,upscale_model:model,width:target.width,height:target.height});
  }else create.inputs.images=add('ImageScale',{image:create.inputs.images,upscale_method:'lanczos',width:target.width,height:target.height,crop:'disabled'});
 }
 if(JSON.stringify(create.inputs.audio)!==JSON.stringify(audio))throw Error('精修不得更换原声音轨');
 return prompt;
}
export const isOriginalVideo=row=>/(?:^|[/\\])[^/\\]*_original(?:[/\\]|$)/.test((row.subfolder||'')+'/'+row.filename);
export function existingUpscale(clip,model,megapixels){
 if(!clip||clip.type!=='output'||!model||!MEGAPIXELS.includes(megapixels))throw Error('请选择output成片、超分模型和目标MP');
 const file=[clip.subfolder,clip.filename].filter(Boolean).join('/');
 if(!clip.filename||/[\\:\[\]\r\n\0]/.test(file)||file.startsWith('/')||file.split('/').some(s=>s==='..')||!/^.*\.(mp4|mov|webm|mkv)$/i.test(file))throw Error('源视频路径无效');
 return {'1':{class_type:'LoadVideo',inputs:{file:file+' [output]'}},'2':{class_type:'GetVideoComponents',inputs:{video:['1',0]}},'3':{class_type:'UpscaleModelLoader',inputs:{model_name:model}},'4':{class_type:'H3FrameUpscale',inputs:{images:['2',0],upscale_model:['3',0],width:32,height:32,megapixels}},'5':{class_type:'CreateVideo',inputs:{images:['4',0],audio:['2',1],fps:['2',2]}},'6':{class_type:'SaveVideo',inputs:{video:['5',0],filename_prefix:'H3_Processed/AI_SuperResolution',format:'auto',codec:'auto'}}};
}
function statusText(job){if(!job)return '尚无处理任务';const states={queued:'排队中',running:'处理中',done:'已完成',error:'处理失败',cancelled:'已取消'};return [states[job.state]||job.state,job.kind==='comfy'?'AI模型超分':job.method,Number.isFinite(job.progress)?'进度 '+Math.round(job.progress*100)+'%':'',job.input_size?'原尺寸 '+job.input_size.join(' × '):'',job.output_size?'输出 '+job.output_size.join(' × '):'',job.video?'文件 '+job.video.subfolder+'/'+job.video.filename:'',job.error||''].filter(Boolean).join('\n');}

export function mountFinishing({container,api,getProject,getGroup,persist,preview,view,log,isBusy,setBusy}){
 const doc=container.ownerDocument;container.innerHTML=`<div class="library"><div class="title">生成时精修与放大</div><p class="muted">先同尺寸低强度二采，再放大。保留一采原片和原声音轨；新设置只作用于后续生成。二采可能改变脸部、动作或口型，超分需对比闪烁。</p><div class="row"><label><input id="finish-refine" type="checkbox">开启H3二次采样</label><label>步数 <input id="finish-steps" type="number" min="1" max="30"></label><label>强度 <input id="finish-denoise" type="number" min="0.01" max="0.5" step="0.01"></label><label>次数 <input id="finish-passes" type="number" min="1" max="3"></label></div><div class="row"><label>放大方式 <select id="finish-upscale"><option value="off">关闭</option><option value="lanczos">Lanczos插值（非AI）</option><option value="model">AI模型超分（需模型）</option></select></label><label>目标MP（原画幅比例） <select id="finish-mp"></select></label><label>超分模型 <select id="finish-model"><option value="">请刷新模型列表</option></select></label><button id="finish-model-refresh">刷新已安装超分模型</button></div><p id="finish-size" class="muted"></p></div><div class="library"><div class="title">已生成视频处理</div><p class="muted">对已有成片做轻降噪、Lanczos放大和轻锐化，另存新文件。“普通处理”为非AI；“AI超分”使用上方已选模型和下方目标MP，独立处理已有视频，无需重跑H3。两者均保留原声音和帧率，不补帧。</p><div class="row"><label>源视频 <select id="post-source"></select></label><label>目标MP <select id="post-mp"></select></label><label>降噪 <select id="post-denoise"><option value="off">关闭</option><option value="light" selected>轻度</option><option value="medium">中度</option></select></label><label>锐化 <select id="post-sharpen"><option value="off">关闭</option><option value="light" selected>轻度</option></select></label></div><div class="row"><button id="post-start">普通处理</button><button id="post-ai">AI超分已有视频</button><button id="post-query">查询后台处理</button><button id="post-cancel">取消当前处理</button><button id="post-original">预览所选原片</button><button id="post-result">预览处理结果</button></div><pre id="post-status" class="status">尚无处理任务</pre></div>`;
 const $=id=>container.querySelector('#'+id);let sources=[],timer=null,disposed=false;
 for(const id of ['finish-mp','post-mp'])for(const n of MEGAPIXELS){const o=doc.createElement('option');o.value=n;o.textContent=n.toFixed(1);$(id).append(o);}$('post-mp').value='1';
 const bindings={refine:'finish-refine',steps:'finish-steps',denoise:'finish-denoise',passes:'finish-passes',upscale:'finish-upscale',megapixels:'finish-mp',model:'finish-model'};
 for(const [key,id] of Object.entries(bindings))$(id).onchange=()=>{const p=getProject();p.finishing={...defaultFinishing(),...p.finishing,[key]:key==='refine'?$(id).checked:['steps','denoise','passes','megapixels'].includes(key)?Number($(id).value):$(id).value};persist();sync();};
 async function models(){try{const r=await api.fetchApi('/object_info/UpscaleModelLoader');if(!r.ok)throw Error('无法读取超分模型列表');const data=await r.json(),choices=data.UpscaleModelLoader?.input?.required?.model_name?.[0];if(!Array.isArray(choices))throw Error('请更新ComfyUI，缺少UpscaleModelLoader接口');$('finish-model').replaceChildren();const blank=doc.createElement('option');blank.value='';blank.textContent=choices.length?'请选择模型':'未安装：放入models/upscale_models';$('finish-model').append(blank);for(const v of choices){const o=doc.createElement('option');o.value=v;o.textContent=v;$('finish-model').append(o);}sync();}catch(e){log(e.message);}}
 $('finish-model-refresh').onclick=models;
 function sync(){const p=getProject(),s={...defaultFinishing(),...p.finishing};for(const [key,id] of Object.entries(bindings)){if(key==='refine')$(id).checked=s[key];else{if(key==='model'&&s.model&&!Array.from($(id).options).some(o=>o.value===s.model)){const o=doc.createElement('option');o.value=s.model;o.textContent=s.model+'（请刷新确认）';$(id).append(o);}$(id).value=s[key];}}
  const t=targetCanvas(p.settings.width,p.settings.height,s.megapixels);$('finish-size').textContent=`原始 ${p.settings.width} × ${p.settings.height}；放大目标 ${t.width} × ${t.height}。超分模型需自行安装，未安装不会回退冒充AI超分。`;
  const group=getGroup(),old=$('post-source').value;sources=[];for(const [rows,title] of [[group?.job?.originalVideos,'当前组一采原片'],[group?.job?.videos,'当前组生成成片'],[p.mergedVideo?[p.mergedVideo]:[],'合并成片']])for(const row of rows||[])sources.push({row,title});$('post-source').replaceChildren();sources.forEach((s,i)=>{const o=doc.createElement('option');o.value=i;o.textContent=s.title+' · '+s.row.filename;$('post-source').append(o);});if(old!==''&&Number(old)<sources.length)$('post-source').value=old;
  $('post-status').textContent=statusText(p.postJob);
 }
 async function query(){const p=getProject(),job=p.postJob,id=job?.id;if(!id)return;try{let data;if(job.kind==='comfy'){const r=await api.fetchApi('/history/'+encodeURIComponent(id));if(!r.ok)throw Error('查询超分任务失败');const h=(await r.json())[id];data={...job};if(h?.status?.completed){const rows=Object.values(h.outputs||{}).flatMap(o=>['images','videos','gifs'].flatMap(k=>o[k]||[])).filter(r=>/\.(mp4|mov|webm)$/i.test(r.filename||''));data.state=h.status.status_str==='success'&&rows.length?'done':'error';data.video=rows[0];if(data.state==='error')data.error='AI超分失败，请查看ComfyUI任务日志';}else data.state='running';}else{const r=await api.fetchApi('/h3_visual_studio/process/'+encodeURIComponent(id));data=await r.json();if(!r.ok)throw Error(data.error||'查询失败');}p.postJob=data;persist();if(getProject()===p){$('post-status').textContent=statusText(data);if(data.state==='done'&&data.video)preview.video(view(data.video),'视频处理完成');}if(!disposed&&['queued','running'].includes(data.state))timer=setTimeout(query,1500);}catch(e){log(e.message+'；可点击查询后台处理重试');}}
 $('post-start').onclick=async()=>{if(isBusy())return;const p=getProject(),source=sources[Number($('post-source').value)];if(!source){log('请先生成或合并一个视频');return;}if(['queued','running'].includes(p.postJob?.state)){log('已有处理任务，请查询或取消');return;}setBusy(true);try{const r=await api.fetchApi('/h3_visual_studio/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clip:source.row,megapixels:Number($('post-mp').value),denoise:$('post-denoise').value,sharpen:$('post-sharpen').value})});const data=await r.json();if(!r.ok)throw Error(data.error||'提交失败');p.postJob=data;persist();sync();void query();}catch(e){log(e.message);}finally{setBusy(false);}};

 $('post-ai').onclick=async()=>{if(isBusy())return;const p=getProject(),source=sources[Number($('post-source').value)];if(!source){log('请先选择已生成或合并的视频');return;}if(['queued','running'].includes(p.postJob?.state)){log('已有处理任务，请查询或取消');return;}setBusy(true);try{const prompt=existingUpscale(source.row,p.finishing?.model,Number($('post-mp').value));const response=await api.fetchApi('/object_info');if(!response.ok)throw Error('无法检查超分模型');assertModels(modelReport(await response.json(),[prompt]));const result=await api.queuePrompt(0,{output:prompt,workflow:{nodes:[],links:[],extra:{h3_existing_upscale:{source:source.row,megapixels:Number($('post-mp').value)}}}});if(!result?.prompt_id)throw Error('服务器未返回任务ID');p.postJob={id:result.prompt_id,kind:'comfy',state:'queued',source:source.row};persist();sync();void query();}catch(e){log(e.message);}finally{setBusy(false);}};
 $('post-query').onclick=()=>{clearTimeout(timer);void query();};$('post-cancel').onclick=async()=>{const p=getProject(),id=p.postJob?.id;if(!id)return;try{if(p.postJob.kind==='comfy'){const r=await api.fetchApi('/queue');if(!r.ok)throw Error('无法确认队列状态');const q=await r.json();if(q.queue_running?.some(row=>row[1]===id)){log('AI超分正在运行；如需中断，请在ComfyUI队列中停止该任务。');return;}const removed=await api.fetchApi('/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete:[id]})});if(!removed.ok)throw Error('移除排队任务失败');p.postJob={...p.postJob,state:'cancelled'};persist();sync();clearTimeout(timer);return;}const r=await api.fetchApi('/h3_visual_studio/process/'+encodeURIComponent(id)+'/cancel',{method:'POST'});if(!r.ok)throw Error('取消失败');clearTimeout(timer);await query();}catch(e){log(e.message);}};
 $('post-original').onclick=()=>{const source=sources[Number($('post-source').value)];if(source)preview.video(view(source.row),'原片对比');};$('post-result').onclick=()=>{const v=getProject().postJob?.video;if(v)preview.video(view(v),'处理结果对比');};
 return {sync,dispose(){disposed=true;clearTimeout(timer);}};
}
