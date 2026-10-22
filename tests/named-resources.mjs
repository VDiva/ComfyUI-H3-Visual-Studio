import assert from 'node:assert/strict';
import {parseFiles} from '../web/folder-parser.mjs';
const f=(path,text='')=>({name:path.split('/').at(-1),webkitRelativePath:path,text:async()=>text});
const files=[f('项目/参考图/主角.png'),f('项目/参考图/夜景.png'),f('项目/参考图/参考图索引.md','|编号|文件名|\n|@图片1|夜景.png|\n|@图片2|主角.png|'),f('项目/参考音频/平静男声.wav'),f('项目/参考音频/参考音频索引.md','|编号|文件名|\n|@音频1|平静男声.wav|'),f('项目/参考视频/推进镜头.mp4'),f('项目/参考视频/参考视频索引.md','|编号|文件名|\n|@视频1|推进镜头.mp4|'),f('项目/章节/提示词.txt','@图片2 @图片1 @音频1声线 @视频1运镜 0～4秒')];
const [page]=await parseFiles([...files].reverse());assert.deepEqual(page.sharedImages.map(f=>f.name),['夜景.png','主角.png']);assert.equal(page.sharedAudios[0].name,'平静男声.wav');assert.equal(page.sharedVideos[0].name,'推进镜头.mp4');
await assert.rejects(()=>parseFiles(files.filter(f=>f.name!=='主角.png')),/索引与实际文件不一致/);
await assert.rejects(()=>parseFiles(files.filter(f=>f.name!=='参考图索引.md')),/中文资源名/);
const bad=files.map(row=>row.name==='参考图索引.md'?f(row.webkitRelativePath,'|@图片1|主角.png|\n|@图片2|主角.png|'):row);await assert.rejects(()=>parseFiles(bad),/不可重复/);
console.log('PASS indexed Chinese image/audio/video names, stable ordering and missing/duplicate rejection');
