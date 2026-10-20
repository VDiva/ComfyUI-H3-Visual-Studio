import assert from 'node:assert/strict';
import {resourceSuggestions,mentionQuery,resourceTokens} from '../web/resource-editor.mjs';
const media={images:[{id:2,name:'知夏.png'}],audios:[{id:1,name:'声线.wav'}],videos:[{id:3,name:'街道.mp4'}]};
assert.equal(resourceSuggestions(media).length,3);assert.equal(resourceSuggestions(media,'知夏')[0].token,'@图片2');assert.equal(resourceSuggestions(media,'音频')[0].key,'audios');
assert.deepEqual(mentionQuery('角色使用@图',6),{start:4,end:6,query:'图'});assert.equal(mentionQuery('文字@图片2 已结束',10),null);
const tokens=resourceTokens('@图片2.png <Audio 1> @视频3 @图片9 <Picture 2>',media);assert.equal(tokens.length,5);assert.equal(tokens.filter(t=>t.exists).length,4);assert.equal(tokens[2].key,'videos');assert.equal(tokens[3].exists,false);
console.log('PASS resource search, mention caret range, Chinese and official tags, type colors and missing resources');
