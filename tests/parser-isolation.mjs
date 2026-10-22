import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseFiles,FOLDER_PARSER_VERSION} from '../web/folder-parser.mjs';
const f=(p,text='')=>({name:p.split('/').at(-1),webkitRelativePath:p,text:async()=>text});
globalThis.H3FolderCore={parseFiles:()=>{throw Error('旧缓存解析器');}};
const files=[f('项目/参考图/人物卡.png'),f('项目/参考图/参考图索引.md','|编号|文件名|\n|@图片1|人物卡.png|'),f('项目/电话亭外/提示词索引.md','|分段|请求秒数|提示词|\n|分段1|14|抵达电话亭.txt|'),f('项目/电话亭外/抵达电话亭.txt','@图片1 0～14秒')];
const [page]=await parseFiles(files);assert.equal(page.groups[0].name,'抵达电话亭');assert.equal(page.sharedImages[0].name,'人物卡.png');assert.equal(FOLDER_PARSER_VERSION,'0.15.16');
for(const file of ['global-entry.js','studio-runtime.mjs']){const text=await fs.readFile(new URL('../web/'+file,import.meta.url),'utf8');assert.ok(text.includes('parseProjectFiles('));assert.ok(!text.includes('globalThis.H3FolderCore.parseFiles'));}
const root=path.resolve('../../../黑暗集会');const actual=[];async function scan(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await scan(p);else actual.push({name:e.name,webkitRelativePath:'黑暗集会/'+path.relative(root,p).replaceAll('\\','/'),text:()=>fs.readFile(p,'utf8')});}}await scan(root);const pages=await parseFiles(actual);assert.equal(pages.length,1);assert.deepEqual(pages[0].groups.map(g=>g.seconds),[14,15]);assert.equal(pages[0].sharedImages.length,4);
console.log('PASS production parser resists stale global overwrite; both entries use versioned ESM; actual named project imports');
