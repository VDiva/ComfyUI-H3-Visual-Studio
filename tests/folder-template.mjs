import assert from 'node:assert/strict';
import {buildFolderTemplate,writeTemplateDirectory} from '../web/folder-template.mjs';
import '../web/folder-core.js';
const t=buildFolderTemplate({name:'1_30',pages:2,groups:3,seconds:4,mode:'reference'});
assert.equal(t.entries.filter(r=>r.path.endsWith('/提示词.txt')).length,6);assert.equal(t.entries.filter(r=>r.path.endsWith('/公共参考图/')).length,2);assert.ok(!t.entries.some(r=>/素材组\d+\/参考图/.test(r.path)));
for(const row of t.entries.filter(r=>r.path.endsWith('/提示词.txt'))){for(const key of ['integrated_multimodal_description:','overall_soundscape:','non_diegetic_music:'])assert.equal(row.text.split(key).length,2);assert.ok(!row.text.includes('<Audio'));}
const auto=buildFolderTemplate({name:'1_31',pages:2,groups:2,seconds:2,mode:'auto_character'});assert.ok(!auto.entries.some(r=>r.path.includes('公共参考图')));
const files=auto.entries.filter(r=>!r.directory).map(r=>({name:r.path.split('/').at(-1),webkitRelativePath:r.path,text:async()=>r.text}));const parsed=await globalThis.H3FolderCore.parseFiles(files,{allowNoImages:true});assert.equal(parsed.length,2);assert.equal(parsed[0].groups[0].seconds,2);
for(const name of ['../bad','CON','bad/name'])assert.throws(()=>buildFolderTemplate({name}));assert.throws(()=>buildFolderTemplate({pages:100,groups:100}));
function directory(){const dirs=new Map(),files=new Map();return {dirs,files,async getDirectoryHandle(name,options){if(!dirs.has(name)){if(!options?.create){const e=Error('missing');e.name='NotFoundError';throw e;}dirs.set(name,directory());}return dirs.get(name);},async getFileHandle(name){return {async createWritable(){return {async write(text){files.set(name,text);},async close(){}};}};}};}
const parent=directory();parent.dirs.set('1_31',directory());assert.equal(await writeTemplateDirectory(parent,auto),'1_31_新建1');assert.equal(parent.dirs.get('1_31').files.size,0);assert.ok(parent.dirs.get('1_31_新建1').dirs.get('1_31_01').dirs.get('素材组1').files.has('提示词.txt'));
console.log('PASS standard shared folders, 3-field templates, text-only mode import, index durations, invalid names/counts and non-overwriting directory creation');
