export const defaultImageSettings=()=>({model:'z_image_turbo_bf16.safetensors',clip:'qwen_3_4b.safetensors',vae:'ae.safetensors',width:768,height:1024,steps:8,seed:666,sampler:'res_multistep',scheduler:'simple',shift:3,
 style:'日本电视动画番剧角色设定图，清晰线稿，赛璐璐上色，人物身份与服装细节清楚，单个人物，全身或四分之三身，正面自然站姿，简洁中性灰背景。不要文字、水印、字幕、分镜拼贴或其他人物。'});
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
export function imageRecipe(project,character){return JSON.stringify({version:1,name:character.name,description:character.description,settings:project.imageSettings});}
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
 const s=project.imageSettings;
 if(!character.name?.trim()||!character.description?.trim())throw Error('人物名称和外貌设定不能为空');
 if(![s.width,s.height].every(n=>Number.isInteger(n)&&n>=64&&n<=4096&&n%16===0))throw Error('生图宽高需为64—4096范围内16的整数倍');
 if(!Number.isInteger(s.steps)||s.steps<1||s.steps>100||!Number.isSafeInteger(s.seed)||s.seed<0)throw Error('生图步数或种子无效');
 for(const key of ['model','clip','vae'])if(!s[key]?.trim())throw Error('生图模型文件名未配置');
 const ordinal=String(character.id).split('').reduce((n,ch)=>(n*31+ch.charCodeAt(0))%100000,0);
 const seed=s.seed+ordinal;if(!Number.isSafeInteger(seed))throw Error('生图种子过大');
 const promptText=[s.style,`人物：${character.name}（身份标识${character.id}，标识不画在图中）。`,character.description,'只描绘这一个人物。只输出画面，不写台词、姓名或说明文字。'].join('\n');
 const safe=String(project.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80)||'page';
 const api={
  '201':{class_type:'UNETLoader',inputs:{unet_name:s.model,weight_dtype:'default'}},
  '202':{class_type:'CLIPLoader',inputs:{clip_name:s.clip,type:'lumina2',device:'default'}},
  '203':{class_type:'VAELoader',inputs:{vae_name:s.vae}},
  '204':{class_type:'CLIPTextEncode',inputs:{clip:['202',0],text:promptText}},
  '205':{class_type:'ConditioningZeroOut',inputs:{conditioning:['204',0]}},
  '206':{class_type:'EmptySD3LatentImage',inputs:{width:s.width,height:s.height,batch_size:1}},
  '207':{class_type:'ModelSamplingAuraFlow',inputs:{model:['201',0],shift:s.shift}},
  '208':{class_type:'KSampler',inputs:{model:['207',0],positive:['204',0],negative:['205',0],latent_image:['206',0],seed,steps:s.steps,cfg:1,sampler_name:s.sampler,scheduler:s.scheduler,denoise:1}},
  '209':{class_type:'VAEDecode',inputs:{samples:['208',0],vae:['203',0]}},
  '210':{class_type:'SaveImage',inputs:{images:['209',0],filename_prefix:`H3_Characters/${safe}/${character.id}`}},
 };
 return {prompt:api,recipe:imageRecipe(project,character),promptText};
}
export function checkImageModels(info,settings){
 for(const name of ['UNETLoader','CLIPLoader','VAELoader','CLIPTextEncode','ConditioningZeroOut','EmptySD3LatentImage','ModelSamplingAuraFlow','KSampler','VAEDecode','SaveImage'])if(!info[name])throw Error('缺少官方生图节点 '+name+'，请更新ComfyUI');
 for(const [node,field,key] of [['UNETLoader','unet_name','model'],['CLIPLoader','clip_name','clip'],['VAELoader','vae_name','vae']]){const values=info[node]?.input?.required?.[field]?.[0];if(Array.isArray(values)&&!values.includes(settings[key]))throw Error('云端未安装生图模型 '+settings[key]+'；请按模型说明下载，未提交生图或视频');}
}
export function generatedImage(history){
 for(const [id,value] of Object.entries(history?.outputs||{}))if(id==='210')for(const row of value.images||[])if(row.type==='output'&&/\.(png|jpe?g|webp)$/i.test(row.filename||''))return row;
 throw Error('生图任务没有返回有效图片，停止后续视频');
}
