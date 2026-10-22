import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,compileRequest,readProject} from '../web/project.mjs';
import {applyDirectorPreset,TURBO8,TURBO4,REFINE_MODEL} from '../web/director-recipe.mjs';
import {modelReport} from '../web/model-check.mjs';
const base=JSON.parse(fs.readFileSync(new URL('./.fixtures/官方采样API基线.json',import.meta.url)));
const nodes=(p,t)=>Object.values(p).filter(n=>n.class_type===t);
for(const exact of [false,true]){
 const project=applyDirectorPreset(defaultProject(),exact);project.autoMerge=false;const g={id:'g',number:1,seconds:2,prompt:'人物在夜间站立，无对白。'};
 const p=compileRequest(base,project,g).prompt;
 assert.equal(project.selflift.enabled,false);assert.equal(nodes(p,'H3StudioDirector').length,1);assert.equal(nodes(p,'H3SelfLiftSampler').length,0);assert.equal(nodes(p,'SaveVideo').length,2);
 assert.equal(nodes(p,'H3StudioDirector')[0].inputs.steps,8);assert.equal(nodes(p,'H3StudioDirector')[0].inputs.sampler,'res_multistep');assert.equal(p['145'].inputs.lora_name,TURBO8);
 const tail=nodes(p,'BasicScheduler').find(n=>n.inputs.denoise===0.2);assert.equal(tail.inputs.steps,3);assert.equal(tail.inputs.scheduler,'beta');
 for(const v of nodes(p,'CreateVideo'))assert.equal(p[v.inputs.audio[0]].class_type,'H3StudioDirector');
 assert.equal(nodes(p,'UNETLoader').length,exact?2:1);
 if(exact){assert.equal(p['127'].inputs.unet_name,'minimax_h3_fl2va_pruned_int8_convrot.safetensors');assert.ok(nodes(p,'UNETLoader').some(n=>n.inputs.unet_name===REFINE_MODEL));assert.ok(nodes(p,'LoraLoaderModelOnly').some(n=>n.inputs.lora_name===TURBO4));}
 assert.equal(project.settings.refineSageAttention,true);if(exact)assert.equal(nodes(p,'PathchSageAttentionKJ').length,2);
 project.settings.refineSageAttention=false;project.settings.sageAttention=true;const sage=compileRequest(base,project,g).prompt;assert.equal(nodes(sage,'PathchSageAttentionKJ').length,1);assert.ok(modelReport({},[sage]).nodes.includes('PathchSageAttentionKJ'));
 if(exact){const refinement=nodes(sage,'H3StudioDirectorRefine')[0];assert.equal(sage[refinement.inputs.refine_model[0]].class_type,'LoraLoaderModelOnly');project.settings.refineSageAttention=true;assert.equal(nodes(compileRequest(base,project,g).prompt,'PathchSageAttentionKJ').length,2);}
}
console.log('PASS balanced/full Director recipes, separate models/LoRAs, beta3/0.2 refine, first-pass audio and originals, optional Sage preflight');

assert.equal(defaultProject().settings.refineSageAttention,true);assert.equal(readProject({settings:{refineSageAttention:false}}).settings.refineSageAttention,false);
