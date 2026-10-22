import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.H3_PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const workflow=JSON.parse(await fs.readFile(path.join(root,'tests/.fixtures/官方可视化工作流.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,'model-catalog.json'),'utf8'));let downloadedKeys=[],breakStudio=false;
const base=JSON.parse(await fs.readFile(path.join(root,'tests/.fixtures/官方采样API基线.json'),'utf8'));
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
 if(url.pathname==='/object_info'){const info={};for(const name of ['UNETLoader','CLIPLoader','VAELoader','CLIPTextEncode','ConditioningZeroOut','TextEncodeQwenImage21','EmptyLatentImage','QwenImage21Cache','KSampler','VAEDecode','SaveImage'])info[name]={input:{required:{}}};info.UNETLoader.input.required.unet_name=[['qwen_image_2.1_turbo_int8_convrot.safetensors']];info.CLIPLoader.input.required.clip_name=[['qwen3vl_8b_w4a8.safetensors']];info.VAELoader.input.required.vae_name=[['qwen_image_2.1_vae_bf16.safetensors']];for(const n of Object.values(base)){info[n.class_type]||={input:{required:{}}};for(const [key,value] of Object.entries(n.inputs||{})){if(['unet_name','clip_name','vae_name','lora_name'].includes(key)&&typeof value==='string'){const required=info[n.class_type].input.required;required[key]||=[[]];if(!required[key][0].includes(value))required[key][0].push(value);}}}if(info.LoraLoaderModelOnly)info.LoraLoaderModelOnly.input.required.lora_name[0].push('dmad_minimax_h3_4step_full_critic_comfyui.safetensors');for(const type of ['LoadVideo','GetVideoComponents','H3FrameUpscale','H3DirectorLatentUpscale','H3PreserveLatent'])info[type]||={input:{required:{}}};info.H3DirectorLatentUpscale={input:{required:{model_name:[['minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors']]}}};info.UpscaleModelLoader={input:{required:{model_name:[['test-upscale.pth']]}}};for(const type of ['H3StudioDirectorGroup','H3StudioDirectorRefine','H3StudioDirector','PathchSageAttentionKJ','H3StudioGroupsCombine'])info[type]={input:{required:{}}};info.H3StudioDirectorRefine.input.required.latent_upscale_model=[['minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors']];if(missingModels)for(const n of Object.values(info))for(const [k,v] of Object.entries(n.input.required))if(Array.isArray(v?.[0]))v[0]=[];res.end(JSON.stringify(info));return;}
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
 browser=await chromium.launch({executablePath:process.env.H3_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.stack)});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#folder-input').waitFor({state:'attached'});
 await page.evaluate(async()=>{const {controllerForNode}=await import('/extensions/h3/studio-runtime.mjs');await controllerForNode(node).importChapters([{name:'八段',groups:Array.from({length:8},(_,i)=>({number:i+1,seconds:5,prompt:'海边的空镜头'+i,images:[],audios:[],videos:[]}))}]);});
 assert.equal(await page.locator('#auto-merge').isChecked(),true);await page.locator('#segment-continuity').check();
 await page.locator('#run').click();
 for(let i=0;i<100&&!batchPayload;i++)await new Promise(r=>setTimeout(r,50));
 assert.ok(batchPayload,await page.locator('.status').allTextContents());assert.equal(batchPayload.items.length,1);assert.equal(batchPayload.combinedOutput,true);assert.equal(batchPayload.autoMerge,true);assert.equal(batchPayload.items[0].groupIds.length,8);
 const nodes=Object.values(batchPayload.items[0].prompt);assert.equal(nodes.filter(n=>n.class_type==='SaveVideo').length,1);assert.equal(nodes.filter(n=>n.class_type==='H3StudioDirector').length,1);assert.equal(JSON.parse(nodes.find(n=>n.class_type==='H3StudioDirector').inputs.timeline_data).output.continuityEnabled,true);
 assert.deepEqual(errors,[]);console.log('PASS browser: default merge, eight selected groups submit one Director job, one final SaveVideo, optional native motion context');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
