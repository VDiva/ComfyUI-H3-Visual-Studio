import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultProject,readProject,resultVideos,originalVideos} from '../web/project.mjs';
import {compileSequence} from '../web/sequence.mjs';
const base=JSON.parse(fs.readFileSync(new URL('./.fixtures/官方采样API基线.json',import.meta.url)));
const p=defaultProject();assert.equal(p.autoMerge,true);p.continuity=true;
const groups=Array.from({length:8},(_,i)=>({id:'g'+i,number:i+1,seconds:5,prompt:'人物动作'+i}));
for(const endpoints of [false,true]){
 const input=groups.map(g=>endpoints?{...g,firstFrame:{file:'first.png'},lastFrame:{file:'last.png'}}:g);
 const graph=compileSequence(base,p,input),nodes=Object.values(graph),core=nodes.find(n=>n.class_type==='H3StudioDirector');
 assert.equal(nodes.filter(n=>n.class_type==='H3StudioDirector').length,1);assert.equal(nodes.filter(n=>n.class_type==='SaveVideo').length,1);assert.equal(nodes.filter(n=>n.class_type==='H3StudioGroupsCombine').length,1);
 assert.equal(Object.keys(nodes.find(n=>n.class_type==='H3StudioGroupsCombine').inputs).length,8);
 assert.equal(JSON.parse(core.inputs.timeline_data).output.continuityEnabled,true);assert.equal(JSON.parse(core.inputs.timeline_data).output.continuityOverlapFrames,22);
 assert.ok(nodes.find(n=>n.class_type==='SaveVideo').inputs.filename_prefix.startsWith('H3_Merged/'));
}
const history={outputs:{a:{images:[{filename:'group_001_original_00002_.mp4',subfolder:'video/H3_Visual/夜海争执'},{filename:'group_001_00002_.mp4',subfolder:'video/H3_Visual/夜海争执'}]}}};
assert.equal(resultVideos(history).length,1);assert.equal(originalVideos(history).length,1);
console.log('PASS eight groups to one Director/SaveVideo, native 22-frame context, first/last-frame groups, merge default and actual cloud filename regression');

const mixed=compileSequence(base,p,groups.map((g,i)=>i===0?{...g,firstFrame:{file:'start.png'}}:g));assert.equal(Object.values(mixed).filter(n=>n.class_type==='H3StudioFrameGroup').length,8);assert.equal(Object.values(mixed).filter(n=>n.class_type==='LoadImage').length,1);
console.log('PASS upstream-style first-frame group plus empty continuation groups on one FL2V timeline');

assert.equal(readProject({autoMerge:false}).autoMerge,true);assert.equal(readProject({autoMerge:false,mergeDefaultsVersion:1}).autoMerge,false);

assert.equal(defaultProject().continuity,true);assert.equal(readProject({continuity:false}).continuity,false);assert.equal(readProject({}).continuity,true);
