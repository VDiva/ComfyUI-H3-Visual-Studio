import {resolutionFor,MEGAPIXELS,ASPECTS} from './resolution.mjs?v=0.15.0';
import {targetCanvas,finishingCanvas,finishingSettings} from './finishing.mjs?v=0.15.0';
export function qualityVariants(project,group,{kind='resolution',a=0.4,b=0.6,target=1.2}={}){
 if(!group)throw Error('请先选择一个分段');
 if(project.selflift?.enabled)throw Error('画质对比请先关闭SelfLift，保持只改变一个参数');
 if(!['resolution','denoise','steps'].includes(kind)||a===b)throw Error('请选择不同的A/B参数');
 const ratio=project.settings.width/project.settings.height;
 const aspect=ASPECTS.reduce((best,v)=>{const r=v.split(':').map(Number),old=best.split(':').map(Number);return Math.abs(Math.log(r[0]/r[1]/ratio))<Math.abs(Math.log(old[0]/old[1]/ratio))?v:best;},ASPECTS[0]);
 return [a,b].map((value,i)=>{const p=structuredClone(project),g=structuredClone(group);p.name+='_对比'+(i?'B':'A');p.autoMerge=false;
  if(kind==='resolution'){if(!MEGAPIXELS.includes(value))throw Error('一采MP范围0.1—2.0，每0.1一档');Object.assign(p.settings,resolutionFor(value,aspect),{megapixels:value});p.finishing={...p.finishing,megapixels:target,canvas:targetCanvas(project.settings.width,project.settings.height,target)};if(p.finishing.upscale==='off')throw Error('分辨率对比需开启放大，以固定最终目标');}
  else {if(!p.finishing.refine)throw Error('请先开启二采');p.finishing={...p.finishing,[kind]:value};}
  const s=finishingSettings(p.finishing),t=finishingCanvas(p.settings.width,p.settings.height,s);
  if(s.upscale!=='off'&&(t.width<p.settings.width||t.height<p.settings.height))throw Error('固定二采目标小于某组一采尺寸，请提高固定目标MP');
  g.id=group.id+'_compare_'+i;
  return {project:p,group:g,label:(i?'B':'A')+' · '+({resolution:'一采MP',denoise:'二采强度',steps:'二采步数'})[kind]+' '+value};
 });
}
export function openQualitySetup({root,onSubmit,initialTarget=1.2}){
 const d=root.ownerDocument.createElement('dialog');d.style.cssText='width:550px;max-width:90vw;background:#14232f;color:#dfedf7;padding:22px;border-radius:12px;border:1px solid #537185';
 d.innerHTML='<h3>固定条件画质对比</h3><p>同一提示词、种子和参考素材，生成A/B两段，只修改下面选中的参数；结果单独保存，不覆盖当前成片。不同尺寸的噪声形状不同，固定种子不保证构图完全相同。</p><form style="display:grid;gap:14px"><label>比较参数 <select name="kind"><option value="resolution">一采MP</option><option value="denoise">二采强度</option><option value="steps">二采步数</option></select></label><label>A <input name="a" type="number" step="0.1" value="0.4"></label><label>B <input name="b" type="number" step="0.1" value="0.6"></label><label>固定二采目标MP（比较一采时使用） <input name="target" type="number" min="0.1" max="4" step="0.1"></label><p role="status"></p><div><button type="submit">提交A/B后台生成</button> <button type="button" id="quality-close">关闭</button></div></form>';
 d.querySelector('[name=target]').value=Math.max(1.2,initialTarget);d.querySelector('[name=kind]').onchange=e=>{const pair=e.target.value==='denoise'?[0.1,0.2]:e.target.value==='steps'?[3,5]:[0.4,0.6];['a','b'].forEach((k,i)=>{const input=d.querySelector('[name='+k+']');input.value=pair[i];input.step=e.target.value==='steps'?'1':'0.1';});};
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;try{const f=new FormData(e.target);await onSubmit({kind:f.get('kind'),a:Number(f.get('a')),b:Number(f.get('b')),target:Number(f.get('target'))});d.close();}catch(error){d.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};
 d.querySelector('#quality-close').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());root.append(d);d.showModal();return d;
}
