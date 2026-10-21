import assert from 'node:assert/strict';
import {backgroundBatch} from '../web/background-batch.mjs';
const page={pageId:'p',groups:[{id:'g',job:{promptId:'prompt',state:'queued'}}],batch:{id:'batch',state:'running'}};
let delayed,online=false,calls=[],updates=0;
const controller=backgroundBatch({api:{fetchApi:async(path,options)=>{
 calls.push([path,options?.method||'GET']);
 if(options?.method==='POST'){if(!online)throw Error('offline');return {ok:true,json:async()=>({id:'batch',state:'stopped',items:[]})};}
 if(!online)return new Promise(resolve=>delayed=resolve);
 return {ok:true,json:async()=>({id:'batch',state:'stopped',items:[]})};
}},getPage:()=>page,persist(){},onUpdate(){updates++;},log(){}});
const pending=controller.query();await Promise.resolve();
controller.suspend('服务失联');assert.equal(controller.active,false);assert.equal(controller.needsRecovery,true);assert.equal(page.batch.state,'disconnected');assert.equal(page.groups[0].job.promptId,'prompt');
delayed({ok:true,json:async()=>({id:'batch',state:'running',items:[]})});await pending;
assert.equal(page.batch.state,'disconnected','stale in-flight query must not lock UI again');
await assert.rejects(()=>controller.start([]),/先查询/);
online=true;await controller.query();assert.equal(page.batch.state,'stopped');assert.equal(controller.needsRecovery,false);assert.equal(controller.active,false);
assert.ok(calls.some(([path,method])=>path.endsWith('/batch/stop')&&method==='POST'));
assert.equal(updates,2);controller.dispose();
console.log('PASS local task suspension unlocks activity, retains task ID, ignores stale query, blocks duplicate submission and reconciles stopped batch');
