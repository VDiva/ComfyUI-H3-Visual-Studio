import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.H3_PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const workflow=JSON.parse(await fs.readFile(path.join(root,'examples/官方可视化工作流.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,'model-catalog.json'),'utf8'));let downloadedKeys=[],breakStudio=false;
const base=JSON.parse(await fs.readFile(path.join(root,'examples/官方采样API基线.json'),'utf8'));
const fixture=path.join(root,'tests/.fixtures/1_26');
let png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2cAAAAASUVORK5CYII=','base64');
try{png=await fs.readFile(new URL('../../../../01/1_26/1_26_01/公共参考图/@图片1.png',import.meta.url));}catch{}
for(const name of ['1_26_01','1_26_02']){
 const b=path.join(fixture,name);await fs.mkdir(path.join(b,'公共参考图'),{recursive:true});await fs.writeFile(path.join(b,'公共参考图/@图片1.png'),png);
 const groups=name.endsWith('01')?2:1;
 for(let i=1;i<=groups;i++){await fs.mkdir(path.join(b,'素材组'+i),{recursive:true});await fs.writeFile(path.join(b,`素材组${i}/提示词.txt`),`integrated_multimodal_description: 0.0～4.0秒：<Picture 1> ${name} 第${i}镜 ${name.endsWith('01')?'<Audio 1> 知夏(S3)':''} <d>[Chinese] 你好。</d>\noverall_soundscape: 风声。\nnon_diegetic_music: N/A`);}
 if(name.endsWith('01')){await fs.mkdir(path.join(b,'公共参考音频'),{recursive:true});await fs.writeFile(path.join(b,'公共参考音频/@音频1.wav'),Buffer.alloc(44));}
}
const autoFixture=path.join(root,'tests/.fixtures/auto/1_30_01');
for(let i=1;i<=2;i++){await fs.mkdir(path.join(autoFixture,'素材组'+i),{recursive:true});await fs.writeFile(path.join(autoFixture,`素材组${i}/提示词.txt`),'integrated_multimodal_description: <Picture 7> 知夏(S3)，银色长发少女，蓝色眼睛，黑色制服。0.0～4.0秒：知夏(S3)走过街道。<d>[Chinese]你好。</d>\noverall_soundscape: 风声。\nnon_diegetic_music: N/A');}
let uploads=0,failUploads=false,missingModels=false;const requests=[];
const html=`<!doctype html><html><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#071019}#node{width:1000px;height:900px}</style><div id="node"></div><script>
window.base=${JSON.stringify(base)};window.workflow=${JSON.stringify(workflow)};window.requests=[];
const initialMode=new URL(location.href).searchParams.get('mode');
if(initialMode==='empty')window.workflow={nodes:[],links:[],last_node_id:0,last_link_id:0,version:0.4};
if(initialMode==='other')window.workflow={nodes:[{id:1,type:'PrimitiveInt',widgets_values:[123],inputs:[],outputs:[]}],links:[],last_node_id:1,last_link_id:0,version:0.4};
window.loads=0;
window.testApp={graph:{_nodes:[],setDirtyCanvas(){},serialize(){const w=structuredClone(window.workflow);const meta=w.nodes.find(n=>n.type==='H3VisualProject');if(meta&&window.node)meta.widgets_values=[window.node.widgets[0].value];return w;}},canvas:{},async graphToPrompt(){return {output:structuredClone(window.base),workflow:this.graph.serialize()};},registerExtension(ext){
 if(!ext.beforeRegisterNodeDef){ext.setup?.();return;}
 class Node{constructor(){this.widgets=[{name:'project_json',value:window.workflow.nodes.find(n=>n.type==='H3VisualProject').widgets_values[0]}];this.properties={};this.type='H3VisualProject';}addDOMWidget(name,type,el){document.querySelector('#node').append(el);return {};}setSize(){}setDirtyCanvas(){}}
 ext.beforeRegisterNodeDef(Node,{name:'H3VisualProject'});
 this.loadGraphData=async data=>{window.loads++;window.node?.onRemoved?.();window.node=null;document.querySelector('#node').replaceChildren();window.workflow=structuredClone(data);this.graph._nodes=window.workflow.nodes.filter(n=>n.type!=='H3VisualProject').map(n=>({...n}));const meta=window.workflow.nodes.find(n=>n.type==='H3VisualProject');if(meta){window.node=new Node();node.id=meta.id;this.graph._nodes.push(node);node.onNodeCreated();}};
 this.loadGraphData(window.workflow);window.loads=0;ext.setup?.();
}};
window.testApi={apiURL:p=>p,fetchApi:(p,o)=>fetch(p,o),async queuePrompt(number,data){window.requests.push(data.output);const r=await fetch('/prompt',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('queue failed');return r.json();}};
window.LiteGraph={createNode(type){const types={LoadImage:['IMAGE','MASK'],LoadAudio:['AUDIO'],LoadVideo:['VIDEO'],GetVideoComponents:['IMAGE','AUDIO','FLOAT'],PrimitiveInt:['INT'],PrimitiveStringMultiline:['STRING']};const name={LoadImage:'image',LoadAudio:'audio',LoadVideo:'file',PrimitiveInt:'value',PrimitiveStringMultiline:'value'}[type];const widgets=name?[{name,value:''}]:[];return {widgets,serialize(){return {type,widgets_values:widgets.map(w=>w.value),properties:{},inputs:type==='GetVideoComponents'?[{name:'video',type:'VIDEO',link:null}]:[],outputs:types[type].map(type=>({name:type,type,links:[]}))};}};}};
</script><script type="module" src="/extensions/h3/global-entry.js"></script></html>`;
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(url.pathname==='/scripts/app.js'||url.pathname==='/scripts/api.js'){res.setHeader('Content-Type','text/javascript');res.end(url.pathname.includes('app.js')?'export const app=window.testApp;':'export const api=window.testApi;');return;}
 if(url.pathname.startsWith('/extensions/h3/')){if(breakStudio&&url.pathname.endsWith('/studio.js')){res.setHeader('Content-Type','text/javascript');res.end('throw Error("mock studio load failure");');return;}const f=path.join(root,'web',path.basename(url.pathname));res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await fs.readFile(f));return;}
 if(url.pathname==='/h3_visual_studio/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({catalog,jobs:{}}));return;}
 if(url.pathname==='/h3_visual_studio/models/download'){let body='';for await(const chunk of req)body+=chunk;downloadedKeys=JSON.parse(body).keys;res.end(JSON.stringify({jobs:{}}));return;}
 if(url.pathname==='/upload/image'){uploads++;for await(const chunk of req){}if(failUploads){res.statusCode=500;res.end('test upload failure');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:`uploaded${uploads}.png`,subfolder:'test',type:'input'}));return;}
 if(url.pathname==='/prompt'){let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({prompt_id:'job-'+requests.length}));return;}
 if(url.pathname.startsWith('/history/')){const id=url.pathname.split('/').at(-1);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({[id]:{status:{status_str:'success',completed:true},outputs:Object.values(requests[Number(id.split('-')[1])-1]?.output||{}).some(n=>n.class_type==='SaveImage')?{'210':{images:[{filename:'character.png',subfolder:'test',type:'output'}]}}:{'92':{images:[{filename:'clip.mp4',subfolder:'test',type:'output'}]}}}}));return;}
 if(url.pathname==='/object_info'){const info={};for(const name of ['UNETLoader','CLIPLoader','VAELoader','CLIPTextEncode','ConditioningZeroOut','EmptySD3LatentImage','ModelSamplingAuraFlow','KSampler','VAEDecode','SaveImage'])info[name]={input:{required:{}}};info.UNETLoader.input.required.unet_name=[['z_image_turbo_bf16.safetensors']];info.CLIPLoader.input.required.clip_name=[['qwen_3_4b.safetensors']];info.VAELoader.input.required.vae_name=[['ae.safetensors']];for(const n of Object.values(base)){info[n.class_type]||={input:{required:{}}};for(const [key,value] of Object.entries(n.inputs||{})){if(['unet_name','clip_name','vae_name','lora_name'].includes(key)&&typeof value==='string'){const required=info[n.class_type].input.required;required[key]||=[[]];if(!required[key][0].includes(value))required[key][0].push(value);}}}if(missingModels)for(const n of Object.values(info))for(const [k,v] of Object.entries(n.input.required))if(Array.isArray(v?.[0]))v[0]=[];res.end(JSON.stringify(info));return;}
 if(url.pathname==='/queue'){res.end(JSON.stringify({queue_pending:[],queue_running:[]}));return;}
 if(url.pathname==='/view'){res.setHeader('Content-Type','image/png');res.end(png);return;}
 res.statusCode=404;res.end('not found');
 }catch(error){res.statusCode=500;res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1150,height:1100}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER_ERROR',e.stack);});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#folder-input').waitFor({state:'attached'});
 await page.locator('#create-folders').click();await page.locator('dialog[open]').waitFor({state:'visible'});assert.equal(await page.locator('dialog [name=pages]').inputValue(),'1');await page.locator('#close-template').click();
 await page.locator('#folder-input').setInputFiles(fixture);
 await page.waitForFunction(()=>JSON.parse(window.node.widgets[0].value).pages.length===2);
 assert.equal(await page.locator('#page-list .page').count(),2);
 assert.deepEqual(await page.locator('#page-list .page').allTextContents(),['1_26_01','1_26_02']);
 assert.equal(uploads,3,'public files upload once, not once per group');
 assert.equal(await page.locator('#groups .group').count(),2);
 assert.equal(await page.locator('#audio').isChecked(),false);
 assert.equal(await page.locator('#auto-merge').isChecked(),false);await page.locator('#auto-merge').check();assert.equal(await page.evaluate(()=>JSON.parse(node.widgets[0].value).pages[0].autoMerge),true);await page.locator('#auto-merge').uncheck();
 const edited=(await page.locator('#prompt').inputValue())+' 第一页独立编辑';
 await page.locator('#prompt').fill(edited);
 await page.locator('#page-list .page').nth(1).click();assert.equal(await page.locator('#groups .group').count(),1);assert.ok((await page.locator('#prompt').inputValue()).includes('1_26_02'));
 await page.locator('#page-list .page').nth(0).click();assert.equal(await page.locator('#prompt').inputValue(),edited);
 await page.locator('#run').click();await page.waitForFunction(()=>window.requests.length===2);await page.waitForFunction(()=>JSON.parse(window.node.widgets[0].value).pages[0].groups.every(g=>g.job?.state==='done'));
 assert.ok(requests.every(r=>!Object.values(r.output).some(n=>n.class_type==='LoadAudio')));
 await page.locator('#audio').check();await page.locator('#run-one').click();await page.waitForFunction(()=>window.requests.length===3);await page.waitForFunction(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#run-one').disabled===false);
 assert.ok(Object.values(requests[2].output).some(n=>n.class_type==='LoadAudio'));
 assert.equal(requests[2].output['130'].inputs.audio[0],'121');
 await page.evaluate(async()=>{await window.testApi.queuePrompt(0,{output:structuredClone(window.base),workflow:window.testApp.graph.serialize()});});
 assert.equal(requests.length,4);assert.ok(Object.values(requests[3].output).some(n=>n.class_type==='LoadImage'));assert.ok(!Object.values(requests[3].output).some(n=>n.class_type==='H3VisualProject'));
 await page.locator('[data-panel="settings"]').click();const [exported]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
 const raw=JSON.parse(await fs.readFile(await exported.path(),'utf8'));assert.ok(raw.nodes.every(n=>n.type!=='H3VisualProject'&&!n.type.includes('Director')));
 const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
 const savedRaw=JSON.parse(await fs.readFile(await saved.path(),'utf8'));assert.equal(savedRaw.pages.length,2);assert.ok(savedRaw.pages[0].groups[0].prompt.includes('独立编辑'));
 await page.evaluate(()=>{const value=window.node.widgets[0].value;window.node.widgets[0].value=value;window.node.onConfigure();});assert.equal(await page.locator('#page-list .page').count(),2);
 const beforeFailure=await page.evaluate(()=>node.widgets[0].value);failUploads=true;
 await page.locator('#folder-input').setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#status').textContent.includes('原有页面保留'));
 assert.equal(await page.evaluate(()=>node.widgets[0].value),beforeFailure,'failed import must preserve all existing pages');
 assert.deepEqual(errors,[]);
 await page.locator('#expand').click();assert.equal(await page.locator('#expand').textContent(),'收起大面板（Esc）');assert.ok(await page.locator('#live-video').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#expand').textContent(),'展开大面板');
 failUploads=false;
 const empty=await browser.newPage();await empty.goto(`http://127.0.0.1:${server.address().port}/?mode=empty`);
 await empty.locator('#h3-global-folder').waitFor({state:'attached'});assert.equal(await empty.locator('#folder-input').count(),0);assert.equal(await empty.locator('#h3-import-menu').isVisible(),false);await empty.locator('#h3-import-toggle').click();assert.equal(await empty.locator('#h3-import-menu').isVisible(),true);await empty.keyboard.press('Escape');assert.equal(await empty.locator('#h3-import-menu').isVisible(),false);await empty.locator('#h3-import-toggle').click();await empty.locator('body').click({position:{x:5,y:5}});assert.equal(await empty.locator('#h3-import-menu').isVisible(),false);
 await empty.locator('#h3-global-folder').setInputFiles(fixture);
 await empty.waitForFunction(()=>window.node&&JSON.parse(node.widgets[0].value).pages.length===2);
 assert.equal(await empty.evaluate(()=>window.loads),1,'empty canvas auto-creates the complete workflow once');
 assert.deepEqual(await empty.locator('#page-list .page').allTextContents(),['1_26_01','1_26_02']);
 await empty.locator('#h3-global-folder').setInputFiles(fixture);await empty.waitForFunction(()=>JSON.parse(node.widgets[0].value).pages.length===4);
 assert.equal(await empty.evaluate(()=>window.loads),1,'existing workflow reused without duplicate nodes');
 const other=await browser.newPage();await other.goto(`http://127.0.0.1:${server.address().port}/?mode=other`);await other.locator('#h3-global-folder').waitFor({state:'attached'});
 await other.locator('#h3-global-folder').setInputFiles(fixture);await other.waitForFunction(()=>window.node&&JSON.parse(node.widgets[0].value).pages.length===2);
 assert.equal(await other.evaluate(()=>JSON.parse(localStorage.getItem('h3-visual-studio.before-auto-create.v1')).nodes[0].widgets_values[0]),123);
 await other.locator('#h3-import-toggle').click();await other.locator('#h3-import-options summary').click();await other.locator('#h3-restore-workflow').click();await other.waitForFunction(()=>window.workflow.nodes.length===1&&window.workflow.nodes[0].type==='PrimitiveInt');
 assert.equal(await other.evaluate(()=>window.workflow.nodes[0].widgets_values[0]),123);
 failUploads=true;await other.locator('#h3-global-folder').setInputFiles(fixture);
 await other.waitForFunction(()=>document.querySelector('#h3-global-import').textContent.includes('导入未完成'));
 assert.equal(await other.evaluate(()=>window.workflow.nodes[0].type),'PrimitiveInt','failed upload restores replaced workflow');
 failUploads=false;await empty.close();await other.close();
 const auto=await browser.newPage({viewport:{width:1250,height:1400}});auto.on('pageerror',e=>errors.push(e.message));await auto.goto(`http://127.0.0.1:${server.address().port}/?mode=empty`);
 await auto.locator('#h3-import-toggle').click();await auto.locator('#h3-import-options summary').click();await auto.locator('#h3-global-mode').selectOption('auto_character');await auto.locator('#h3-global-folder').setInputFiles(autoFixture);
 await auto.waitForFunction(()=>window.node&&JSON.parse(node.widgets[0].value).pages[0]?.mode==='auto_character');
 missingModels=true;const blockedStart=requests.length;await auto.locator('#run').click();await auto.waitForFunction(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#status').textContent.includes('缺少模型'));
 const missingText=await auto.locator('#status').textContent();assert.ok(missingText.includes('z_image_turbo_bf16.safetensors'));assert.ok(missingText.includes('models/loras/'));assert.ok(missingText.includes('models/vae/'));assert.equal(requests.length,blockedStart,'missing models block both image and video requests');await auto.locator('#model-downloads button').filter({hasText:'下载全部缺失模型'}).click();await auto.waitForTimeout(100);assert.ok(downloadedKeys.some(k=>k.includes('z_image_turbo')));assert.ok(downloadedKeys.some(k=>k.includes('minimax_h3')));missingModels=false;
 await auto.locator('#h3-import-options summary').click();const autoStart=requests.length;await auto.locator('#run').click();
 await auto.waitForFunction(()=>JSON.parse(node.widgets[0].value).pages[0].groups.every(g=>g.job?.state==='done'));
 assert.equal(requests.length-autoStart,3,'one character image then two videos');assert.equal(Object.values(requests[autoStart].output).filter(n=>n.class_type==='SaveImage').length,1);
 assert.ok(Object.values(requests[autoStart+1].output).some(n=>n.class_type==='LoadImage'));
 const cached=requests.length;await auto.locator('#run-one').click();await auto.waitForFunction(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#run-one').disabled===false);assert.equal(requests.length-cached,1,'cached character image is reused');
 await auto.evaluate(()=>{node.onConfigure();});const restored=requests.length;await auto.locator('[data-panel="characters"]').click();await auto.locator('#generate-characters').click();await auto.waitForFunction(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#generate-characters').disabled===false);assert.equal(requests.length,restored,'saved character reference survives reload');
 await auto.screenshot({path:path.join(root,'tests/双模式界面预览_模型检查.png'),fullPage:true});await auto.close();assert.deepEqual(errors,[]);
 await page.locator('#audio').uncheck();
 await page.evaluate(()=>{const ws=JSON.parse(node.widgets[0].value);for(const p of ws.pages)for(const g of p.groups)if(g.job)g.job.videos=[];node.widgets[0].value=JSON.stringify(ws);node.onConfigure();});
 await page.evaluate(()=>document.querySelector('#node').firstChild.shadowRoot.querySelector('#status').textContent='界面测试通过（模拟服务）；云端生成尚未验证。');
 await page.locator('[data-panel="shots"]').click();await page.setViewportSize({width:1110,height:720});await page.locator('#expand').click();await page.screenshot({path:path.join(root,'tests/新版工作区预览.png'),fullPage:false});await page.keyboard.press('Escape');
 const installer=await browser.newPage();await installer.goto(`http://127.0.0.1:${server.address().port}/?mode=empty`);missingModels=true;downloadedKeys=[];await installer.locator('#h3-import-toggle').click();await installer.locator('#h3-global-install-models').click();await installer.waitForFunction(()=>window.node&&document.querySelector('#node').firstChild.shadowRoot.querySelector('#model-downloads').textContent.includes('models/'));for(let i=0;i<50&&!downloadedKeys.length;i++)await installer.waitForTimeout(50);assert.ok(downloadedKeys.some(k=>k.includes('minimax_h3')),'one click from blank canvas queues model installation');assert.equal(await installer.evaluate(()=>window.loads),1);missingModels=false;await installer.close();
 breakStudio=true;const broken=await browser.newPage();await broken.goto(`http://127.0.0.1:${server.address().port}/?mode=empty`);await broken.locator('#h3-import-toggle').waitFor({state:'visible'});await broken.locator('#h3-import-toggle').click();await broken.locator('#h3-global-import-button').waitFor({state:'visible'});await broken.waitForFunction(()=>document.querySelector('#h3-global-import').textContent.includes('mock studio load failure'));await broken.close();
 console.log(JSON.stringify({passed:true,pages:2,uploads,queuedRequests:requests.length,checks:'real browser directory import, page isolation, persistence, native queue payload, audio toggle, pure official export, standard Run, failed-import rollback, empty-canvas bootstrap, workflow reuse, backup restore and previews'}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
