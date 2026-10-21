export function livePreview({api,image,video,label,owns}){
 let active=null,url=null,activeNode=null;
 const release=()=>{if(url){URL.revokeObjectURL(url);url=null;}};
 function showImage(src,text){release();video.pause?.();video.hidden=true;image.hidden=false;image.src=src;label.textContent=text;}
 function showVideo(src,text){release();image.hidden=true;video.hidden=false;if(video.getAttribute('src')!==src){video.src=src;video.load?.();}label.textContent=text;}
 const execution=e=>{const d=e.detail||{};if(d.prompt_id){active=owns(d.prompt_id)?d.prompt_id:null;activeNode=d.node??null;if(active)label.textContent='任务执行中，等待云端预览帧…';}};
 const progress=e=>{const d=e.detail||{};if(d.prompt_id)active=owns(d.prompt_id)?d.prompt_id:null;if(active&&d.max)label.textContent=`节点内部进度 ${d.value}/${d.max} · 累计进度见下方“当前步骤”`;};
 const preview=e=>{if(!active||!owns(active)||!(e.detail instanceof Blob))return;release();url=URL.createObjectURL(e.detail);video.pause?.();video.hidden=true;image.hidden=false;image.src=url;label.textContent='采样实时预览 · 完整视频需等待当前段完成';};
 const directorPreview=e=>{const d=e.detail||{};if(!active||!owns(active)||activeNode==null||String(d.node_id)!==String(activeNode)||!d.image_b64)return;const mime=d.mime||'image/jpeg';if(!['image/png','image/jpeg','image/webp','video/mp4'].includes(mime))return;const src='data:'+mime+';base64,'+d.image_b64;if(mime==='video/mp4')showVideo(src,'导演台片段预览');else showImage(src,'导演台采样预览 · '+(d.step??'')+(d.total_steps?'/'+d.total_steps:''));};
 const listeners=[['execution_start',execution],['executing',execution],['progress',progress],['b_preview',preview],['minimax_director_preview',directorPreview]];
 for(const [name,fn] of listeners)api.addEventListener?.(name,fn);
 return {watch(id,text){active=id;label.textContent=text||'等待云端预览；无预览帧时将在完成后显示结果';},image:showImage,video:showVideo,dispose(){release();video.pause?.();for(const [name,fn] of listeners)api.removeEventListener?.(name,fn);}};
}
