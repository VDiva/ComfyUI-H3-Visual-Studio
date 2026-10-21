import {finishingSettings,finishingCanvas} from './finishing.mjs?v=0.15.2';

// Compile Studio projects to the bundled Director executor, keeping the selected
// model/LoRA graph as the source of truth. No upstream timeline UI is required.
export function directorCoreRequest(prompt, project, plan, saveId) {
 const entries=Object.entries(prompt),find=type=>{
  const rows=entries.filter(([,n])=>n.class_type===type);
  if(rows.length!==1)throw Error('导演台内核需要唯一的 '+type);
  return rows[0];
 };
 const [,condition]=find('MiniMaxH3ReferenceToVideo');
 const [,guide]=find('BasicGuider');
 const shifted=prompt[guide.inputs.model[0]];
 if(shifted?.class_type!=='MiniMaxH3SigmaShift')throw Error('导演台内核需要MiniMaxH3SigmaShift模型接线');
 let next=Math.max(...Object.keys(prompt).map(id=>Number(id)||0));
 const add=(class_type,inputs)=>{const id=String(++next);prompt[id]={class_type,inputs};return [id,0];};
 const refs={prompt:plan.prompt,duration_sec:plan.length/24};
 for(const [key,value] of Object.entries(condition.inputs)){
  const match=key.match(/^ref_(images|audios|videos)\.ref_(image|audio|video)_(\d+)$/);
  if(match)refs[match[2]+'_'+match[3]]=value;
 }
 const settings=project.settings,finish=finishingSettings(project.finishing);
 const inputs={model:shifted.inputs.model,video_vae:condition.inputs.vae,audio_vae:condition.inputs.audio_vae,clip:condition.inputs.clip,
  task_type:'r2v',global_prompt:plan.prompt,frame_rate:24,width:settings.width,height:settings.height,
  ref_max_size:Math.max(settings.width,settings.height),total_frames:plan.length,
  timeline_data:JSON.stringify({output:{mode:'fixed',width:settings.width,height:settings.height,audioMode:'generate'}}),
  r2v_groups:add('H3StudioDirectorGroup',refs),steps:settings.steps,sampler:settings.sampler,scheduler:settings.scheduler,
  cfg:1,seed:settings.seed,shift_video:shifted.inputs.shift_video,shift_audio:shifted.inputs.shift_audio,
  clear_vram_between_segments:true,cache_name:''};
 const hasFinish=finish.refine||finish.upscale!=='off';
 if(finish.refine||finish.upscale==='latent'){
  const target=finishingCanvas(settings.width,settings.height,finish);
  if(finish.upscale==='latent'&&(target.width<settings.width||target.height<settings.height))throw Error('放大目标小于原始尺寸，请提高目标MP');
  let model=inputs.model;
  if(finish.dualModel){
   if(!finish.refineModel||!finish.refineLora)throw Error('独立二采缺少模型或LoRA配置');
   model=add('UNETLoader',{unet_name:finish.refineModel,weight_dtype:'default'});
   model=add('LoraLoaderModelOnly',{model,lora_name:finish.refineLora,strength_model:1});
   if(settings.sageAttention)model=add('PathchSageAttentionKJ',{model,sage_attention:'auto',allow_compile:false});
  }
  const packed={mode:finish.upscale==='latent'?(finish.refine?'upscale':'latent_upscale'):'refine',
   upscale_method:'h3_latent',latent_upscale_model:finish.latentModel,sampler:'euler',passes:finish.passes,
   megapixels:finish.megapixels,target_width:target.width,target_height:target.height,
   enable_latent_chunking:!!finish.chunking,refine_model:model};
  if(finish.refine){
   const shiftedRefine=add('MiniMaxH3SigmaShift',{model,shift_video:inputs.shift_video,shift_audio:inputs.shift_audio});
   packed.sigmas=add('BasicScheduler',{model:shiftedRefine,scheduler:finish.scheduler&&finish.scheduler!=='inherit'?finish.scheduler:settings.scheduler,steps:finish.steps,denoise:finish.denoise});
  }
  inputs.refine=add('H3StudioDirectorRefine',packed);
 }
 if(project.selflift?.enabled){
  const s=project.selflift;
  if(settings.sampler!=='euler'||hasFinish||settings.acceleration!=='inherit')throw Error('SelfLift需要Euler、沿用原图模式，并关闭额外精修和放大');
  if(!Number.isFinite(s.lowScale)||s.lowScale<0.25||s.lowScale>=1||!Number.isInteger(s.highSteps)||s.highSteps<1||s.highSteps>=settings.steps)throw Error('SelfLift比例或高清步数无效');
  inputs.selflift=add('H3StudioDirectorSelfLift',{split_mode:'highres_steps',highres_steps:s.highSteps,transition_step:6,
   lowres_scale:s.lowScale,sampler_mode:'euler',native_low_carry:true,latent_upscale_model:finish.latentModel||s.model,
   latent_upsample:'bilinear',rho:0,w_min:0.5,w_max:1,enable_latent_chunking:!!s.chunking,enable_tiling:false,tile_count:2,tile_overlap:128});
 }
 const core=add('H3StudioDirector',inputs);
 let images=core;
 if(['model','lanczos'].includes(finish.upscale)){
  const target=finishingCanvas(settings.width,settings.height,finish);
  if(target.width<settings.width||target.height<settings.height)throw Error('放大目标小于原始尺寸，请提高目标MP');
  images=finish.upscale==='model'?add('H3FrameUpscale',{images,upscale_model:add('UpscaleModelLoader',{model_name:finish.model}),...target}):add('ImageScale',{image:images,upscale_method:'lanczos',...target,crop:'disabled'});
 }
 const save=prompt[saveId];
 save.inputs.video=add('CreateVideo',{images,audio:[core[0],1],fps:24});
 const outputs=[saveId];
 if(hasFinish){
  const original=add('CreateVideo',{images:[core[0],inputs.refine?6:0],audio:[core[0],1],fps:24});
  outputs.push(add('SaveVideo',{...save.inputs,video:original,filename_prefix:save.inputs.filename_prefix+'_original'})[0]);
 }
 const keep=new Set();
 function visit(id){id=String(id);if(keep.has(id))return;const node=prompt[id];if(!node)throw Error('导演台执行图缺少节点 '+id);keep.add(id);for(const value of Object.values(node.inputs))if(Array.isArray(value)&&value.length===2&&typeof value[1]==='number')visit(value[0]);}
 outputs.forEach(visit);
 return Object.fromEntries(Object.entries(prompt).filter(([id])=>keep.has(id)));
}
