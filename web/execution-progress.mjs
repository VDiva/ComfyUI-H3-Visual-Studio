const stages={TextEncodeQwenImage21:'Qwen-Image-2.1编码人物提示词',QwenImage21Cache:'配置Qwen人物图缓存',UNETLoader:'加载视频模型',CLIPLoader:'加载文本模型',DualCLIPLoader:'加载文本模型',VAELoader:'加载VAE模型',LoraLoaderModelOnly:'加载加速LoRA',LoraLoader:'加载LoRA',MiniMaxH3ReferenceToVideo:'编码提示词与参考素材',SamplerCustomAdvanced:'视频采样 / H3精修',KSampler:'人物图采样',VAEDecode:'解码图像帧',VAEDecodeAudio:'解码原声音轨',UpscaleModelLoader:'加载AI超分模型',H3FrameUpscale:'AI模型超分',ImageScale:'Lanczos放大',CreateVideo:'组装视频与音轨',SaveVideo:'编码并保存视频',SaveImage:'保存人物参考图',LoadVideo:'读取源视频',GetVideoComponents:'提取视频帧与音轨',CLIPTextEncode:'编码人物提示词'};
export function executionProgress({api,show,now=()=>performance.now()/1000,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
 stages.H3StudioDirector='导演台内核：准备生成';
 stages.H3StudioDirectorGroup='准备导演台参考素材';
 stages.H3StudioDirectorRefine='准备导演台二采设置';
 stages.H3StudioDirectorSelfLift='准备导演台SelfLift设置';
 let active=null,node=null,graph={},context='',last='',frames=null,suspended=false;
 let measurement=null,baseText='',directorPhase=null,timer=null;
 const duration=seconds=>seconds>=60?Math.floor(seconds/60)+'分'+Math.floor(seconds%60)+'秒':Math.floor(seconds)+'秒';
 const render=()=>{
  let suffix='',detail=null;
  if(measurement){
   const m=measurement,elapsed=Math.max(0,now()-m.began),waiting=Math.max(0,now()-m.changed);
   suffix=' · 本阶段已用 '+duration(elapsed);
   if(m.value<m.max){suffix+=' · 当前'+m.unit+'已等待 '+duration(waiting);}
   if(m.rate>0){
    suffix+=' · 平均 '+m.rate.toFixed(1)+'秒/'+m.unit;
    if(m.value<m.max){const estimate=m.rate*(m.max-m.value);suffix+=waiting>m.rate*1.5?' · 当前'+m.unit+'耗时偏长，剩余时间重估中':' · 本阶段预计剩余约 '+duration(Math.max(0,estimate-waiting));}
   }else if(m.value<m.max)suffix+=' · 等待首个进度，暂无法估时';
   detail={value:m.value,max:m.max,label:m.label,elapsed};
  }
  last=context+' · '+baseText+suffix;show(last,detail);
 };
 const emit=text=>{baseText=text;render();};
 const reset=()=>{measurement=null;directorPhase=null;if(timer!==null)clearIntervalFn(timer);timer=null;};
 const measure=(key,label,value,max,unit)=>{
  if(!Number.isFinite(value)||!Number.isFinite(max)||max<=0||value<0||value>max)return;
  if(!measurement||measurement.key!==key||value<measurement.value){measurement={key,label,value,max,unit,began:now(),changed:now(),rate:0};}
  else{const m=measurement;if(value>m.value){const sample=(now()-m.changed)/(value-m.value);if(sample>0)m.rate=m.rate?m.rate*.6+sample*.4:sample;m.changed=now();}m.value=value;m.max=max;}
  if(timer===null)timer=setIntervalFn(()=>{if(active&&measurement)render();},1000);
 };
 const matches=d=>!suspended&&active&&(!d.prompt_id||String(d.prompt_id)===active);
 const name=()=>{const type=graph[String(node)]?.class_type;return stages[type]||type||('执行节点 '+node);};
 const executing=e=>{const d=e.detail||{};if(!matches(d))return;if(d.node==null){reset();emit('节点执行结束，等待结果确认');active=null;return;}if(String(node)!==String(d.node)){frames=null;reset();}node=d.node;emit(name()+'（节点 '+node+'）');};
 const frameProgress=e=>{const d=e.detail||{};if(!matches(d)||!d.prompt_id||!Number.isInteger(d.value)||!Number.isInteger(d.max)||d.max<=0||d.value<0||d.value>d.max)return;node=d.node;frames=d;const eta=d.value>0&&d.value<d.max?' · 预计剩余约'+Math.ceil(d.elapsed/d.value*(d.max-d.value)/60)+'分钟':'';emit('AI模型超分 · 已完成 '+d.value+'/'+d.max+' 帧（'+Math.floor(d.value/d.max*100)+'%）'+(d.value<d.max?' · 正在处理第'+(d.value+1)+'帧':' · 正在整理输出帧')+eta);};
 const progress=e=>{const d=e.detail||{};if(!matches(d))return;if(d.node!=null&&String(d.node)!==String(node)){node=d.node;frames=null;reset();}if(node==null)return;if(frames&&String(frames.node)===String(node))return;if(graph[String(node)]?.class_type==='H3FrameUpscale'){emit('AI模型超分 · 正在处理视频帧（等待累计帧数；内部百分比会逐帧重置）');return;}if(graph[String(node)]?.class_type==='H3StudioDirector'&&directorPhase)return;if(Number.isFinite(d.value)&&Number.isFinite(d.max)&&d.max>0){measure('node:'+node,name(),d.value,d.max,'步');emit(name()+' · '+d.value+'/'+d.max+'（'+Math.min(100,Math.round(d.value/d.max*100))+'%）');}};
 const start=e=>{const d=e.detail||{};if(matches(d)&&d.prompt_id)emit('开始执行，准备模型');};
 const failure=e=>{const d=e.detail||{};if(matches(d)&&d.prompt_id){reset();emit('执行停止：'+(d.exception_message||'任务已中断'));active=null;}};
 const directorProgress=e=>{
  const d=e.detail||{};if(!active||!matches(d)||String(d.node_id)!==String(node)||graph[String(node)]?.class_type!=='H3StudioDirector')return;
  const phase=d.phase||d.phase_label,label=d.phase_label||d.phase||'执行中',fraction=d.phase_max>0?Math.max(0,Math.min(1,d.phase_value/d.phase_max)):null;
  directorPhase=phase;
  const inputs=graph[String(node)].inputs||{},refine=graph[String(inputs.refine?.[0])]?.inputs||{},sigmas=graph[String(refine.sigmas?.[0])]?.inputs||{};
  const steps=phase==='sample'?Number(inputs.steps):phase==='refine'?Number(sigmas.steps)*Math.max(1,Number(refine.passes)||1):0;
  const max=steps>0?steps:1,value=fraction===null?0:fraction*max;
  const key=node+':'+(d.task_key||'')+':'+(d.segment||1)+':'+phase;
  measure(key,label,value,max,steps>0?'步':'阶段');
  const count=steps>0?' · 已完成 '+Number(value.toFixed(2))+'/'+steps+' 步'+(value<steps?' · 正在第 '+Math.min(steps,Math.floor(value+1e-6)+1)+' 步':''):'';
  const percent=fraction===null?'':' · 阶段进度 '+(fraction*100).toFixed(1)+'%';
  emit('导演台'+(d.segment_total>1?' · 片段 '+d.segment+'/'+d.segment_total:'')+' · '+label+count+percent);
 };
 const listeners=[['execution_start',start],['executing',executing],['progress',progress],['minimax_director_progress',directorProgress],['h3_frame_progress',frameProgress],['execution_error',failure],['execution_interrupted',failure]];
 const recent=new Map();const subscriptions=listeners.map(([event,fn])=>[event,e=>{const id=e.detail?.prompt_id;if(id){let events=recent.get(String(id))||[];events=events.filter(item=>item.event!==event);events.push({event,detail:e.detail});recent.set(String(id),events);if(recent.size>20)recent.delete(recent.keys().next().value);}fn(e);}]);
 for(const [event,fn] of subscriptions)api.addEventListener(event,fn);
 return {connectionLost(text){reset();suspended=true;emit(text);},connectionRestored(){suspended=false;reset();emit('连接已恢复，等待核对任务状态；此前计时已停止');},syncQueue(id,prompt,title,queued=true){if(suspended)return;this.watch(id,prompt,title,queued);if(active===String(id)&&node===null)emit(queued?'排队等待执行（服务器队列已确认）':'服务器已开始执行，等待节点进度；可能正在加载模型，长时间不变请查看ComfyUI日志');},watch(id,prompt,title='当前任务',queued=true){if(String(id)===active){if(prompt)graph=prompt;return;}reset();suspended=false;active=String(id);node=null;frames=null;graph=prompt||{};context=title;emit(queued?'排队等待执行':'执行中，等待节点进度');for(const item of recent.get(active)||[]){const handler=listeners.find(([event])=>event===item.event)?.[1];handler?.({detail:item.detail});}},finish(id){if(String(id)===active){reset();emit('执行结束，请查看任务结果');active=null;node=null;}},dispose(){reset();for(const [event,fn] of subscriptions)api.removeEventListener(event,fn);recent.clear();active=null;},get text(){return last;}};
}
