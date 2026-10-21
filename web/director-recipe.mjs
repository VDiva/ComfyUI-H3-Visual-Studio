export const TURBO8='minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors';
export const TURBO4='minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors';
export const REFINE_MODEL='minimax_h3_ref2va_pruned_w4a8_mixed.safetensors';
export function attentionModel(add,model,enabled){return enabled?add('PathchSageAttentionKJ',{model,sage_attention:'auto',allow_compile:false}):model;}
export function applyDirectorPreset(project,exact=false){
 project.selflift={...project.selflift,enabled:false};
 project.settings={...project.settings,width:864,height:480,megapixels:0.4,steps:8,sampler:'res_multistep',scheduler:'simple',acceleration:'director8',directorBaseModel:exact?'minimax_h3_fl2va_pruned_int8_convrot.safetensors':'',sageAttention:exact};
 project.finishing={...project.finishing,refine:true,upscale:'latent',steps:3,denoise:0.2,passes:1,scheduler:'beta',megapixels:exact?1:0.8,chunking:true,dualModel:exact,refineModel:REFINE_MODEL,refineLora:TURBO4};
 return project;
}
export function mountDirectorRecipe({container,getProject,persist,onChange,log}){
 const card=document.createElement('div');card.className='library';card.innerHTML='<div class="title">导演台参考预设</div><p class="muted">Turbo8低清一采 → 3D放大 → Euler / beta三步二采，强度0.2。单模型版减少模型切换；双模型版接近原例，内存和显存需求更高。</p><div class="row"><button id="recipe-balanced">应用均衡版（单模型0.8MP）</button><button id="recipe-exact">应用双模型预设（1MP）</button><label><input id="recipe-sage" type="checkbox">启用KJ SageAttention（需对应节点及运行库）</label></div><div class="row"><label><input id="recipe-dual" type="checkbox">独立二采模型</label><label>二采调度 <select id="recipe-scheduler"><option value="inherit">沿用一采</option><option value="simple">simple</option><option value="beta">beta</option></select></label></div><p id="recipe-summary" class="muted"></p>';
 container.prepend(card);const $=id=>card.querySelector('#'+id);
 const apply=exact=>{applyDirectorPreset(getProject(),exact);persist();onChange();log(exact?'已应用双模型参数：FL2VA一采，W4A8二采，目标1MP；修改生成设置的MP或画幅比例后，放大目标同步为一采MP的2倍。':'已应用单模型均衡参数：保留当前主模型，Turbo8一采，0.8MP三步beta二采；已关闭SelfLift。实际速度和脸部效果待实测。');};
 $('recipe-balanced').onclick=()=>apply(false);$('recipe-exact').onclick=()=>apply(true);
 $('recipe-dual').onchange=()=>{const p=getProject();p.finishing={...p.finishing,dualModel:$('recipe-dual').checked,refineModel:p.finishing.refineModel||REFINE_MODEL,refineLora:p.finishing.refineLora||TURBO4};persist();onChange();};
 $('recipe-scheduler').onchange=()=>{getProject().finishing.scheduler=$('recipe-scheduler').value;persist();onChange();};
 $('recipe-sage').onchange=()=>{const p=getProject();if(p.settings.acceleration!=='director8'){p.settings.sageAttention=false;$('recipe-sage').checked=false;log('请先应用导演台参考预设，再启用该SageAttention选项。');return;}p.settings.sageAttention=$('recipe-sage').checked;persist();onChange();};
 return {sync(){const p=getProject();$('recipe-sage').checked=!!p.settings.sageAttention;$('recipe-dual').checked=!!p.finishing?.dualModel;$('recipe-scheduler').value=p.finishing?.scheduler||'inherit';$('recipe-summary').textContent='二采：'+(p.finishing?.dualModel?'独立模型 '+p.finishing.refineModel:'沿用一采模型')+'；调度：'+(p.finishing?.scheduler||'沿用')+'。缺少模型可在模型与下载一键安装，注意力节点缺失时不会静默跳过。';}};
}
