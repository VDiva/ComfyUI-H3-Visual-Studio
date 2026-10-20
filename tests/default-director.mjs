import assert from 'node:assert/strict';
import {defaultProject,readProject,readWorkspace} from '../web/project.mjs';
for(const p of [defaultProject(),readProject({}),readProject({finishing:{refine:false,upscale:'off',chunking:false,megapixels:1.5}}),readWorkspace({pages:[{finishing:{upscale:'model'}}]}).pages[0]]){
 assert.equal(p.finishing.refine,true);assert.equal(p.finishing.upscale,'latent');assert.equal(p.finishing.chunking,true);assert.equal(p.finishing.defaultsVersion,1);
}
const p=readProject({finishing:{upscale:'off',megapixels:1.5}});assert.equal(p.finishing.megapixels,1.5);
p.finishing.upscale='off';p.finishing.refine=false;p.finishing.chunking=false;
const saved=readProject(JSON.stringify(p));assert.equal(saved.finishing.upscale,'off');assert.equal(saved.finishing.refine,false);assert.equal(saved.finishing.chunking,false);
console.log('PASS new pages, legacy migration, workspace import and later manual choices');
