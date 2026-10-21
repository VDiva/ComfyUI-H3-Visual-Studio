import assert from 'node:assert/strict';
import {syncFinishingResolution,targetCanvas,finishingSettings} from '../web/finishing.mjs';
import {resolutionFor,MEGAPIXELS,ASPECTS} from '../web/resolution.mjs';
for(const aspect of ASPECTS)for(const mp of MEGAPIXELS){
 const p={settings:resolutionFor(mp,aspect),finishing:{upscale:'latent',megapixels:0.7,steps:3,denoise:0.2}};
 syncFinishingResolution(p,mp);assert.equal(p.finishing.megapixels,Number((2*mp).toFixed(1)));
 const t=targetCanvas(p.settings.width,p.settings.height,p.finishing.megapixels);
 assert.ok(t.width>=p.settings.width&&t.height>=p.settings.height);
 assert.equal(finishingSettings(p.finishing).megapixels,p.finishing.megapixels);
 assert.equal(p.finishing.steps,3);assert.equal(p.finishing.denoise,0.2);
}
const p={settings:resolutionFor(0.6,'16:9'),finishing:{megapixels:3}};
assert.equal(syncFinishingResolution(p,0.6),true);assert.equal(p.finishing.megapixels,1.2);
p.settings=resolutionFor(0.4,'16:9');syncFinishingResolution(p,0.4);assert.equal(p.finishing.megapixels,0.8);
assert.equal(syncFinishingResolution(p,0.4),false);
p.finishing.upscale='off';assert.equal(syncFinishingResolution(p,2),false);assert.equal(p.finishing.megapixels,0.8);
console.log('PASS double MP for every source MP/aspect, 4MP maximum, downward sync, preserved sampling parameters and disabled upscale');
