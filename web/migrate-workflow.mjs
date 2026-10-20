export function migrateWorkflow(data){
 let changed=0;
 for(const node of data?.nodes||[]){if(node.type==='ModelSamplingMiniMaxH3'){node.type='MiniMaxH3SigmaShift';if(node.properties?.['Node name for S&R']==='ModelSamplingMiniMaxH3')node.properties['Node name for S&R']='MiniMaxH3SigmaShift';changed++;}}
 return changed;
}
export async function repairCurrentWorkflow(app,storage){
 const before=structuredClone(app.graph.serialize());const fixed=structuredClone(before);const count=migrateWorkflow(fixed);if(!count)return 0;
 storage.setItem('h3-visual-studio.before-sampling-repair.v1',JSON.stringify(before));
 try{await app.loadGraphData(fixed);}catch(error){await app.loadGraphData(before);throw error;}
 return count;
}
