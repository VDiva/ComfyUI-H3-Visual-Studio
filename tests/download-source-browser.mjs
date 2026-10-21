import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.H3_PLAYWRIGHT_MODULE||'playwright');
let mode='auto',reject=false,downloads=[];
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<div id="box"></div><pre id="log"></pre><script type="module">import {modelDownloader} from "/downloader.mjs";window.d=modelDownloader({api:{fetchApi:(...args)=>fetch(...args)},container:document.querySelector("#box"),log:text=>document.querySelector("#log").textContent=text,recheck:async()=>{}});await d.show({missing:["models/test"]});</script>');return;}
 if(req.url==='/downloader.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(new URL('../web/model-download.mjs',import.meta.url)));return;}
 if(req.method==='POST'){
  let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);
  if(req.url.endsWith('/source')){if(reject){res.statusCode=400;res.end(JSON.stringify({error:'保存失败'}));return;}mode=data.mode;res.end(JSON.stringify({source_mode:mode}));return;}
  if(req.url.endsWith('/download')){downloads.push({mode,...data});res.end('{"jobs":{}}');return;}
 }
 res.end(JSON.stringify({backend_version:'0.5.11',source_mode:mode,catalog:[{key:'models/test',source:'https://huggingface.co/o/r'}],jobs:{},proxy:{}}));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);const select=page.getByLabel('模型下载源');await select.waitFor();
 assert.equal(await select.inputValue(),'auto');
 for(const next of ['official','xiangongyun','auto']){await select.selectOption(next);await page.waitForFunction(mode=>document.querySelector('#download-source')?.dataset.saved===mode&&!document.querySelector('#download-source')?.disabled,next);assert.equal(mode,next);assert.equal(downloads.length,0);}
 await select.selectOption('official');await page.waitForFunction(()=>!document.querySelector('#download-source').disabled);await page.getByRole('button',{name:'下载',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#log').textContent.includes('顺序下载'));assert.equal(downloads[0].mode,'official');
 await page.reload();await select.waitFor();assert.equal(await select.inputValue(),'official');
 reject=true;await select.selectOption('xiangongyun');await page.waitForFunction(()=>document.querySelector('#log').textContent==='保存失败');assert.equal(await select.inputValue(),'official');assert.equal(mode,'official');
 console.log('PASS source selector, all modes, no implicit download, selected-source submission, reload and failed-save rollback');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
