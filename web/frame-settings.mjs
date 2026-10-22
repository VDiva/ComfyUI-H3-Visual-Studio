export function mountFrameSettings({container,getGroup,persist,upload,isBusy,log}){
 const card=document.createElement('div');card.className='library';card.id='frame-settings';const title=document.createElement('strong');title.textContent='当前组首尾帧';card.append(title);
 const help=document.createElement('p');help.className='muted';help.textContent='可单独使用首帧、尾帧或同时使用两张；需匹配FL2V模型。此模式不叠加公共@素材引用，请先移除引用。连续镜头可让前段尾帧与后段首帧使用同一张图；序列中的空组可在开启段间引导后引用上段末尾运动。';card.append(help);
 const controls=[];
 for(const [key,label] of [['firstFrame','首帧'],['lastFrame','尾帧']]){
  const row=document.createElement('div');row.className='row';const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
  const button=document.createElement('button');button.textContent='上传'+label;const clear=document.createElement('button');clear.textContent='清除'+label;const status=document.createElement('span');row.append(button,clear,status,file);card.append(row);
  button.onclick=()=>file.click();clear.onclick=()=>{const g=getGroup();if(isBusy()||!g)return;delete g[key];persist();sync();};
  file.onchange=async()=>{const g=getGroup(),selected=file.files[0];if(isBusy()||!g||!selected)return;button.disabled=true;try{g[key]={file:await upload(selected),name:selected.name};persist();sync();}catch(e){log(e.message);}finally{file.value='';sync();}};
  controls.push({key,button,clear,status});
 }
 function sync(){const g=getGroup();for(const c of controls){c.button.disabled=isBusy()||!g;c.clear.disabled=isBusy()||!g?.[c.key];c.status.textContent=g?.[c.key]?.name||g?.[c.key]?.file||'未设置';}}
 container.prepend(card);return {sync};
}
