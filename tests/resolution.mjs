import {syncFinishingResolution} from '../web/finishing.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createRequire} from 'node:module';
import {resolutionFor,ASPECTS,MEGAPIXELS} from '../web/resolution.mjs';
import {defaultProject,readProject,compileRequest} from '../web/project.mjs';
for(const mp of MEGAPIXELS)for(const aspect of ASPECTS)for(const step of [16,32]){const r=resolutionFor(mp,aspect,step);assert.equal(r.width%step,0);assert.equal(r.height%step,0);assert.ok(Math.abs(r.width*r.height/1e6-mp)<0.08);}
assert.deepEqual(resolutionFor(0.4,'16:9'),{width:832,height:480});assert.throws(()=>resolutionFor(-1,'16:9'));
const p=readProject({settings:{width:864,height:480}});assert.equal(p.settings.width,864);
Object.assign(p.settings,resolutionFor(0.2,'9:16'));p.groups=[{id:'one',number:1,seconds:4,prompt:'人物站立，无对白。'}];
const base=JSON.parse(await fs.readFile(new URL('../examples/官方采样API基线.json',import.meta.url),'utf8'));const request=compileRequest(base,p,p.groups[0]);const target=Object.values(request.prompt).find(n=>n.class_type==='MiniMaxH3ReferenceToVideo');assert.equal(target.inputs.width,320);assert.equal(target.inputs.height,608);
const require=createRequire(import.meta.url),{chromium}=require(process.env.H3_PLAYWRIGHT_MODULE);const source=await fs.readFile(new URL('../web/resolution.mjs',import.meta.url),'utf8');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/javascript');res.end(source);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.setContent('<div id="video"></div><div id="image"></div><pre id="guide"></pre>');await page.evaluate(async()=>{const {mountResolution,resolutionGuide}=await import('/resolution.mjs');window.saved={width:864,height:480};window.pic={width:768,height:1024};window.changes=0;window.video=mountResolution({container:document.querySelector('#video'),getSettings:()=>window.saved,onChange:()=>{window.changes++;document.querySelector('#guide').textContent=resolutionGuide(window.saved);}});window.image=mountResolution({container:document.querySelector('#image'),getSettings:()=>window.pic,onChange:()=>{},step:16,id:'image-resolution'});});
assert.equal(await page.locator('#video-resolution-mp').inputValue(),'legacy');assert.equal(await page.evaluate(()=>window.saved.width),864);
await page.locator('#video-resolution-mp').selectOption('0.4');assert.deepEqual(await page.evaluate(()=>window.saved),{width:832,height:480,megapixels:0.4});await page.locator('#video-resolution-aspect').selectOption('9:16');assert.deepEqual(await page.evaluate(()=>window.saved),{width:480,height:832,megapixels:0.4});assert.match(await page.locator('#guide').textContent(),/0.2 MP ≈ 320 × 608/);
await page.locator('#image-resolution-mp').selectOption('0.2');const img=await page.evaluate(()=>window.pic);assert.equal(img.width%16,0);assert.equal(img.height%16,0);
await page.locator('#video-resolution-aspect').selectOption('16:9');
assert.equal(MEGAPIXELS.length,20);assert.equal(await page.locator('#video-resolution-mp option:not([data-legacy])').count(),20);
for(const mp of MEGAPIXELS){await page.locator('#video-resolution-mp').selectOption(String(mp));assert.deepEqual(await page.evaluate(()=>window.saved),{...resolutionFor(mp,'16:9'),megapixels:mp});Object.assign(p.settings,resolutionFor(mp,'16:9'));syncFinishingResolution(p,mp);const high=compileRequest(base,p,p.groups[0]);const node=Object.values(high.prompt).find(n=>n.class_type==='MiniMaxH3ReferenceToVideo');assert.equal(node.inputs.width,p.settings.width);assert.equal(node.inputs.height,p.settings.height);}
await page.evaluate(()=>{window.saved={width:1056,height:544};window.video.sync();});assert.equal(await page.locator('#video-resolution-mp').inputValue(),'legacy');assert.equal(await page.evaluate(()=>window.saved.width),1056);
console.log('PASS MP/aspect rounding, legacy preservation, compiled video dimensions, browser selection, image sizing and page sync');
}finally{await browser?.close();await new Promise(r=>server.close(r));}

