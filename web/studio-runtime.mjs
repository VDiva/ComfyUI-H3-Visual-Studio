import {compileSequence} from './sequence.mjs?v=0.15.32';
import {mountFrameSettings} from './frame-settings.mjs?v=0.15.32';
import {mountVoiceSettings} from './dialogue.mjs?v=0.15.32';
import {mountPluginUpdater,pluginUpdateBlocked} from './plugin-update.mjs?v=0.15.32';
import {mountProxyCore} from './proxy-core.mjs?v=0.15.32';
import {backgroundBatch} from './background-batch.mjs?v=0.15.32';
import {generationSummary} from './generation-summary.mjs?v=0.15.32';
import {qualityVariants,openQualitySetup} from './quality-compare.mjs?v=0.15.32';
import {openVideoCompare} from './video-compare.mjs?v=0.15.32';
import {mountDependencies} from './dependencies.mjs?v=0.15.32';
import {mountDirectorRecipe} from './director-recipe.mjs?v=0.15.32';
import {mountSelfLift} from './selflift.mjs?v=0.15.32';
import {mountFinishing,syncFinishingResolution} from './finishing.mjs?v=0.15.32';
import {executionProgress} from './execution-progress.mjs?v=0.15.32';
import {mountExecutionHealth} from './execution-health.mjs?v=0.15.32';
import {mountResolution,resolutionGuide} from './resolution.mjs?v=0.15.32';
import {attachResourceEditor} from './resource-editor.mjs?v=0.15.32';
import {openFolderTemplate} from './folder-template.mjs?v=0.15.32';
import {livePreview} from './live-preview.mjs?v=0.15.32';
import {modelDownloader} from './model-download.mjs?v=0.15.32';
import {modelReport,reportText,assertModels,addVoiceModelReport} from './model-check.mjs?v=0.15.32';
import {ACCELERATION_MODES,effectiveVideoSettings,accelerationSummary} from './acceleration.mjs?v=0.15.32';
import {app} from '../../scripts/app.js';
import {api} from '../../scripts/api.js';
import {defaultImageSettings,discoverCharacters,charactersForGroup,referenceReady,imageRecipe,compileCharacterImage,checkImageModels,generatedImage,videoWithCharacters} from './characters.mjs?v=0.15.32';
import {parseFiles as parseProjectFiles,FOLDER_PARSER_VERSION} from './folder-parser.mjs?v=0.15.32';
import {defaultProject,readProject,readWorkspace,workspaceData,bindSharedMedia,mergePages,planGroup,compileRequest,resultVideos,runSequential,originalVideos} from './project.mjs?v=0.15.32';

const states=new WeakMap();
const preparedRequests=new WeakSet();
const uuid=()=>crypto.randomUUID();
const view=row=>api.apiURL('/view?'+new URLSearchParams({filename:row.filename||row.file?.split('/').at(-1)||'',subfolder:row.subfolder||row.file?.split('/').slice(0,-1).join('/')||'',type:row.type||'input'}));
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const style=`
.live-pane{background:#0b141e;border-radius:8px;padding:10px;overflow:auto;min-width:0}.live-pane img,.live-pane video{width:100%;max-height:65vh;object-fit:contain;background:#05090e}.live-pane [hidden]{display:none}#model-downloads{max-height:150px;overflow:auto;flex-shrink:0}.runbar{flex-shrink:0}@media(max-width:1100px){.layout{grid-template-columns:115px minmax(0,1fr) 180px}.work{grid-template-columns:135px minmax(0,1fr)}}

:host{color:#dce6ee;font:13px/1.5 system-ui;display:block;width:100%;height:100%;color-scheme:dark}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer;border:1px solid #3b4f60;border-radius:7px;background:#203242;color:#deebf4;padding:7px 11px}button:hover{border-color:#4bd9bd}button:disabled{opacity:.45;cursor:default}.primary{background:#16775f;border-color:#39b895;color:white}.danger{background:#4d2631}.shell{background:#101923;border:1px solid #314253;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;overflow:hidden}.layout{display:grid;grid-template-columns:170px minmax(0,1fr) 360px;gap:10px;flex:1;min-height:0;overflow:hidden}.pages{background:#0b141e;border-radius:8px;padding:7px;overflow:auto;max-height:none}.page{display:block;text-align:left;width:100%;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.page.active{background:#235049;border-color:#52d7b3}.content{display:flex;flex-direction:column;gap:10px;min-width:0;overflow:auto;padding-right:3px}.head{display:flex;align-items:center;gap:10px}.head h2{font-size:19px;color:#f1fbff;margin:0}.badge{color:#6ce2be;font-size:11px;border:1px solid #316856;border-radius:20px;padding:3px 8px}.muted{color:#8da5b7;font-size:12px}.tools,.row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.tools select{max-width:270px}.grow{flex:1}input,textarea,select{background:#0b141d;color:#dce6ee;border:1px solid #334959;border-radius:6px;padding:6px}input[type=number]{width:100px}textarea{resize:vertical;width:100%;min-height:200px;line-height:1.65}fieldset{border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:10px}.library{background:#172432;border-radius:8px;padding:10px}.gallery{display:flex;gap:8px;overflow:auto;padding-top:8px;max-height:150px}.asset{flex:0 0 116px;position:relative;border:1px solid #314757;border-radius:6px;padding:4px}.asset img{width:106px;height:65px;object-fit:cover}.asset audio,.asset video{width:106px;height:65px}.asset button{position:absolute;right:4px;top:4px;padding:0 5px;background:#1a1722}.asset small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.settings{background:#172432;padding:8px;border-radius:8px}.timeline{display:flex;gap:4px;overflow:auto;min-height:44px}.timeline button{min-width:60px;flex-shrink:0;border-bottom:3px solid #537b91}.timeline button.active{border-color:#4fd7b4;background:#244739}.work{display:grid;grid-template-columns:210px minmax(0,1fr);gap:10px;min-height:310px}.groups{background:#0b141e;max-height:440px;overflow:auto;border-radius:8px}.group{display:flex;align-items:center;gap:5px;padding:9px;border-bottom:1px solid #27394a;cursor:pointer}.group.active{background:#203d42;border-left:3px solid #49d9b8}.group .meta{font-size:11px;color:#94afbf}.editor{min-width:0;display:flex;flex-direction:column;gap:8px}.preview{max-height:190px;width:100%;background:#080d12;border-radius:8px}.status{font-size:12px;white-space:pre-wrap;max-height:100px;overflow:auto;background:#080f17;padding:8px;border-radius:7px;color:#a8c3d5}.runbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.file{display:none}.title{font-weight:600;color:#eaf7ff}a{color:#73d6bc}.settings label{display:inline-flex;align-items:center;gap:4px;font-size:12px}
.shell{padding:16px;gap:12px;background:#101820}.head{flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid #2b3c49;padding-bottom:12px}.head h2{font-size:19px}.head .file-actions{display:flex;gap:6px}.layout{grid-template-columns:135px minmax(0,1fr) 220px;gap:14px}.content{overflow:hidden;padding:0}.content #edit{flex:1;min-height:0;overflow:hidden;gap:12px}.page-meta{padding:12px;background:#162330;border-radius:9px}.page-meta .row+.row{margin-top:8px}.page-meta input#name{min-width:80px;width:100px}.workspace-tabs{display:flex;gap:4px;border-bottom:1px solid #334754;padding-bottom:7px;flex-shrink:0;overflow:auto}.workspace-tabs button{white-space:nowrap;border:0;background:transparent;padding:8px 12px}.workspace-tabs button.active{background:#244b44;color:#8aefcf}.tab-panel{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:2px}.tab-panel[hidden]{display:none!important}#panel-shots{overflow:hidden}#panel-shots>.row{flex-shrink:0}.timeline{min-height:38px;max-height:55px;flex-shrink:0}.timeline button{padding:5px 8px}.work{grid-template-columns:120px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}.groups{max-height:none;overflow:auto}.editor{overflow:auto}.editor #prompt{min-height:220px;flex:1;resize:none}.editor #result{display:none}.live-pane{display:flex;flex-direction:column;gap:10px;padding:10px;border:1px solid #293c49}.live-pane .title{font-size:13px}.live-pane img,.live-pane video{max-height:calc(100vh - 250px);border-radius:8px}.runbar{padding:12px;background:#172632;border-radius:9px;border:1px solid #2b414f}.runbar .primary{font-weight:600}.runbar .muted{display:none}.status{max-height:76px;min-height:35px;margin:0}#model-downloads{max-height:none;overflow:visible}#panel-models>p{margin:0}.pages{display:flex;flex-direction:column;gap:8px}.pages>#page-list{overflow:auto;flex:1;min-height:0}.pages>#delete-page{font-size:11px;padding:5px;color:#a9bdcb}.page{padding:9px 8px}.library{padding:14px}.gallery{max-height:none;flex-wrap:wrap;overflow:visible}.asset{flex-basis:140px}.asset img{width:130px;height:90px}.settings{background:transparent}.settings[open]{display:flex;flex-direction:column;gap:12px}.settings>summary{cursor:pointer}.settings textarea{min-height:180px}.head .badge{display:none}
@media(max-width:1200px){.layout{grid-template-columns:115px minmax(0,1fr) 180px}.work{grid-template-columns:105px minmax(0,1fr)}.shell{padding:10px;gap:8px}.head h2{font-size:16px}.head button{padding:6px 8px}.runbar{gap:5px;padding:8px}.runbar button{padding:7px 9px}.page-meta{padding:8px}.workspace-tabs button{padding:7px 8px}}
.layout{grid-template-columns:190px minmax(0,1fr) 220px}#resolution-guide{font-size:11px;line-height:1.7;max-height:260px;overflow:auto}@media(max-width:1200px){.layout{grid-template-columns:170px minmax(0,1fr) 180px}}
:host{container-type:inline-size}.layout>*{min-width:0}.head .file-actions{flex-wrap:wrap}.workspace-tabs{min-width:0}
@container(max-width:1000px){.layout{grid-template-columns:140px minmax(0,1fr) 180px;gap:10px}.work{grid-template-columns:100px minmax(0,1fr)}}
@container(max-width:800px){.layout{grid-template-columns:130px minmax(0,1fr);grid-template-rows:minmax(300px,1fr) 160px}.live-pane{grid-column:1/-1}.live-pane img,.live-pane video{max-height:110px}.page-meta .row{align-items:flex-start}}
@container(max-width:560px){.layout{display:flex;flex-direction:column;overflow:auto}.pages{flex:none;max-height:130px}.pages>#page-list{display:flex;gap:6px}.pages .page{width:auto;flex-shrink:0}.pages #resolution-guide{display:none}.content{flex:none;min-height:480px}.live-pane{flex:none;min-height:160px}.head .grow{display:none}.work{grid-template-columns:85px minmax(0,1fr)}}
`;
function attach(node){
 if(states.has(node))return;
 const host=document.createElement('div'),root=host.attachShadow({mode:'open'});
 host.style.cssText='display:block;width:100%;height:100%;min-width:0;min-height:0;--comfy-widget-min-height:720px;--comfy-widget-height:100%;';
 const widget=node.widgets?.find(w=>w.name==='project_json');
 if(!widget)return;
 widget.type='hidden';widget.hidden=true;widget.computeSize=()=>[0,-4];
 widget.computeLayoutSize=()=>({minWidth:0,minHeight:0,maxHeight:0});
 let workspace,project,selected=0,tab='images',busy=false,stop=false,disposed=false,chapters=[],activeJob=null;
 try{workspace=readWorkspace(widget.value);}catch{workspace=readWorkspace({});}
 project=workspace.pages.find(p=>p.pageId===workspace.activePageId);
 const uploadCache=new WeakMap();
 root.innerHTML=`<style>${style}</style><div class="shell">
 <div class="head"><h2>H3 可视化工作室</h2><span class="badge">官方采样流程</span><span class="grow"></span><button id="expand">展开大面板</button><span class="muted">v0.15.32</span></div>
 <div class="layout"><aside class="pages"><div class="row"><span class="title grow">页面</span><button id="add-page">＋</button></div><div id="page-list"></div><div id="resolution-guide" class="muted" style="white-space:pre-line;flex-shrink:0;border-top:1px solid #334959;padding-top:8px"></div><button id="delete-page" style="margin-top:12px">删除当前页</button></aside><main class="content"><fieldset id="edit">
 <div class="tools"><button id="folder" title="新目录导入成功后替换全部现有页面；失败保留原工作区">导入目录并替换工作区</button><button id="open">打开工程</button><button id="save">保存工程</button><button id="install-models" class="primary">一键安装所需模型</button><button id="check-models">检查全部模型</button><button id="export">导出本组导演台API</button></div>
 <div class="row"><span class="muted">工程</span><input id="name" class="grow" placeholder="工程名称"><label><input id="audio" type="checkbox">启用参考音频</label><span class="muted">最终声音始终由 H3 解码</span></div>
 <div class="row"><span class="title">工作模式</span><select id="mode"><option value="reference">参考素材 → 生视频</option><option value="auto_character">自动生成人物参考图 → 生视频</option></select><span class="muted">模式按页面保存</span></div>
 <div id="character-panel" class="library" hidden><div class="row"><span class="title grow">人物参考图 · Qwen-Image-2.1 Turbo</span><button id="extract-characters">从提示词识别人物</button><button id="add-character">添加人物</button><button id="generate-characters">只生成/更新人物图</button></div><p class="muted">先提取人物外貌设定，可编辑后生图；同一页按人物复用，不为每个素材组重复生成。缺少明确人物标签时请补充设定。</p><details><summary>生图模型与风格设置（首次需下载模型）</summary><div id="image-settings" class="row"></div><textarea id="image-style" style="min-height:65px" placeholder="统一人物参考图画风"></textarea><a href="https://huggingface.co/Comfy-Org/Qwen-Image-2.1" target="_blank" rel="noopener">官方模型下载</a></details><div id="characters"></div></div>
 <div class="library"><div class="row"><span class="title">公共素材库</span><button data-tab="images">图片</button><button data-tab="audios">音频</button><button data-tab="videos">视频</button><span id="counts" class="muted grow"></span><button id="upload">添加公共素材</button></div><div id="gallery" class="gallery"></div><div class="muted">项目共享图片库不限保存数量；分组用 &lt;Picture N&gt;、&lt;Audio N&gt;、&lt;Video N&gt; 引用所需素材。</div></div>
 <details class="settings"><summary>官方生成设置与公共提示词</summary><div class="row" id="settings"></div><textarea id="common" style="min-height:65px" placeholder="公共提示词（与每组提示词合并）"></textarea></details>
 <div id="timeline" class="timeline"></div>
 <div class="row"><span class="title">素材组</span><span id="summary" class="muted grow"></span><button id="all">全选</button><button id="none">取消全选</button><button id="add">添加分组</button></div>
 <div class="work"><div id="groups" class="groups"></div><div class="editor"><div class="row"><span id="group-title" class="title grow"></span><label>请求秒数 <input id="seconds" type="number" min="0.2" max="20.7" step="0.1"></label><button id="up">↑</button><button id="down">↓</button><button id="remove">删除本组</button></div><textarea id="prompt" placeholder="本组提示词。只说明确标注的台词；图片编号指向上方公共素材库。"></textarea><div id="binding" class="muted"></div><div id="result"></div></div></div>
 </fieldset></main><aside class="live-pane"><div class="title">实时预览 / 最新结果</div><p id="live-label" class="muted">等待任务。采样预览需云端开启预览；完成后自动显示图片或视频。</p><img id="live-image" hidden><video id="live-video" controls playsinline preload="metadata" hidden></video></aside></div>
 <div class="runbar"><button id="run-one" class="primary">生成当前组</button><button id="run" class="primary">按顺序生成勾选组</button><label><input id="auto-merge" type="checkbox">批量完成后自动合并</label><button id="merge">合并勾选组</button><button id="stop" class="danger" disabled>停止后续提交</button><button id="resume">查询已提交任务</button><span class="muted">后台批次提交成功后可关闭页面（人物图准备阶段需保持打开）</span></div>
 <div id="model-downloads" style="white-space:pre-wrap;overflow-wrap:anywhere"></div><div id="status" class="status" style="white-space:pre-wrap;overflow-wrap:anywhere">先导入目录并建页，或添加分组。视频由导演台内核执行，成片由ComfyUI保存。</div>
 <input id="folder-input" class="file" type="file" webkitdirectory multiple><input id="json-input" class="file" type="file" accept="application/json,.json"><input id="media-input" class="file" type="file" multiple>
 </div>`;
 const $=id=>root.querySelector('#'+id);
 // Reuse the same controls and handlers, but separate editing from maintenance.
 const edit=$('edit'),content=root.querySelector('.content'),head=root.querySelector('.head');
 const fileActions=document.createElement('div');fileActions.className='file-actions';fileActions.append($('folder'),$('open'),$('save'));const createFolders=document.createElement('button');createFolders.id='create-folders';createFolders.textContent='创建标准目录';createFolders.onclick=()=>openFolderTemplate({root,api,mode:project.mode,log});fileActions.prepend(createFolders);head.insertBefore(fileActions,$('expand'));
 const meta=document.createElement('div');meta.className='page-meta';meta.append($('name').closest('.row'),$('mode').closest('.row'));
 const nav=document.createElement('nav');nav.className='workspace-tabs';nav.setAttribute('aria-label','工作区');
 const panels={};let activePanel='shots';
 for(const [id,title] of [['shots','分段编辑'],['assets','公共素材'],['characters','人物设定'],['settings','生成设置'],['finishing','视频精修与放大'],['models','模型与下载']]){const panel=document.createElement('section');panel.id='panel-'+id;panel.className='tab-panel';panel.hidden=id!=='shots';panels[id]=panel;const button=document.createElement('button');button.type='button';button.dataset.panel=id;button.textContent=title;button.className=id==='shots'?'active':'';button.onclick=()=>showPanel(id);nav.append(button);}
 function showPanel(id){activePanel=id;for(const [key,panel] of Object.entries(panels))panel.hidden=key!==id;nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.panel===id));}
 panels.shots.append($('timeline'),$('summary').closest('.row'),root.querySelector('.work'));
 panels.assets.append($('gallery').closest('.library'));
 panels.characters.append($('character-panel'));const characterHelp=document.createElement('p');characterHelp.className='muted';characterHelp.textContent='人物设定用于“自动人物生图”模式，请先在上方切换工作模式。';panels.characters.append(characterHelp);
 const settings=root.querySelector('details.settings');settings.open=true;panels.settings.append(settings,$('export'));
 const modelActions=document.createElement('div');modelActions.className='row';modelActions.append($('install-models'),$('check-models'));const modelHelp=document.createElement('p');modelHelp.className='muted';modelHelp.textContent='模型只需安装一次。下载在云端后台运行，可切回分段编辑继续操作。';panels.models.append(modelHelp,modelActions,$('model-downloads'));
 root.querySelector('.tools').remove();edit.replaceChildren(meta,...Object.values(panels));content.insertBefore(nav,edit);
 const resourceEditor=attachResourceEditor({textarea:$('prompt'),getMedia:()=>project.media});
 const commonResourceEditor=attachResourceEditor({textarea:$('common'),getMedia:()=>project.media});
 const preview=livePreview({api,image:$('live-image'),video:$('live-video'),label:$('live-label'),owns:id=>workspace.pages.some(p=>p.groups.some(g=>g.job?.promptId===id)||p.characters.some(c=>c.imageJob?.promptId===id))});
 let expanded=false,placeholder=null,oldHostStyle='',globalWasHidden=false;
 function toggleExpanded(force){const next=force??!expanded;if(next===expanded)return;expanded=next;if(expanded){const globalPanel=document.getElementById('h3-global-import');globalWasHidden=globalPanel?.hidden||false;if(globalPanel){globalPanel.hidden=true;globalPanel.style.visibility='hidden';}placeholder=document.createComment('h3-widget');host.before(placeholder);oldHostStyle=host.style.cssText;document.body.append(host);host.style.cssText='position:fixed;inset:1vh 1vw;width:98vw;height:98vh;z-index:2147483646;';$('expand').textContent='收起大面板（Esc）';}else{const globalPanel=document.getElementById('h3-global-import');if(globalPanel){globalPanel.hidden=globalWasHidden;globalPanel.style.visibility=globalWasHidden?'hidden':'';}if(placeholder?.parentNode)placeholder.replaceWith(host);host.style.cssText=oldHostStyle;$('expand').textContent='展开大面板';}}
 const escape=e=>{if(e.key==='Escape'&&expanded)toggleExpanded(false);};document.addEventListener('keydown',escape);$('expand').onclick=()=>toggleExpanded();
 const persist=()=>{widget.value=JSON.stringify(workspaceData(workspace));node.setDirtyCanvas?.(true,true);};
 function log(text){$('status').textContent=text;}
 const generationInfo=document.createElement('div');generationInfo.id='generation-summary';generationInfo.className='status';generationInfo.style.cssText='white-space:pre-wrap;flex-shrink:0';$('status').before(generationInfo);
 const batchInfo=document.createElement('div');batchInfo.id='batch-status';batchInfo.className='status';$('status').before(batchInfo);
 const batchResume=document.createElement('button');batchResume.id='batch-continue';batchResume.textContent='继续后台批次';batchResume.hidden=true;root.querySelector('.runbar').append(batchResume);
 const compareButton=document.createElement('button');compareButton.id='quality-compare';compareButton.textContent='固定条件A/B生成';root.querySelector('.runbar').append(compareButton);
 const compareResult=document.createElement('button');compareResult.id='quality-results';compareResult.textContent='对比A/B结果';compareResult.disabled=true;root.querySelector('.runbar').append(compareResult);
 const stepStatus=document.createElement('div');stepStatus.className='status';stepStatus.style.cssText='white-space:pre-wrap;flex-shrink:0';stepStatus.textContent='当前步骤：等待任务';stepStatus.setAttribute('role','status');$('status').before(stepStatus);
 const previewStep=document.createElement('div');previewStep.style.cssText='white-space:pre-wrap;color:#8aefcf;font-weight:600;padding:8px 0';previewStep.textContent='当前步骤：等待任务';$('live-label').before(previewStep);
 const stageBar=document.createElement('progress');stageBar.style.cssText='width:100%;height:14px;display:none';stageBar.setAttribute('aria-label','当前阶段实际进度');previewStep.after(stageBar);
 const progressTracker=executionProgress({api,show:(text,detail)=>{stepStatus.textContent='当前步骤：'+text;previewStep.textContent='当前步骤：'+text;stageBar.style.display=detail?'block':'none';if(detail){stageBar.max=detail.max;stageBar.value=detail.value;stageBar.title=detail.label+'：'+(detail.value/detail.max*100).toFixed(1)+'%';}}});
 function setBusy(value){busy=value;$('add-page').disabled=value;$('delete-page').disabled=value||batchController.active||pluginUpdateBlocked();$('edit').disabled=value||batchController.active||pluginUpdateBlocked();for(const id of ['run','run-one'])$(id).disabled=value||batchController.active||batchController.needsRecovery||pluginUpdateBlocked();$('resume').disabled=value;$('merge').disabled=value||batchController.active;compareButton.disabled=value||batchController.active||batchController.needsRecovery||pluginUpdateBlocked();$('stop').disabled=!value&&!batchController.active;}
 function current(){return project.groups[selected];}

 let lastBatchPrompt=null;
 const batchController=backgroundBatch({api,getPage:()=>project,persist,log,onUpdate:(page,job)=>{
  if(page!==project)return;
  const counts=job.items.filter(i=>i.state==='done').length;
  batchInfo.textContent=`后台批次：${({queued:'排队',running:'执行中',disconnected:'服务异常，已暂停，待核对',merging:'合并中',done:'已完成',stopped:'已停止后续提交',paused:'暂停',error:'失败'})[job.state]||job.state} · ${counts}/${job.items.length}`+(job.error?' · '+job.error:'');
  batchResume.hidden=job.state!=='paused';batchRetryMerge.hidden=!(job.state==='error'&&job.items.length>1&&job.items.every(i=>i.state==='done'));
  const running=job.items.find(i=>['running','queued'].includes(i.state)&&i.promptId);
  if(running){
   if(running.promptId!==lastBatchPrompt){lastBatchPrompt=running.promptId;preview.watch(running.promptId,running.label+(running.state==='running'?' · 云端执行中':' · 等待云端执行'));}
   void api.fetchApi('/queue').then(r=>{if(!r.ok)throw Error('无法核对队列');return r.json();}).then(q=>{
    const current=(q.queue_running||[]).find(r=>String(r[1])===String(running.promptId)),pending=(q.queue_pending||[]).find(r=>String(r[1])===String(running.promptId)),row=current||pending;
    if(!disposed&&row&&project===page&&page.batch?.id===job.id)progressTracker.syncQueue(running.promptId,row[2],running.label,!current);
   }).catch(()=>{if(!disposed&&project===page&&lastBatchPrompt===running.promptId)progressTracker.syncQueue(running.promptId,null,running.label,running.state!=='running');});
  }
  if(job.mergedVideo)preview.video(view(job.mergedVideo),'合并成片已完成'+(job.mergedVideo.transitions?.some(t=>t.warning)?' · 接缝有变化，请检查首尾帧':''));
  render();setBusy(busy);
 }});
 const batchRetryMerge=document.createElement('button');batchRetryMerge.textContent='重试合并（不重跑生成）';batchRetryMerge.hidden=true;batchInfo.after(batchRetryMerge);batchRetryMerge.onclick=()=>void batchController.action('retry_merge').catch(e=>log(e.message));
 const executionHealth=mountExecutionHealth({api,container:root.querySelector('.shell'),isBusy:()=>busy||batchController.active||batchController.needsRecovery,owns:id=>!!id&&(id===lastBatchPrompt||workspace.pages.some(p=>p.groups.some(g=>g.job?.promptId===id)||p.characters.some(c=>c.imageJob?.promptId===id))),onUnavailable:text=>{progressTracker.connectionLost(text);stop=true;batchController.suspend(text);setBusy(false);render();},onRecovered:()=>progressTracker.connectionRestored()});
 batchResume.onclick=()=>{void batchController.action('resume').catch(e=>log(e.message));};
 const updater=mountPluginUpdater({container:panels.models,api,log,onState:()=>setBusy(busy)});
 const updateButton=document.createElement('button');updateButton.id='check-plugin-update';updateButton.textContent='检查更新';updateButton.onclick=()=>{showPanel('models');void updater.check();};fileActions.append(updateButton);
 const updateStateChanged=()=>setBusy(busy);window.addEventListener('h3-plugin-update-state',updateStateChanged);
 const finishingController=mountFinishing({onSettingsChanged:()=>render(),container:panels.finishing,api,getProject:()=>project,getGroup:current,persist,preview,view,log,isBusy:()=>busy,setBusy,onQueued:(id,prompt)=>progressTracker.watch(id,prompt,'已有视频AI超分'),onFinished:id=>progressTracker.finish(id),openModelDownloads:async()=>{showPanel('models');const key=(project.selflift?.enabled||project.finishing?.upscale==='latent')?'models/latent_upscale_models/minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors':'models/upscale_models/RealESRGAN_x4.pth';await downloader.show({missing:[key]});log('点击模型旁的下载按钮，安装完成后返回视频精修与放大，刷新并选择模型。');}});
 const selfliftController=mountSelfLift({container:panels.finishing,getProject:()=>project,persist,onChange:()=>{syncSettings();render();},log});
 const recipeController=mountDirectorRecipe({container:panels.finishing,getProject:()=>project,persist,onChange:()=>{syncSettings();render();},log});
 const voiceController=mountVoiceSettings({container:panels.characters,getProject:()=>project,persist,upload,isBusy:()=>busy,log});
 const frameController=mountFrameSettings({container:panels.shots,getGroup:current,persist,upload,isBusy:()=>busy||batchController.active,log});
 function numberGroups(){project.groups.forEach((g,i)=>g.number=i+1);selected=Math.max(0,Math.min(selected,project.groups.length-1));}
 function render(){
  $('page-list').replaceChildren();
  for(const page of workspace.pages){const button=document.createElement('button');button.className='page'+(page===project?' active':'');button.textContent=page.name;button.title=page.sourcePath||page.name;button.onclick=()=>{if(busy)return;project=page;workspace.activePageId=page.pageId;selected=0;syncSettings();persist();render();void batchController.query({discover:true});};$('page-list').append(button);}
  voiceController.sync();numberGroups();$('mode').value=project.mode;$('character-panel').hidden=project.mode!=='auto_character';renderCharacters();$('name').value=project.name;$('common').value=project.commonPrompt;commonResourceEditor.sync();$('audio').checked=!!project.audioReference;
  $('auto-merge').checked=project.autoMerge===true;if($('segment-continuity'))$('segment-continuity').checked=!!project.continuity;frameController.sync();
  $('counts').textContent=`${project.media.images.length}图 · ${project.media.audios.length}音频 · ${project.media.videos.length}视频`;
  $('summary').textContent=`${project.groups.length}组 · ${project.groups.reduce((n,g)=>n+Number(g.seconds||0),0).toFixed(1)}秒请求时长`;
  $('gallery').replaceChildren();
  for(const row of project.media[tab]){
   const card=document.createElement('div');card.className='asset';
   const el=document.createElement(tab==='images'?'img':tab==='audios'?'audio':'video');
   if(tab!=='images'){el.controls=true;el.preload='none';}else el.loading='lazy';el.src=view(row);card.append(el);
   const name=document.createElement('small');name.textContent=`${{images:'图片',audios:'音频',videos:'视频'}[tab]}${row.id} · ${row.name||row.file}`;name.title=row.file;card.append(name);
   const remove=document.createElement('button');remove.textContent='×';remove.title='移除公共引用（不删除服务器文件）';remove.onclick=()=>{if(busy)return;project.media[tab].splice(project.media[tab].indexOf(row),1);persist();render();};card.append(remove);$('gallery').append(card);
  }
  $('timeline').replaceChildren();$('groups').replaceChildren();
  for(const [i,g] of project.groups.entries()){
   const bar=document.createElement('button');bar.textContent=`${g.number} · ${g.seconds}s`;bar.style.width=Math.max(65,Number(g.seconds)*14)+'px';bar.classList.toggle('active',i===selected);bar.onclick=()=>{selected=i;render();};$('timeline').append(bar);
   const row=document.createElement('div');row.className='group'+(i===selected?' active':'');
   const check=document.createElement('input');check.type='checkbox';check.checked=g.selected!==false;check.onclick=e=>e.stopPropagation();check.onchange=()=>{g.selected=check.checked;persist();};row.append(check);
   const text=document.createElement('div');const title=document.createElement('div');title.textContent=`素材组${g.number} · ${g.seconds}秒`;const status=document.createElement('div');status.className='meta';status.textContent=({queued:'已提交',done:'已完成',error:'失败'})[g.job?.state]||'待生成';text.append(title,status);row.append(text);row.onclick=()=>{selected=i;render();};$('groups').append(row);
  }
  const g=current();$('group-title').textContent=g?`素材组 ${g.number}`:'尚无素材组';$('seconds').value=g?.seconds??4;$('prompt').value=g?.prompt||'';resourceEditor.sync();
  for(const id of ['seconds','prompt','remove','up','down','export'])$(id).disabled=!g;
  $('result').replaceChildren();
  if(g){
   try{const video=videoWithCharacters(project,g);const plan=planGroup(video.project,video.group);$('binding').textContent=`本组实际输入 ${plan.images.length}图 / ${plan.audios.length}音频 / ${plan.videos.length}视频；${plan.length}帧 ≈ ${(plan.length/24).toFixed(2)}秒。`;}catch(e){$('binding').textContent='待修正：'+e.message;}
   for(const file of ((project.batch?.autoMerge??project.autoMerge)?(project.mergedVideo?[project.mergedVideo]:[]):[...(g.job?.videos||[]),...(project.mergedVideo?[project.mergedVideo]:[])])){const video=document.createElement('video');video.className='preview';video.controls=true;video.preload='metadata';video.src=view({...file,type:file.type||'output'});$('result').append(video);}
   if(!busy&&g.job?.videos?.[0])preview.video(view({...g.job.videos[0],type:'output'}),'素材组'+g.number+' · 已完成视频');
  }else $('binding').textContent='';
  generationInfo.textContent=generationSummary(project,current());compareResult.disabled=!(project.comparison?.groups?.every(g=>g.job?.state==='done'&&g.job.videos?.[0]));
  finishingController.sync();selfliftController.sync();recipeController.sync();
  persist();
 }
 function renderCharacters(){
  imageResolution.sync();videoResolution.sync();$('resolution-guide').textContent=resolutionGuide(project.settings);
  $('characters').replaceChildren();
  $('image-style').value=project.imageSettings.style;
  root.querySelectorAll('[data-image-setting]').forEach(el=>el.value=project.imageSettings[el.dataset.imageSetting]);
  for(const c of project.characters){
   const card=document.createElement('div');card.style.cssText='border-top:1px solid #334959;padding-top:8px;margin-top:8px';
   const row=document.createElement('div');row.className='row';
   const id=document.createElement('span');id.textContent=c.id;id.className='badge';row.append(id);
   const name=document.createElement('input');name.value=c.name;name.placeholder='人物名称';name.oninput=()=>{c.name=name.value;persist();updateBinding();};row.append(name);
   const state=document.createElement('span');state.className='muted grow';state.textContent=referenceReady(project,c)?`已生成 · 公共图片${c.reference.pictureId}`:c.imageJob?.state==='queued'?'生图任务已提交':'待生成/设定有变更';row.append(state);
   const regenerate=document.createElement('button');regenerate.textContent='重新生成';regenerate.onclick=()=>{c.reference=null;c.imageJob=null;persist();render();};row.append(regenerate);
   const remove=document.createElement('button');remove.textContent='删除人物';remove.onclick=()=>{project.characters=project.characters.filter(v=>v!==c);persist();render();};row.append(remove);card.append(row);
   const description=document.createElement('textarea');description.style.minHeight='75px';description.value=c.description;description.placeholder='外貌、年龄、发型、服装、标志性特征。只用于这个人物。';description.oninput=()=>{c.description=description.value;persist();updateBinding();};card.append(description);
   if(c.reference?.file){const image=document.createElement('img');image.src=view({file:c.reference.file});image.style.cssText='height:140px;max-width:180px;object-fit:contain';card.append(image);}
   $('characters').append(card);
  }
 }
 for(const key of ['model','clip','vae','steps','cfg','seed']){
  const label=document.createElement('label');label.textContent=({model:'生图模型',clip:'文本编码器',vae:'图像VAE',width:'图宽',height:'图高',steps:'生图步数',cfg:'生图CFG',seed:'生图种子'})[key];
  const input=document.createElement('input');input.dataset.imageSetting=key;input.type=['model','clip','vae'].includes(key)?'text':'number';input.value=project.imageSettings[key];if(input.type==='text')input.style.width='260px';
  input.oninput=()=>{project.imageSettings[key]=input.type==='number'?Number(input.value):input.value;persist();updateBinding();};if(key==='cfg')input.step='0.1';label.append(input);$('image-settings').append(label);
 }
 const imageResolution=mountResolution({container:$('image-settings'),getSettings:()=>project.imageSettings,onChange:()=>{persist();updateBinding();},step:16,id:'image-resolution'});
 const videoResolution=mountResolution({container:$('settings'),getSettings:()=>project.settings,onChange:mp=>{const raised=syncFinishingResolution(project,mp);finishingController.sync();persist();updateBinding();if(raised)log('已同步二采放大目标为 '+project.finishing.megapixels+' MP（一采MP的2倍）。');$('resolution-guide').textContent=resolutionGuide(project.settings);},id:'video-resolution'});
 $('image-style').oninput=()=>{project.imageSettings.style=$('image-style').value;persist();updateBinding();};
 $('mode').onchange=()=>{project.mode=$('mode').value;if(project.mode==='auto_character'&&!project.characters.length)project.characters=discoverCharacters(project);persist();render();};
 $('extract-characters').onclick=()=>{const found=discoverCharacters(project);for(const c of found)if(!project.characters.some(v=>v.id===c.id))project.characters.push(c);persist();render();log(found.length?`识别到${found.length}个人物，请核对外貌设定。`:'未识别到人物名/S编号，请添加人物并填写外貌设定。');};
 $('add-character').onclick=()=>{project.characters.push({id:'C'+uuid().slice(0,8),name:'新人物',description:'',reference:null});persist();render();};
 for(const key of ['steps','seed','sampler','scheduler']){
  const label=document.createElement('label');label.textContent=({width:'宽',height:'高',steps:'步数',seed:'种子',sampler:'采样器',scheduler:'调度器'})[key];
  const input=document.createElement('input');input.value=project.settings[key];input.type=['sampler','scheduler'].includes(key)?'text':'number';if(key==='width'||key==='height')input.step=32;
  input.dataset.setting=key;input.onchange=()=>{project.settings[key]=input.type==='number'?Number(input.value):input.value;persist();updateBinding();};label.append(input);$('settings').append(label);
 }
 const accelerationLabel=document.createElement('label');accelerationLabel.textContent='视频加速 ';
 const accelerationSelect=document.createElement('select');accelerationSelect.id='video-acceleration';
 for(const [value,text] of ACCELERATION_MODES){const option=document.createElement('option');option.value=value;option.textContent=text;accelerationSelect.append(option);}
 accelerationLabel.append(accelerationSelect);$('settings').prepend(accelerationLabel);
 const accelerationHelp=document.createElement('span');accelerationHelp.className='muted';accelerationHelp.id='acceleration-help';$('settings').append(accelerationHelp);
 accelerationSelect.onchange=()=>{project.settings.acceleration=accelerationSelect.value;syncSettings();persist();updateBinding();log(accelerationSummary(project.settings));};
 function updateBinding(){generationInfo.textContent=generationSummary(project,current());
  const g=current();if(!g)return;
  try{const video=videoWithCharacters(project,g);const p=planGroup(video.project,video.group);$('binding').textContent=`本组实际输入 ${p.images.length}图 / ${p.audios.length}音频 / ${p.videos.length}视频；${p.length}帧 ≈ ${(p.length/24).toFixed(2)}秒。`;}catch(error){$('binding').textContent='待修正：'+error.message;}
  $('summary').textContent=`${project.groups.length}组 · ${project.groups.reduce((n,g)=>n+Number(g.seconds||0),0).toFixed(1)}秒请求时长`;
  const bar=$('timeline').children[selected];if(bar)bar.textContent=`${g.number} · ${g.seconds}s`;
 }
 const syncSettings=()=>{const effective=effectiveVideoSettings(project.settings);accelerationSelect.value=project.settings.acceleration||'inherit';accelerationHelp.textContent=accelerationSummary(project.settings);root.querySelectorAll('[data-setting]').forEach(el=>{const key=el.dataset.setting;el.value=effective[key];el.disabled=accelerationSelect.value!=='inherit'&&['steps','sampler','scheduler'].includes(key);});};
 $('name').oninput=()=>{project.name=$('name').value;const label=$('page-list').querySelector('.page.active');if(label)label.textContent=project.name;persist();};$('common').oninput=()=>{project.commonPrompt=$('common').value;persist();};$('common').onchange=updateBinding;
 $('audio').onchange=()=>{project.audioReference=$('audio').checked;persist();render();};
 $('prompt').oninput=()=>{if(current()){current().prompt=$('prompt').value;persist();}};$('prompt').onchange=updateBinding;
 $('seconds').onchange=()=>{if(current()){current().seconds=Number($('seconds').value);persist();updateBinding();}};
 root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;render();});
 $('all').onclick=()=>{project.groups.forEach(g=>g.selected=true);persist();render();};$('none').onclick=()=>{project.groups.forEach(g=>g.selected=false);persist();render();};
 $('add').onclick=()=>{project.groups.push({id:uuid(),number:project.groups.length+1,seconds:4,prompt:'',selected:true});selected=project.groups.length-1;persist();render();};
 $('remove').onclick=()=>{project.groups.splice(selected,1);persist();render();};
 for(const [id,delta] of [['up',-1],['down',1]])$(id).onclick=()=>{const other=selected+delta;if(other<0||other>=project.groups.length)return;[project.groups[selected],project.groups[other]]=[project.groups[other],project.groups[selected]];selected=other;numberGroups();persist();render();};
 async function upload(file){
  if(uploadCache.has(file))return uploadCache.get(file);
  const form=new FormData();const ext=file.name.split('.').at(-1).toLowerCase();form.append('image',file,`h3_${uuid()}.${ext}`);form.append('type','input');form.append('subfolder','h3_visual_studio');form.append('overwrite','false');
  const response=await api.fetchApi('/upload/image',{method:'POST',body:form});if(!response.ok)throw Error('上传失败 HTTP '+response.status);
  const data=await response.json();if(!data.name||data.type&&data.type!=='input')throw Error('上传返回无效记录');
  const name=String(data.name).replaceAll('\\','/'),folder=String(data.subfolder||'').replaceAll('\\','/').replace(/^\/+|\/+$/g,'');const value=folder&&!name.startsWith(folder+'/')?folder+'/'+name:name;
  uploadCache.set(file,value);return value;
 }
 $('folder').onclick=()=>$('folder-input').click();
 async function chapterPage(chapter,mode=project.mode,sharedImages=null,sharedMedia={}){
  const next=defaultProject();next.pageId=uuid();next.name=chapter.name.split('/').at(-1);next.sourcePath=chapter.name;next.settings=structuredClone(project.settings);next.mode=mode;next.imageSettings=structuredClone(project.imageSettings);next.finishing=structuredClone(project.finishing);next.selflift=structuredClone(project.selflift);next.voiceSettings=structuredClone(project.voiceSettings);next.audioReference=project.audioReference;next.autoMerge=project.autoMerge;next.continuity=project.continuity;const maps={images:new Map(),audios:new Map(),videos:new Map()};
  for(const [key,shared,local] of [['images','sharedImages','images'],['audios','sharedAudios','audios'],['videos','sharedVideos','videos']]){
   if(key!=='images'&&sharedMedia[key]){next.media[key]=sharedMedia[key];continue;}
   if(key==='images'&&sharedImages){next.media.images=sharedImages;next.projectImageLibrary=true;continue;}
   const list=chapter[shared]||[];
   for(const [i,file] of list.entries()){log(`${next.name}：公共${key} ${i+1}/${list.length} 上传中`);const value=await upload(file);next.media[key].push({id:i+1,name:file.name,file:value});maps[key].set(file,i+1);}
   if(!chapter[shared])for(const g of chapter.groups)for(const file of g[local]||[])if(!maps[key].has(file)){const id=next.media[key].length+1;next.media[key].push({id,name:file.name,file:await upload(file)});maps[key].set(file,id);}
  }
  next.groups=chapter.groups.map(g=>{let prompt=g.prompt;for(const [key,tag,shared,label] of [['images','Picture','sharedImages','图片'],['audios','Audio','sharedAudios','音频'],['videos','Video','sharedVideos','视频']])if(!chapter[shared]&&!(mode==='auto_character'&&key==='images')){const re=new RegExp(`<${tag}\\s+(\\d+)>|@${label}(\\d+)(?:\\.[a-z0-9]+)?`,'gi');prompt=prompt.replace(re,(_,a,b)=>`<${tag} ${maps[key].get(g[key][Number(a||b)-1])}>`);}return {id:uuid(),number:g.number,name:g.name,seconds:g.seconds,prompt,selected:true};});
  if(next.mode==='auto_character'){next.characters=discoverCharacters(next);}else next.groups.forEach(g=>planGroup(next,g));return next;
 }
 async function importChapters(items,{mode=project.mode}={}){
  if(busy)throw Error('当前工作室正在处理任务');
  if(!items?.length)throw Error('没有可导入的目录');
  setBusy(true);stop=false;
  try{
   const added=[];
   const roots=new Set(items.map(c=>c.sharedImageRoot).filter(Boolean));
   if(roots.size>1||(roots.size&&items.some(c=>!c.sharedImageRoot)))throw Error('请一次导入一个完整项目，所有页面共用项目根参考图');
   let sharedImages=null;
   if(roots.size){sharedImages=[];const library=items[0].sharedImages;const wanted=[...new Set(items.flatMap(c=>c.groups.flatMap(g=>[...g.prompt.matchAll(/<\s*Picture\s+(\d+)\s*>|@图片(\d+)/gi)].map(m=>Number(m[1]||m[2])))))];
    for(const id of wanted){if(stop||disposed)throw Error('已取消导入');const file=library[id-1];if(!file)throw Error('项目参考图缺失：@图片'+id);log('上传项目共享参考图 @图片'+id);sharedImages.push({id,name:file.name,file:await upload(file)});}
   }
   const sharedMedia={};
   for(const [key,field,tag,label] of [['audios','sharedAudios','Audio','音频'],['videos','sharedVideos','Video','视频']]){
    const pools=items.map(c=>c[field]);const library=pools.find(Boolean);
    if(library&&pools.some(p=>p&&p!==library))continue;
    if(!roots.size&&!library)continue;
    sharedMedia[key]=[];
    const re=new RegExp('<\\s*'+tag+'\\s+(\\d+)\\s*>|@'+label+'(\\d+)','gi');
    const wanted=[...new Set(items.flatMap(c=>c.groups.flatMap(g=>[...g.prompt.matchAll(re)].map(m=>Number(m[1]||m[2])))))];
    for(const id of wanted){if(stop||disposed)throw Error('已取消导入');const file=library?.[id-1];if(!file)throw Error('项目公共资源缺失：@'+label+id);log('上传项目共享资源 @'+label+id);sharedMedia[key].push({id,name:file.name,file:await upload(file)});}
   }
   for(const chapter of items){if(stop||disposed)throw Error('已取消导入；原有页面保留');added.push(await chapterPage(chapter,mode,sharedImages,sharedMedia));}
   if(stop||disposed)throw Error('已取消导入；原有页面保留');
   workspace=readWorkspace({version:1,...(sharedImages?{sharedImages}:{}),...(sharedMedia.audios?{sharedAudios:sharedMedia.audios}:{}),...(sharedMedia.videos?{sharedVideos:sharedMedia.videos}:{}),pages:added,activePageId:added[0].pageId});
   project=workspace.pages.find(p=>p.pageId===workspace.activePageId);selected=0;persist();syncSettings();render();
   log(`已清除旧工作区并导入${added.length}个文件夹页面；旧页面与结果记录已替换，服务器素材及成片文件未删除。已保存到节点工程数据，尚未提交生成。`);
   return added.length;
  }finally{setBusy(false);}
 }
 $('folder-input').onchange=async()=>{try{const items=await parseProjectFiles([...$('folder-input').files],{allowNoImages:project.mode==='auto_character'});await importChapters(items);}catch(error){log('导入未提交，原有页面保留：'+error.message);}finally{$('folder-input').value='';}};
 $('add-page').onclick=()=>{if(busy)return;const page=defaultProject();page.pageId=uuid();page.name='新页面 '+(workspace.pages.length+1);bindSharedMedia(workspace,page);workspace.pages.push(page);workspace.activePageId=page.pageId;project=page;selected=0;syncSettings();persist();render();};
 $('delete-page').onclick=()=>{if(busy)return;workspace.pages=workspace.pages.filter(p=>p!==project);if(!workspace.pages.length){const p=defaultProject();p.pageId=uuid();bindSharedMedia(workspace,p);workspace.pages.push(p);}project=workspace.pages[0];workspace.activePageId=project.pageId;selected=0;syncSettings();persist();render();};
 $('upload').onclick=()=>{$('media-input').accept=tab==='images'?'image/*':tab==='audios'?'audio/*':'video/*';$('media-input').click();};
 $('media-input').onchange=async e=>{if(busy)return;setBusy(true);try{const added=[];let id=project.media[tab].reduce((n,r)=>Math.max(n,r.id),0);for(const file of e.target.files)added.push({id:++id,name:file.name,file:await upload(file)});project.media[tab].push(...added);persist();render();log('公共素材已添加。');}catch(error){log(error.message);}finally{setBusy(false);$('media-input').value='';}};
 $('save').onclick=()=>{persist();download(workspaceData(workspace),'H3工作区.h3-workspace.json');};$('open').onclick=()=>$('json-input').click();
 $('json-input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;workspace=readWorkspace(await file.text());project=workspace.pages.find(p=>p.pageId===workspace.activePageId);selected=0;persist();syncSettings();render();log('工程已打开；素材路径对应当前服务器的 input 目录。');}catch(error){log('工程读取失败：'+error.message);}};
 async function waitJob(id){
  let missing=0;
  while(!disposed){const response=await api.fetchApi('/history/'+encodeURIComponent(id));if(!response.ok)throw Error('任务查询失败，已保留任务ID，请恢复查询');const history=(await response.json())[id];if(history){progressTracker.finish(id);stepStatus.textContent=history.status?.status_str==='success'?'当前步骤：任务已完成':'当前步骤：任务执行失败';return history;}
   // A removed task must not keep the batch waiting forever.
   const queueResponse=await api.fetchApi('/queue');if(!queueResponse.ok)throw Error('队列查询失败，已停止后续提交');const q=await queueResponse.json();const queued=(q.queue_pending||[]).find(row=>String(row[1])===String(id)),running=(q.queue_running||[]).find(row=>String(row[1])===String(id));const row=running||queued;if(row){const group=workspace.pages.flatMap(p=>p.groups).find(g=>g.job?.promptId===id);const character=workspace.pages.flatMap(p=>p.characters).find(c=>c.imageJob?.promptId===id);progressTracker.watch(id,row[2],group?'素材组'+group.number:character?'人物图 · '+character.name:'当前任务',!running);}const pending=!!row;missing=pending?0:missing+1;if(missing>=5)throw Error('任务已不在队列且没有历史结果；已停止后续提交');
   await new Promise(resolve=>setTimeout(resolve,1500));
  }throw Error('面板已关闭，停止后续提交；已提交任务仍在服务器运行');
 }
 const dependencyController=mountDependencies({api,container:panels.models,log});
 const proxyController=mountProxyCore({api,container:panels.models,log});
 const downloader=modelDownloader({api,container:$('model-downloads'),log,recheck:async()=>{try{showPanel('models');await checkAllModels(await app.graphToPrompt());}catch(error){log(error.message);}}});
 async function checkAllModels(graph,{imageOnly=false,install=false}={}){
  const response=await api.fetchApi('/object_info');if(!response.ok)throw Error('无法获取云端模型清单，未提交任务');
  const prompts=imageOnly?[]:[compileRequest(graph.output,{...project,mode:'reference',commonPrompt:'',media:{images:[],audios:[],videos:[]}},{id:'model-check',number:1,seconds:1,prompt:'模型检查'}).prompt];
  if(imageOnly||project.mode==='auto_character')prompts.push(compileCharacterImage(project,{id:'CHECK',name:'模型检查',description:'仅检查模型，不提交生图'}).prompt);
  const voiceInfo=await response.json();const report=modelReport(voiceInfo,prompts);
  if(!imageOnly&&project.voiceSettings?.voices?.some(v=>v.file)){
   const voiceStatus=await api.fetchApi('/h3_visual_studio/models');if(!voiceStatus.ok)throw Error('无法扫描服务器配音模型');
   addVoiceModelReport(report,await voiceStatus.json(),['Base']);
   for(const name of ['Qwen3TTSVoiceClone','MiniMaxH3DialogueAudioLock','MiniMaxH3DialogueAudioFinalize'])if(!voiceInfo[name]&&!report.nodes.includes(name))report.nodes.push(name);
  }
  const dependencyPrompt={...(prompts[0]||{})};if(!imageOnly&&project.voiceSettings?.voices?.some(v=>v.file))dependencyPrompt.voice_dependencies={class_type:'H3PrepareDialogue',inputs:{}};const dependencyErrors=await dependencyController.check(dependencyPrompt);if(install||dependencyErrors.length||report.missing.length||report.nodes.length||report.unknown.length)showPanel('models');log(reportText(report));await downloader.show(report);if(install){await downloader.install(report);if(report.nodes.length)log('模型下载已处理；以下是缺少的节点，需要更新ComfyUI，不是下载权重：\n'+report.nodes.join('\n'));}else{assertModels(report);if(dependencyErrors.length)throw Error('缺少运行依赖：\n'+dependencyErrors.join('\n'));}return report;
 }
 async function installModels(){if(busy)return;setBusy(true);try{await checkAllModels(await app.graphToPrompt(),{install:true});}catch(error){log(error.message);}finally{setBusy(false);}}
 $('install-models').onclick=installModels;
 $('check-models').onclick=async()=>{if(busy)return;setBusy(true);try{showPanel('models');await checkAllModels(await app.graphToPrompt());}catch(error){log(error.message);}finally{setBusy(false);}};
 async function ensureCharacterImages(groups,graph,{allowSubmit=true}={}){
  if(project.mode!=='auto_character')return;
  if(!project.characters.length){project.characters=discoverCharacters(project);persist();render();}
  const needed=[...new Map(groups.flatMap(g=>charactersForGroup(project,g)).map(c=>[c.id,c])).values()];
  if(!needed.length)throw Error('没有识别到人物，请添加人物名称和外貌设定');
  const pending=needed.filter(c=>!referenceReady(project,c));
  for(const c of pending)if(c.imageJob?.state==='done'&&c.imageJob.recipe===imageRecipe(project,c)&&c.imageJob.output)c.imageJob.state='generated';
  if(allowSubmit&&pending.some(c=>!c.imageJob||!['queued','generated'].includes(c.imageJob.state))){
   const response=await api.fetchApi('/object_info');if(!response.ok)throw Error('无法检查云端生图模型，停止生成');checkImageModels(await response.json(),project.imageSettings);
  }
  for(const c of pending){
   if(stop||disposed)throw Error('已停止后续生成');
   const request=compileCharacterImage(project,c);
   let job=c.imageJob;
   if(job&&job.recipe!==request.recipe&&['queued','generated'].includes(job.state))throw Error('人物'+c.name+'已有旧设定的生图任务，请查询完成后再更新设定');
   if(!job||job.state==='error'||job.recipe!==request.recipe){
    if(!allowSubmit)continue;
    log(`正在生成${c.name}的人物参考图，完成后才进入视频阶段……`);
    preparedRequests.add(request.prompt);
    const workflow=structuredClone(graph.workflow);workflow.extra ||= {};workflow.extra.h3_visual_request={stage:'character',pageId:project.pageId,characterId:c.id,recipe:request.recipe};
    const response=await api.queuePrompt(0,{output:request.prompt,workflow});if(!response?.prompt_id)throw Error('生图任务未返回ID，停止后续生成');
    c.imageJob=job={state:'queued',promptId:response.prompt_id,recipe:request.recipe};preview.watch(response.prompt_id,'正在生成'+c.name+'人物图；等待预览帧');persist();render();
   }
   if(job.state==='queued'){
    const history=await waitJob(job.promptId);
    if(history.status?.status_str!=='success'||history.status?.completed!==true){job.state='error';persist();throw Error('人物'+c.name+'生图失败，未提交后续视频');}
    try{job.output=generatedImage(history);}catch(error){job.state='error';persist();throw error;}
    job.state='generated';preview.image(view(job.output),'人物图已生成，正在存入公共图库');persist();
   }
   if(job.state==='generated'){
    // Reuse a completed image after reload; never regenerate merely because transfer failed.
    const response=await api.fetchApi('/view?'+new URLSearchParams({filename:job.output.filename,subfolder:job.output.subfolder||'',type:'output'}));
    if(!response.ok)throw Error('人物图已生成，但读取失败；保留任务ID，可再次查询');
    const file=new File([await response.blob()],`${c.id}.png`,{type:'image/png'});const inputPath=await upload(file);
    const old=project.media.images.find(r=>r.generatedCharacterId===c.id);
    const id=old?.id??project.media.images.reduce((n,r)=>Math.max(n,r.id),0)+1;
    const row={id,name:c.name+'人物参考.png',file:inputPath,generatedCharacterId:c.id};project.media.images=project.media.images.filter(r=>r.id!==id);project.media.images.push(row);
    c.reference={pictureId:id,file:inputPath,recipe:request.recipe,output:job.output};job.state='done';persist();render();
   }
  }
 }
 $('generate-characters').onclick=async()=>{if(busy)return;setBusy(true);stop=false;try{const graph=await app.graphToPrompt();await checkAllModels(graph,{imageOnly:true});await ensureCharacterImages(project.groups,graph);log('人物参考图已生成并保存到本页公共图库，未提交视频。');}catch(error){log('已停止：'+error.message);}finally{setBusy(false);}};
 const continuityLabel=document.createElement('label'),continuityToggle=document.createElement('input');continuityToggle.type='checkbox';continuityToggle.id='segment-continuity';continuityLabel.append(continuityToggle,document.createTextNode('段间引导（引用上段22帧，连续镜头用）'));$('auto-merge').closest('label').after(continuityLabel);continuityToggle.onchange=()=>{project.continuity=continuityToggle.checked;persist();};
 $('auto-merge').onchange=()=>{project.autoMerge=$('auto-merge').checked;persist();};
 async function mergeGroups(groups){
  if(groups.length<2)throw Error('合并至少需要两个素材组');
  const clips=groups.map(g=>{if(g.job?.state!=='done'||g.job.videos?.length!==1)throw Error('素材组'+g.number+'尚未完成或结果不唯一');return g.job.videos[0];});
  log('FFmpeg正在从磁盘合并；原视频保留。');
  const response=await api.fetchApi('/h3_visual_studio/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips})});
  const data=await response.json();if(!response.ok||!data.video)throw Error(data.error||'合并失败');
  project.mergedVideo=data.video;preview.video(view(data.video),'合并视频已完成');persist();render();log('合并完成，已保存到output/H3_Merged；'+(data.video.transitions?.some(t=>t.warning)?'检测到接缝差异，请检查相邻首尾帧（切镜也可能产生差异）。':'首尾帧差异检测完成。'));
 }
 $('merge').onclick=async()=>{if(busy||batchController.active)return;setBusy(true);try{await mergeGroups(project.groups.filter(g=>g.selected!==false));}catch(error){log(error.message);}finally{setBusy(false);}};
 async function run(one){
  if(busy||batchController.active||batchController.needsRecovery||pluginUpdateBlocked()){log('插件更新中或此页有未结束后台批次，请先查询或停止后续提交。');return;}const chosen=one?[current()]:project.groups.filter(g=>g.selected!==false);if(!chosen.length||!chosen[0]){log('请先选择素材组');return;}
  setBusy(true);stop=false;
  try{persist();const graph=await app.graphToPrompt();await checkAllModels(graph);await ensureCharacterImages(chosen,graph);if(stop||disposed)throw Error('已停止后续生成');const snapshot=structuredClone(project);snapshot.autoMerge=!one&&project.autoMerge&&chosen.length>1;const requests=new Map();for(const g of chosen){const copy=snapshot.groups.find(v=>v.id===g.id);requests.set(g.id,compileRequest(graph.output,snapshot,copy));}
   const items=chosen.map(g=>{const request=requests.get(g.id),workflow=structuredClone(graph.workflow);workflow.extra ||= {};workflow.extra.h3_visual_request={pageId:project.pageId,groupId:g.id,groupNumber:g.number};return {groupId:g.id,label:'分段'+g.number,prompt:request.prompt,workflow};});
   const merged=!one&&project.autoMerge&&chosen.length>1;
   const native=merged&&!project.voiceSettings?.voices?.some(v=>v.file);
   let submitted=items;
   if(native){submitted=[{...items[0],groupIds:chosen.map(g=>g.id),label:chosen.length+'段导演台成片',prompt:compileSequence(graph.output,snapshot,chosen)}];}
   else if(project.continuity&&merged)throw Error('段间引导需要统一的首尾帧/参考模式，且暂不支持固定声线配音，请关闭引导或调整配置');
   const job=await batchController.start(submitted,{autoMerge:merged,combinedOutput:native});
   log('后台批次已保存 '+job.id+'；现在可关闭页面。任务按顺序执行，刷新后可查询。');
  }catch(error){log('已停止：'+error.message+'。已提交任务不会自动重复提交，可查询任务状态。');}finally{activeJob=null;setBusy(false);}
 }
 $('run-one').onclick=()=>run(true);$('run').onclick=()=>run(false);$('stop').onclick=()=>{stop=true;if(batchController.active)void batchController.action('stop').catch(e=>log(e.message));log('停止后续提交；当前任务继续运行，等待完成后结束批次。');};
 $('resume').onclick=async()=>{if(busy)return;await batchController.query({discover:true});if(batchController.active||project.batch?.state==='done')return;const pending=project.groups.filter(g=>g.job?.state==='queued'&&g.job.promptId);const images=project.characters.some(c=>['queued','generated'].includes(c.imageJob?.state));if(!pending.length&&!images){log('没有待查询任务。');return;}setBusy(true);stop=false;try{if(images)await ensureCharacterImages(project.groups,await app.graphToPrompt(),{allowSubmit:false});for(const g of pending){const history=await waitJob(g.job.promptId);g.job.state=history.status?.status_str==='success'?'done':'error';g.job.videos=resultVideos(history);g.job.originalVideos=originalVideos(history);persist();render();if(g.job.videos[0])preview.video(view({...g.job.videos[0],type:'output'}),'已恢复任务的视频结果');}log('已提交任务状态已更新；没有追加生成。');}catch(error){log(error.message);}finally{setBusy(false);}};
 compareButton.onclick=()=>{if(busy||batchController.active)return;openQualitySetup({root,initialTarget:project.finishing.megapixels,onSubmit:async options=>{
  if(busy||batchController.active)throw Error('已有后台批次，请等待完成');
  setBusy(true);stop=false;try{const graph=await app.graphToPrompt();await ensureCharacterImages([current()],graph);if(stop||disposed)throw Error('已取消');const variants=qualityVariants(project,current(),options);
   const items=variants.map(v=>({groupId:v.group.id,label:v.label,prompt:compileRequest(graph.output,v.project,v.group).prompt,workflow:structuredClone(graph.workflow)}));
   const info=await api.fetchApi('/object_info');if(!info.ok)throw Error('无法检查模型');assertModels(modelReport(await info.json(),items.map(i=>i.prompt)));const errors=await dependencyController.check(items[0].prompt);if(errors.length)throw Error(errors.join('\n'));
   project.comparison={options,seed:project.settings.seed,groups:variants.map(v=>({...v.group,label:v.label,job:null})),created:Date.now()};persist();await batchController.start(items);log('A/B后台批次已提交，完成后点击“对比A/B结果”。');
  }finally{setBusy(false);}
 }});};
 compareResult.onclick=()=>{try{const [a,b]=project.comparison.groups;openVideoCompare({root,left:{...a.job.videos[0],label:a.label},right:{...b.job.videos[0],label:b.label},view,title:'固定条件A/B画质对比 · 种子 '+project.comparison.seed});}catch(e){log('请先完成A/B两段生成：'+e.message);}};
 $('export').onclick=async()=>{try{const request=compileRequest((await app.graphToPrompt()).output,project,current());download(request.prompt,project.name+'_导演台_API.json');log('已导出导演台内核执行API（供ComfyUI API使用）；可视化工作区请用保存工程。');}catch(error){log('导出失败：'+error.message);}};
 syncSettings();
 setTimeout(()=>{if(!disposed)downloader.resume();},0);
 const dom=node.addDOMWidget('h3_visual','H3Visual',host,{serialize:false,hideOnZoom:false,selectOn:[],getMinHeight:()=>720,getHeight:()=> '100%'});
 dom.computeSize=width=>[Math.max(960,Number(width)||1760),1020];
 dom.computeLayoutSize=()=>({minWidth:960,minHeight:720,maxHeight:undefined});
 node.setSize([1800,1100]);
 // Keep editor clicks/focus inside the panel instead of selecting the canvas
 // node and triggering inspector-driven widget re-layout on every tab switch.
 for(const event of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','keydown'])host.addEventListener(event,e=>e.stopPropagation());
 const state={installModels,importChapters,getMode:()=>project.mode,isBusy:()=>busy||pluginUpdateBlocked()||workspace.pages.some(p=>['submitting','unknown','queued','running','merging'].includes(p.batch?.state)),async queueCurrent(number,data,send,options){
  if(busy||batchController.active||batchController.needsRecovery||pluginUpdateBlocked())throw Error('插件更新中或可视化工作室已有任务或后台批次，请等待或停止后续提交');
  const g=current();if(!g)throw Error('请先在可视化工作室中导入素材或添加分组');
  setBusy(true);stop=false;
  try{
   await checkAllModels(data);await ensureCharacterImages([g],data);if(stop||disposed)throw Error('已停止后续生成');
   const request=compileRequest(data.output,project,g);const workflow=structuredClone(data.workflow);workflow.extra ||= {};workflow.extra.h3_visual_request={pageId:project.pageId,pageName:project.name,groupId:g.id,groupNumber:g.number,prompt:request.plan.prompt,length:request.plan.length,mapping:request.plan.mapping};
   const response=await send(number,{output:request.prompt,workflow},options);if(!response?.prompt_id)throw Error('服务器未返回任务ID');g.job={state:'queued',promptId:response.prompt_id};preview.watch(response.prompt_id);persist();render();log(`当前组已通过ComfyUI运行按钮提交：${response.prompt_id}；结果将自动更新。`);
   const queuedPageId=project.pageId;void waitJob(response.prompt_id).then(history=>{if(disposed||g.job?.promptId!==response.prompt_id)return;g.job.state=history.status?.status_str==='success'?'done':'error';g.job.videos=resultVideos(history);g.job.originalVideos=originalVideos(history);persist();if(project.pageId===queuedPageId){render();if(g.job.videos[0])preview.video(view({...g.job.videos[0],type:'output'}),'当前组视频已完成，可播放声音');}}).catch(error=>{if(!disposed)log('结果自动查询中断：'+error.message+'；可点击查询已提交任务。');});return response;
  }finally{setBusy(false);}
 },refresh(){try{workspace=readWorkspace(widget.value);project=workspace.pages.find(p=>p.pageId===workspace.activePageId);selected=0;syncSettings();render();}catch(error){log('工程数据错误：'+error.message);}},dispose(){if(expanded)toggleExpanded(false);disposed=true;stop=true;updater.dispose();executionHealth.dispose();window.removeEventListener('h3-plugin-update-state',updateStateChanged);batchController.dispose();progressTracker.dispose();downloader.dispose();proxyController.dispose();dependencyController.dispose();finishingController.dispose();resourceEditor.dispose();commonResourceEditor.dispose();preview.dispose();document.removeEventListener('keydown',escape);placeholder?.remove();host.remove();}};states.set(node,state);render();setTimeout(()=>{if(!disposed)void batchController.query({discover:true});},0);
}
app.registerExtension({name:'H3.Visual.Studio.Official',setup(){
 const send=api.queuePrompt.bind(api);
 api.queuePrompt=async function(number,data,options){
  const visual=(data?.workflow?.nodes||[]).filter(n=>n.type==='H3VisualProject');
  if(!visual.length||preparedRequests.has(data.output))return send(number,data,options);
  if(visual.length!==1)throw Error('一个官方工作流只能放一个可视化工作室节点');
  const node=(app.graph?._nodes||[]).find(n=>String(n.id)===String(visual[0].id));
  const controller=states.get(node);if(!controller)throw Error('可视化节点尚未初始化，请重新打开工作流');
  return controller.queueCurrent(number,data,send,options);
 };
},beforeRegisterNodeDef(NodeType,data){if(data.name!=='H3VisualProject')return;
 const created=NodeType.prototype.onNodeCreated;NodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);attach(this);return result;};
 const configure=NodeType.prototype.onConfigure;NodeType.prototype.onConfigure=function(){const result=configure?.apply(this,arguments);states.get(this)?.refresh();return result;};
 const removed=NodeType.prototype.onRemoved;NodeType.prototype.onRemoved=function(){states.get(this)?.dispose();return removed?.apply(this,arguments);};
}});

export const controllerForNode=node=>states.get(node);
