export function openVideoCompare({root=document.body,left,right,view,title='一采与精修对比'}){
 if(!left||!right)throw Error('需要两份已完成视频才能对比');
 const doc=root.ownerDocument,dialog=doc.createElement('dialog');dialog.style.cssText='width:94vw;max-width:1600px;background:#101e28;color:#e0edf7;border:1px solid #547083;border-radius:12px;padding:18px';
 const heading=doc.createElement('h3');heading.textContent=title;dialog.append(heading);
 const grid=doc.createElement('div');grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:14px';
 const clips=[left,right].map((row,i)=>{const box=doc.createElement('div'),label=doc.createElement('p'),v=doc.createElement('video');label.textContent=row.label||(i?'精修成片':'一采原片');v.src=view(row);v.controls=i===0;v.preload='metadata';v.muted=i===1;v.style.cssText='width:100%;max-height:65vh;background:#000';box.append(label,v);grid.append(box);return v;});dialog.append(grid);
 const controls=doc.createElement('div');controls.style.cssText='display:flex;gap:12px;align-items:center;margin-top:12px';const play=doc.createElement('button');play.textContent='同步播放 / 暂停';const range=doc.createElement('input');range.type='range';range.min='0';range.max='0';range.step='0.01';range.value='0';range.style.flex='1';const clock=doc.createElement('span'),close=doc.createElement('button');close.textContent='关闭';const fullscreen=doc.createElement('button');fullscreen.textContent='双屏全屏';fullscreen.onclick=()=>void grid.requestFullscreen?.().catch(()=>{});controls.append(play,range,clock,fullscreen,close);dialog.append(controls);
 const duration=()=>Math.min(...clips.map(v=>Number.isFinite(v.duration)?v.duration:v.seekable.length?v.seekable.end(v.seekable.length-1):0));
 const updateRange=()=>{range.max=String(duration());range.disabled=duration()<=0;};for(const v of clips)for(const event of ['loadedmetadata','durationchange','progress','canplay'])v.addEventListener(event,updateRange);updateRange();
 let seeking=false;
 function seek(t){if(!Number.isFinite(t))return;seeking=true;for(const v of clips)if(Number.isFinite(v.duration)&&Math.abs(v.currentTime-t)>0.04)v.currentTime=Math.min(t,v.duration);queueMicrotask(()=>seeking=false);}
 range.oninput=()=>{clips.forEach(v=>v.pause());seek(Number(range.value));};
 clips.forEach((v,i)=>{v.addEventListener('seeking',()=>{if(!seeking)seek(v.currentTime);});v.addEventListener('play',()=>{if(i===0){seek(v.currentTime);void clips[1].play().catch(()=>{});}});v.addEventListener('pause',()=>{if(i===0)clips[1].pause();});});
 clips[0].addEventListener('timeupdate',()=>{const t=clips[0].currentTime;range.value=String(t);clock.textContent=t.toFixed(2)+' / '+duration().toFixed(2)+'秒';if(!clips[0].paused&&Math.abs(clips[1].currentTime-t)>0.15)seek(t);if(t>=duration()&&duration()>0)clips.forEach(v=>v.pause());});
 play.onclick=()=>{if(clips[0].paused){seek(clips[0].currentTime);for(const v of clips)void v.play().catch(()=>{});}else clips.forEach(v=>v.pause());};
 close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{for(const v of clips){v.pause();v.removeAttribute('src');v.load();}dialog.remove();});root.append(dialog);dialog.showModal();return dialog;
}
