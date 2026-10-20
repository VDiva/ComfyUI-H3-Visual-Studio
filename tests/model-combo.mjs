import assert from 'node:assert/strict';
import {modelChoices,modelReport} from '../web/model-check.mjs';
const file='RealESRGAN_x4.pth';
const prompts=[{'1':{class_type:'UpscaleModelLoader',inputs:{model_name:file}}}];
for(const value of [[[file]],['COMBO',{options:[file]}],{options:[file]}]){
 const definition={input:{required:{model_name:value}}};
 assert.deepEqual(modelChoices(definition,'model_name'),[file]);
 const report=modelReport({UpscaleModelLoader:definition},prompts);
 assert.deepEqual(report.missing,[]);assert.deepEqual(report.unknown,[]);
}
for(const value of [[[]],['COMBO',{options:[]}]])assert.deepEqual(modelReport({UpscaleModelLoader:{input:{required:{model_name:value}}}},prompts).missing,['models/upscale_models/'+file]);
assert.deepEqual(modelReport({UpscaleModelLoader:{input:{required:{}}}},prompts).unknown,['models/upscale_models/'+file]);
console.log('PASS legacy and COMBO model choices, installed, missing and unknown checks');
