export function buildFolderTemplate({name='1_26',pages=1,groups=1,seconds=4,mode='reference'}){
 name=String(name).trim();if(!name||name.length>80||/[<>:"/\\|?*\x00-\x1f]/.test(name)||name==='.'||name==='..'||/[. ]$/.test(name)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))throw Error('章节名不能含路径或Windows非法字符');
 if(!Number.isInteger(pages)||pages<1||pages>100||!Number.isInteger(groups)||groups<1||groups>100||pages*groups>1000)throw Error('上传目录和素材组数量各为1—100，总组数不超过1000');
 if(!Number.isFinite(seconds)||seconds<0.2||seconds>20.7)throw Error('每组时长需为0.2—20.7秒');
 const entries=[{path:name+'/',directory:true}];const add=(path,text)=>entries.push({path:name+'/'+path,text});
 add('填写说明.txt','这是目录与提示词占位模板，不是已完成剧本。请替换全部【待填写】内容后再生成。\n目录层级：外层章节/上传子目录/素材组1/提示词.txt；每个上传子目录导入为一页，素材组不是页面。\n每页必须保留自己的素材组索引.md，列顺序为素材组、请求秒数、提示词相对路径；第二列填纯数字，不带“秒”。外层汇总不能代替每页索引。\n参考模式：每页公共参考图放真实@图片1.png至@图片N，连续编号；素材组内不另设参考图文件夹。空图片目录或放图说明不能当真实图片。\n自动人物生图模式：不需要图片目录，需填写真实人物名、固定S编号和外貌服装；导入前选择“自动人物生图 → 生视频”。\n参考音频默认关闭，不生成虚构<Audio N>引用。索引秒数与提示词末时点同步修改，每组时间从0开始。\n导入时选择外层章节或上传子目录，不选择素材组1或公共参考图。完整交付标准见插件内标准目录与AI交付规范.md。\n');
 let chapterIndex='# '+name+' 素材组索引\n\n|上传目录|组|请求秒数|提示词|\n|---|---|---|---|\n';
 for(let p=1;p<=pages;p++){
  const page=name+'_'+String(p).padStart(2,'0');entries.push({path:name+'/'+page+'/',directory:true});
  if(mode==='reference'){entries.push({path:name+'/'+page+'/公共参考图/',directory:true});add(page+'/公共参考图/放图说明.txt','在此放真实参考图，按@图片1.png、@图片2.png连续编号，当前目录所有素材组共用。不要把说明文件当图片。\n');}
  let index='# '+page+' 素材组索引\n\n|素材组|请求秒数|提示词|\n|---|---|---|\n';
  for(let g=1;g<=groups;g++){
   const path=page+'/素材组'+g+'/提示词.txt';
   const prompt='integrated_multimodal_description: [Shot 1] 【待填写：本镜风格、现场背景、时间、光源、构图、机位、人物位置；'+(mode==='auto_character'?'真实人物名（S编号）及外貌服装':'真实参考图<Picture N>对应的身份或场景用途')+'；有对白时明确当前角色声线】。\n0.0～'+seconds.toFixed(1)+'秒：【待填写：起态、刺激、动作过程、可见表情及末态；有原对白才写角色（S编号）说道：<d>[Chinese]实际原对白</d>，无对白删去该示例，不新增台词】。\noverall_soundscape: 【待填写：环境、接触动作声、呼吸等非语言声音，不重复对白】。\nnon_diegetic_music: N/A\n';
   add(path,prompt);index+='|素材组'+g+'|'+seconds+'|素材组'+g+'/提示词.txt|\n';chapterIndex+='|'+page+'|素材组'+g+'|'+seconds+'|'+path+'|\n';
  }
  add(page+'/素材组索引.md',index);
 }
 add('素材组索引.md',chapterIndex);return {name,entries};
}
export async function writeTemplateDirectory(parent,template){
 // Choose a fresh sibling directory. Never overwrite an existing project.
 let directory,folderName;
 for(let n=0;n<1000;n++){folderName=template.name+(n?'_新建'+n:'');try{await parent.getDirectoryHandle(folderName);}catch(error){if(error.name!=='NotFoundError')throw error;directory=await parent.getDirectoryHandle(folderName,{create:true});break;}}
 if(!directory)throw Error('无法找到可用目录名');
 for(const row of template.entries){const parts=row.path.split('/').filter(Boolean).slice(1);let target=directory;const dirs=row.directory?parts:parts.slice(0,-1);for(const part of dirs)target=await target.getDirectoryHandle(part,{create:true});if(!row.directory){const file=await target.getFileHandle(parts.at(-1),{create:true});const writer=await file.createWritable();await writer.write(row.text);await writer.close();}}
 return folderName;
}
export function openFolderTemplate({root,api,mode='reference',log}){
 const dialog=document.createElement('dialog');dialog.style.cssText='background:#16232e;color:#deebf4;border:1px solid #4c697b;border-radius:12px;padding:22px;width:480px;max-width:95vw';
 dialog.innerHTML='<h3>创建标准目录与提示词模板</h3><p>生成占位模板，填写实际镜头与台词后再导入。</p><form style="display:grid;gap:12px"><label>章节名 <input name="name" value="1_26" required></label><label>上传子目录数量 <input name="pages" type="number" min="1" max="100" value="1"></label><label>每份素材组数量 <input name="groups" type="number" min="1" max="100" value="1"></label><label>每组秒数 <input name="seconds" type="number" min="0.2" max="20.7" step="0.1" value="4"></label><label>模式 <select name="mode"><option value="reference">参考素材（共享公共参考图目录）</option><option value="auto_character">自动生图（无需参考图目录）</option></select></label><div style="display:flex;gap:8px"><button type="button" id="create-directory">选择位置并创建</button><button type="submit">下载ZIP</button><button type="button" id="close-template">关闭</button></div><p id="template-message" style="white-space:pre-wrap"></p></form>';
 root.append(dialog);dialog.querySelector('[name=mode]').value=mode;const message=dialog.querySelector('#template-message');
 const build=()=>{const f=new FormData(dialog.querySelector('form'));return buildFolderTemplate({name:f.get('name'),pages:Number(f.get('pages')),groups:Number(f.get('groups')),seconds:Number(f.get('seconds')),mode:f.get('mode')});};
 dialog.querySelector('#close-template').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 dialog.querySelector('#create-directory').onclick=async()=>{try{if(!window.showDirectoryPicker)throw Error('当前环境不支持直接创建目录，请使用下载ZIP后解压');const template=build();const parent=await window.showDirectoryPicker({mode:'readwrite'});const name=await writeTemplateDirectory(parent,template);message.textContent='已创建：'+name+'。请填写占位内容并添加所需素材。';log(message.textContent);}catch(error){message.textContent=error.name==='AbortError'?'已取消选择':error.message;}};
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();try{const template=build();const response=await api.fetchApi('/h3_visual_studio/template/zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(template)});if(!response.ok)throw Error((await response.json()).error||'ZIP生成失败');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=template.name+'_标准目录.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent='ZIP已下载，解压后填写模板并添加素材。';}catch(error){message.textContent=error.message;}};
 dialog.showModal();
}
