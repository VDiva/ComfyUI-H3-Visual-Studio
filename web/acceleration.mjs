import {TURBO8,attentionModel} from './director-recipe.mjs?v=0.15.31';
// Independent integration of the documented DMAD stock-node recipe; no AICG3D code copied.
export const DMAD_LORA='dmad_minimax_h3_4step_full_critic_comfyui.safetensors';
export const ACCELERATION_MODES=[['director8','导演台 Turbo8（res_multistep/simple）'],['inherit','沿用原图（原Turbo/步数）'],['dmad4','DMAD 四步加速（需下载LoRA）'],['dmad8','DMAD 八步（动作质量对照）']];
export function accelerationMode(settings={}){
 const mode=settings.acceleration??'inherit';
 if(!ACCELERATION_MODES.some(([id])=>id===mode))throw Error('未知视频加速模式：'+mode);
 return mode;
}
export function effectiveVideoSettings(settings){
 const mode=accelerationMode(settings);
 return mode==='director8'?{...settings,steps:8,sampler:'res_multistep',scheduler:'simple'}:mode==='inherit'?{...settings}:{...settings,steps:mode==='dmad4'?4:8,sampler:'lcm',scheduler:'simple'};
}
export function accelerationSummary(settings){
 const mode=accelerationMode(settings);
 if(mode==='director8')return '导演台参考：Turbo8 / res_multistep / simple / 偏移12/3；保留当前主模型，原例预设可指定FL2VA。';
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
 if(mode==='director8'){
  Object.assign(lora.inputs,{lora_name:TURBO8,strength_model:1});
  if(settings.directorBaseModel)prompt[String(lora.inputs.model[0])].inputs.unet_name=settings.directorBaseModel;
  Object.assign(shift.inputs,{shift_video:12,shift_audio:3});
  Object.assign(scheduler.inputs,{steps:8,scheduler:'simple',denoise:1});selector.inputs.sampler_name='res_multistep';
  if(settings.sageAttention){let next=Math.max(...Object.keys(prompt).map(Number));const add=(class_type,inputs)=>{const id=String(++next);prompt[id]={class_type,inputs};return [id,0];};shift.inputs.model=attentionModel(add,shift.inputs.model,true);}
  return prompt;
 }
 Object.assign(lora.inputs,{lora_name:DMAD_LORA,strength_model:1});
 Object.assign(shift.inputs,{shift_video:12,shift_audio:2});
 Object.assign(scheduler.inputs,{steps:effective.steps,scheduler:'simple',denoise:1});
 selector.inputs.sampler_name='lcm';
 return prompt;
}
