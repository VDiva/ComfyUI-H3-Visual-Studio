import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('../proxy-web/',import.meta.url);
let state={state:'stopped',busy:false,message:'内核已就绪',installed:true,subscribed:false,running:false,nodes:[],selected:'',version:'v1.19.32',platform:'Linux / amd64',bundled_available:true,asset_name:'mihomo-linux-amd64-compatible-v1.19.32.gz',asset_url:'https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-linux-amd64-compatible-v1.19.32.gz',proxy:''};
const actions=[];
const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(req.url.startsWith('/api/')){
  if(req.headers.authorization!=='Bearer test-access'){send(401,{error:'访问码无效'});return;}
  if(req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=JSON.parse(Buffer.concat(chunks));actions.push(body.action);
   if(body.action==='subscribe'){state.subscribed=true;state.message='订阅已保存';}
   if(body.action==='start'){Object.assign(state,{running:true,nodes:['Tokyo','Hong Kong <node>'],selected:'Tokyo',proxy:'http://127.0.0.1:17999',message:'代理已开启'});}
   if(body.action==='select')state.selected=body.name;
   if(body.action==='stop')Object.assign(state,{running:false,nodes:[],selected:'',proxy:'',message:'代理已停止'});
   if(body.action==='delete-subscription')state.subscribed=false;
  }
  send(200,state);return;
 }
 const routes={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
 if(!routes[req.url]){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html; charset=utf-8'});
 res.end(await readFile(new URL(routes[req.url],root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#token=test-access');
 await page.locator('#workspace').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'');
 assert.equal(await page.locator('#start').isDisabled(),true);
 await page.locator('#subscription').fill('https://subscription.example/private');await page.locator('#subscribe').click();
 await page.waitForFunction(()=>!document.getElementById('start').disabled);assert.equal(await page.locator('#subscription').inputValue(),'');
 await page.locator('#start').click();await page.waitForFunction(()=>document.getElementById('address').value.includes('17999'));
 assert.equal(await page.locator('#subscribe').isDisabled(),true);
 await page.locator('#node').selectOption('Hong Kong <node>');await page.waitForFunction(()=>document.getElementById('node').value==='Hong Kong <node>');
 await page.screenshot({path:fileURLToPath(new URL('./proxy-web-preview.png',import.meta.url)),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#stop').click();await page.waitForFunction(()=>document.getElementById('address').value==='');
 assert.equal(await page.locator('#copy').isDisabled(),true);
 await page.locator('#delete-subscription').click();await page.waitForFunction(()=>document.getElementById('subscribed').textContent==='未保存');
 assert.deepEqual(actions,['subscribe','start','select','stop','delete-subscription']);assert.deepEqual(errors,[]);
 console.log('PASS browser auth, subscription save/clear, start/stop, node text, proxy address, command output, desktop/mobile layout');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
