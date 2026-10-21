import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,readProject,compileRequest} from '../web/project.mjs';
import {applyDirectorPreset} from '../web/director-recipe.mjs';
for(const initial of [defaultProject(),readProject({})]){
 assert.equal(initial.finishing.dualModel,true);assert.equal(initial.finishing.megapixels,2);assert.equal(initial.settings.sageAttention,true);
 assert.equal(initial.settings.directorBaseModel,'minimax_h3_fl2va_pruned_int8_convrot.safetensors');
}
const disabled=defaultProject();disabled.settings.sageAttention=false;disabled.finishing.dualModel=false;
assert.equal(readProject(disabled).settings.sageAttention,false);assert.equal(readProject(disabled).finishing.dualModel,false);
const p=applyDirectorPreset(defaultProject(),false);assert.equal(p.selflift.enabled,false);assert.equal(p.settings.acceleration,'director8');assert.equal(p.finishing.dualModel,false);assert.equal(p.finishing.megapixels,0.8);assert.equal(p.finishing.steps,3);assert.equal(p.finishing.scheduler,'beta');assert.equal(p.finishing.denoise,0.2);assert.equal(p.settings.sageAttention,false);
assert.deepEqual(readProject(JSON.stringify(p)).finishing,p.finishing);
const explicit=structuredClone(p);explicit.settings.acceleration='dmad4';explicit.finishing.refine=false;explicit.finishing.upscale='off';assert.equal(readProject(explicit).settings.acceleration,'dmad4');assert.equal(readProject(explicit).finishing.refine,false);
const base=JSON.parse(fs.readFileSync(new URL('./.fixtures/官方采样API基线.json',import.meta.url)));const out=compileRequest(base,p,{id:'g',number:1,seconds:2,prompt:'单人站立，无对白。'}).prompt;assert.equal(Object.values(out).filter(n=>n.class_type==='UNETLoader').length,1);assert.equal(Object.values(out).filter(n=>n.class_type==='H3StudioDirector').length,1);assert.ok(!Object.values(out).some(n=>n.class_type==='H3SelfLiftSampler'));assert.equal(Object.values(out).find(n=>n.class_type==='H3StudioDirector').inputs.steps,8);console.log('PASS default balanced recipe, single model, 8+3 steps, no SelfLift/DMAD, saved choices and compiled request');
