export const defaultVoices=()=>({voices:[{speaker:'S2',name:'沈亦辰',file:'',filename:''},{speaker:'S3',name:'林知夏',file:'',filename:''}]});
export function dialogueEvents(prompt,voices,seconds){
 const events=[];let prior=0;if(!voices.some(v=>v.file))return events;
 const matcher=/<d>\s*\[([^\]]+)\]([\s\S]*?)<\/d>/gi;
 for(const match of prompt.matchAll(matcher)){
  const prefix=prompt.slice(prior,match.index);prior=match.index+match[0].length;
  const windows=[...prefix.matchAll(/(\d+(?:\.\d+)?)\s*[～~–—-]\s*(\d+(?:\.\d+)?)\s*秒/g)];
  const candidates=[];for(const voice of voices){for(const label of [voice.speaker,voice.name,voice.name?.replace(/^林|^沈/,'')].filter(Boolean)){const index=prefix.lastIndexOf(label);if(index>=0)candidates.push({index,voice});}}candidates.sort((a,b)=>b.index-a.index);if(!candidates[0]?.voice.file)continue;
  const window=windows.at(-1);if(!window)throw Error('每句对白前需写明起止秒数，才能自动配音锁定');
  const start=Number(window[1]),end=Number(window[2]);
  if(end<=start||start<0||end>seconds+1e-6||start<(events.at(-1)?.end||0))throw Error('对白时间窗越界或重叠，请调整提示词时间线');
  const owner=prefix.slice(window.index);const choices=[];
  for(const voice of voices){for(const label of [voice.speaker,voice.name,voice.name?.replace(/^林|^沈/,'')].filter(Boolean)){const index=owner.lastIndexOf(label);if(index>=0)choices.push({index,voice});}}
  choices.sort((a,b)=>b.index-a.index);const voice=choices[0]?.voice;
  if(!voice)throw Error('无法确定对白说话角色，请在说话前写姓名和(S编号)');
  if(!voice.file)throw Error('请上传'+voice.name+'('+voice.speaker+')已选定的声音样本');
  if(/(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|^[a-z]:/i.test(voice.file))throw Error('声音样本须位于ComfyUI input内');
  const text=match[2].trim();if(!text)throw Error('对白不能为空');
  const language=({japanese:'Japanese',chinese:'Chinese',english:'English'})[match[1].trim().toLowerCase()];if(!language)throw Error('配音锁定暂支持Japanese、Chinese、English');
  events.push({speaker:voice.speaker,start,end,text,language,reference:voice.file});
 }
 if(events.length>64)throw Error('每段最多64句配音');return events;
}
export function compileDialogue(add,project,plan){
 const events=dialogueEvents(plan.prompt,project.voiceSettings?.voices||[],plan.seconds);if(!events.length)return null;
 if(project.selflift?.enabled)throw Error('自动配音锁定暂不支持SelfLift，请关闭后生成');
 const audioInputs={},references=new Map();
 events.forEach((event,i)=>{if(!references.has(event.reference))references.set(event.reference,add('LoadAudio',{audio:event.reference,audioUI:''}));const audio=add('H3QwenClone',{reference_audio:references.get(event.reference),text:event.text,language:event.language,seed:(project.settings.seed+i)%4294967296});audioInputs['audio_'+i]=audio;});
 return add('H3PrepareDialogue',{timeline_json:JSON.stringify(events.map(({speaker,start,end})=>({speaker,start,end}))),...audioInputs});
}
export function mountVoiceSettings({container,getProject,persist,upload,isBusy,log}){
 const card=document.createElement('div');card.className='library';card.id='voice-settings';const title=document.createElement('h3');title.textContent='固定声线配音 → 锁对白生成画面';
 const help=document.createElement('p');help.className='muted';help.textContent='在额外试听JSON中选好声音、下载后上传到对应角色。有样本的角色自动克隆台词并锁定，没有样本的角色由H3配音；自然配音超过时间窗时停止，不截字、不强行加速。需Qwen独立运行环境与ExactAudioLock节点。';const list=document.createElement('div');const add=document.createElement('button');add.textContent='添加配音角色';card.append(title,help,list,add);container.prepend(card);
 const config=()=>{const p=getProject();p.voiceSettings||=defaultVoices();return p.voiceSettings;};
 add.onclick=()=>{if(isBusy())return;config().voices.push({speaker:'S'+(Math.max(0,...config().voices.map(v=>Number(v.speaker.slice(1))||0))+1),name:'新角色',file:'',filename:''});persist();sync();};
 function sync(){add.disabled=isBusy();list.replaceChildren();for(const voice of config().voices){const row=document.createElement('div');row.className='row';const speaker=document.createElement('input');speaker.value=voice.speaker;speaker.placeholder='S编号';speaker.style.width='60px';const name=document.createElement('input');name.value=voice.name;name.placeholder='角色姓名';name.style.width='100px';speaker.disabled=name.disabled=isBusy();speaker.onchange=()=>{voice.speaker=speaker.value.trim();persist();};name.onchange=()=>{voice.name=name.value.trim();persist();};const file=document.createElement('input');file.type='file';file.accept='.wav,.mp3,.flac,.ogg,.m4a';file.hidden=true;const button=document.createElement('button');button.textContent=voice.file?'更换声音样本':'上传已选声音';button.disabled=isBusy();const status=document.createElement('span');status.textContent=voice.filename||voice.file||'未上传：由H3配音';const remove=document.createElement('button');remove.textContent='移除';remove.disabled=isBusy();remove.onclick=()=>{config().voices=config().voices.filter(v=>v!==voice);persist();sync();};button.onclick=()=>file.click();file.onchange=async()=>{const selected=file.files[0];if(!selected)return;button.disabled=true;try{voice.file=await upload(selected);voice.filename=selected.name;persist();log(voice.name+'的固定声音样本已保存；下次直接生成实际对白');}catch(error){log(error.message);}finally{sync();}};row.append(speaker,name,button,status,remove,file);list.append(row);}}
 sync();return {sync};
}
