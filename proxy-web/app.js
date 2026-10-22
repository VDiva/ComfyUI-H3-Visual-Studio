"use strict";
const $=id=>document.getElementById(id);
const fragment=new URLSearchParams(location.hash.slice(1));
let token=fragment.get('token')||sessionStorage.getItem('h3-proxy-web-token')||'';
if(fragment.has('token'))history.replaceState(null,'',location.pathname+location.search);
let state=null,requesting=false,timer;
function notice(text){$('notice').textContent=text;}
async function request(path,options={}){
 const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
 const data=await response.json();
 if(!response.ok){if(response.status===401){$('auth').hidden=false;$('workspace').hidden=true;}throw Error(data.error||'请求失败');}
 return data;
}
function paint(data){
 state=data;const busy=requesting||data.busy;
 $('auth').hidden=true;$('workspace').hidden=false;
 $('badge').textContent=data.running?'代理运行中':data.busy?'正在处理':'代理已停止';$('badge').classList.toggle('running',!!data.running);
 $('platform').textContent=data.platform+' · Mihomo '+data.version;
 $('kernel').textContent=data.installed?'内核已就绪，可直接保存订阅并开启':data.bundled_available?'内核已内置，正在离线安装':'当前架构未内置内核，请上传或在线安装';
 $('subscribed').textContent=data.subscribed?'已保存':'未保存';
 $('status').textContent=data.message||'';
 $('progress').hidden=!data.busy;$('progress').value=data.progress||0;
 $('asset-name').textContent=data.asset_name||'当前系统不支持一键安装';
 if(data.asset_url){$('asset').href=data.asset_url;$('asset').hidden=false;}else $('asset').hidden=true;
 for(const id of ['install','upload','subscribe','delete-subscription','start','stop','refresh','test','node'])$(id).disabled=busy;
 for(const id of ['install','upload','subscribe'])$(id).disabled=busy||data.running;
 $('start').disabled=busy||data.running||!data.installed||!data.subscribed;
 for(const id of ['stop','refresh','test','node'])$(id).disabled=busy||!data.running;
 $('delete-subscription').disabled=busy||!data.subscribed;
 const names=data.nodes||[];const current=Array.from($('node').options).map(o=>o.value);
 if(JSON.stringify(current)!==JSON.stringify(names)){
  $('node').replaceChildren();
  if(!names.length){const o=document.createElement('option');o.value='';o.textContent='开启后加载节点';$('node').append(o);}
  for(const name of names){const o=document.createElement('option');o.value=name;o.textContent=name;$('node').append(o);}
 }
 $('node').value=data.selected||'';
 const address=data.proxy||'';$('address').value=address;
 $('copy').disabled=!address;$('copy-commands').disabled=!address;
 $('commands').value=address?`export http_proxy=${address}
export https_proxy=${address}
export HTTP_PROXY=${address}
export HTTPS_PROXY=${address}
export no_proxy=localhost,127.0.0.1,::1
export NO_PROXY="$no_proxy"`:'';
}
async function refresh(){
 clearTimeout(timer);
 try{const data=await request('/api/status');sessionStorage.setItem('h3-proxy-web-token',token);paint(data);timer=setTimeout(refresh,data.busy?1000:3000);}
 catch(error){notice(error.message);if(!$('workspace').hidden)timer=setTimeout(refresh,4000);}
}
async function act(action,extra={}){
 if(requesting||state?.busy)return;requesting=true;notice('');if(state)paint(state);
 try{paint(await request('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}));if(action==='subscribe'||action==='delete-subscription')$('subscription').value='';}
 catch(error){notice(error.message);}finally{requesting=false;await refresh();}
}
$('auth-form').onsubmit=event=>{event.preventDefault();token=$('token').value.trim();$('token').value='';void refresh();};
$('subscription-form').onsubmit=event=>{event.preventDefault();void act('subscribe',{url:$('subscription').value});};
for(const action of ['install','start','stop','refresh','test','delete-subscription'])$(action).onclick=()=>act(action);
$('node').onchange=()=>act('select',{name:$('node').value});
$('upload').onclick=()=>$('archive').click();
$('archive').onchange=async()=>{
 const file=$('archive').files[0];$('archive').value='';if(!file)return;
 if(file.size>80*1024**2){notice('安装包超过 80 MiB，请选择官方压缩包。');return;}
 if(file.name!==state?.asset_name){notice('请选择当前系统对应的固定版本安装包：'+state?.asset_name);return;}
 requesting=true;paint(state);notice('正在上传安装包，请稍候…');
 try{await request('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});notice('上传完成，正在核对官方 SHA256…');}
 catch(error){notice(error.message);}finally{requesting=false;await refresh();}
};
async function copy(id){const field=$(id);try{await navigator.clipboard.writeText(field.value);notice('已复制');}catch{field.focus();field.select();notice('浏览器未允许复制，已选中文本，请按 Ctrl+C。');}}
$('copy').onclick=()=>copy('address');$('copy-commands').onclick=()=>copy('commands');
if(token)void refresh();
