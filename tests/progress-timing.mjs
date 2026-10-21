import assert from 'node:assert/strict';
import {executionProgress} from '../web/execution-progress.mjs';
const api=new EventTarget();let clock=0,text='',detail,tick,cleared=0;
const tracker=executionProgress({api,show:(t,d)=>{text=t;detail=d;},now:()=>clock,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>cleared++});
const send=(event,detail)=>api.dispatchEvent(new CustomEvent(event,{detail}));
tracker.watch('ours',{'1':{class_type:'H3StudioDirector',inputs:{steps:8,refine:['2',0]}},'2':{inputs:{sigmas:['3',0],passes:1}},'3':{inputs:{steps:4}}});
send('executing',{prompt_id:'ours',node:'1'});
const phase=(value,p='refine')=>send('minimax_director_progress',{node_id:'1',phase:p,phase_label:p==='refine'?'精修采样':'采样',phase_value:value,phase_max:1});
phase(0);assert.match(text,/正在第 1 步/);assert.match(text,/暂无法估时/);
clock=10;phase(.25);assert.match(text,/1\/4 步/);assert.match(text,/25.0%/);assert.match(text,/10.0秒\/步/);assert.match(text,/预计剩余约 30秒/);
clock=15;tick();assert.match(text,/当前步已等待 5秒/);assert.equal(detail.value,1);assert.match(text,/预计剩余约 25秒/);
send('progress',{prompt_id:'ours',node:'1',value:4,max:6});assert.match(text,/精修采样/);assert.equal(detail.value,1);
clock=40;tick();assert.match(text,/重估中/);assert.equal(detail.value,1); // No fabricated percentage while GPU is busy.
clock=41;phase(.5);assert.match(text,/正在第 3 步/);assert.equal(detail.value,2);
clock=50;phase(0,'sample');assert.equal(detail.value,0);assert.match(text,/本阶段已用 0秒/);assert.doesNotMatch(text,/平均/);
const before=text;send('minimax_director_progress',{prompt_id:'other',node_id:'1',phase:'refine',phase_value:1,phase_max:1});assert.equal(text,before);
tracker.finish('ours');assert.ok(cleared>0);assert.equal(detail,null);tracker.dispose();
console.log('PASS real stage/step counters, live elapsed time, ETA, stalled-step re-estimation, phase reset, task isolation and timer cleanup');
