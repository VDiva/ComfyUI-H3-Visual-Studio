import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {dialogueEvents,defaultVoices} from '../web/dialogue.mjs';
import {defaultProject,compileRequest,readWorkspace} from '../web/project.mjs';
import {modelReport} from '../web/model-check.mjs';
const base=JSON.parse(await fs.readFile(new URL('./.fixtures/官方采样API基线.json',import.meta.url),'utf8'));
const project=defaultProject();project.voiceSettings={enabled:true,voices:defaultVoices().voices.map(v=>({...v,file:'voices/'+v.speaker+'.wav'}))};
project.media.images=Array.from({length:10},(_,i)=>({id:i+1,file:'images/'+i+'.png'}));
const names=['抵达电话亭与拒听传闻','女人出没的传闻与打趣'];let count=0;
for(const [i,name] of names.entries()){
 const prompt=await fs.readFile(new URL('../../../黑暗集会/第一话/电话亭外/'+name+'.txt',import.meta.url),'utf8').catch(()=>fs.readFile('../../../黑暗集会/第一话/电话亭外/'+name+'.txt','utf8'));
 const group={id:'g'+i,number:i+1,seconds:[14,15][i],prompt};const events=dialogueEvents(prompt,project.voiceSettings.voices,group.seconds);
 assert.equal(events.length,3);assert.deepEqual(events.map(e=>e.speaker),i===0?['S3','S3','S2']:['S3','S2','S3']);
 const {prompt:graph}=compileRequest(base,project,group);const nodes=Object.values(graph);assert.equal(nodes.filter(n=>n.class_type==='H3QwenClone').length,3);assert.equal(nodes.filter(n=>n.class_type==='H3PrepareDialogue').length,1);assert.ok(nodes.find(n=>n.class_type==='H3StudioDirector').inputs.dialogue);assert.ok(!nodes.some(n=>/Review|VoiceDesign|SaveVoice/.test(n.class_type)));
 assert.deepEqual(nodes.filter(n=>n.class_type==='H3QwenClone').map(n=>n.inputs.text),[...prompt.matchAll(/<d>\s*\[[^\]]+\]([\s\S]*?)<\/d>/g)].map(m=>m[1].trim()));
 const missing=modelReport({},[graph]);for(const n of ['Qwen3TTSVoiceClone','MiniMaxH3DialogueAudioLock','MiniMaxH3DialogueAudioFinalize'])assert.ok(missing.nodes.includes(n));count+=events.length;
}
assert.equal(count,6);assert.deepEqual(dialogueEvents('知夏(S3)说：<d>[Japanese]はい</d>',defaultVoices().voices,2),[]);
const mixed=structuredClone(project);mixed.media.images=[];mixed.voiceSettings.enabled=false;mixed.voiceSettings.voices[0].file='';const mixGraph=compileRequest(base,mixed,{id:'mixed',seconds:4,prompt:'0～2秒知夏(S3)说：<d>[Japanese]はい</d> 2～4秒亦辰(S2)说：<d>[Japanese]いいえ</d>'}).prompt;assert.equal(Object.values(mixGraph).filter(n=>n.class_type==='H3QwenClone').length,1);
const empty=defaultProject();const emptyGraph=compileRequest(base,empty,{id:'empty',seconds:2,prompt:'知夏(S3)说：<d>[Japanese]はい</d>'}).prompt;assert.ok(!Object.values(emptyGraph).some(n=>n.class_type==='H3PrepareDialogue'));
assert.throws(()=>dialogueEvents('知夏(S3)说：<d>[Japanese]はい</d>',project.voiceSettings.voices,2),/起止秒数/);
assert.throws(()=>dialogueEvents('0～3秒知夏(S3)说：<d>[Japanese]はい</d>',project.voiceSettings.voices,2),/越界/);
const bad=structuredClone(project.voiceSettings.voices);bad[0].file='../secret.wav';assert.throws(()=>dialogueEvents('0～2秒亦辰(S2)说：<d>[Japanese]はい</d>',bad,2),/input/);
const ws=readWorkspace({pages:[{...project,pageId:'p',groups:[]}]});assert.equal(ws.pages[0].voiceSettings.voices[1].file,'voices/S3.wav');
console.log('PASS six original Japanese lines / speakers / time windows, direct clone graph without audition, required deps, save/reload and unsafe-input rejection');
