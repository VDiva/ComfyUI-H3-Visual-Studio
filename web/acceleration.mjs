// Independent integration of the documented DMAD stock-node recipe; no AICG3D code copied.
export const DMAD_LORA='dmad_minimax_h3_4step_full_critic_comfyui.safetensors';
export const ACCELERATION_MODES=[['inherit','沿用原图（原Turbo/步数）'],['dmad4','DMAD 四步加速（需下载LoRA）'],['dmad8','DMAD 八步（动作质量对照）']];
export function accelerationMode(settings={}){
 const mode=settings.acceleration??'inherit';
 if(!ACCELERATION_MODES.some(([id])=>id===mode))throw Error('未知视频加速模式：'+mode);
 return mode;
}
export function effectiveVideoSettings(settings){
 const mode=accelerationMode(settings);
 return mode==='inherit'?{...settings}:{...settings,steps:mode==='dmad4'?4:8,sampler:'lcm',scheduler:'simple'};
}
export function accelerationSummary(settings){
 const mode=accelerationMode(settings);
 return mode==='inherit'?'沿用原图的LoRA和采样设置。':`DMAD ${mode==='dmad4'?4:8}步 · lcm/simple · 偏移12/2 · 替换原Turbo LoRA，不叠加；人物生图参数不变。参考/混合模型效果需实测。`;
}
export function accelerateApi(base,settings){
 const prompt=structuredClone(base),mode=accelerationMode(settings);
 if(mode==='inherit')return prompt;
 const entries=Object.entries(prompt),samplers=entries.filter(([,n])=>n.class_type==='SamplerCustomAdvanced');
 if(samplers.length!==1)throw Error('DMAD需要单一官方SamplerCustomAdvanced链路，请使用配套工作流');
 const source=(n,key,type)=>{
  const link=n?.inputs?.[key],node=Array.isArray(link)&&link[1]===0?prompt[String(link[0])]:null;
  if(node?.class_type!==type)throw Error(`DMAD链路不兼容：${key}需要${type}，未提交任务`);
  return node;
 };
 const sampler=samplers[0][1],guider=source(sampler,'guider','BasicGuider');
 const shift=source(guider,'model','MiniMaxH3SigmaShift');
 const lora=source(shift,'model','LoraLoaderModelOnly');
 source(lora,'model','UNETLoader'); // Refuse hidden stacked LoRAs or unsupported model patches.
 const scheduler=source(sampler,'sigmas','BasicScheduler');
 if(JSON.stringify(scheduler.inputs.model)!==JSON.stringify(guider.inputs.model))throw Error('DMAD调度器与guider需连接同一偏移模型');
 const selector=source(sampler,'sampler','KSamplerSelect');
 const effective=effectiveVideoSettings(settings);
 Object.assign(lora.inputs,{lora_name:DMAD_LORA,strength_model:1});
 Object.assign(shift.inputs,{shift_video:12,shift_audio:2});
 Object.assign(scheduler.inputs,{steps:effective.steps,scheduler:'simple',denoise:1});
 selector.inputs.sampler_name='lcm';
 return prompt;
}
export function accelerateWorkflow(graph,settings){
 if(accelerationMode(settings)==='inherit')return graph;
 // Validate the actual model path, rather than silently editing an unrelated LoRA.
 const api=Object.fromEntries(graph.nodes.map(n=>[String(n.id),{class_type:n.type,inputs:{}}]));
 for(const l of graph.links){const [id,a,o,b,slot]=l;api[String(b)].inputs[graph.nodes.find(n=>n.id===b).inputs[slot].name]=[String(a),o];}
 const result=accelerateApi(api,settings);
 const fields={LoraLoaderModelOnly:['lora_name','strength_model'],MiniMaxH3SigmaShift:['shift_video','shift_audio'],BasicScheduler:['scheduler','steps','denoise'],KSamplerSelect:['sampler_name']};
 for(const n of graph.nodes){const keys=fields[n.type];if(!keys)continue;
  keys.forEach((key,i)=>{if(result[String(n.id)].inputs[key]!==undefined){n.widgets_values[i]=result[String(n.id)].inputs[key];if(n.widgets_values_named)n.widgets_values_named[key]=n.widgets_values[i];}});
 }
 return graph;
}
