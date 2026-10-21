import assert from 'node:assert/strict';
import fs from 'node:fs';
import {qualityVariants} from '../web/quality-compare.mjs';
import {generationSummary} from '../web/generation-summary.mjs';
import {defaultProject,compileRequest} from '../web/project.mjs';
const p=defaultProject();p.groups=[{id:'g',number:1,prompt:'0～4秒：人物站立，无对白。',seconds:4}];const before=structuredClone(p);
const variants=qualityVariants(p,p.groups[0]);assert.deepEqual(p,before);
for(const [i,v] of variants.entries()){assert.equal(v.project.settings.seed,p.settings.seed);assert.equal(v.project.finishing.megapixels,1.2);assert.equal(v.group.prompt,p.groups[0].prompt);assert.equal(v.group.seconds,4);assert.equal(v.project.settings.megapixels,i?0.6:0.4);}
const base=JSON.parse(fs.readFileSync(new URL('../examples/官方采样API基线.json',import.meta.url)));
for(const v of variants){const request=compileRequest(base,v.project,v.group);assert.equal(Object.values(request.prompt).find(n=>n.class_type==='H3DirectorLatentUpscale').inputs.width>0,true);}
assert.match(generationSummary(p,p.groups[0]),/0.8 MP/);assert.match(generationSummary(p),/二采3步/);
for(const kind of ['steps','denoise']){const vs=qualityVariants(p,p.groups[0],{kind,a:kind==='steps'?3:.1,b:kind==='steps'?5:.2});assert.deepEqual(vs[0].project.settings,vs[1].project.settings);assert.equal(vs[0].project.finishing.megapixels,vs[1].project.finishing.megapixels);}
assert.throws(()=>qualityVariants(p,p.groups[0],{target:.2}),/小于/);
assert.throws(()=>qualityVariants(p,p.groups[0],{kind:'steps',a:3,b:40}),/步数/);
console.log('PASS immutable A/B variants, fixed seed/prompt/media, constant final canvas, graph compilation, validation and parameter summary');
