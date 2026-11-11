/** Standard indexed project-directory import and unlimited shared media library. */
import { api } from "../../scripts/api.js";
import { newBatchSegment, safeUploadFilename } from "./minimax_gen_timeline.js";

const token = /@(图片|音频|视频)([1-9]\d*)(?!\d)|<(Picture|Audio|Video)\s+([1-9]\d*)>/gi;
const kinds = {图片:"images", picture:"images", 音频:"audios", audio:"audios", 视频:"videos", video:"videos"};
const specs = {images:["参考图", "imageFile",9], audios:["参考音频","audioFile",3], videos:["参考视频","videoFile",3]};
function rows(text) {
    return text.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim())
        .filter(line => line.startsWith("|")).map(line => line.split("|").slice(1,-1).map(s=>s.trim().replace(/^`|`$/g,"")));
}
function relative(value) {
    if (!value || value.includes("\\") || value.startsWith("/") || value.split("/").some(p=>p===".." || p===".")) throw Error(`不安全或无效路径：${value}`);
    return value;
}
function validate(prompt, library, label) {
    const used={images:new Set(),audios:new Set(),videos:new Set()};
    for (const match of prompt.matchAll(token)) {
        const kind=kinds[(match[1]||match[3]).toLowerCase()], id=Number(match[2]||match[4])-1;
        if (!library[kind].some(item=>item.index===id)) throw Error(`${label} 引用了缺失素材：${match[0]}`);
        used[kind].add(id);
    }
    for (const [kind, ids] of Object.entries(used)) if(ids.size>specs[kind][2]) throw Error(`${label} 的 ${kind} 超过单段模型上限 ${specs[kind][2]}`);
}
async function upload(file) {
    const body=new FormData();
    body.append("image", file, safeUploadFilename(file.name));
    body.append("type","input"); body.append("overwrite","false");
    const response=await api.fetchApi("/upload/image", {method:"POST",body});
    if(!response.ok) throw Error(`上传失败：${file.name} (${response.status})`);
    const data=await response.json();
    return [data.subfolder,data.name].filter(Boolean).join("/");
}
function choose(directory=false) {
    return new Promise(resolve=>{
        const input=document.createElement("input"); input.type="file"; input.multiple=true;
        if(directory) input.webkitdirectory=true;
        else input.accept="image/png,image/jpeg,image/webp,audio/*,video/*";
        input.onchange=()=>resolve(Array.from(input.files||[])); input.oncancel=()=>resolve([]); input.click();
    });
}
export async function importStandardProject(editor) {
    const files=await choose(true); if(!files.length)return;
    const entries=new Map();
    for(const file of files) {
        const path=relative(file.webkitRelativePath.split("/").slice(1).join("/"));
        if(entries.has(path))throw Error(`重复路径：${path}`); entries.set(path,file);
    }
    const library={images:[],audios:[],videos:[]};
    for(const [kind,[folder,field]] of Object.entries(specs)) {
        const index=entries.get(`${folder}/${folder}索引.md`);
        if(!index){if([...entries.keys()].some(path=>path.startsWith(folder+"/")))throw Error(`${folder}目录缺少${folder}索引.md`);continue;}
        const prefix={images:"图片",audios:"音频",videos:"视频"}[kind];
        for(const cells of rows(await index.text())) {
            const match=cells[0]?.match(new RegExp(`^@${prefix}([1-9]\\d*)$`)); if(!match)continue;
            const id=Number(match[1])-1, path=`${folder}/${relative(cells[1])}`;
            if(library[kind].some(r=>r.index===id || r.sourcePath===path))throw Error(`重复素材登记：${path}`);
            if(!entries.has(path))throw Error(`缺少素材：${path}`);
            library[kind].push({index:id,sourcePath:path,[field]:path});
        }
        library[kind].sort((a,b)=>a.index-b.index);
        if(library[kind].some((item,i)=>item.index!==i))throw Error(`${folder}索引编号必须从1连续`);
    }
    const segments=[];
    for(const [path,file] of [...entries].sort(([a],[b])=>a.localeCompare(b,"zh-CN",{numeric:true}))) {
        if(!path.endsWith("/提示词索引.md"))continue;
        const chapter=path.slice(0,-"提示词索引.md".length), seen=new Set(), list=[];
        for(const cells of rows(await file.text())) {
            const match=cells[0]?.match(/^分段([1-9]\d*)$/); if(!match)continue;
            const id=Number(match[1]), duration=Number(cells[1]);
            if(!/^\d+(?:\.\d)?$/.test(cells[1]) || duration<0.2 || duration>10)throw Error(`${path} 分段${id}时长须为0.2–10秒，最多一位小数`);
            const name=relative(cells[2]);
            if(name.includes("/") || !name.endsWith(".txt") || name==="剧本.txt" || seen.has(name))throw Error(`${path} 提示词文件无效或重复：${name}`);
            seen.add(name);
            const source=entries.get(chapter+name); if(!source)throw Error(`缺少提示词：${chapter+name}`);
            const prompt=(await source.text()).replace(/^\uFEFF/,"").trim();
            for(const field of ["integrated_multimodal_description","overall_soundscape","non_diegetic_music"]) {
                if((prompt.match(new RegExp(`^${field}\\s*[:：]`,"gm"))||[]).length!==1)throw Error(`${chapter+name} 须包含一次 ${field}`);
            }
            const shots=[...prompt.matchAll(/\[Shot\s+\d+\s*[,，]\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)s?\]/gi)];
            if(!shots.length || Number(shots[0][1])!==0 || Math.abs(Number(shots.at(-1)[2])-duration)>0.001 || shots.some((s,i)=>Number(s[2])<=Number(s[1]) || (i && Number(s[1])!==Number(shots[i-1][2]))))throw Error(`${chapter+name} Shot时间须从0连续到${duration}秒`);
            validate(prompt,library,chapter+name);
            list.push({id,name,prompt,duration,chapter});
        }
        list.sort((a,b)=>a.id-b.id);
        if(!list.length || list.some((s,i)=>s.id!==i+1))throw Error(`${path} 分段编号须从1连续且不可重复`);
        segments.push(...list);
    }
    if(!segments.length)throw Error("目录内没有有效章节提示词索引.md");
    if(!window.confirm(`导入 ${segments.length} 段，替换当前导演台时间轴？模型、采样及二采设置保留。`))return;
    // Validate every reference before uploading or changing the timeline.
    for(const [kind,items] of Object.entries(library)) for(const item of items) {
        item[specs[kind][1]]=await upload(entries.get(item.sourcePath));
    }
    const timeline=structuredClone(editor.timeline);
    const fps=Number(timeline.frameRate)||24;
    const hasMedia=Object.values(library).some(items=>items.length);
    const task=hasMedia?"r2v":"t2v";
    const options=editor.taskTypeWidget?.options?.values;
    const taskLabel=Array.isArray(options) ? options.find(v=>String(v).startsWith(task+" ")) || task : task;
    timeline.editMode="segment"; timeline.timelineMode="prompt_batch";
    timeline.global={...timeline.global, taskType:taskLabel,prompt:"",commonEnabled:false, refs:[],refAudios:[],refVideos:[],assetLibrary:library};
    timeline.segments=segments.map(s=>newBatchSegment({frameRate:fps,prompt:s.prompt,durationSec:s.duration,taskType:taskLabel,chapter:s.chapter,sourceName:s.name}));
    let start=0;for(const s of timeline.segments){s.start=start;start+=s.frameCount;}
    timeline.totalFrames=start; timeline.projectLibrary=true;
    timeline.runSelectEnabled=false;timeline.runSelection=[];
    delete timeline.run_select_enabled;delete timeline.run_selection;
    timeline.shots=[];timeline.videoClips=[];timeline.video={fileName:"",videoFile:"",frames:[],frameMap:[],type:"input"};
    timeline.batchWorkspaces={};
    editor.applyImportedTimeline(timeline,{task_type:taskLabel});
    alert(`已导入 ${segments.length} 段。公共库 ${library.images.length} 图 / ${library.audios.length} 音频 / ${library.videos.length} 视频。请核对所接模型：${task}。`);
}

export function bindProjectActions(editor) {
    const host=editor.root?.querySelector('[data-a="pack-import"]')?.parentElement;
    if(!host || host.querySelector('[data-a="project-import"]'))return;
    for(const [action,label,handler] of [
        ["project-import","导入项目目录",()=>importStandardProject(editor)],
        ["project-library","公共素材库",async()=>{
            let library=editor.timeline.global?.assetLibrary;
            if(!library){
                if(!window.confirm("将当前素材组迁移到公共素材库？原分组引用会映射为项目编号，未在提示词引用的素材不传给模型。"))return;
                const g=editor.timeline.global || {};
                if(!String(g.taskType || editor.taskTypeWidget?.value || "").startsWith("r2v"))throw Error("旧素材迁移目前用于 r2v 素材组；首尾帧和源视频请保留专用输入。");
                library={images:[],audios:[],videos:[]};
                const replacements=[];
                for(const segment of editor.timeline.segments || []) {
                    const maps={};
                    for(const [kind,[,field]] of Object.entries(specs)) {
                        const listField={images:"refs",audios:"refAudios",videos:"refVideos"}[kind];
                        const merged=new Map();
                        if(g.commonEnabled)for(const item of g[listField]||[])merged.set(item.index,item);
                        for(const item of segment[listField]||[])merged.set(item.index,item);
                        maps[kind]=new Map();
                        for(const [old,item] of merged){
                            if(!item[field])continue;
                            let shared=library[kind].find(r=>r[field]===item[field]);
                            if(!shared){shared={...item,index:library[kind].length};library[kind].push(shared);}
                            maps[kind].set(Number(old),shared.index);
                        }
                    }
                    const raw=[g.commonEnabled?g.prompt:"",segment.prompt].filter(Boolean).join("\n\n");
                    const prompt=raw.replace(token,(whole,cn,cnid,en,enid)=>{
                        const kind=kinds[(cn||en).toLowerCase()],id=maps[kind].get(Number(cnid||enid)-1);
                        if(id===undefined)throw Error(`素材缺失：${whole}，未执行迁移`);
                        return `<${{images:"Picture",audios:"Audio",videos:"Video"}[kind]} ${id+1}>`;
                    });
                    validate(prompt,library,"当前分组");replacements.push([segment,prompt]);
                }
                for(const [segment,prompt]of replacements){segment.prompt=prompt;segment.refs=[];segment.refAudios=[];segment.refVideos=[];}
                editor.timeline.global={...g,assetLibrary:library,refs:[],refAudios:[],refVideos:[],prompt:"",commonEnabled:false};
                editor.timeline.projectLibrary=true;editor.applyImportedTimeline(structuredClone(editor.timeline),{});
            }
            const listing=Object.entries(library).flatMap(([kind,items])=>items.map(r=>`${{images:"@图片",audios:"@音频",videos:"@视频"}[kind]}${r.index+1} ${r.sourcePath||r.imageFile||r.audioFile||r.videoFile}`));
            if(!window.confirm(`${listing.join("\n")}\n\n库内数量不限；单段最多9图/3音频/3视频。点击确定追加素材，取消关闭。`))return;
            const files=await choose();
            for(const file of files){const ext=file.name.split(".").pop().toLowerCase();const kind=["png","jpg","jpeg","webp"].includes(ext)?"images":["wav","mp3","flac","ogg","m4a","aac"].includes(ext)?"audios":"videos";const index=Math.max(-1,...library[kind].map(r=>r.index))+1;const path=await upload(file);library[kind].push({index,[specs[kind][1]]:path,sourcePath:file.name});}
            editor.commit();editor.renderImageBatchGroups?.();
        }],
    ]) {
        const button=document.createElement("button");button.type="button";button.className="bd-btn";button.dataset.a=action;button.textContent=label;
        button.onclick=async e=>{e.preventDefault();e.stopPropagation();button.disabled=true;button.textContent="处理中…";try{await handler();}catch(error){alert(String(error.message||error));}finally{button.disabled=false;button.textContent=label;}};
        host.appendChild(button);
    }
}
