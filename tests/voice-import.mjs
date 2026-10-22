import assert from 'node:assert/strict';
import {parseFiles} from '../web/folder-parser.mjs';
const f=(path,text='')=>({name:path.split('/').at(-1),webkitRelativePath:path,text:async()=>text});
const files=[f('项目/参考音频/参考音频索引.md','|编号|文件名|配音角色编号|角色姓名|\n|@音频1|知夏.wav|S3|林知夏|'),f('项目/参考音频/知夏.wav'),f('项目/片段/提示词.txt','0～2秒知夏(S3)说：<d>[Japanese]はい</d>')];
const rows=await parseFiles(files,{allowNoImages:true});assert.equal(rows[0].voiceBindings[0].speaker,'S3');assert.equal(rows[0].voiceBindings[0].file,files[1]);assert.equal(rows[0].groups[0].audios.length,0);
await assert.rejects(()=>parseFiles(files.filter(x=>x!==files[1]),{allowNoImages:true}),/文件缺失/);
console.log('PASS indexed voice binding without prompt audio reference, missing sample rejection');
