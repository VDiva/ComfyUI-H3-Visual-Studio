export const SELF_MODEL='minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors';
export const defaultSelfLift=()=>({enabled:false,lowScale:0.65,highSteps:2,model:SELF_MODEL,chunking:true});
export function selfLiftApi(prompt,project){
 const s={...defaultSelfLift(),...project.selflift};if(!s.enabled)return prompt;
 if(project.settings.acceleration&&project.settings.acceleration!=='inherit')throw Error('SelfLift只支持Euler，请关闭DMAD加速，使用沿用原图模式');
 if(project.finishing?.refine||project.finishing?.upscale&&project.finishing.upscale!=='off')throw Error('启用SelfLift时请关闭额外精修和放大，避免叠加');
 if(!Number.isFinite(s.lowScale)||s.lowScale<0.25||s.lowScale>=1||!Number.isInteger(s.highSteps)||s.highSteps<1||s.highSteps>=project.settings.steps)throw Error('SelfLift比例需为0.25—0.95，高清步数需小于总步数');
 if(!s.model)throw Error('SelfLift缺少H3 3D latent模型');
 const result=structuredClone(prompt),entries=Object.entries(result),samples=entries.filter(([,n])=>n.class_type==='SamplerCustomAdvanced');
 if(samples.length!==1)throw Error('SelfLift需要单一官方采样链路');
 const [,sample]=samples[0],guide=result[String(sample.inputs.guider?.[0])],schedule=result[String(sample.inputs.sigmas?.[0])];
 if(guide?.class_type!=='BasicGuider'||schedule?.class_type!=='BasicScheduler'||JSON.stringify(guide.inputs.model)!==JSON.stringify(schedule.inputs.model))throw Error('SelfLift需要共用同一模型的BasicGuider/BasicScheduler');
 if(schedule.inputs.denoise!==1)throw Error('SelfLift必须从完整一采时间表开始');
 sample.class_type='H3SelfLiftSampler';sample.inputs={model:guide.inputs.model,positive:guide.inputs.conditioning,noise:sample.inputs.noise,sigmas:sample.inputs.sigmas,latent_image:sample.inputs.latent_image,model_name:project.finishing?.latentModel||s.model,width:project.settings.width,height:project.settings.height,low_scale:s.lowScale,high_steps:s.highSteps,chunking:!!s.chunking};
 return result;
}
export function mountSelfLift({container,getProject,persist,onChange,log}){
 const card=document.createElement('div');card.className='library';card.innerHTML='<div class="title">SelfLift 渐进一采（实验）</div><p class="muted">低清前段 → 3D latent放大 → 高清收尾，总步数不增加。最终尺寸使用“生成设置”的分辨率；仍需高清阶段显存。</p><div class="row"><label><input id="selflift-enabled" type="checkbox">启用渐进一采</label><label>低清宽高比例 <input id="selflift-scale" type="number" min="0.25" max="0.95" step="0.05"></label><label>高清收尾步数 <input id="selflift-steps" type="number" min="1" max="99"></label></div><p id="selflift-summary" class="muted"></p><p class="muted">使用上方H3 latent模型选择框中的模型；首次需下载同一份3D权重。启用时自动关闭DMAD和额外二采/放大，使用Euler；后续如重新打开冲突设置，将在提交前提示。</p>';
 container.prepend(card);const $=id=>card.querySelector('#'+id);
 const sync=()=>{const p=getProject(),s={...defaultSelfLift(),...p.selflift};$('selflift-enabled').checked=s.enabled;$('selflift-scale').value=s.lowScale;$('selflift-steps').value=s.highSteps;const w=p.settings.width,h=p.settings.height;$('selflift-summary').textContent=`目标 ${w}×${h}；低清约${Math.max(32,Math.round(w*s.lowScale/32)*32)}×${Math.max(32,Math.round(h*s.lowScale/32)*32)}；低清${Math.max(0,p.settings.steps-s.highSteps)}步 + 高清${s.highSteps}步。`;};
 for(const [id,key] of [['selflift-enabled','enabled'],['selflift-scale','lowScale'],['selflift-steps','highSteps']])$(id).onchange=()=>{const p=getProject();p.selflift={...defaultSelfLift(),...p.selflift,[key]:key==='enabled'?$(id).checked:Number($(id).value)};if(p.selflift.enabled&&key==='enabled'){p.settings={...p.settings,acceleration:'inherit',sampler:'euler',sageAttention:false,steps:Math.max(4,p.settings.steps)};p.finishing={...p.finishing,refine:false,upscale:'off'};p.selflift.model=p.finishing.latentModel||SELF_MODEL;log('SelfLift已启用：使用Euler，已关闭DMAD及额外二采/放大。请先短片测试。');}persist();sync();onChange();};
 return {sync};
}
