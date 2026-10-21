import assert from 'node:assert/strict';import fs from 'node:fs/promises';import http from 'node:http';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.H3_PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer(async(req,res)=>{if(req.url==='/module'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(new URL('../web/execution-health.mjs',import.meta.url)));}else{res.setHeader('Content-Type','text/html');res.end('<div id="box"></div>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  const {mountExecutionHealth}=await import('/module');window.busy=true;window.code=502;window.lost=0;window.recovered=0;window.api=new EventTarget();api.fetchApi=async()=>({ok:code===200,status:code,json:async()=>({system:{},devices:[]})});
  window.h=mountExecutionHealth({api,container:document.querySelector('#box'),isBusy:()=>busy,owns:id=>id==='ours',onUnavailable:()=>lost++,onRecovered:()=>recovered++,interval:60000});
 });
 const alert=page.getByRole('alert');await page.evaluate(()=>h.check());assert.equal(await alert.isVisible(),false);
 await page.evaluate(()=>h.check());assert.equal(await alert.isVisible(),true);assert.match(await alert.textContent(),/可能已崩溃/);assert.equal(await page.evaluate(()=>lost),1);
 await page.evaluate(()=>h.check());assert.equal(await page.evaluate(()=>lost),1);
 await page.evaluate(async()=>{code=200;await h.check();});assert.match(await alert.textContent(),/连接已恢复/);assert.equal(await page.evaluate(()=>recovered),1);
 await page.evaluate(()=>api.dispatchEvent(new CustomEvent('execution_start',{detail:{prompt_id:'ours'}})));assert.equal(await alert.isVisible(),false);
 await page.evaluate(()=>api.dispatchEvent(new CustomEvent('execution_error',{detail:{prompt_id:'other',exception_message:'out of memory'}})));assert.equal(await alert.isVisible(),false);
 await page.evaluate(()=>api.dispatchEvent(new CustomEvent('execution_error',{detail:{prompt_id:'ours',exception_message:'Allocation out of memory'}})));assert.match(await alert.textContent(),/显存不足/);
 await page.evaluate(()=>api.dispatchEvent(new CustomEvent('execution_error',{detail:{prompt_id:'ours',exception_message:'CUDA error invalid argument'}})));assert.match(await alert.textContent(),/CUDA执行异常/);
 await page.evaluate(()=>h.dispose());assert.equal(await page.locator('#execution-health').count(),0);
 console.log('PASS visible service-loss alert, transient failure tolerance, recovery, OOM/CUDA diagnosis, task isolation and disposal');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
