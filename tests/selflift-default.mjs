import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,readProject,compileRequest} from '../web/project.mjs';
const p=defaultProject();assert.equal(p.selflift.enabled,true);assert.equal(p.settings.acceleration,'inherit');assert.equal(p.settings.sampler,'euler');assert.equal(p.finishing.refine,false);assert.equal(p.finishing.upscale,'off');
assert.equal(readProject(JSON.stringify(p)).selflift.enabled,true);p.selflift.enabled=false;assert.equal(readProject(JSON.stringify(p)).selflift.enabled,false);
const old={...p};delete old.selflift;assert.equal(readProject(old).selflift.enabled,false);
const base=JSON.parse(fs.readFileSync(new URL('../examples/官方采样API基线.json',import.meta.url)));const fresh=defaultProject();const out=compileRequest(base,fresh,{id:'g',number:1,seconds:2,prompt:'单人站立，无对白。'}).prompt;assert.equal(Object.values(out).filter(n=>n.class_type==='H3SelfLiftSampler').length,1);assert.equal(Object.values(out).filter(n=>n.class_type==='SaveVideo').length,1);
console.log('PASS default SelfLift enabled, consistent Euler/no-refine configuration, saved choices preserved and default request compiles');
