export const MEGAPIXELS=Array.from({length:20},(_,i)=>(i+1)/10);
export const ASPECTS=['16:9','9:16','1:1','4:3','3:4','2.39:1'];
export function resolutionFor(mp,aspect,step=32){
 const [a,b]=String(aspect).split(':').map(Number);
 if(!MEGAPIXELS.includes(Number(mp))||!a||!b||!Number.isFinite(a/b)||a<=0||b<=0)throw Error('无效的百万像素或画幅比例');
 const pixels=Number(mp)*1e6,ratio=a/b;
 return {width:Math.max(step,Math.round(Math.sqrt(pixels*ratio)/step)*step),height:Math.max(step,Math.round(Math.sqrt(pixels/ratio)/step)*step)};
}
export function resolutionSummary(s){return s.width+' × '+s.height+' · '+(s.width*s.height/1e6).toFixed(3)+' MP';}
export function mountResolution({container,getSettings,onChange,step=32,id='video-resolution'}){
 const doc=container.ownerDocument,label=doc.createElement('label'),mp=doc.createElement('select'),aspect=doc.createElement('select'),actual=doc.createElement('span');
 label.textContent='百万像素 ';mp.id=id+'-mp';mp.setAttribute('aria-label','百万像素');aspect.id=id+'-aspect';aspect.setAttribute('aria-label','画幅比例');
 for(const n of MEGAPIXELS){const o=doc.createElement('option');o.value=n;o.textContent=n.toFixed(1)+' MP'+(n<=0.4?' · 低分辨率预览':'');mp.append(o);}
 for(const value of ASPECTS){const o=doc.createElement('option');o.value=value;o.textContent=value;aspect.append(o);}
 label.append(mp);const ratioLabel=doc.createElement('label');ratioLabel.textContent='画幅比例 ';ratioLabel.append(aspect);actual.className='muted';actual.id=id+'-actual';container.append(label,ratioLabel,actual);
 function sync(){const s=getSettings();let match;for(const n of MEGAPIXELS)for(const a of ASPECTS){const r=resolutionFor(n,a,step);if(r.width===s.width&&r.height===s.height)match=[n,a];}
  mp.querySelector('[data-legacy]')?.remove();aspect.querySelector('[data-legacy]')?.remove();
  if(match){mp.value=match[0];aspect.value=match[1];}else{for(const [select,text] of [[mp,'保留已存尺寸'],[aspect,'已存比例']]){const o=doc.createElement('option');o.value='legacy';o.dataset.legacy='true';o.textContent=text;select.append(o);select.value='legacy';}}
  actual.textContent=resolutionSummary(s);
 }
 function change(){const s=getSettings();let a=aspect.value;if(a==='legacy'){const ratio=s.width/s.height;a=ASPECTS.reduce((best,v)=>{const [x,y]=v.split(':').map(Number);const [bx,by]=best.split(':').map(Number);return Math.abs(Math.log(x/y/ratio))<Math.abs(Math.log(bx/by/ratio))?v:best;},ASPECTS[0]);}
 const n=mp.value==='legacy'?MEGAPIXELS.reduce((best,v)=>Math.abs(v-s.width*s.height/1e6)<Math.abs(best-s.width*s.height/1e6)?v:best,0.4):Number(mp.value);
 Object.assign(s,resolutionFor(n,a,step),{megapixels:n});onChange(n);sync();}
 mp.onchange=change;aspect.onchange=change;sync();return {sync};
}
export function resolutionGuide(s,step=32){
 const ratio=s.width/s.height;const aspect=ASPECTS.reduce((best,v)=>{const [a,b]=v.split(':').map(Number),[x,y]=best.split(':').map(Number);return Math.abs(Math.log(a/b/ratio))<Math.abs(Math.log(x/y/ratio))?v:best;},'16:9');
 return '百万像素 / 分辨率\n1 MP = 100万像素\n按 '+aspect+'、'+step+' 像素对齐\n'+MEGAPIXELS.map(n=>{const r=resolutionFor(n,aspect,step);return n+' MP ≈ '+r.width+' × '+r.height;}).join('\n')+'\n当前 '+resolutionSummary(s)+'\n0.1—0.4仅作低分辨率预览\n更高档位增加细节空间、显存和耗时\n实际宽高因比例与对齐略有取整';
}
