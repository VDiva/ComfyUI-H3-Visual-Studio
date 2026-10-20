const loaders={UNETLoader:['unet_name','diffusion_models'],CLIPLoader:['clip_name','text_encoders'],DualCLIPLoader:['clip_name1','text_encoders','clip_name2'],VAELoader:['vae_name','vae'],LoraLoaderModelOnly:['lora_name','loras'],LoraLoader:['lora_name','loras'],UpscaleModelLoader:['model_name','upscale_models']};
export function modelReport(info,prompts){
 const missing=new Set(),nodes=new Set(),unknown=new Set(),checked=new Set();
 for(const prompt of prompts)for(const node of Object.values(prompt||{})){
  if(node.class_type==='H3VisualProject')continue;
  const definition=info[node.class_type];if(!definition)nodes.add(node.class_type);
  const loader=loaders[node.class_type];if(!loader)continue;
  for(const field of [loader[0],loader[2]].filter(Boolean)){
   const file=node.inputs?.[field];if(typeof file!=='string'||!file)continue;
   const label=`models/${loader[1]}/${file}`;checked.add(label);
   const choices=(definition?.input?.required?.[field]||definition?.input?.optional?.[field])?.[0];
   if(Array.isArray(choices)){if(!choices.includes(file))missing.add(label);}else unknown.add(label);
  }
 }
 return {missing:[...missing],nodes:[...nodes],unknown:[...unknown],checked:[...checked]};
}
export function reportText(r){return [r.missing.length?'缺少模型（'+r.missing.length+'项）：\n'+r.missing.join('\n'):'',r.nodes.length?'缺少节点（请更新ComfyUI或安装对应插件）：\n'+r.nodes.join('\n'):'',r.unknown.length?'无法确认模型（未返回模型列表）：\n'+r.unknown.join('\n'):''].filter(Boolean).join('\n\n')||`模型检查通过（${r.checked.length}项）。`;}
export function assertModels(r){if(r.missing.length||r.nodes.length||r.unknown.length)throw Error(reportText(r));}
