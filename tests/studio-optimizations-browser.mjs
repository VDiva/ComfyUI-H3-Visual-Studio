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
let png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2cAAAAASUVORK5CYII=','base64');
let uploads=0,failUploads=false,missingModels=false;const requests=[];let postPayload=null,postQueries=0,cancelCalls=0;
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
window.testApi=Object.assign(new EventTarget(),{apiURL:p=>p,fetchApi:(p,o)=>fetch(p,o),async queuePrompt(number,data){window.requests.push(data.output);const r=await fetch('/prompt',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('queue failed');return r.json();}});
window.LiteGraph={createNode(type){const types={LoadImage:['IMAGE','MASK'],LoadAudio:['AUDIO'],LoadVideo:['VIDEO'],GetVideoComponents:['IMAGE','AUDIO','FLOAT'],PrimitiveInt:['INT'],PrimitiveStringMultiline:['STRING']};const name={LoadImage:'image',LoadAudio:'audio',LoadVideo:'file',PrimitiveInt:'value',PrimitiveStringMultiline:'value'}[type];const widgets=name?[{name,value:''}]:[];return {widgets,serialize(){return {type,widgets_values:widgets.map(w=>w.value),properties:{},inputs:type==='GetVideoComponents'?[{name:'video',type:'VIDEO',link:null}]:[],outputs:types[type].map(type=>({name:type,type,links:[]}))};}};}};
</script><script type="module" src="/extensions/h3/global-entry.js"></script></html>`;
let batchJob=null,batchPayload=null;
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(url.pathname==='/scripts/app.js'||url.pathname==='/scripts/api.js'){res.setHeader('Content-Type','text/javascript');res.end(url.pathname.includes('app.js')?'export const app=window.testApp;':'export const api=window.testApi;');return;}
 if(url.pathname.startsWith('/extensions/h3/')){if(breakStudio&&url.pathname.endsWith('/studio.js')){res.setHeader('Content-Type','text/javascript');res.end('throw Error("mock studio load failure");');return;}const f=path.join(root,'web',path.basename(url.pathname));res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await fs.readFile(f));return;}
 if(url.pathname==='/h3_visual_studio/batches'&&req.method==='POST'){let body='';for await(const c of req)body+=c;batchPayload=JSON.parse(body);batchJob={...batchPayload,state:'running',created:Date.now(),items:batchPayload.items.map((i,n)=>({...i,promptId:'background-'+n,state:n?'pending':'running'}))};res.end(JSON.stringify(batchJob));return;}
 if(url.pathname==='/h3_visual_studio/batches'){res.end(JSON.stringify({jobs:batchJob?[batchJob]:[]}));return;}
 if(url.pathname.startsWith('/h3_visual_studio/batches/')){if(req.method==='POST'&&url.pathname.endsWith('/stop'))batchJob.state='stopped';res.end(JSON.stringify(batchJob));return;}
 if(url.pathname==='/h3_visual_studio/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({catalog,jobs:{}}));return;}
 if(url.pathname==='/h3_visual_studio/models/download'){let body='';for await(const chunk of req)body+=chunk;downloadedKeys=JSON.parse(body).keys;res.end(JSON.stringify({jobs:{}}));return;}
 if(url.pathname==='/upload/image'){uploads++;for await(const chunk of req){}if(failUploads){res.statusCode=500;res.end('test upload failure');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:`uploaded${uploads}.png`,subfolder:'test',type:'input'}));return;}
 if(url.pathname==='/prompt'){let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({prompt_id:'job-'+requests.length}));return;}
 if(url.pathname.startsWith('/history/')){const id=url.pathname.split('/').at(-1);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({[id]:{status:{status_str:'success',completed:true},outputs:Object.values(requests[Number(id.split('-')[1])-1]?.output||{}).some(n=>n.class_type==='SaveImage')?{'210':{images:[{filename:'character.png',subfolder:'test',type:'output'}]}}:{'92':{images:[{filename:'clip.mp4',subfolder:'test',type:'output'}]}}}}));return;}
 if(url.pathname==='/object_info'){const info={};for(const name of ['UNETLoader','CLIPLoader','VAELoader','CLIPTextEncode','ConditioningZeroOut','TextEncodeQwenImage21','EmptyLatentImage','QwenImage21Cache','KSampler','VAEDecode','SaveImage'])info[name]={input:{required:{}}};info.UNETLoader.input.required.unet_name=[['qwen_image_2.1_turbo_int8_convrot.safetensors']];info.CLIPLoader.input.required.clip_name=[['qwen3vl_8b_w4a8.safetensors']];info.VAELoader.input.required.vae_name=[['qwen_image_2.1_vae_bf16.safetensors']];for(const n of Object.values(base)){info[n.class_type]||={input:{required:{}}};for(const [key,value] of Object.entries(n.inputs||{})){if(['unet_name','clip_name','vae_name','lora_name'].includes(key)&&typeof value==='string'){const required=info[n.class_type].input.required;required[key]||=[[]];if(!required[key][0].includes(value))required[key][0].push(value);}}}if(info.LoraLoaderModelOnly)info.LoraLoaderModelOnly.input.required.lora_name[0].push('dmad_minimax_h3_4step_full_critic_comfyui.safetensors');for(const type of ['LoadVideo','GetVideoComponents','H3FrameUpscale','H3DirectorLatentUpscale','H3PreserveLatent'])info[type]||={input:{required:{}}};info.H3DirectorLatentUpscale={input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors']]}}};info.UpscaleModelLoader={input:{required:{model_name:[['test-upscale.pth']]}}};if(missingModels)for(const n of Object.values(info))for(const [k,v] of Object.entries(n.input.required))if(Array.isArray(v?.[0]))v[0]=[];res.end(JSON.stringify(info));return;}
 if(url.pathname==='/object_info/UpscaleModelLoader'){res.end(JSON.stringify({UpscaleModelLoader:{input:{required:{model_name:[['test-upscale.pth']]}}}}));return;}
 if(url.pathname==='/object_info/H3DirectorLatentUpscale'){res.end(JSON.stringify({H3DirectorLatentUpscale:{input:{required:{model_name:['COMBO',{options:['minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors']}]}}}}));return;}
 if(url.pathname==='/h3_visual_studio/process'&&req.method==='POST'){let body='';for await(const c of req)body+=c;postPayload=JSON.parse(body);postQueries=0;res.end(JSON.stringify({id:'post-1',state:'queued'}));return;}
 if(url.pathname==='/h3_visual_studio/process/post-1/cancel'){cancelCalls++;res.end(JSON.stringify({id:'post-1',state:'cancelled'}));return;}
 if(url.pathname==='/h3_visual_studio/process/post-1'){postQueries++;res.end(JSON.stringify({id:'post-1',state:cancelCalls?'cancelled':'done',video:cancelCalls?undefined:{filename:'finished.mp4',subfolder:'H3_Processed',type:'output'}}));return;}
 if(url.pathname==='/h3_visual_studio/dependencies'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({environment:{python:'3.12',torch:'2.8',cuda:'12.8',gpu:'mock GPU'},items:[{key:'safetensors',label:'safetensors',installed:true,can_install:false,job:{}}],restart_required:false}));return;}
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
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#folder-input').waitFor({state:'attached'});await page.evaluate(()=>window.ui=s=>document.querySelector('#node')?.firstElementChild?.shadowRoot?.querySelector(s));



 await page.locator('[data-panel="settings"]').click();
 await page.locator('#video-resolution-mp').selectOption('0.6');
 assert.match(await page.locator('#generation-summary').textContent(),/0.6 MP.*1.2 MP/);
 await page.locator('#video-resolution-aspect').selectOption('9:16');
 await page.locator('[data-panel="finishing"]').click();assert.equal(await page.locator('#finish-mp').inputValue(),'1.2');
 await page.locator('#finish-upscale').selectOption('off');
 await page.locator('[data-panel="settings"]').click();await page.locator('#video-resolution-mp').selectOption('0.9');
 await page.locator('[data-panel="finishing"]').click();await page.locator('#finish-upscale').selectOption('latent');assert.equal(await page.locator('#finish-mp').inputValue(),'1.8');
 await page.locator('#recipe-balanced').click();assert.equal(await page.locator('#finish-mp').inputValue(),'0.8');
 await page.evaluate(async()=>{const w=JSON.parse(window.node.widgets[0].value);w.pages[0].groups=[{id:'g',number:1,seconds:4,prompt:'0～4秒：人物站立，无对白。',job:{state:'done',videos:[{filename:'sample.mp4',subfolder:'video',type:'output'}],originalVideos:[{filename:'original.mp4',subfolder:'video/g_original',type:'output'}]}}];window.node.widgets[0].value=JSON.stringify(w);(await import('/extensions/h3/studio.js?v=0.11.0')).controllerForNode(window.node).refresh();});
 await page.locator('#compare-original').click();assert.equal(await page.locator('dialog video').count(),2);assert.equal(await page.locator('dialog video').nth(1).evaluate(v=>v.muted),true);await page.locator('dialog button').filter({hasText:'关闭'}).click();
 await page.locator('#quality-compare').click();await page.locator('dialog [type=submit]').click();
 await page.waitForFunction(()=>JSON.parse(window.node.widgets[0].value).pages[0].batch?.state==='running');
 assert.equal(batchPayload.items.length,2);assert.equal(batchPayload.autoMerge,false);
 const graphA=batchPayload.items[0].prompt,graphB=batchPayload.items[1].prompt;
 const find=(g,t)=>Object.values(g).find(n=>n.class_type===t);
 assert.equal(find(graphA,'RandomNoise').inputs.noise_seed,find(graphB,'RandomNoise').inputs.noise_seed);
 assert.equal(find(graphA,'H3DirectorLatentUpscale').inputs.width,find(graphB,'H3DirectorLatentUpscale').inputs.width);
 assert.notEqual(find(graphA,'MiniMaxH3ReferenceToVideo').inputs.width,find(graphB,'MiniMaxH3ReferenceToVideo').inputs.width);
 assert.equal(await page.locator('#run').isDisabled(),true);
 // Simulate reconnecting a new panel while the server retains the job.
 await page.evaluate(async()=>{const graph=window.testApp.graph.serialize();await window.testApp.loadGraphData(graph);});
 await page.waitForFunction(()=>window.ui('#batch-status')?.textContent.includes('执行中'));
 assert.equal(await page.locator('#run').isDisabled(),true);
 batchJob.state='done';batchJob.items.forEach((i,n)=>{i.state='done';i.videos=[{filename:'comparison'+n+'.mp4',subfolder:'video',type:'output'}];});
 await page.waitForFunction(()=>!window.ui('#quality-results').disabled);
 await page.locator('#quality-results').click();assert.equal(await page.locator('dialog video').count(),2);await page.locator('dialog button').filter({hasText:'关闭'}).click();
 await page.locator('#run-one').click();await page.waitForFunction(()=>window.ui('#batch-status')?.textContent.includes('执行中'));
 assert.equal(batchPayload.items.length,1);await page.locator('#stop').click();await page.waitForFunction(()=>window.ui('#batch-status')?.textContent.includes('已停止'));
 assert.equal(await page.locator('#run').isDisabled(),false);
 await page.locator('#expand').click();await page.screenshot({path:path.join(root,'tests','工作室优化预览.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS studio MP/aspect and enable/preset synchronization, summary, original comparison, A/B compiled graphs, background recovery and stop controls');
}catch(error){console.log('STATE',await pageState(browser));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

async function pageState(browser){return browser.contexts()[0].pages()[0].evaluate(()=>({status:document.querySelector('#status')?.textContent,batch:window.ui('#batch-status')?.textContent,panels:document.querySelectorAll('#folder-input').length,value:window.node?.widgets?.[0]?.value}));}
