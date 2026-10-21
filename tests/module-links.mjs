// Parse/link the real frontend module graph without executing DOM or ComfyUI code.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
const modules=new Map();
async function get(file){
 file=path.resolve(file);
 if(modules.has(file))return modules.get(file);
 const module=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{identifier:file});
 modules.set(file,module);return module;
}
const app=new vm.SyntheticModule(['app'],function(){this.setExport('app',{});});
const api=new vm.SyntheticModule(['api'],function(){this.setExport('api',{});});
for(const name of (await fs.readdir(root)).filter(name=>/\.(?:js|mjs)$/.test(name))){
 const module=await get(path.join(root,name));
 if(module.status!=='unlinked')continue;
 await module.link(async(specifier,source)=>{
  if(specifier==='../../scripts/app.js')return app;
  if(specifier==='../../scripts/api.js')return api;
  if(!specifier.startsWith('./'))throw Error('Unrecognized import: '+specifier);
  return get(path.resolve(path.dirname(source.identifier),specifier.split('?')[0]));
 });
}
console.log('PASS frontend files, syntax, import paths and named exports ('+modules.size+' modules)');
