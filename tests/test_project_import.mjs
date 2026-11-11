import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
let files=[],uploads=0,applied;
const ctx={console,structuredClone,Set,Map,FormData,alert:()=>{},window:{confirm:()=>true},document:{createElement:()=>({files,click(){this.onchange();}})},api:{fetchApi:async()=>{uploads++;return {ok:true,json:async()=>({name:`uploaded_${uploads}.png`,subfolder:'project'})};}},safeUploadFilename:x=>x,t:x=>x};
vm.createContext(ctx);
const gen=fs.readFileSync(root+'web/js/minimax_gen_timeline.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
vm.runInContext(gen,ctx);
const importer=fs.readFileSync(root+'web/js/minimax_project_import.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
// Avoid duplicate imported declarations by using the same context's real helpers.
vm.runInContext(importer,ctx);
function file(path,text){const b=new Blob([text]);b.name=path.split('/').at(-1);b.webkitRelativePath='项目/'+path;return b;}
function project(prompt='@图片20',duration='5'){
 return [file('参考图/参考图索引.md','|编号|文件名|\n|---|---|\n'+Array.from({length:20},(_,i)=>`|@图片${i+1}|角色${i+1}.png|`).join('\n')),...Array.from({length:20},(_,i)=>file(`参考图/角色${i+1}.png`,'pixels')),file('第一话/章节/提示词索引.md',`|分段|请求秒数|提示词|\n|---|---|---|\n|分段1|${duration}|镜头.txt|`),file('第一话/章节/镜头.txt',`integrated_multimodal_description:\n[Shot 1, 0–${duration}s] ${prompt}\noverall_soundscape:\n风声\nnon_diegetic_music:\nN/A`)];
}
const editor={timeline:{frameRate:24,output:{width:864,height:480},global:{},segments:[]},applyImportedTimeline(t){applied=t;}};
files=project();await ctx.importStandardProject(editor);
assert.equal(uploads,20);assert.equal(applied.segments.length,1);assert.equal(applied.segments[0].durationSec,5);assert.equal(applied.global.assetLibrary.images.length,20);assert.ok(applied.segments[0].prompt.includes('@图片20'));assert.equal(applied.output.width,864);
const before=uploads;
files=project('@图片21');await assert.rejects(()=>ctx.importStandardProject(editor),/缺失/);assert.equal(uploads,before);
files=project('@图片1','11');await assert.rejects(()=>ctx.importStandardProject(editor),/时长/);assert.equal(uploads,before);
files=project(Array.from({length:10},(_,i)=>`@图片${i+1}`).join(' '));await assert.rejects(()=>ctx.importStandardProject(editor),/上限/);assert.equal(uploads,before);
console.log('Directory import tests passed: real frame helper, 20 images, duration, unchanged output, preflight failures before upload');

// Shared-only UI must preserve old group overrides and rewrite local slots.
const legacy={timeline:{global:{taskType:'r2v',commonEnabled:true,prompt:'common <Picture 1>',refs:[{index:0,imageFile:'common.png'}]},segments:[{prompt:'first <Picture 1>',refs:[]},{prompt:'second <Picture 1>',refs:[{index:0,imageFile:'override.png'}]}]}};
const shared=ctx.ensureSharedLibrary(legacy);
assert.equal(shared.images.length,2);
assert.equal(legacy.timeline.segments[0].prompt,'common <Picture 1>\n\nfirst <Picture 1>');
assert.equal(legacy.timeline.segments[1].prompt,'common <Picture 2>\n\nsecond <Picture 2>');
assert.equal(legacy.timeline.global.refs.length,0);
assert.equal(legacy.timeline.segments[1].refs.length,0);
assert.equal(ctx.ensureSharedLibrary(legacy),shared);
const broken={timeline:{global:{taskType:'r2v'},segments:[{prompt:'<Picture 2>',refs:[{index:0,imageFile:'keep.png'}]}]}};
assert.throws(()=>ctx.ensureSharedLibrary(broken),/素材缺失/);
assert.equal(broken.timeline.segments[0].refs[0].imageFile,'keep.png');
assert.equal(broken.timeline.global.assetLibrary,undefined);
console.log('Shared library migration passed: overrides, common prompts, idempotency, no mutation on failure');
