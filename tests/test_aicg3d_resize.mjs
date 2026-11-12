import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function extract(file, start, end) {
 const s=fs.readFileSync(path.join(root,file),'utf8');
 return s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
}
const loader=extract('web/js/aicg3d/aicg3d-loader.js','function resize(node) {','/** 上游 UI 会整表重排');
let dirty=0;
const ctx=vm.createContext({refreshLayout(){dirty++;}});
vm.runInContext(loader+';globalThis.resize=resize',ctx);
let calls=0;
const node={size:[300,100],__a3LoaderWidget:{},__a3LoaderPanel:{style:{},scrollHeight:400},setSize(size){
 if(++calls>10) throw new Error('recursive resize');
 ctx.resize(this); // emulate callbacks before the renderer commits the new size
 this.size=size;
}};
ctx.resize(node);
assert.equal(calls,1);
assert.equal(dirty,1);
const callback=node.__a3LoaderWidget.computeLayoutSize;
ctx.resize(node);
assert.equal(calls,1);
assert.equal(dirty,1);
assert.equal(node.__a3LoaderWidget.computeLayoutSize,callback);
node.setSize=()=>{throw new Error('renderer failure')};
node.__a3LoaderPanel.scrollHeight=800;
assert.throws(()=>ctx.resize(node),/renderer failure/);
assert.equal(node.__a3LoaderResizing,false);
const voice=extract('web/js/aicg3d/aicg3d_voice_library.js','function resizeVoiceNode(node) {','function syncVoiceDomLayout(node) {');
const vctx=vm.createContext({MIN_NODE_WIDTH:400,MIN_NODE_HEIGHT:500});
vm.runInContext(voice+';globalThis.resizeVoiceNode=resizeVoiceNode',vctx);
let voiceCalls=0;
const vn={size:[10,10],setSize(size){
 if(++voiceCalls>10) throw new Error('recursive voice resize');
 vctx.resizeVoiceNode(this);
 this.size=size;
}};
assert.equal(vctx.resizeVoiceNode(vn),true);
assert.equal(voiceCalls,1);
assert.equal(vctx.resizeVoiceNode(vn),false);
console.log('Resize reentry, stable layout, unchanged size and failure cleanup: PASS');
