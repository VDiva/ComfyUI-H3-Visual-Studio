import assert from 'node:assert/strict';
import {livePreview} from '../web/live-preview.mjs';
const api=new EventTarget(),image={},video={pause(){},load(){},getAttribute(){return this.src;}},label={};
const p=livePreview({api,image,video,label,owns:id=>id==='ours'});
function event(name,detail){const e=new Event(name);Object.defineProperty(e,'detail',{value:detail});api.dispatchEvent(e);}
event('execution_start',{prompt_id:'other'});event('b_preview',new Blob(['x']));assert.equal(image.src,undefined);
p.watch('ours');event('progress',{prompt_id:'ours',value:2,max:8});assert.ok(label.textContent.includes('2/8'));event('b_preview',new Blob(['x']));assert.ok(image.src.startsWith('blob:'));assert.equal(video.hidden,true);
p.video('/clip.mp4','done');assert.equal(video.src,'/clip.mp4');assert.equal(image.hidden,true);
p.image('/person.png','image done');assert.equal(image.src,'/person.png');assert.equal(video.hidden,true);
event('executing',{prompt_id:'other'});event('b_preview',new Blob(['y']));assert.equal(image.src,'/person.png');p.dispose();
console.log('PASS live frame ownership, progress, video/image results, unrelated task exclusion and cleanup');
