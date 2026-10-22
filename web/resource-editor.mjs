const kinds={图片:['images','Picture'],音频:['audios','Audio'],视频:['videos','Video']};
export function resourceSuggestions(media,query=''){
 const rows=[];for(const [label,[key,tag]] of Object.entries(kinds))for(const item of media[key]||[]){const token='@'+label+item.id;rows.push({...item,key,tag,token,label:token+' · '+(item.name||item.file||'')});}
 const q=query.toLowerCase();return rows.filter(row=>row.label.toLowerCase().includes(q)||row.token.slice(1).includes(query));
}
export function mentionQuery(text,caret){const match=text.slice(0,caret).match(/@([^@\s<>，。；！？、：()（）]{0,80})$/);return match?{start:caret-match[0].length,end:caret,query:match[1]}:null;}
export function resourceTokens(text,media){
 const regex=/@(图片|音频|视频)(\d+)(?:\.(?:png|jpe?g|webp|wav|mp3|flac|ogg|m4a|aac|mp4|mov|webm|mkv))?|<\s*(Picture|Audio|Video)\s+(\d+)\s*>/gi;
 const rows=[];for(const m of text.matchAll(regex)){const key=m[1]?kinds[m[1]][0]:({picture:'images',audio:'audios',video:'videos'})[m[3].toLowerCase()];const id=Number(m[2]||m[4]);rows.push({start:m.index,end:m.index+m[0].length,key,id,exists:(media[key]||[]).some(r=>r.id===id)});}return rows;
}
export function attachResourceEditor({textarea,getMedia}){
 const style=document.createElement('style');style.textContent=`.resource-editor{position:relative;flex:1;min-height:220px;background:#0b141d;border-radius:6px;overflow:hidden}.resource-editor textarea{position:absolute!important;inset:0;width:100%;height:100%;min-height:0!important;margin:0;background:transparent!important;color:transparent!important;-webkit-text-fill-color:transparent;caret-color:#fff;resize:none!important;font:inherit;line-height:1.65;tab-size:4}.resource-editor textarea::selection{background:#32718c88}.resource-editor pre{position:absolute;inset:0;margin:0;padding:7px;font:inherit;line-height:1.65;tab-size:4;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;overflow:hidden;color:#dce6ee;pointer-events:none}.ref-images{color:#71e3bc;background:#164f423d;border-radius:3px}.ref-audios{color:#c7a0ff;background:#57377e3d;border-radius:3px}.ref-videos{color:#77c8ff;background:#2355763d;border-radius:3px}.ref-missing{color:#ffb27e;text-decoration:underline wavy #e89969}.resource-menu{box-sizing:border-box;position:absolute;left:0;top:0;z-index:10;width:min(350px,85%);max-height:220px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;background:#182d3a;border:1px solid #538174;border-radius:8px;padding:5px;box-shadow:0 8px 22px #0009}.resource-menu::-webkit-scrollbar{width:12px}.resource-menu::-webkit-scrollbar-track{background:#13232f;border-radius:6px}.resource-menu::-webkit-scrollbar-thumb{background:#63877d;border:2px solid #13232f;border-radius:6px}.resource-menu[hidden]{display:none}.resource-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:8px}.resource-menu button.active{background:#28564c}.resource-menu small{display:block;color:#9eb8c8;padding:4px 8px}`;
 const wrapper=document.createElement('div');wrapper.className='resource-editor';textarea.before(style,wrapper);const mirror=document.createElement('pre');mirror.setAttribute('aria-hidden','true');const menu=document.createElement('div');menu.className='resource-menu';menu.hidden=true;menu.setAttribute('role','listbox');textarea.setAttribute('aria-autocomplete','list');wrapper.append(mirror,textarea,menu);
 const caretMirror=document.createElement('div');caretMirror.setAttribute('aria-hidden','true');caretMirror.style.cssText='position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;';wrapper.append(caretMirror);
 let rows=[],selected=0,query=null,composing=false,closed=false,menuInteracting=false,scrollDrag=null;
 function positionMenu(){
  if(menu.hidden||!query)return;
  const css=getComputedStyle(textarea);
  for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','tabSize','textIndent','textTransform','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','direction'])caretMirror.style[key]=css[key];
  caretMirror.style.borderStyle='solid';caretMirror.style.borderColor='transparent';caretMirror.style.width=textarea.offsetWidth+'px';
  caretMirror.replaceChildren(document.createTextNode(textarea.value.slice(0,query.start)));
  const marker=document.createElement('span');marker.textContent='@';caretMirror.append(marker);
  const box=wrapper.getBoundingClientRect(),point=marker.getBoundingClientRect();
  const x=point.left-box.left-textarea.scrollLeft,y=point.top-box.top-textarea.scrollTop;
  const line=parseFloat(css.lineHeight)||parseFloat(css.fontSize)*1.65;
  if(y+line<0||y>wrapper.clientHeight){hide();return;}
  const below=wrapper.clientHeight-y-line-6,above=y-6,up=below<100&&above>below;
  menu.style.maxHeight=Math.max(36,Math.min(220,up?above:below))+'px';
  menu.style.left=Math.max(4,Math.min(x,wrapper.clientWidth-menu.offsetWidth-6))+'px';
  menu.style.top=Math.max(4,up?y-menu.offsetHeight-4:y+line+4)+'px';
 }
 const stopPropagation=e=>e.stopPropagation();
 const menuDown=e=>{
  menuInteracting=true;e.stopPropagation();
  const rect=menu.getBoundingClientRect();
  if(e.button!==0||e.clientX<rect.left+menu.clientLeft+menu.clientWidth||menu.scrollHeight<=menu.clientHeight)return;
  e.preventDefault();
  const height=menu.clientHeight,max=menu.scrollHeight-height,thumb=Math.max(20,height*height/menu.scrollHeight),travel=height-thumb;
  const y=e.clientY-rect.top-menu.clientTop,top=menu.scrollTop/max*travel;
  if(y<top||y>top+thumb)menu.scrollTop=Math.max(0,Math.min(max,(y-thumb/2)/travel*max));
  scrollDrag={id:e.pointerId,y:e.clientY,top:menu.scrollTop,scale:max/travel};menu.setPointerCapture(e.pointerId);
 };
 const menuMove=e=>{if(scrollDrag?.id===e.pointerId){e.preventDefault();e.stopPropagation();menu.scrollTop=scrollDrag.top+(e.clientY-scrollDrag.y)*scrollDrag.scale;}};
 const pointerUp=()=>{menuInteracting=false;scrollDrag=null;};
 const outside=e=>{if(!e.composedPath().includes(menu)&&!e.composedPath().includes(textarea))hide();};
 menu.addEventListener('pointerdown',menuDown);menu.addEventListener('pointermove',menuMove);
 menu.addEventListener('wheel',stopPropagation,{passive:true});
 textarea.ownerDocument.addEventListener('pointerup',pointerUp,true);
 textarea.ownerDocument.addEventListener('pointercancel',pointerUp,true);
 textarea.ownerDocument.addEventListener('pointerdown',outside,true);
 function sync(){const text=textarea.value;mirror.replaceChildren();let end=0;for(const token of resourceTokens(text,getMedia())){mirror.append(document.createTextNode(text.slice(end,token.start)));const span=document.createElement('span');span.className=token.exists?'ref-'+token.key:'ref-missing';span.textContent=text.slice(token.start,token.end);mirror.append(span);end=token.end;}mirror.append(document.createTextNode(text.slice(end)+'\n'));mirror.style.width=(textarea.clientWidth+2)+'px';mirror.scrollTop=textarea.scrollTop;mirror.scrollLeft=textarea.scrollLeft;}
 function hide(){menu.hidden=true;textarea.setAttribute('aria-expanded','false');}
 function choose(row){if(!query)return;textarea.focus();textarea.setRangeText(row.token+' ',query.start,query.end,'end');hide();textarea.dispatchEvent(new Event('input',{bubbles:true}));hide();}
 function show(){if(composing||textarea.disabled||closed)return;query=mentionQuery(textarea.value,textarea.selectionStart);if(!query){hide();return;}rows=resourceSuggestions(getMedia(),query.query);selected=Math.min(selected,Math.max(0,rows.length-1));menu.replaceChildren();const title=document.createElement('small');title.textContent=rows.length?'可用公共资源 · ↑↓选择，Enter插入，Esc关闭':'没有匹配资源，请先添加公共素材';menu.append(title);rows.forEach((row,i)=>{const button=document.createElement('button');button.type='button';button.textContent=row.label;button.className=i===selected?'active':'';button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===selected));button.onpointerdown=e=>e.preventDefault();button.onclick=()=>choose(row);menu.append(button);});menu.hidden=false;textarea.setAttribute('aria-expanded','true');positionMenu();const active=menu.querySelector('.active');if(active){if(active.offsetTop<menu.scrollTop)menu.scrollTop=active.offsetTop;else if(active.offsetTop+active.offsetHeight>menu.scrollTop+menu.clientHeight)menu.scrollTop=active.offsetTop+active.offsetHeight-menu.clientHeight;}}
 const input=()=>{sync();selected=0;show();};const click=()=>{selected=0;show();};const keydown=e=>{if(composing||e.isComposing||menu.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();selected=(selected+(e.key==='ArrowDown'?1:-1)+rows.length)%Math.max(1,rows.length);show();}else if((e.key==='Enter'||e.key==='Tab')&&rows[selected]){e.preventDefault();e.stopPropagation();choose(rows[selected]);}};
 const blur=()=>{if(!menuInteracting)hide();},start=()=>{composing=true;hide();},finish=()=>{composing=false;input();};
 textarea.addEventListener('input',input);textarea.addEventListener('click',click);textarea.addEventListener('keydown',keydown);textarea.addEventListener('blur',blur);textarea.addEventListener('compositionstart',start);textarea.addEventListener('compositionend',finish);const scroll=()=>{sync();positionMenu();};textarea.addEventListener('scroll',scroll);
 const resize=new ResizeObserver(()=>{sync();positionMenu();});resize.observe(wrapper);sync();return {sync(){hide();sync();},dispose(){closed=true;resize.disconnect();textarea.ownerDocument.removeEventListener('pointerup',pointerUp,true);textarea.ownerDocument.removeEventListener('pointercancel',pointerUp,true);textarea.ownerDocument.removeEventListener('pointerdown',outside,true);menu.removeEventListener('pointerdown',menuDown);menu.removeEventListener('pointermove',menuMove);menu.removeEventListener('wheel',stopPropagation);caretMirror.remove();for(const [name,fn] of [['input',input],['click',click],['keydown',keydown],['blur',blur],['compositionstart',start],['compositionend',finish],['scroll',scroll]])textarea.removeEventListener(name,fn);}};
}
