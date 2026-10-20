import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {defaultProject,compileRequest,readWorkspace} from '../web/project.mjs';
const require=createRequire(import.meta.url);const {parseFiles}=require('../web/folder-core.js');
const root=process.argv[2];if(!root)throw Error('Pass project root');
const files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())await walk(full);else if(e.name==='提示词.txt'||e.name==='素材组索引.md'||['公共参考图','公共参考音频','公共参考视频'].includes(path.basename(dir)))files.push({name:e.name,webkitRelativePath:path.relative(root,full).replaceAll('\\','/'),text:()=>fs.readFile(full,'utf8')});}}
for(const volume of ['01','02','03','04'])await walk(path.join(root,volume));
const chapters=await parseFiles(files);const base=JSON.parse(await fs.readFile(new URL('../examples/官方采样API基线.json',import.meta.url),'utf8'));
let groups=0,audioGroups=0;const pages=[];
for(const chapter of chapters){const p=defaultProject();p.pageId=chapter.name;p.name=chapter.name.split('/').at(-1);p.sourcePath=chapter.name;
 for(const [kind,shared] of [['images','sharedImages'],['audios','sharedAudios'],['videos','sharedVideos']])p.media[kind]=(chapter[shared]||[]).map((f,i)=>({id:i+1,name:f.name,file:f.webkitRelativePath}));
 p.groups=chapter.groups.map(g=>({id:chapter.name+'/'+g.number,number:g.number,prompt:g.prompt,seconds:g.seconds,selected:true}));
 for(const g of p.groups){p.audioReference=false;const off=compileRequest(base,p,g);if(Object.values(off.prompt).some(n=>n.class_type==='LoadAudio'))throw Error('audio leak');p.audioReference=true;const on=compileRequest(base,p,g);if(on.plan.audios.length)audioGroups++;groups++;}
 p.audioReference=false;pages.push(p);
}
const workspace=readWorkspace(JSON.stringify({version:1,pages,activePageId:pages[0].pageId}));
if(workspace.pages.length!==chapters.length)throw Error('page persistence failed');
console.log(JSON.stringify({passed:true,pages:pages.length,groups,audioReferencedGroups:audioGroups,compiledRequests:groups*2}));
