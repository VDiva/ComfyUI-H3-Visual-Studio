  const numeric = (a,b) => a.localeCompare(b, 'zh-CN', {numeric:true});
  async function parseFiles(files, options = {}) {
    const groups = new Map();
    const indexes = new Map();
    const libraries = new Map();
    const projectLibraries = new Map();
    const imageLibrary = chapter => {const matches=[...projectLibraries.keys()].filter(root=>chapter===root||chapter.startsWith(root+'/'));if(matches.length>1)throw Error('项目参考图目录重复，请只保留最外层一份参考图');const root=matches[0];return root?{images:projectLibraries.get(root),root}:{images:libraries.get(chapter)};};
    const audioLibraries = new Map();
    const videoLibraries = new Map();
    const inherited=(store,chapter)=>{const roots=[...store.keys()].filter(r=>chapter===r||chapter.startsWith(r+'/')).sort((a,b)=>a.length-b.length);return roots.length?store.get(roots[0]):undefined;};
    const resourceOrders=new Map();
    for(const file of files){
      const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');
      const match=path.match(/^(.*\/(参考图|参考音频|参考视频))\/[^/]*索引\.md$/);if(!match)continue;
      const label=({'参考图':'图片','参考音频':'音频','参考视频':'视频'})[match[2]],rows=[];
      for(const line of (await file.text()).replace(/^\uFEFF/,'').split(/\r?\n/)){
        const cells=line.split('|').map(x=>x.trim());const n=cells[1]?.match(new RegExp('^@'+label+'([1-9]\\d*)$'));if(!n)continue;
        const name=cells[2];if(!name||/[\\/]/.test(name))throw Error('资源索引必须填写同目录完整文件名');rows.push({id:Number(n[1]),name});
      }
      if(resourceOrders.has(match[1]))throw Error('同一资源目录只保留一份资源索引');
      rows.sort((a,b)=>a.id-b.id);if(rows.some((r,i)=>r.id!==i+1)||new Set(rows.map(r=>r.name)).size!==rows.length)throw Error('资源索引编号必须从1连续且文件不可重复');resourceOrders.set(match[1],rows);
    }
    function orderResources(parent,rows,label,folders){
      const matches=folders.map(folder=>resourceOrders.get(parent+'/'+folder)).filter(Boolean);
      if(matches.length>1)throw Error('资源索引重复');
      if(matches.length){const order=matches[0];const byName=new Map(rows.map(f=>[f.name,f]));if(byName.size!==rows.length||order.length!==rows.length||order.some(r=>!byName.has(r.name)))throw Error(parent+'：资源索引与实际文件不一致，请补充或修正索引');rows.splice(0,rows.length,...order.map(r=>byName.get(r.name)));return;}
      rows.sort((a,b)=>numeric(a.name,b.name));if(rows.some((f,i)=>!new RegExp('^@'+label+'([1-9]\\d*)\\.','i').test(f.name)||Number(f.name.match(/\d+/)[0])!==i+1))throw Error(parent+'：中文资源名需在资源目录的索引.md中登记@'+label+'编号与完整文件名');
    }
    const namedPrompts=new Map();
    for(const file of files){
      const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');
      if(!path.endsWith('/提示词索引.md'))continue;
      const parent=path.slice(0,path.lastIndexOf('/'));
      const text=(await file.text()).replace(/^\uFEFF/,'');
      for(const line of text.split(/\r?\n/)){
        const cells=line.split('|').map(v=>v.trim());const match=cells[1]?.match(/^(?:分段|素材组|提示词)([1-9]\d*)$/);
        if(!match)continue;
        const name=cells[3];if(!name||!name.endsWith('.txt'))throw Error(parent+'：索引需指定txt提示词文件');
        if(/[\\/]/.test(name)){if(/^素材组\d+\/提示词\.txt$/.test(name))continue;throw Error(parent+'：剧情命名提示词必须直接放在章节内');}
        if(['剧本.txt','填写说明.txt','放图说明.txt'].includes(name))throw Error('索引不能把剧本或说明当提示词');
        const key=parent+'/'+name;if(namedPrompts.has(key))throw Error('索引重复引用同一提示词：'+name);
        namedPrompts.set(key,{number:Number(match[1]),found:false});
      }
    }
    for (const file of files) {
      const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
      const parts = path.split('/');
      if (parts.at(-2) === '参考图' && !parts.some(x=>/^素材组\d+$/.test(x)) && /\.(png|jpe?g|webp)$/i.test(file.name)) {const parent=parts.slice(0,-2).join('/');if(!projectLibraries.has(parent))projectLibraries.set(parent,[]);projectLibraries.get(parent).push(file);}
      if (parts.at(-2) === '公共参考图' && /^@图片\d+\.(png|jpe?g|webp)$/i.test(file.name)) {
        const parent=parts.slice(0,-2).join('/');
        if (!libraries.has(parent)) libraries.set(parent,[]);
        libraries.get(parent).push(file);
      }
      for (const [folder,label,extensions,store] of [
        ["公共参考音频","音频",/\.(wav|mp3|flac|ogg|m4a|aac)$/i,audioLibraries],
        ["公共参考视频","视频",/\.(mp4|mov|webm|mkv)$/i,videoLibraries]]) {
        if ([folder,folder.replace('公共','')].includes(parts.at(-2)) && extensions.test(file.name)) {
          const parent=parts.slice(0,-2).join("/");
          if (!store.has(parent)) store.set(parent,[]);
          store.get(parent).push(file);
        }
      }
      const gi = parts.findIndex(x => /^素材组\d+$/.test(x));
      if (/^(?:素材(?:组)?|提示词)索引\.md$/i.test(parts.at(-1))) {
        const parent=parts.slice(0,-1).join('/');
        const text=(await file.text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
        if(indexes.has(parent)&&indexes.get(parent)!==text)throw Error(`${parent}：同目录的时长索引内容不同，请保留一份明确的时长索引`);
        indexes.set(parent,text);
      }
      const named=namedPrompts.get(path);if(named)named.found=true;
      const flat = parts.at(-1).match(/^提示词([1-9]\d*)?\.txt$/i);
      if (gi < 1 && (flat||named) && parts.length > 1) {
        const chapter=parts.slice(0,-1).join('/');
        const number=named?.number||Number(flat[1]||1), key=`${chapter}/素材组${number}`;
        if (!groups.has(key)) groups.set(key,{chapter,number,images:[],audios:[],videos:[],prompts:[]});
        const group=groups.get(key);
        if(group.layout==='nested')throw Error(`${chapter}：请勿混用平铺提示词与素材组目录`);
        group.layout='flat';group.prompts.push(file);continue;
      }
      if (gi < 1) continue;
      const chapter = parts.slice(0,gi).join('/');
      const number = Number(parts[gi].match(/\d+/)[0]);
      const key = `${chapter}/素材组${number}`;
      if (!groups.has(key)) groups.set(key, {chapter, number, images:[], audios:[], videos:[], prompts:[]});
      const group = groups.get(key);
      if(group.layout==='flat')throw Error(`${chapter}：请勿混用平铺提示词与素材组目录`);
      group.layout='nested';
      if (parts.length === gi+2 && parts.at(-1) === '提示词.txt') group.prompts.push(file);
      if (parts.length === gi+3 && parts[gi+1] === '参考图' && /^@图片\d+\.(png|jpe?g|webp)$/i.test(file.name)) group.images.push(file);
      if (parts.length === gi+3 && parts[gi+1] === '参考音频' && /^@音频\d+\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(file.name)) group.audios.push(file);
    }
    for(const [store,label,folders] of [[audioLibraries,'音频',['参考音频','公共参考音频']],[videoLibraries,'视频',['参考视频','公共参考视频']]])for(const [parent,rows] of store)orderResources(parent,rows,label,folders);
    for(const [parent,rows] of libraries)orderResources(parent,rows,'图片',['公共参考图']);
    for(const [parent,rows] of projectLibraries)orderResources(parent,rows,'图片',['参考图']);
    for(const [path,row] of namedPrompts)if(!row.found)throw Error('索引提示词文件不存在：'+path);
    const chapters = new Map();
    for (const group of groups.values()) {
      if (group.prompts.length !== 1) throw Error(`${group.chapter}/素材组${group.number}：每段需要唯一的提示词文件，请勿同时放提示词.txt与提示词1.txt`);
      group.name=group.prompts[0].name.replace(/\.txt$/i,'');
      group.prompt = (await group.prompts[0].text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
      if (!group.prompt) throw Error(`素材组${group.number}的提示词为空`);
      group.images.sort((a,b)=>numeric(a.name,b.name));
      const {images:sharedImages,root}=imageLibrary(group.chapter);
      if(root&&libraries.has(group.chapter))throw Error(`${group.chapter}：已有项目根参考图，请移除页内公共参考图`);
      if (sharedImages && group.images.length) throw Error(`素材组${group.number}：已有公共参考图，请移除重复的组内参考图`);
      const availableImages=sharedImages || group.images;
      if (!options.allowNoImages && !sharedImages && (!group.images.length || group.images.length > 9)) throw Error(`${group.chapter}/素材组${group.number}：参考图数量必须为1—9张。当前是“参考素材”模式；如果目录只有提示词，请在导入模式中选择“自动人物生图 → 生视频”后重新选择目录；如需使用已有图片，请在项目根参考图目录补充@图片1.png。`);
      group.images.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(`素材组${group.number}：图片需从@图片1连续编号，且不可重复`);});
      const refs = [...group.prompt.matchAll(/(?:<Picture\s+(\d+)>|@图片(\d+))/gi)].map(m=>Number(m[1]||m[2]));
      if(new Set(refs).size>9)throw Error('每段最多引用9张图片，项目图库数量不限');
      if (!options.allowNoImages && refs.some(n=>n<1||n>availableImages.length)) throw Error(`素材组${group.number}：提示词引用超出图片数量`);
      group.audios.sort((a,b)=>numeric(a.name,b.name));
      const sharedAudios=inherited(audioLibraries,group.chapter);
      if (sharedAudios && group.audios.length) throw Error("已有公共参考音频，请移除重复的组内参考音频");
      if (group.audios.length > 3) throw Error(`素材组${group.number}：参考音频最多3份`);
      group.audios.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(`素材组${group.number}：音频需从@音频1连续编号，且不可重复`);});
      const audioRefs=[...group.prompt.matchAll(/(?:<Audio\s+(\d+)>|@音频(\d+))/gi)].map(m=>Number(m[1]||m[2]));
      if(audioRefs.some(n=>n<1||n>(sharedAudios || group.audios).length)) throw Error(`素材组${group.number}：声音参考缺失，不能不绑定音频继续导入`);
      if(group.audios.some((_,i)=>!audioRefs.includes(i+1))) throw Error(`素材组${group.number}：参考音频未在提示词中明确指定角色或用途`);
      if (new Set(audioRefs).size > 3) throw Error("单组参考音频最多3份");
      const sharedVideos=inherited(videoLibraries,group.chapter) || [];
      const videoRefs=[...group.prompt.matchAll(/(?:<Video\s+(\d+)>|@视频(\d+))/gi)].map(m=>Number(m[1]||m[2]));
      if(videoRefs.some(n=>n<1||n>sharedVideos.length)) throw Error("公共视频参考缺失");
      if(new Set(videoRefs).size>3) throw Error("单组参考视频最多3份");
      let indexText=indexes.get(group.chapter);
      // An outer index is unambiguous only when it contains one upload page.
      if(indexText===undefined){
        const ancestors=group.chapter.split('/');
        while(ancestors.length>1){ancestors.pop();const parent=ancestors.join('/');if(!indexes.has(parent))continue;
          const pages=new Set([...groups.values()].filter(g=>g.chapter.startsWith(parent+'/')).map(g=>g.chapter));
          if(pages.size===1)indexText=indexes.get(parent);
          break;
        }
      }
      const row = (indexText||'').split(/\r?\n/).find(line=>new RegExp(`^\\|\\s*(?:素材组|分段|提示词)${group.number}\\s*\\|`).test(line));
      group.seconds = row ? Number(row.split('|')[2].trim()) : NaN;
      group.timeSource = row ? '素材组索引' : '提示词末时点';
      if (!row) {
        const ends = [...group.prompt.matchAll(/\d+(?:\.\d+)?\s*[～~–—-]\s*(\d+(?:\.\d+)?)\s*秒/g)].map(m=>Number(m[1]));
        group.seconds = ends.length ? Math.max(...ends) : NaN;
      }
      if (!Number.isFinite(group.seconds)||group.seconds<0.2||group.seconds>20.7) throw Error(`素材组${group.number}：无法识别0.2—20.7秒内的时长，请补齐提示词索引.md`);
      if (!chapters.has(group.chapter)) chapters.set(group.chapter,[]);
      chapters.get(group.chapter).push(group);
    }
    if (!chapters.size) throw Error('未找到可导入的提示词。中文剧情文件名需要同目录提示词索引.md登记；参考模式请选择完整项目根目录。');
    return [...chapters.entries()].sort((a,b)=>numeric(a[0],b[0])).map(([name,groups])=>{
      if(new Set(groups.map(g=>g.layout)).size>1)throw Error(`${name}：请勿混用平铺提示词与素材组目录`);
      groups.sort((a,b)=>a.number-b.number);
      groups.forEach((g,i)=>{if(g.number!==i+1) throw Error(`${name}：素材组必须从1连续编号`);});
      const {images:sharedImages,root}=imageLibrary(name);
      return {name,groups,...(root?{sharedImageRoot:root}:{}),...(sharedImages ? {sharedImages} : {}),...(inherited(audioLibraries,name)?{sharedAudios:inherited(audioLibraries,name)}:{}),...(inherited(videoLibraries,name)?{sharedVideos:inherited(videoLibraries,name)}:{})};
    });
  }
export {parseFiles};
export const FOLDER_PARSER_VERSION='0.15.22';
