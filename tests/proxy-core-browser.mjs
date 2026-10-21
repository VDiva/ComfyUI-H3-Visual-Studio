import assert from 'node:assert/strict';import fs from 'node:fs/promises';import http from 'node:http';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.H3_PLAYWRIGHT_MODULE||'playwright');
let state={state:'stopped',installed:false,version:'v1.19.32',subscribed:false,running:false,busy:false,nodes:[],selected:'',message:'准备就绪'},actions=[];
const server=http.createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<div id="box"></div><pre id="log"></pre><script type="module">import {mountProxyCore} from "/proxy.mjs";window.controller=mountProxyCore({container:document.querySelector("#box"),api:{fetchApi:(...a)=>fetch(...a)},log:t=>document.querySelector("#log").textContent=t});</script>');return;}
 if(req.url==='/proxy.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(new URL('../web/proxy-core.mjs',import.meta.url)));return;}
 if(req.method==='POST'){
  let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);actions.push(data.action);
  if(data.action==='install')state.installed=true;
  if(data.action==='subscribe'){assert.equal(data.url,'https://example.com/?token=private');state.subscribed=true;}
  if(data.action==='start')state={...state,running:true,nodes:['A','B'],selected:'A'};
  if(data.action==='select')state.selected=data.name;
  if(data.action==='stop')state.running=false;
  state.message='已处理 '+data.action;
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#proxy-core-status').filter({hasText:'准备就绪'}).waitFor();
 assert.equal(await page.locator('#proxy-start').isDisabled(),true);
 await page.locator('#proxy-install').click();await page.waitForFunction(()=>document.querySelector('#proxy-core-status').textContent.includes('已处理 install'));
 await page.getByLabel('代理订阅链接').fill('https://example.com/?token=private');await page.locator('#proxy-subscribe').click();await page.waitForFunction(()=>!document.querySelector('#proxy-start').disabled);
 assert.equal(await page.getByLabel('代理订阅链接').inputValue(),'');assert.equal(await page.getByLabel('代理订阅链接').getAttribute('type'),'password');
 await page.locator('#proxy-start').click();await page.waitForFunction(()=>!document.querySelector('#proxy-node').disabled);
 assert.equal(await page.locator('#proxy-install').isDisabled(),true);await page.getByLabel('代理节点').selectOption('B');await page.waitForFunction(()=>document.querySelector('#proxy-core-status').textContent.includes('已处理 select'));
 await page.locator('#proxy-refresh').click();await page.waitForFunction(()=>document.querySelector('#proxy-core-status').textContent.includes('已处理 refresh'));
 await page.locator('#proxy-test').click();await page.waitForFunction(()=>document.querySelector('#proxy-core-status').textContent.includes('已处理 test'));
 await page.locator('#proxy-stop').click();await page.waitForFunction(()=>document.querySelector('#proxy-stop').disabled);
 assert.deepEqual(actions,['install','subscribe','start','select','refresh','test','stop']);assert.deepEqual(errors,[]);
 await page.evaluate(()=>window.controller.dispose());assert.equal(await page.locator('#proxy-core-panel').count(),0);
 console.log('PASS install/subscribe/start/select/refresh/test/stop UI, secret input clearing, control states and disposal');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
