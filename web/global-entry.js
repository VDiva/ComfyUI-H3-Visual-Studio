import {mountPluginUpdater} from './plugin-update.mjs?v=0.15.4';
import {openFolderTemplate} from './folder-template.mjs?v=0.15.4';
import {api} from '../../scripts/api.js';
import {migrateWorkflow,repairCurrentWorkflow} from './migrate-workflow.mjs?v=0.15.4';
import {app} from '../../scripts/app.js';
import {mountGlobalImporter} from './bootstrap.mjs?v=0.15.4';
import './folder-core.js?v=0.15.4';
let studio;
const load=()=>import('./studio.js?v=0.15.4').then(module=>(studio=module));
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
app.registerExtension({name:'H3.Visual.Studio.GlobalImporter',beforeConfigureGraph(data){migrateWorkflow(data);},setup(){
 const mount=()=>{
  mountGlobalImporter({app,prepare:load,getController:node=>studio?.controllerForNode(node),parseFiles:async(files,options)=>{try{await load();}catch(error){throw Error('工作室模块加载失败：'+error.message+'；请完整更新插件web目录并强制刷新');}return globalThis.H3FolderCore.parseFiles(files,options);},download});
  const updateContainer=document.getElementById('h3-import-menu');if(updateContainer)mountPluginUpdater({container:updateContainer,api});
  const create=document.createElement('button');create.id='h3-global-create-folders';create.textContent='创建标准目录';create.style.cssText='background:#243746;color:white;border:1px solid #587488;border-radius:6px;padding:6px;cursor:pointer';create.onclick=()=>openFolderTemplate({root:document.body,api,mode:document.getElementById('h3-global-mode')?.value||'reference',log:()=>{}});document.getElementById('h3-import-options')?.append(create);
  const repair=document.createElement('button');repair.id='h3-repair-sampling';repair.textContent='修复旧采样节点';repair.style.cssText='background:#243746;color:white;border:1px solid #587488;border-radius:6px;padding:6px;cursor:pointer';repair.onclick=async()=>{repair.disabled=true;try{const count=await repairCurrentWorkflow(app,localStorage);repair.textContent=count?'已修复，请保存工作流':'当前无需修复；缺失时请更新ComfyUI';}catch(error){repair.textContent='修复失败：'+error.message;}finally{repair.disabled=false;}};document.getElementById('h3-import-options')?.append(repair);
  load().catch(error=>{const panel=document.getElementById('h3-import-menu');if(panel){const message=document.createElement('div');message.style.cssText='max-width:360px;background:#762d2d;color:white;padding:8px;white-space:pre-wrap';message.textContent='H3工作室加载失败：'+error.message+'。请完整更新云端插件并强制刷新。';panel.append(message);}});
 };
 if(document.body)mount();else window.addEventListener('DOMContentLoaded',mount,{once:true});
}});
