import {compileRequest} from './project.mjs?v=0.15.31';
export function compileSequence(base,project,groups){
 if(groups.length<2)throw Error('多段成片至少需要两组');
 const frameSequence=groups.some(g=>g.firstFrame?.file||g.lastFrame?.file||g.frameMode==='fl2v');
 const graph={},cores=[],ports=[];let counter=0,saveId;
 for(const group of groups){
  const source=compileRequest(base,{...project,autoMerge:true},frameSequence?{...group,frameMode:'fl2v'}:group).prompt;
  const mapping=new Map(Object.keys(source).map(id=>[id,String(++counter)]));
  for(const [id,node] of Object.entries(source)){
   const inputs=Object.fromEntries(Object.entries(node.inputs).map(([key,v])=>[key,Array.isArray(v)&&v.length===2&&typeof v[1]==='number'&&mapping.has(String(v[0]))?[mapping.get(String(v[0])),v[1]]:structuredClone(v)]));
   graph[mapping.get(id)]={...node,inputs};
   if(node.class_type==='H3StudioDirector'){if(inputs.dialogue)throw Error('固定声线配音使用逐段后台合并，不支持多段单节点对白锁定');cores.push(mapping.get(id));ports.push(inputs.i2v_groups?'i2v_groups':'r2v_groups');}
   if(node.class_type==='SaveVideo'&&saveId===undefined)saveId=mapping.get(id);
  }
 }
 if(new Set(ports).size!==1)throw Error('同一次导演台多段生成不能混用参考素材与首尾帧模式');
 const port=ports[0],core=graph[cores[0]],combine=String(++counter);
 graph[combine]={class_type:'H3StudioGroupsCombine',inputs:Object.fromEntries(cores.map((id,i)=>['group_'+i,graph[id].inputs[port]]))};
 core.inputs[port]=[combine,0];core.inputs.total_frames=cores.reduce((n,id)=>n+graph[id].inputs.total_frames,0);
 const timeline=JSON.parse(core.inputs.timeline_data);Object.assign(timeline.output,{exportMode:'all',continuityEnabled:!!project.continuity,continuityOverlapFrames:22});core.inputs.timeline_data=JSON.stringify(timeline);
 graph[saveId].inputs.filename_prefix='H3_Merged/'+graph[saveId].inputs.filename_prefix.replace(/^\.h3-intermediate\//,'');
 const keep=new Set();function visit(id){if(keep.has(id))return;keep.add(id);for(const v of Object.values(graph[id].inputs))if(Array.isArray(v)&&v.length===2&&typeof v[1]==='number'&&graph[String(v[0])])visit(String(v[0]));}visit(saveId);
 return Object.fromEntries(Object.entries(graph).filter(([id])=>keep.has(id)));
}
