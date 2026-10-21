import {modelChoices,modelReport,assertModels} from './model-check.mjs?v=0.15.3';
export const defaultImageSettings=()=>({engine:'qwen_image_2_1',model:'qwen_image_2.1_turbo_int8_convrot.safetensors',clip:'qwen3vl_8b_w4a8.safetensors',vae:'qwen_image_2.1_vae_bf16.safetensors',width:768,height:1024,steps:8,seed:666,sampler:'euler',scheduler:'simple',cfg:1,cacheDevice:'auto',cacheDtype:'default',negativePrompt:'',
 style:'日本电视动画番剧角色设定图，清晰线稿，赛璐璐上色，人物身份与服装细节清楚，单个人物，全身或四分之三身，正面自然站姿，简洁中性灰背景。不要文字、水印、字幕、分镜拼贴或其他人物。'});
export function normalizeImageSettings(raw={}){
 const defaults=defaultImageSettings();
 if(raw.model==='z_image_turbo_bf16.safetensors')return {...defaults,...Object.fromEntries(['width','height','seed','style'].filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]))};
 return {...defaults,...raw};
}
const pictureTags=/<\s*Picture\s+\d+\s*>|@图片\d+(?:\.(?:png|jpe?g|webp))?/gi;
export function discoverCharacters(project){
 const text=[project.commonPrompt,...project.groups.map(g=>g.prompt)].filter(Boolean).join('\n');
 const byId=new Map();
 const re=/([\p{Script=Han}A-Za-z·]{1,12})\s*[（(]\s*S(\d+)\s*[)）]/gu;
 const ignored=/(?:参考|保持|角色|固定|声线|描述|只有|以及|随后|此时|镜头中的|是)$/;
 for(const match of text.matchAll(re)){
  let name=match[1];
  // Names immediately after prose are deliberately conservative; the editor can refine them.
  name=name.replace(/^(?:随后|此时|只有|以及|同一角色|角色|由|让|与|和|及|男主|女主)/,'');
  if(!name||ignored.test(name))continue;
  const id='S'+match[2];if(byId.has(id))continue;
  const previous=(project.characters||[]).find(c=>c.id===id);
  const sentences=text.split(/[。！？\n]/).filter(s=>s.includes(name)&&!s.includes('<d>')&&!/声线一致性|音区|咬字|共鸣|响度/.test(s)).slice(0,3).join('。').replace(pictureTags,'').slice(0,1200);
  byId.set(id,previous||{id,name,description:sentences?`仅从以下文字提取${name}的外貌与服装；忽略其他人物、动作、机位及背景，不画文字。\n${sentences}`:`角色${name}。外貌、年龄、发型、衣着依本页提示词中的视觉描述；图中只有该角色，不把声线说明画成文字。`,reference:null});
 }
 if(!byId.size){
  for(const m of text.matchAll(/\bS(\d+)\b/g)){const id='S'+m[1];if(byId.has(id))continue;const old=(project.characters||[]).find(c=>c.id===id);byId.set(id,old||{id,name:'角色'+id,description:`根据本页镜头文字描绘角色${id}的外貌与服装，单人角色参考图。请补充明确的外貌、发型和衣着。`,reference:null});}
 }
 return [...byId.values()].sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
}
export function imageRecipe(project,character){return JSON.stringify({version:2,name:character.name,description:character.description,settings:project.imageSettings});}
export function referenceReady(project,character){return !!character.reference?.file&&character.reference.recipe===imageRecipe(project,character)&&project.media.images.some(r=>r.id===character.reference.pictureId&&r.file===character.reference.file);}
export function charactersForGroup(project,group){
 const text=[project.commonPrompt,group.prompt].filter(Boolean).join('\n');
 const all=project.characters||[];
 const found=all.filter(c=>text.includes(c.name)||new RegExp('(?:^|[^A-Za-z0-9])'+c.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^A-Za-z0-9])').test(text));
 return found.length?found:all;
}
export function videoWithCharacters(project,group){
 if(project.mode!=='auto_character')return {project,group};
 const chosen=charactersForGroup(project,group);
 if(!chosen.length)throw Error('生图模式尚未识别人物，请先识别或添加人物设定');
 if(chosen.length>9)throw Error('本组人物参考超过9张，请明确分组人物');
 if(chosen.some(c=>!referenceReady(project,c)))throw Error('人物参考图尚未生成或设定已变更，需先生成人物图');
 const rows=chosen.map(c=>project.media.images.find(r=>r.id===c.reference.pictureId));
 const prefix='人物外貌身份参考：'+chosen.map(c=>`<Picture ${c.reference.pictureId}>对应${c.name}（${c.id}）`).join('；')+'。仅参考人物外貌与服装，背景、机位、动作以本组文字为准，不因提供参考而增加出场人物，不继承参考图的中性背景。';
 return {project:{...project,mode:'reference',commonPrompt:String(project.commonPrompt||'').replace(pictureTags,''),media:{...project.media,images:rows}},group:{...group,prompt:prefix+'\n'+String(group.prompt||'').replace(pictureTags,'')}};
}
export function compileCharacterImage(project,character){
 const s=normalizeImageSettings(project.imageSettings);
 if(!character.name?.trim()||!character.description?.trim())throw Error('人物名称和外貌设定不能为空');
 if(![s.width,s.height].every(n=>Number.isInteger(n)&&n>=64&&n<=4096&&n%16===0))throw Error('生图宽高需为64—4096范围内16的整数倍');
 if(!Number.isInteger(s.steps)||s.steps<1||s.steps>100||!Number.isSafeInteger(s.seed)||s.seed<0)throw Error('生图步数或种子无效');
 if(s.engine!=='qwen_image_2_1'||!/qwen_image_2\.1/i.test(s.model))throw Error('生图链路仅支持Qwen-Image-2.1，请使用专用模型配置');
 if(!Number.isFinite(s.cfg)||s.cfg<0||s.cfg>20||!['auto','gpu','cpu','off'].includes(s.cacheDevice)||!['default','int8','int4'].includes(s.cacheDtype))throw Error('生图CFG或Qwen缓存设置无效');
 for(const key of ['model','clip','vae'])if(!s[key]?.trim())throw Error('生图模型文件名未配置');
 const ordinal=String(character.id).split('').reduce((n,ch)=>(n*31+ch.charCodeAt(0))%100000,0);
 const seed=s.seed+ordinal;if(!Number.isSafeInteger(seed))throw Error('生图种子过大');
 const promptText=[s.style,`人物：${character.name}（身份标识${character.id}，标识不画在图中）。`,character.description,'只描绘这一个人物。只输出画面，不写台词、姓名或说明文字。'].join('\n');
 const safe=String(project.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80)||'page';
 const api={
  '201':{class_type:'UNETLoader',inputs:{unet_name:s.model,weight_dtype:'default'}},
  '202':{class_type:'CLIPLoader',inputs:{clip_name:s.clip,type:'qwen_image',device:'default'}},
  '203':{class_type:'VAELoader',inputs:{vae_name:s.vae}},
  '204':{class_type:'TextEncodeQwenImage21',inputs:{clip:['202',0],prompt:promptText,negative_prompt:s.negativePrompt||'',resolution:1024}},
  '206':{class_type:'EmptyLatentImage',inputs:{width:s.width,height:s.height,batch_size:1}},
  '207':{class_type:'QwenImage21Cache',inputs:{model:['201',0],device:s.cacheDevice,dtype:s.cacheDtype}},
  '208':{class_type:'KSampler',inputs:{model:['207',0],positive:['204',0],negative:['204',1],latent_image:['206',0],seed,steps:s.steps,cfg:s.cfg,sampler_name:s.sampler,scheduler:s.scheduler,denoise:1}},
  '209':{class_type:'VAEDecode',inputs:{samples:['208',0],vae:['203',0]}},
  '210':{class_type:'SaveImage',inputs:{images:['209',0],filename_prefix:`H3_Characters/${safe}/${character.id}`}},
 };
 return {prompt:api,recipe:imageRecipe(project,character),promptText};
}
export function checkImageModels(info,settings){
 const project={name:'模型检查',imageSettings:normalizeImageSettings(settings)};
 const {prompt}=compileCharacterImage(project,{id:'CHECK',name:'模型检查',description:'仅检查，不生成'});
 assertModels(modelReport(info,[prompt]));
 const types=modelChoices(info.CLIPLoader,'type');
 if(Array.isArray(types)&&!types.includes('qwen_image'))throw Error('当前ComfyUI不支持Qwen编码器类型，请更新ComfyUI');
}
export function generatedImage(history){
 for(const [id,value] of Object.entries(history?.outputs||{}))if(id==='210')for(const row of value.images||[])if(row.type==='output'&&/\.(png|jpe?g|webp)$/i.test(row.filename||''))return row;
 throw Error('生图任务没有返回有效图片，停止后续视频');
}
