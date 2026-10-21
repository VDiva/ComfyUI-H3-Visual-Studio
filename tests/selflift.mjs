import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,readProject,compileRequest} from '../web/project.mjs';
import {selfLiftApi,defaultSelfLift} from '../web/selflift.mjs';
import {modelReport} from '../web/model-check.mjs';
const base=JSON.parse(fs.readFileSync(new URL('../examples/官方采样API基线.json',import.meta.url),'utf8'));
const p=defaultProject();p.groups=[{id:'g',number:1,seconds:2,prompt:'夜间单人中近景，无对白。'}];p.settings={...p.settings,acceleration:'inherit',sampler:'euler',steps:8};p.finishing={...p.finishing,refine:false,upscale:'off'};
assert.equal(p.selflift.enabled,false);const old=compileRequest(base,p,p.groups[0]).prompt;assert.ok(Object.values(old).some(n=>n.class_type==='SamplerCustomAdvanced'));
p.selflift={...defaultSelfLift(),enabled:true};const out=compileRequest(base,p,p.groups[0]).prompt;const custom=Object.values(out).filter(n=>n.class_type==='H3SelfLiftSampler');assert.equal(custom.length,1);assert.equal(custom[0].inputs.high_steps,2);assert.equal(custom[0].inputs.width,864);assert.equal(custom[0].inputs.height,480);assert.equal(custom[0].inputs.low_scale,0.65);assert.equal(Object.values(out).filter(n=>n.class_type==='SaveVideo').length,1);assert.deepEqual(out['121'].inputs.samples,out['122'].inputs.samples);assert.equal(out['130'].inputs.audio[0],'121');assert.equal(out['124'].inputs.steps,8);assert.ok(!Object.values(out).some(n=>n.class_type==='H3DirectorLatentUpscale'));
const restored=readProject(JSON.stringify(p));assert.deepEqual(restored.selflift,p.selflift);
for(const change of [q=>q.settings.acceleration='dmad4',q=>q.finishing.refine=true,q=>q.selflift.highSteps=8,q=>q.selflift.lowScale=1]){const q=structuredClone(p);change(q);assert.throws(()=>compileRequest(base,q,q.groups[0]));}
const report=modelReport({},[out]);assert.ok(report.nodes.includes('H3SelfLiftSampler'));assert.ok(report.unknown.some(x=>x.includes('latent_upscale_models')));
console.log('PASS opt-in SelfLift, total schedule preservation, AV output/audio provenance, cache settings, conflicts and model checks');
