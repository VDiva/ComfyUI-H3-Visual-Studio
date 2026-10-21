import assert from 'node:assert/strict';
import {backgroundBatch} from '../web/background-batch.mjs';
for(const status of [502,503,504,404,200]){
 let message='';const page={pageId:'p',groups:[]};
 const controller=backgroundBatch({api:{fetchApi:async()=>({status,ok:status===200,json:async()=>{throw Error('HTML response');}})},getPage:()=>page,persist(){},onUpdate(){},log:t=>message=t});
 await controller.query({discover:true});
 if([502,503,504].includes(status)){assert.match(message,/进度可能已过期/);assert.doesNotMatch(message,/更新插件/);}
 else if(status===404)assert.match(message,/接口不存在/);
 else assert.match(message,/返回异常/);
 controller.dispose();
}
console.log('PASS gateway failures distinguish stale progress from missing plugin routes');
