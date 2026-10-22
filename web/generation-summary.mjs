import {finishingCanvas,defaultFinishing} from './finishing.mjs?v=0.15.31';
import {effectiveVideoSettings} from './acceleration.mjs?v=0.15.31';
export function generationSummary(project,group){const p=project,s=p.settings,f={...defaultFinishing(),...p.finishing},e=effectiveVideoSettings(s);const mp=s.megapixels??Number((s.width*s.height/1e6).toFixed(2));let text=`一采 ${mp} MP · ${s.width} × ${s.height} · ${e.steps}步 · ${e.sampler} / ${e.scheduler}`;
 if(p.selflift?.enabled)text+=' → SelfLift渐进采样';
 else {if(f.upscale!=='off'){const t=finishingCanvas(s.width,s.height,f);text+=` → ${f.upscale==='latent'?'H3 latent放大':f.upscale==='model'?'模型超分':'Lanczos放大'} ${f.megapixels} MP · ${t.width} × ${t.height}`;}
 text+=f.refine?` → 二采${f.steps}步 × ${f.passes}次 / 强度${f.denoise} / ${f.scheduler||'inherit'}`:' → 不二采';}
 text+=`；种子 ${s.seed}`;if(group)text+=`；本段 ${group.seconds}秒`;return text;}
