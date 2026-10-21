const stages={TextEncodeQwenImage21:'Qwen-Image-2.1编码人物提示词',QwenImage21Cache:'配置Qwen人物图缓存',UNETLoader:'加载视频模型',CLIPLoader:'加载文本模型',DualCLIPLoader:'加载文本模型',VAELoader:'加载VAE模型',LoraLoaderModelOnly:'加载加速LoRA',LoraLoader:'加载LoRA',MiniMaxH3ReferenceToVideo:'编码提示词与参考素材',SamplerCustomAdvanced:'视频采样 / H3精修',KSampler:'人物图采样',VAEDecode:'解码图像帧',VAEDecodeAudio:'解码原声音轨',UpscaleModelLoader:'加载AI超分模型',H3FrameUpscale:'AI模型超分',ImageScale:'Lanczos放大',CreateVideo:'组装视频与音轨',SaveVideo:'编码并保存视频',SaveImage:'保存人物参考图',LoadVideo:'读取源视频',GetVideoComponents:'提取视频帧与音轨',CLIPTextEncode:'编码人物提示词'};
export function executionProgress({api,show}){
 stages.H3StudioDirector='导演台内核：准备生成';
 stages.H3StudioDirectorGroup='准备导演台参考素材';
 stages.H3StudioDirectorRefine='准备导演台二采设置';
 stages.H3StudioDirectorSelfLift='准备导演台SelfLift设置';
 let active=null,node=null,graph={},context='',last='',frames=null;
 const emit=text=>{last=context+' · '+text;show(last);};
 const matches=d=>active&&(!d.prompt_id||String(d.prompt_id)===active);
 const name=()=>{const type=graph[String(node)]?.class_type;return stages[type]||type||('执行节点 '+node);};
 const executing=e=>{const d=e.detail||{};if(!matches(d))return;if(d.node==null){emit('节点执行结束，等待结果确认');active=null;return;}if(String(node)!==String(d.node))frames=null;node=d.node;emit(name()+'（节点 '+node+'）');};
 const frameProgress=e=>{const d=e.detail||{};if(!matches(d)||!d.prompt_id||!Number.isInteger(d.value)||!Number.isInteger(d.max)||d.max<=0||d.value<0||d.value>d.max)return;node=d.node;frames=d;const eta=d.value>0&&d.value<d.max?' · 预计剩余约'+Math.ceil(d.elapsed/d.value*(d.max-d.value)/60)+'分钟':'';emit('AI模型超分 · 已完成 '+d.value+'/'+d.max+' 帧（'+Math.floor(d.value/d.max*100)+'%）'+(d.value<d.max?' · 正在处理第'+(d.value+1)+'帧':' · 正在整理输出帧')+eta);};
 const progress=e=>{const d=e.detail||{};if(!matches(d))return;if(d.node!=null&&String(d.node)!==String(node)){node=d.node;frames=null;}if(node==null)return;if(frames&&String(frames.node)===String(node))return;if(graph[String(node)]?.class_type==='H3FrameUpscale'){emit('AI模型超分 · 正在处理视频帧（等待累计帧数；内部百分比会逐帧重置）');return;}if(Number.isFinite(d.value)&&Number.isFinite(d.max)&&d.max>0)emit(name()+' · '+d.value+'/'+d.max+'（'+Math.min(100,Math.round(d.value/d.max*100))+'%）');};
 const start=e=>{const d=e.detail||{};if(matches(d)&&d.prompt_id)emit('开始执行，准备模型');};
 const failure=e=>{const d=e.detail||{};if(matches(d)&&d.prompt_id){emit('执行停止：'+(d.exception_message||'任务已中断'));active=null;}};
 const directorProgress=e=>{const d=e.detail||{};if(!active||String(d.node_id)!==String(node)||graph[String(node)]?.class_type!=='H3StudioDirector')return;const percent=d.phase_max>0?' · '+Math.round(d.phase_value/d.phase_max*100)+'%':'';emit('导演台 · '+(d.phase_label||d.phase)+percent);};
 const listeners=[['execution_start',start],['executing',executing],['progress',progress],['minimax_director_progress',directorProgress],['h3_frame_progress',frameProgress],['execution_error',failure],['execution_interrupted',failure]];
 const recent=new Map();const subscriptions=listeners.map(([event,fn])=>[event,e=>{const id=e.detail?.prompt_id;if(id){let events=recent.get(String(id))||[];events=events.filter(item=>item.event!==event);events.push({event,detail:e.detail});recent.set(String(id),events);if(recent.size>20)recent.delete(recent.keys().next().value);}fn(e);}]);
 for(const [event,fn] of subscriptions)api.addEventListener(event,fn);
 return {syncQueue(id,prompt,title,queued=true){this.watch(id,prompt,title,queued);if(active===String(id)&&node===null)emit(queued?'排队等待执行（服务器队列已确认）':'服务器已开始执行，等待节点进度；可能正在加载模型，长时间不变请查看ComfyUI日志');},watch(id,prompt,title='当前任务',queued=true){if(String(id)===active){if(prompt)graph=prompt;return;}active=String(id);node=null;frames=null;graph=prompt||{};context=title;emit(queued?'排队等待执行':'执行中，等待节点进度');for(const item of recent.get(active)||[]){const handler=listeners.find(([event])=>event===item.event)?.[1];handler?.({detail:item.detail});}},finish(id){if(String(id)===active){emit('执行结束，请查看任务结果');active=null;node=null;}},dispose(){for(const [event,fn] of subscriptions)api.removeEventListener(event,fn);recent.clear();active=null;},get text(){return last;}};
}
