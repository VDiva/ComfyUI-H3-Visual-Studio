(() => {
  const numeric = (a,b) => a.localeCompare(b, 'zh-CN', {numeric:true});
  async function parseFiles(files, options = {}) {
    const groups = new Map();
    const indexes = new Map();
    const libraries = new Map();
    const audioLibraries = new Map();
    const videoLibraries = new Map();
    for (const file of files) {
      const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
      const parts = path.split('/');
      if (parts.at(-2) === '公共参考图' && /^@图片\d+\.(png|jpe?g|webp)$/i.test(file.name)) {
        const parent=parts.slice(0,-2).join('/');
        if (!libraries.has(parent)) libraries.set(parent,[]);
        libraries.get(parent).push(file);
      }
      for (const [folder,label,extensions,store] of [
        ["公共参考音频","音频",/\.(wav|mp3|flac|ogg|m4a|aac)$/i,audioLibraries],
        ["公共参考视频","视频",/\.(mp4|mov|webm|mkv)$/i,videoLibraries]]) {
        if (parts.at(-2) === folder && new RegExp("^@"+label+"\\d+").test(file.name) && extensions.test(file.name)) {
          const parent=parts.slice(0,-2).join("/");
          if (!store.has(parent)) store.set(parent,[]);
          store.get(parent).push(file);
        }
      }
      const gi = parts.findIndex(x => /^素材组\d+$/.test(x));
      if (/^素材(?:组)?索引\.md$/i.test(parts.at(-1))) {
        const parent=parts.slice(0,-1).join('/');
        const text=(await file.text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
        if(indexes.has(parent)&&indexes.get(parent)!==text)throw Error(`${parent}：素材索引.md与素材组索引.md内容不同，请保留一份明确的时长索引`);
        indexes.set(parent,text);
      }
      if (gi < 1) continue;
      const chapter = parts.slice(0,gi).join('/');
      const number = Number(parts[gi].match(/\d+/)[0]);
      const key = `${chapter}/素材组${number}`;
      if (!groups.has(key)) groups.set(key, {chapter, number, images:[], audios:[], videos:[], prompts:[]});
      const group = groups.get(key);
      if (parts.length === gi+2 && parts.at(-1) === '提示词.txt') group.prompts.push(file);
      if (parts.length === gi+3 && parts[gi+1] === '参考图' && /^@图片\d+\.(png|jpe?g|webp)$/i.test(file.name)) group.images.push(file);
      if (parts.length === gi+3 && parts[gi+1] === '参考音频' && /^@音频\d+\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(file.name)) group.audios.push(file);
    }
    for (const store of [audioLibraries,videoLibraries]) for (const [parent,files] of store) {
      files.sort((a,b)=>numeric(a.name,b.name));
      files.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(parent+"：公共音频/视频需从1连续编号，且不可重复");});
    }
    for (const [parent, images] of libraries) {
      images.sort((a,b)=>numeric(a.name,b.name));
      images.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(`${parent}：公共图片需从@图片1连续编号，且不可重复`);});
    }
    const chapters = new Map();
    for (const group of groups.values()) {
      if (group.prompts.length !== 1) throw Error(`${group.chapter}/素材组${group.number}：需要唯一的提示词.txt`);
      group.prompt = (await group.prompts[0].text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
      if (!group.prompt) throw Error(`素材组${group.number}的提示词为空`);
      group.images.sort((a,b)=>numeric(a.name,b.name));
      const sharedImages=libraries.get(group.chapter);
      if (sharedImages && group.images.length) throw Error(`素材组${group.number}：已有公共参考图，请移除重复的组内参考图`);
      const availableImages=sharedImages || group.images;
      if (!options.allowNoImages && !sharedImages && (!group.images.length || group.images.length > 9)) throw Error(`${group.chapter}/素材组${group.number}：参考图数量必须为1—9张。当前是“参考素材”模式；如果目录只有提示词，请在导入模式中选择“自动人物生图 → 生视频”后重新选择目录；如需使用已有图片，请补充公共参考图/@图片1.png。`);
      group.images.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(`素材组${group.number}：图片需从@图片1连续编号，且不可重复`);});
      const refs = [...group.prompt.matchAll(/(?:<Picture\s+(\d+)>|@图片(\d+))/gi)].map(m=>Number(m[1]||m[2]));
      if (!options.allowNoImages && refs.some(n=>n<1||n>availableImages.length)) throw Error(`素材组${group.number}：提示词引用超出图片数量`);
      group.audios.sort((a,b)=>numeric(a.name,b.name));
      const sharedAudios=audioLibraries.get(group.chapter);
      if (sharedAudios && group.audios.length) throw Error("已有公共参考音频，请移除重复的组内参考音频");
      if (group.audios.length > 3) throw Error(`素材组${group.number}：参考音频最多3份`);
      group.audios.forEach((f,i)=>{if(Number(f.name.match(/\d+/)[0])!==i+1) throw Error(`素材组${group.number}：音频需从@音频1连续编号，且不可重复`);});
      const audioRefs=[...group.prompt.matchAll(/(?:<Audio\s+(\d+)>|@音频(\d+))/gi)].map(m=>Number(m[1]||m[2]));
      if(audioRefs.some(n=>n<1||n>(sharedAudios || group.audios).length)) throw Error(`素材组${group.number}：声音参考缺失，不能不绑定音频继续导入`);
      if(group.audios.some((_,i)=>!audioRefs.includes(i+1))) throw Error(`素材组${group.number}：参考音频未在提示词中明确指定角色或用途`);
      if (new Set(audioRefs).size > 3) throw Error("单组参考音频最多3份");
      const sharedVideos=videoLibraries.get(group.chapter) || [];
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
      const row = (indexText||'').split(/\r?\n/).find(line=>new RegExp(`^\\|\\s*素材组${group.number}\\s*\\|`).test(line));
      group.seconds = row ? Number(row.split('|')[2].trim()) : NaN;
      group.timeSource = row ? '素材组索引' : '提示词末时点';
      if (!row) {
        const ends = [...group.prompt.matchAll(/\d+(?:\.\d+)?\s*[～~–—-]\s*(\d+(?:\.\d+)?)\s*秒/g)].map(m=>Number(m[1]));
        group.seconds = ends.length ? Math.max(...ends) : NaN;
      }
      if (!Number.isFinite(group.seconds)||group.seconds<0.2||group.seconds>20.7) throw Error(`素材组${group.number}：无法识别0.2—20.7秒内的时长，请补齐素材组索引.md`);
      if (!chapters.has(group.chapter)) chapters.set(group.chapter,[]);
      chapters.get(group.chapter).push(group);
    }
    if (!chapters.size) throw Error('未找到素材组。请选择包含“素材组1/提示词.txt”和“公共参考图”的章节目录。');
    return [...chapters.entries()].sort((a,b)=>numeric(a[0],b[0])).map(([name,groups])=>{
      groups.sort((a,b)=>a.number-b.number);
      groups.forEach((g,i)=>{if(g.number!==i+1) throw Error(`${name}：素材组必须从1连续编号`);});
      const sharedImages=libraries.get(name);
      return {name,groups,...(sharedImages ? {sharedImages} : {}),...(audioLibraries.has(name) ? {sharedAudios:audioLibraries.get(name)} : {}),...(videoLibraries.has(name) ? {sharedVideos:videoLibraries.get(name)} : {})};
    });
  }
  const api = {parseFiles};
  globalThis.H3FolderCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
