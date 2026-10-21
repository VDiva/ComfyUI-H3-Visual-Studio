export function mountProxyCore({api,container,log}){
 const box=document.createElement('section');box.className='library';box.id='proxy-core-panel';
 box.innerHTML='<div class="title">Clash / Mihomo 订阅代理</div><p class="muted">代理运行在ComfyUI服务器。填写Clash/Mihomo兼容订阅，开启后用于插件下载；仙宫云线路保持直连。</p><div class="row"><input id="proxy-subscription" type="password" autocomplete="off" spellcheck="false" aria-label="代理订阅链接" placeholder="订阅链接（保存后不回显）" style="flex:1;min-width:200px"><button id="proxy-subscribe">保存订阅</button></div><div class="row"><button id="proxy-install">安装Mihomo内核</button><button id="proxy-start">开启代理</button><button id="proxy-stop">停止代理</button><button id="proxy-refresh">更新订阅</button><button id="proxy-test">测试代理连接</button><a href="https://github.com/MetaCubeX/mihomo" target="_blank" rel="noopener">Mihomo官方 / GPL-3.0</a></div><div class="row"><label>代理节点 <select id="proxy-node" aria-label="代理节点"><option value="">开启代理后加载节点</option></select></label></div><p id="proxy-core-status" class="muted" role="status">正在检查代理内核…</p>';
 container.prepend(box);const $=id=>box.querySelector('#'+id);let timer=null,disposed=false,requesting=false,state=null;
 function paint(data){state=data;const busy=requesting||data.busy;
  $('proxy-core-status').textContent=(data.running?'运行中':'已停止')+' · '+(data.installed?'内核 '+data.version:'内核未安装')+' · '+(data.subscribed?'订阅已保存':'未保存订阅')+'\n'+(data.message||'')+(data.busy&&data.progress?' · '+data.progress+'%':'');
  for(const action of ['install','subscribe','start','stop','refresh','test'])$('proxy-'+action).disabled=busy;
  $('proxy-subscribe').disabled=busy||data.running;$('proxy-install').disabled=busy||data.running;
  $('proxy-start').disabled=busy||data.running||!data.installed||!data.subscribed;
  for(const action of ['stop','refresh','test'])$('proxy-'+action).disabled=busy||!data.running;
  $('proxy-node').disabled=busy||!data.running;
  const names=data.nodes||[],current=[...$('proxy-node').options].map(o=>o.value);
  if(JSON.stringify(current)!==JSON.stringify(names)){
   $('proxy-node').replaceChildren();if(!names.length){const option=document.createElement('option');option.value='';option.textContent='开启代理后加载节点';$('proxy-node').append(option);}
   for(const name of names){const option=document.createElement('option');option.value=name;option.textContent=name;$('proxy-node').append(option);}
  }
  $('proxy-node').value=data.selected||'';
  if(data.running){
   const source={auto:'自动：仙宫云优先，回退官方源才使用代理',xiangongyun:'仙宫云：直连，不经过代理',official:'官方源：新建下载连接使用代理'}[data.download_source]||'下载源状态未知';
   $('proxy-core-status').textContent+='\n'+(data.download_attached===false?'下载代理未接管，可能被手动代理设置覆盖；请停止后重新开启。':data.download_attached===true?'已接管插件下载代理。':'')+' '+source+'。开启或切换节点后，已有下载连接不会立即重连；请重试失败项。';
  }
 }
 function schedule(){clearTimeout(timer);if(!disposed&&box.isConnected&&(state?.busy||state?.running))timer=setTimeout(refresh,state?.busy?1200:5000);}
 async function refresh(){if(disposed)return;try{const response=await api.fetchApi('/h3_visual_studio/proxy-core');if(!response.ok)throw Error('代理管理不可用，请更新完整插件并重启ComfyUI');paint(await response.json());schedule();}catch(error){$('proxy-core-status').textContent=error.message;}}
 async function act(action,extra={}){if(requesting||disposed)return;requesting=true;if(state)paint(state);
  try{const response=await api.fetchApi('/h3_visual_studio/proxy-core',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});const data=await response.json();if(!response.ok)throw Error(data.error||'代理操作失败');if(action==='subscribe')$('proxy-subscription').value='';paint(data);}
  catch(error){state={...(state||{}),message:error.message};log(error.message);$('proxy-core-status').textContent=error.message;}
  finally{requesting=false;if(state)paint(state);schedule();}
 }
 $('proxy-subscribe').onclick=()=>act('subscribe',{url:$('proxy-subscription').value});
 $('proxy-node').onchange=()=>act('select',{name:$('proxy-node').value});
 for(const action of ['install','start','stop','refresh','test'])$('proxy-'+action).onclick=()=>act(action);
 void refresh();return {refresh,dispose(){disposed=true;clearTimeout(timer);box.remove();}};
}
