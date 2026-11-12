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
function choose(directory=false, kind=null) {
    return new Promise(resolve=>{
        const input=document.createElement("input"); input.type="file"; input.multiple=true;
        if(directory) input.webkitdirectory=true;
        else input.accept=({images:"image/png,image/jpeg,image/webp",audios:"audio/*",videos:"video/*"})[kind] || "image/png,image/jpeg,image/webp,audio/*,video/*";
        input.onchange=()=>resolve(Array.from(input.files||[])); input.oncancel=()=>resolve([]); input.click();
    });
}
export async function importStandardProject(editor) {
    const importRoot=editor.root;
    const assertActive=()=>{
        if(editor._destroyed || (importRoot && editor.root!==importRoot)) {
            throw Error("导入已停止：原导演台已关闭或工作流已切换。已上传文件可能保留，请回到参考生视频重新导入。");
        }
    };
    const files=await choose(true); if(!files.length)return;
    const entries=new Map();
    for(const file of files) {
        const path=relative(file.webkitRelativePath.split("/").slice(1).join("/"));
        if(entries.has(path))throw Error(`重复路径：${path}`); entries.set(path,file);
    }
    assertActive();
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
    assertActive();
    // Preflight above finishes before uploads. Bounded parallelism avoids serial RTTs.
    const jobs=Object.entries(library).flatMap(([kind,items])=>items.map(item=>({kind,item})));
    const button=editor.root?.querySelector('[data-a="project-import"]');
    let cursor=0,done=0,failure=null;
    const totalBytes=jobs.reduce((sum,{item})=>sum+(entries.get(item.sourcePath).size||0),0);
    const progress=()=>{if(button)button.textContent=`上传素材 ${done}/${jobs.length}（共 ${(totalBytes/1048576).toFixed(1)} MB）`;};
    progress();
    const worker=async()=>{
        while(!failure && cursor<jobs.length){
            const {kind,item}=jobs[cursor++];
            try {
                assertActive();
                item[specs[kind][1]]=await upload(entries.get(item.sourcePath));
                assertActive();
                done++;progress();
            } catch(error){failure ||= error;}
        }
    };
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
    if(failure)throw failure;
    assertActive();
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

export function ensureSharedLibrary(editor) {
    if (editor.timeline.global?.assetLibrary) return editor.timeline.global.assetLibrary;
                const g=editor.timeline.global || {};
                const library={images:[],audios:[],videos:[]};
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

    editor.timeline.projectLibrary=true;
    return library;
}


/** Remove library metadata only; retain IDs and physical files used by other workflows. */
export function sharedAssetUsage(timeline, kind, index) {
    const hits = [];
    const visit = (value, path) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
            if (key === "assetLibrary") continue;
            const location = path ? `${path}.${key}` : key;
            if (typeof child === "string" && /prompt/i.test(key)) {
                for (const match of child.matchAll(token)) {
                    if (kinds[(match[1] || match[3]).toLowerCase()] === kind && Number(match[2] || match[4]) - 1 === index) {
                        hits.push(location); break;
                    }
                }
            } else if (child && typeof child === "object") visit(child, location);
        }
    };
    visit(timeline, "");
    return hits;
}

export function removeSharedAsset(timeline, kind, index) {
    const library = timeline.global?.assetLibrary;
    if (!library || !Array.isArray(library[kind])) throw Error("公共素材库不存在");
    const usage = sharedAssetUsage(timeline, kind, index);
    if (usage.length) throw Error(`该素材仍被引用，请先修改提示词：\n${usage.join("\n")}`);
    library[kind] = library[kind].filter(item => Number(item.index) !== Number(index));
}

/** Visible shared library, independent of the common-prompt enable switch. */
export function renderSharedLibraryPanel(editor, enabled = true) {
    const root = editor.root;
    if (!root) return;
    let panel = root.querySelector('[data-r="shared-library-panel"]');
    if (!enabled) { panel?.remove(); return; }
    const library = editor.timeline.global?.assetLibrary;
    if (!library) return;
    if (!panel) {
        panel = document.createElement("section");
        panel.dataset.r = "shared-library-panel";
        panel.className = "bd-panel";
        const anchor = root.querySelector('[data-r="batch-panel"]');
        if (!anchor) return;
        anchor.before(panel);
    }
    panel.replaceChildren();
    const heading = document.createElement("b");
    heading.textContent = "公共参考素材（所有分段共享）";
    panel.appendChild(heading);
    for (const [kind, label] of [["images", "图片"], ["audios", "音频"], ["videos", "视频"]]) {
        const section = document.createElement("div");
        section.style.cssText = "margin-top:10px";
        const add = document.createElement("button");
        add.className = "bd-btn";
        add.textContent = "上传公共" + label + "（" + library[kind].length + "）";
        add.onclick = async event => {
            event.preventDefault(); event.stopPropagation(); add.disabled = true;
            try {
                const files = await choose(false, kind);
                for (const file of files) {
                    const path = await upload(file);
                    const index = Math.max(-1, ...library[kind].map(item => item.index)) + 1;
                    library[kind].push({index, [specs[kind][1]]: path, sourcePath: file.name});
                    editor.commit();
                }
            } catch (error) { alert(String(error.message || error)); }
            finally { editor.renderImageBatchGroups?.(); }
        };
        section.appendChild(add);
        const grid = document.createElement("div");
        grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-height:280px;overflow:auto";
        for (const item of library[kind]) {
            const card = document.createElement("div");
            card.style.cssText = "width:150px;padding:6px;border:1px solid #46515f;border-radius:6px;overflow-wrap:anywhere";
            const title = document.createElement("div");
            title.textContent = "@" + label + (item.index + 1);
            card.appendChild(title);
            const path = item[specs[kind][1]];
            if (path) {
                const media = document.createElement(kind === "images" ? "img" : kind === "audios" ? "audio" : "video");
                const split = path.lastIndexOf("/");
                const query = new URLSearchParams({filename:path.slice(split+1), subfolder:split < 0 ? "" : path.slice(0,split), type:item.type || "input"});
                media.src = api.apiURL("/view?" + query);
                media.style.cssText = "width:100%;max-height:120px;object-fit:contain";
                if (kind !== "images") { media.controls = true; media.preload = "metadata"; }
                else media.loading = "lazy";
                card.appendChild(media);
            }
            const name = document.createElement("div");
            name.textContent = item.sourcePath || path;
            name.style.fontSize = "11px";
            card.appendChild(name);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "bd-btn";
            remove.textContent = "删除";
            remove.title = "从公共库移除；其他素材编号和磁盘文件保留";
            remove.onclick = event => {
                event.preventDefault(); event.stopPropagation();
                try {
                    // Flush in-progress edits before checking references.
                    editor.commit();
                    const usage = sharedAssetUsage(editor.timeline, kind, Number(item.index));
                    if (usage.length) throw Error(`@${label}${item.index + 1} 仍被以下提示词引用，请先移除引用：\n${usage.join("\n")}`);
                    if (!window.confirm(`从公共库删除 @${label}${item.index + 1}？其他素材编号不变，服务器原文件保留。`)) return;
                    removeSharedAsset(editor.timeline, kind, Number(item.index));
                    editor.commit();
                    editor.renderImageBatchGroups?.();
                    renderSharedLibraryPanel(editor);
                } catch (error) { alert(String(error.message || error)); }
            };
            card.appendChild(remove);
            grid.appendChild(card);
        }
        section.appendChild(grid);
        panel.appendChild(section);
    }
}

export function bindProjectActions(editor) {
    const host=editor.root?.querySelector('[data-a="pack-import"]')?.parentElement;
    if(!host || host.querySelector('[data-a="project-import"]'))return;
    for(const [action,label,handler] of [
        ["project-import","导入项目目录",()=>importStandardProject(editor)],
        ["project-library","公共素材库",async()=>{
            let library=editor.timeline.global?.assetLibrary;
            if(!library){
                library=ensureSharedLibrary(editor);
                editor.applyImportedTimeline(structuredClone(editor.timeline),{});
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
