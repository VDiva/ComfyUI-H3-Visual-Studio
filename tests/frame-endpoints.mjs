import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,compileRequest} from '../web/project.mjs';
const base=JSON.parse(fs.readFileSync(new URL('./.fixtures/官方采样API基线.json',import.meta.url)));
for(const mode of ['first','last','both']){
 const p=defaultProject();p.autoMerge=true;
 const g={id:'frame',number:1,seconds:4,prompt:'人物转头，镜头固定'};
 if(mode!=='last')g.firstFrame={file:'frames/first.png'};
 if(mode!=='first')g.lastFrame={file:'frames/last.png'};
 const graph=compileRequest(base,p,g).prompt,values=Object.values(graph),core=values.find(n=>n.class_type==='H3StudioDirector');
 assert.equal(core.inputs.task_type,'fl2v');assert.ok(core.inputs.i2v_groups);assert.equal(core.inputs.r2v_groups,undefined);
 assert.equal(values.filter(n=>n.class_type==='LoadImage').length,mode==='both'?2:1);
 assert.equal(values.filter(n=>n.class_type==='SaveVideo').length,1);assert.ok(values.find(n=>n.class_type==='SaveVideo').inputs.filename_prefix.startsWith('.h3-intermediate/'));
 p.media.images=[{id:1,file:'identity.png'}];assert.throws(()=>compileRequest(base,p,{...g,prompt:'@图片1 人物转头'}),/不叠加/);
}
console.log('PASS first/last/both endpoint graphs, FL2V routing, reference-mode guard and merged-only output graph');
