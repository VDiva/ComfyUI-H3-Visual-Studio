import {workflowTemplate} from './workflow-template.mjs?v=0.6.6';
export const BACKUP_KEY='h3-visual-studio.before-auto-create.v1';
const kind=n=>n.comfyClass||n.type;
export function isStudioWorkflow(graph){
 const nodes=graph?._nodes||graph?.nodes||[];
 return nodes.filter(n=>kind(n)==='H3VisualProject').length===1 && nodes.filter(n=>kind(n)==='MiniMaxH3ReferenceToVideo').length===1 && nodes.filter(n=>kind(n)==='SaveVideo').length===1;
}
export async function ensureWorkflow({app,storage,getController,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const before=structuredClone(app.graph.serialize());
 let created=false;
 if(!isStudioWorkflow(app.graph)){
  storage.setItem(BACKUP_KEY,JSON.stringify(before));
  const template=structuredClone(workflowTemplate);
  // Preserve a manually created studio node's saved pages when filling in its graph.
  const old=(before.nodes||[]).filter(n=>n.type==='H3VisualProject');
  if(old.length===1&&old[0].widgets_values?.[0])template.nodes.find(n=>n.type==='H3VisualProject').widgets_values[0]=old[0].widgets_values[0];
  try{await app.loadGraphData(template);created=true;}
  catch(error){await app.loadGraphData(before);throw error;}
 }
 for(let i=0;i<50;i++){
  const nodes=app.graph?._nodes||[];
  const controller=nodes.filter(n=>kind(n)==='H3VisualProject').map(getController).find(Boolean);
  if(controller&&isStudioWorkflow(app.graph))return {controller,created,before};
  await pause(100);
 }
 if(created)await app.loadGraphData(before);
 throw Error('可视化工作流初始化失败。请确认已重启ComfyUI并强制刷新插件。');
}
export function mountGlobalImporter({app,getController,parseFiles,download,prepare=async()=>{},storage=localStorage}){
 if(document.getElementById('h3-global-import'))return;
 const panel=document.createElement('div');panel.id='h3-global-import';panel.style.cssText='position:fixed;right:22px;top:90px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font:13px/1.5 system-ui';
 const button=document.createElement('button');button.id='h3-global-import-button';button.textContent='H3 导入提示词与素材';button.title='H3可视化工作室 · 全局导入入口';button.style.cssText='background:#176d59;color:white;border:1px solid #55c9a8;border-radius:8px;padding:9px 14px;cursor:pointer';
 const install=document.createElement('button');install.id='h3-global-install-models';install.textContent='一键安装所需模型';install.style.cssText=button.style.cssText;
 const input=document.createElement('input');input.id='h3-global-folder';input.type='file';input.webkitdirectory=true;input.multiple=true;input.style.display='none';
 const mode=document.createElement('select');mode.id='h3-global-mode';mode.style.cssText='background:#18302c;color:white;border:1px solid #476d61;border-radius:6px;padding:5px';
 for(const [value,label] of [['reference','参考素材 → 生视频'],['auto_character','自动人物生图 → 生视频']]){const option=document.createElement('option');option.value=value;option.textContent=label;mode.append(option);}
 const message=document.createElement('div');message.style.cssText='max-width:360px;white-space:pre-wrap;background:#12222e;color:#d7e6ee;border-radius:6px;padding:8px;display:none';
 const restore=document.createElement('button');restore.id='h3-restore-workflow';restore.textContent='恢复创建前工作流';
 const backup=document.createElement('button');backup.textContent='下载创建前备份';
 for(const el of [restore,backup])el.style.cssText='background:#243746;color:#d7e6ee;border:1px solid #455e70;border-radius:6px;padding:5px 9px;cursor:pointer';
 button.title='新目录导入成功后替换全部现有页面；失败保留原工作区';
 const label=document.createElement('span');label.textContent='H3 工作室 · 导入入口 v0.5.8 · 导入替换工作区';label.style.cssText='color:white;background:#12222e;padding:3px 8px;border-radius:4px';
 const options=document.createElement('details');options.id='h3-import-options';options.style.cssText='max-width:360px;background:#12222e;color:white;border-radius:6px;padding:4px';const summary=document.createElement('summary');summary.textContent='导入模式与备份';options.append(summary,mode,restore,backup,message);
 const launcher=document.createElement('button');launcher.id='h3-import-toggle';launcher.textContent='H3';launcher.title='H3工作室：导入、模型安装与目录工具';launcher.setAttribute('aria-expanded','false');launcher.style.cssText='width:42px;height:36px;background:#176d59;color:white;border:1px solid #55c9a8;border-radius:9px;cursor:pointer';
 const menu=document.createElement('div');menu.id='h3-import-menu';menu.style.cssText='display:none;flex-direction:column;align-items:stretch;gap:8px;padding:12px;background:#12222e;border:1px solid #426172;border-radius:10px;width:280px;max-width:calc(100vw - 30px);max-height:70vh;overflow:auto;box-shadow:0 12px 30px #0008';
 menu.append(label,button,install,options);panel.append(launcher,menu,input);document.body.append(panel);
 function setOpen(open){menu.style.display=open?'flex':'none';launcher.setAttribute('aria-expanded',String(open));}
 launcher.onclick=()=>setOpen(launcher.getAttribute('aria-expanded')!=='true');
 document.addEventListener('pointerdown',event=>{if(!panel.contains(event.target))setOpen(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});
 let busy=false;
 const status=text=>{message.textContent=text;message.style.display='block';launcher.title='H3工作室：'+text;options.open=true;setOpen(true);};
 function sync(){let exists=false;try{exists=!!storage.getItem(BACKUP_KEY);}catch{}restore.hidden=!exists;backup.hidden=!exists;button.disabled=busy;install.disabled=busy;mode.disabled=busy;restore.disabled=busy;backup.disabled=busy;}
 install.onclick=async()=>{if(busy)return;busy=true;sync();try{await prepare();const ready=await ensureWorkflow({app,storage,getController});status('已打开工作室，正在检查并安装所需模型。下载进度见工作室面板。');await ready.controller.installModels();}catch(error){status('安装未完成：'+error.message);}finally{busy=false;sync();}};
 button.onclick=()=>{if(!busy){input.click();setOpen(false);}};
 input.onchange=async()=>{
  if(busy)return;
  const files=[...input.files];if(!files.length)return;
  busy=true;sync();let prepared;
  try{
   status('正在识别提示词与素材目录……');
   const chapters=await parseFiles(files,{allowNoImages:mode.value==='auto_character'});
   if((app.graph?._nodes||[]).some(n=>getController(n)?.isBusy?.()))throw Error('工作室正在处理任务，请等待后再导入');
   status('正在准备官方可视化工作流……');
   prepared=await ensureWorkflow({app,storage,getController});
   const count=await prepared.controller.importChapters(chapters,{mode:mode.value});
   app.graph.setDirtyCanvas?.(true,true);
   status(`${prepared.created?'已自动创建官方工作流；':'已使用当前工作流；'}导入${count}个文件夹页面。请保存工作流。尚未提交生成。`);
  }catch(error){
   if(prepared?.created){try{await app.loadGraphData(prepared.before);}catch(rollback){status('导入失败，自动恢复也失败；可下载创建前备份。'+rollback.message);return;}}
   status('导入未完成：'+error.message);
  }finally{busy=false;input.value='';sync();}
 };
 restore.onclick=async()=>{if(busy)return;busy=true;sync();try{const value=storage.getItem(BACKUP_KEY);if(!value)throw Error('没有创建前备份');await app.loadGraphData(JSON.parse(value));status('已恢复创建前工作流；服务器已上传素材未删除。');}catch(error){status(error.message);}finally{busy=false;sync();}};
 backup.onclick=()=>{try{const value=storage.getItem(BACKUP_KEY);if(value)download(JSON.parse(value),'H3自动创建前工作流备份.json');}catch(error){status(error.message);}};
 sync();
}
