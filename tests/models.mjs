import assert from 'node:assert/strict';
import {modelReport,reportText,assertModels} from '../web/model-check.mjs';
const p={'1':{class_type:'UNETLoader',inputs:{unet_name:'h3.safetensors'}},'2':{class_type:'VAELoader',inputs:{vae_name:'video.safetensors'}},'3':{class_type:'VAELoader',inputs:{vae_name:'audio.safetensors'}},'4':{class_type:'CLIPLoader',inputs:{clip_name:'qwen.safetensors'}},'5':{class_type:'LoraLoaderModelOnly',inputs:{lora_name:'turbo.safetensors'}}};
const info={};for(const n of Object.values(p)){info[n.class_type]||={input:{required:{}}};for(const key of Object.keys(n.inputs))info[n.class_type].input.required[key]=[[]];}
let r=modelReport(info,[p,p]);assert.equal(r.missing.length,5);assert.equal(r.checked.length,5);assert.throws(()=>assertModels(r));assert.ok(reportText(r).includes('audio.safetensors'));assert.ok(reportText(r).includes('models/loras/turbo.safetensors'));
for(const n of Object.values(p))for(const [key,value] of Object.entries(n.inputs))info[n.class_type].input.required[key][0].push(value);
r=modelReport(info,[p]);assertModels(r);assert.equal(r.missing.length,0);
delete info.CLIPLoader;r=modelReport(info,[p]);assert.deepEqual(r.nodes,['CLIPLoader']);assert.equal(r.unknown.length,1);assert.throws(()=>assertModels(r));
const extra={'1':{class_type:'UNETLoader',inputs:{unet_name:'z_image.safetensors'}}};r=modelReport(info,[p,extra]);assert.ok(r.missing.some(v=>v.endsWith('z_image.safetensors')));
console.log('PASS aggregate missing models, deduplication, full model directories, installed models, missing nodes, unverified inventory and both stages');
