import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {defaultProject,compileRequest,resultVideos,originalVideos} from '../web/project.mjs';
import {modelReport} from '../web/model-check.mjs';
import {applyDirectorPreset} from '../web/director-recipe.mjs';
const base=JSON.parse(await fs.readFile(new URL('./.fixtures/官方采样API基线.json',import.meta.url),'utf8'));
const original=JSON.stringify(base);
const schemas=[];
const group={id:'g',number:3,seconds:4,prompt:'<Picture 99> <Audio 20> <Video 8> test'};
function project(){const p=applyDirectorPreset(defaultProject(),false);p.audioReference=true;p.media={images:[{id:99,file:'images/face.png'}],audios:[{id:20,file:'voice.wav'}],videos:[{id:8,file:'clip.mp4'}]};return p;}
function compile(p){return compileRequest(base,p,group).prompt;}
function node(graph,type){const found=Object.entries(graph).filter(([,n])=>n.class_type===type);assert.equal(found.length,1,type);return found[0];}
for(const upscale of ['off','latent','lanczos','model'])for(const refine of [false,true]){
 const p=project();p.finishing={...p.finishing,upscale,refine};const graph=compile(p);
 schemas.push(graph);
 const [coreId,core]=node(graph,'H3StudioDirector');
 assert.equal(core.inputs.model[0], '145'); // unshifted model: executor owns H3 shifts
 assert.equal(core.inputs.steps,8);assert.equal(core.inputs.sampler,'res_multistep');
 assert.equal(JSON.parse(core.inputs.timeline_data).output.mode,'fixed');
 const [,refs]=node(graph,'H3StudioDirectorGroup');
 assert.match(refs.inputs.prompt,/<Picture 1> <Audio 1> <Video 1>/);
 for(const key of ['image_0','audio_0','video_0'])assert.ok(refs.inputs[key]);
 assert.ok(!Object.values(graph).some(n=>['SamplerCustomAdvanced','H3DirectorLatentUpscale','H3SelfLiftSampler'].includes(n.class_type)));
 for(const [,n] of Object.entries(graph))for(const value of Object.values(n.inputs))if(Array.isArray(value))assert.ok(graph[value[0]],'all dependencies retained');
 const saves=Object.values(graph).filter(n=>n.class_type==='SaveVideo');assert.equal(saves.length,refine||upscale!=='off'?2:1);
 for(const save of saves){const video=graph[save.inputs.video[0]];assert.deepEqual(video.inputs.audio,[coreId,1]);}
 if(refine||upscale==='latent'){
  const [,r]=node(graph,'H3StudioDirectorRefine');assert.equal(r.inputs.mode,upscale==='latent'?(refine?'upscale':'latent_upscale'):'refine');
  if(refine){const scheduler=graph[r.inputs.sigmas[0]];assert.equal(scheduler.inputs.denoise,p.finishing.denoise);}
 }
}
const p=project();p.finishing.dualModel=true;
assert.equal(Object.values(compile(p)).filter(n=>n.class_type==='UNETLoader').length,2);
p.settings.acceleration='dmad4';assert.equal(node(compile(p),'H3StudioDirector')[1].inputs.steps,4);
p.settings={...p.settings,acceleration:'inherit',sampler:'euler',steps:8};p.finishing={...p.finishing,refine:false,upscale:'off'};p.selflift.enabled=true;
const selfliftGraph=compile(p);schemas.push(selfliftGraph);node(selfliftGraph,'H3StudioDirectorSelfLift');p.selflift.highSteps=8;assert.throws(()=>compile(p),/SelfLift/);
p.selflift.enabled=false;p.media.images[0].file='../escape.png';assert.throws(()=>compile(p),/相对路径/);
assert.equal(JSON.stringify(base),original);
const info={H3StudioDirectorRefine:{input:{required:{latent_upscale_model:[['installed']]}}}};
assert.equal(modelReport(info,[{x:{class_type:'H3StudioDirectorRefine',inputs:{latent_upscale_model:'missing'}}}]).missing.length,1);
const history={outputs:{x:{images:[{filename:'a.mp4',subfolder:'group_003_original'},{filename:'b.mp4',subfolder:'group_003'}]}}};
assert.equal(resultVideos(history)[0].filename,'b.mp4');assert.equal(originalVideos(history)[0].filename,'a.mp4');
await fs.writeFile(new URL('./.fixtures/director-schema.json',import.meta.url),JSON.stringify(schemas));
console.log('PASS Director core: 8 finishing combinations, compact refs, generated audio, fixed canvas, dual model, DMAD, SelfLift, model check and results');
