import {defaultVoices} from './dialogue.mjs?v=0.15.27';
import {applyDirectorPreset} from './director-recipe.mjs?v=0.15.27';
import {directorCoreRequest} from './director-core.mjs?v=0.15.27';
import {defaultSelfLift} from './selflift.mjs?v=0.15.27';
import {defaultImageSettings,normalizeImageSettings,videoWithCharacters} from './characters.mjs?v=0.15.27';
import {accelerateApi,effectiveVideoSettings,accelerationMode} from './acceleration.mjs?v=0.15.27';
import {defaultFinishing,isOriginalVideo} from './finishing.mjs?v=0.15.27';
const TAGS = [
  ['images','Picture','图片',9],['audios','Audio','音频',3],['videos','Video','视频',3],
];
export const defaultProject = () => applyDirectorPreset({version:1,name:'未命名项目',mode:'reference',autoMerge:false,finishing:{...defaultFinishing(),refine:false,upscale:'off'},selflift:defaultSelfLift(),characters:[],imageSettings:defaultImageSettings(),commonPrompt:'',audioReference:false,voiceSettings:defaultVoices(),
  settings:{width:864,height:480,steps:8,seed:666,sampler:'euler',scheduler:'simple',acceleration:'inherit'},
  media:{images:[],audios:[],videos:[]},groups:[]},true);
export function readProject(raw) {
  const base=defaultProject();
  const value=typeof raw==='string' ? JSON.parse(raw || '{}') : structuredClone(raw || {});
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('工程必须为JSON对象');
  const result={...base,...value,imageSettings:normalizeImageSettings(value.imageSettings),settings:{...base.settings,...value.settings},media:{...base.media,...value.media}};
  // Missing presets adopt the current default; explicit saved choices remain unchanged.
  const finishing={...base.finishing,...value.finishing};
  if(value.finishing&&value.finishing.defaultsVersion!==1)Object.assign(finishing,{defaultsVersion:1,refine:true,upscale:'latent',chunking:true,steps:4});
  result.finishing=finishing;result.selflift={...defaultSelfLift(),enabled:false,...value.selflift};
  if(!['reference','auto_character'].includes(result.mode)||!Array.isArray(result.characters))throw Error('工作流模式或人物列表无效');
  accelerationMode(result.settings);
  if(!Array.isArray(result.groups)||TAGS.some(([key])=>!Array.isArray(result.media[key])))throw Error('工程素材或分组格式错误');
  const ids=new Set();
  for(const g of result.groups){if(!g.id||ids.has(g.id))throw Error('分组ID缺失或重复');ids.add(g.id);}
  for(const [key] of TAGS){const ids=new Set();for(const row of result.media[key]){if(!Number.isInteger(row.id)||row.id<1||ids.has(row.id))throw Error('公共素材编号重复或无效');ids.add(row.id);}}
  return result;
}
export function readWorkspace(raw) {
  const value=typeof raw==='string'?JSON.parse(raw||'{}'):structuredClone(raw||{});
  if(Array.isArray(value.pages)){
    if(!value.pages.length)throw Error('工作区至少需要一页');
    const ids=new Set();
    const pages=value.pages.map((row,i)=>{const page=readProject(row);page.pageId=row.pageId||'page-'+i;if(ids.has(page.pageId))throw Error('页面ID重复');ids.add(page.pageId);return page;});
    const shared={};
    for(const [key,field] of [['images','sharedImages'],['audios','sharedAudios'],['videos','sharedVideos']])if(value[field]){const pool=readProject({media:{[key]:value[field]}}).media[key];shared[field]=pool;for(const page of pages){page.media[key]=pool;if(key==='images')page.projectImageLibrary=true;}}
    return {version:1,...shared,pages,activePageId:ids.has(value.activePageId)?value.activePageId:pages[0].pageId};
  }
  const page=readProject(value);page.pageId=page.pageId||'page-initial';
  return {version:1,pages:[page],activePageId:page.pageId};
}
export function workspaceData(workspace){return {...workspace,pages:workspace.pages.map(p=>{const media={...p.media};for(const [key,field] of [['images','sharedImages'],['audios','sharedAudios'],['videos','sharedVideos']])if(workspace[field])media[key]=[];return {...p,media};})};}
export function bindSharedMedia(workspace,page){for(const [key,field] of [['images','sharedImages'],['audios','sharedAudios'],['videos','sharedVideos']])if(workspace[field]){page.media[key]=workspace[field];if(key==='images')page.projectImageLibrary=true;}return page;}
export function mergePages(workspace,incoming){
  const next=readWorkspace(workspace);
  for(const page of incoming){
    const valid=readProject(page);
    valid.pageId=page.pageId;
    if(!valid.pageId)throw Error('新页面缺少ID');
    const index=next.pages.findIndex(p=>p.pageId===valid.pageId);
    if(index<0)next.pages.push(valid);else next.pages[index]=valid;
  }
  if(incoming.length)next.activePageId=incoming[0].pageId;
  return readWorkspace(next);
}
export function validFrames(seconds) {
  if(!Number.isFinite(seconds)||seconds<0.2||seconds>20.7)throw Error('时长应在0.2—20.7秒之间');
  const n=Math.max(5,Math.round(seconds*24));return n+(5-n%17+17)%17;
}
export function planGroup(project,group) {
  const s=project.settings;
  if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<32||s.height<32||s.width%32||s.height%32)throw Error('宽高必须为32的正整数倍');
  if(!Number.isInteger(s.steps)||s.steps<1||s.steps>1000)throw Error('采样步数无效');
  if(!Number.isSafeInteger(s.seed)||s.seed<0)throw Error('种子需为非负安全整数');
  let prompt=[project.commonPrompt,group.prompt].filter(Boolean).join('\n').trim();
  if(!prompt)throw Error('提示词不能为空');
  const plan={id:group.id,groupNumber:group.number,seconds:Number(group.seconds),fps:24,length:validFrames(Number(group.seconds)),mapping:{},images:[],audios:[],videos:[]};
  for(const [key,tag,label,limit] of TAGS){
    const re=new RegExp(`<\\s*${tag}\\s+(\\d+)\\s*>|@${label}(\\d+)(?:\\.(?:png|jpe?g|webp|wav|mp3|flac|ogg|m4a|aac|mp4|mov|webm|mkv))?`,'gi');
    const pool=project.media[key],byId=new Map(pool.map(row=>[row.id,row]));
    let wanted=[...new Set([...prompt.matchAll(re)].map(m=>Number(m[1]||m[2])))];
    if(key==='audios'&&!project.audioReference){prompt=prompt.replace(re,'');plan.mapping[tag]={};continue;}
    if(!wanted.length&&key==='images'&&!project.projectImageLibrary)wanted=pool.map(row=>row.id).sort((a,b)=>a-b);
    if(wanted.length>limit)throw Error(`本组最多引用${limit}份${label}；公共库不限数量，请明确选择所需编号`);
    if(wanted.some(id=>!byId.has(id)||!byId.get(id).file))throw Error(`本组引用的${label}未上传或不存在`);
    const mapping=Object.fromEntries(wanted.map((id,i)=>[id,i+1]));
    plan.mapping[tag]=mapping;plan[key]=wanted.map(id=>byId.get(id));
    prompt=prompt.replace(re,(_,a,b)=>`<${tag} ${mapping[Number(a||b)]}>`);
  }
  plan.prompt=prompt;return plan;
}
const refKey = key => key!=='ref_image_size' && /^(?:ref_images|ref_audios|ref_videos|ref_video_audios)(?:\.|$)|^ref_(?:image|audio|video)_/.test(key);
function onlyAncestors(prompt,outputs){
  const keep=new Set();
  function visit(id){id=String(id);if(keep.has(id))return;const node=prompt[id];if(!node)throw Error('官方连线指向不存在的节点 '+id);keep.add(id);for(const value of Object.values(node.inputs||{}))if(Array.isArray(value)&&value.length===2&&typeof value[1]==='number'&&prompt[String(value[0])])visit(value[0]);}
  outputs.forEach(visit);return Object.fromEntries(Object.entries(prompt).filter(([id])=>keep.has(id)));
}
export function compileRequest(base,project,group) {
  ({project,group}=videoWithCharacters(project,group));
  const plan=planGroup(project,group),prompt=accelerateApi(base,project.settings),videoSettings=effectiveVideoSettings(project.settings);
  const entries=Object.entries(prompt);
  const targets=entries.filter(([,n])=>n.class_type==='MiniMaxH3ReferenceToVideo');
  if(targets.length!==1)throw Error('工作流需且只能包含一个官方 MiniMaxH3ReferenceToVideo 节点');
  if(entries.some(([,n])=>/MiniMaxH3Director/.test(n.class_type)))throw Error('请使用新官方工作流，不能混入旧导演台');
  const [targetId,target]=targets[0];
  const saves=entries.filter(([,n])=>n.class_type==='SaveVideo');
  if(saves.length!==1)throw Error('工作流需且只能包含一个官方 SaveVideo 节点');
  for(const [key] of TAGS)for(const row of plan[key])if(/(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|^[a-z]:/i.test(row.file))throw Error('素材必须是ComfyUI input中的相对路径');
  for(const key of Object.keys(target.inputs))if(refKey(key))delete target.inputs[key];
  Object.assign(target.inputs,{prompt:plan.prompt,length:plan.length,width:project.settings.width,height:project.settings.height});
  let next=Math.max(0,...Object.keys(prompt).map(id=>Number(id)||0));
  const add=(class_type,inputs)=>{const id=String(++next);prompt[id]={class_type,inputs};return id;};
  plan.images.forEach((row,i)=>{target.inputs[`ref_images.ref_image_${i}`]=[add('LoadImage',{image:row.file}),0];});
  plan.audios.forEach((row,i)=>{target.inputs[`ref_audios.ref_audio_${i}`]=[add('LoadAudio',{audio:row.file,audioUI:''}),0];});
  plan.videos.forEach((row,i)=>{const source=add('LoadVideo',{file:row.file});const components=add('GetVideoComponents',{video:[source,0]});target.inputs[`ref_videos.ref_video_${i}`]=[components,0];});
  for(const node of Object.values(prompt)){
    if(node.class_type==='BasicScheduler')node.inputs.steps=videoSettings.steps;
    if(node.class_type==='RandomNoise')node.inputs.noise_seed=project.settings.seed;
    if(node.class_type==='KSamplerSelect')node.inputs.sampler_name=videoSettings.sampler;
    if(node.class_type==='BasicScheduler')node.inputs.scheduler=videoSettings.scheduler;
    if(node.class_type==='CreateVideo')node.inputs.fps=24;
  }
  const [saveId,save]=saves[0];
  const safe=String(project.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80)||'project';
  save.inputs.filename_prefix=`${save.inputs.filename_prefix || 'video/H3_Visual'}/${safe}/group_${String(group.number).padStart(3,'0')}`;
  const result=onlyAncestors(prompt,[saveId]);
  if(!result[targetId])throw Error('保存节点没有连接到官方H3采样链路');
  // Generated audio must originate from VAEDecodeAudio, never from LoadAudio.
  const videoNodes=Object.values(result).filter(n=>n.class_type==='CreateVideo');
  if(videoNodes.length!==1)throw Error('官方保存链路需要一个CreateVideo');
  const source=result[String(videoNodes[0].inputs.audio?.[0])];
  if(source?.class_type!=='VAEDecodeAudio')throw Error('最终音轨必须连接官方VAEDecodeAudio，禁止参考音频直接作为成片原声');
  return {prompt:directorCoreRequest(result,{...project,settings:{...project.settings,...videoSettings}},plan,saveId),plan};
}
export function resultVideos(history) {
  const files=[];
  for(const output of Object.values(history?.outputs||{}))for(const key of ['images','videos','gifs'])for(const row of output?.[key]||[])if(/\.(mp4|webm|mov)$/i.test(row.filename||''))files.push(row);
  return files.filter(row=>!isOriginalVideo(row));
}
export function originalVideos(history){const files=[];for(const output of Object.values(history?.outputs||{}))for(const key of ['images','videos','gifs'])for(const row of output?.[key]||[])if(/\.(mp4|webm|mov)$/i.test(row.filename||'')&&isOriginalVideo(row))files.push(row);return files;}
export async function runSequential({groups,submit,wait,shouldStop=()=>false,onState=()=>{}}) {
  for(const group of groups){
    if(shouldStop())break;
    const queued=await submit(group);
    if(!queued?.prompt_id)throw Error('服务器未返回任务ID，已停止，避免重复提交');
    onState(group,'queued',queued);
    const history=await wait(queued.prompt_id);
    if(history?.status?.status_str!=='success'||history?.status?.completed!==true){onState(group,'error',history);throw Error('素材组'+group.number+'生成失败，已停止后续提交');}
    onState(group,'done',history);
  }
}
