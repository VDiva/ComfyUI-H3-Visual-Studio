import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.H3_PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer(async(req,res)=>{
 if(req.url==='/editor.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(new URL('../web/resource-editor.mjs',import.meta.url)));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<style>body{margin:20px;height:1600px;font:14px/1.65 sans-serif}#box{width:600px;height:360px;display:flex}textarea{padding:7px;border:1px solid #333;box-sizing:border-box}</style><div id="box"><textarea id="prompt"></textarea></div><script type="module">import {attachResourceEditor} from '/editor.mjs';window.editor=attachResourceEditor({textarea:document.querySelector('textarea'),getMedia:()=>({images:Array.from({length:70},(_,i)=>({id:i+1,name:'图片'+(i+1)}))})});document.addEventListener('wheel',e=>e.preventDefault(),{passive:false});</script>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:900,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const input=page.locator('textarea'),menu=page.locator('.resource-menu');
 await input.fill('@');await menu.waitFor({state:'visible'});const first=await menu.boundingBox();assert.ok(first.x<50,'menu follows @ at left, not fixed right');
 await input.fill('第一行文字\n这是第二行 @');const second=await menu.boundingBox();assert.ok(second.y>first.y+10);assert.ok(second.x>first.x+30);
 const initial=await page.evaluate(()=>({outer:scrollY,text:document.querySelector('textarea').scrollTop}));
 await menu.hover();await page.mouse.wheel(0,500);await page.waitForFunction(()=>document.querySelector('.resource-menu').scrollTop>0);
 assert.deepEqual(await page.evaluate(()=>({outer:scrollY,text:document.querySelector('textarea').scrollTop})),initial);
 await page.evaluate(()=>document.querySelector('.resource-menu').scrollTop=0);const rect=await menu.boundingBox();
 await page.mouse.move(rect.x+rect.width-8,rect.y+10);await page.mouse.down();await page.mouse.move(rect.x+rect.width-8,rect.y+160,{steps:8});await page.mouse.up();
 assert.equal(await menu.isVisible(),true,'scrollbar interaction must not close menu');assert.ok(await menu.evaluate(e=>e.scrollTop)>0,'scrollbar drag scrolls');
 await menu.locator('button').filter({hasText:'@图片70 ·'}).click();assert.ok((await input.inputValue()).endsWith('@图片70 '));assert.equal(await menu.isVisible(),false);
 await input.fill('最末一行 @');await input.press('ArrowDown');await input.press('Enter');assert.ok((await input.inputValue()).endsWith('@图片2 '));
 await input.fill(Array(30).fill('一行普通文字').join('\n')+'\n@');await input.evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await menu.isVisible(),true);{const r=await menu.boundingBox(),b=await page.locator('.resource-editor').boundingBox();assert.ok(r.y>=b.y&&r.y+r.height<=b.y+b.height+1,'menu contained after text scroll');}
 assert.deepEqual(errors,[]);console.log('PASS caret-relative @ menu, multiline placement, wheel isolation, scrollbar dragging, selection, keyboard and textarea scroll');
}finally{await browser?.close();await new Promise(r=>server.close(r));}

