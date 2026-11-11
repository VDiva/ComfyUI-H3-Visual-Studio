from pathlib import Path
import importlib.util
import copy
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('shared_assets', ROOT/'director/shared_assets.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class SharedAssetsTests(unittest.TestCase):
 def timeline(self,prompt):
  return {'global':{'assetLibrary':{'images':[{'index':i,'imageFile':f'{i}.png'} for i in range(100)],'audios':[],'videos':[]}},'segments':[{'prompt':prompt}]}
 def test_unlimited_library_compact_order_dedup_unchanged(self):
  timeline=self.timeline('@图片20 then <Picture 3> then @图片20')
  original=copy.deepcopy(timeline);result=module.resolve_shared_assets(timeline)
  self.assertEqual(result['segments'][0]['prompt'],'<Picture 1> then <Picture 2> then <Picture 1>')
  self.assertEqual([r['imageFile'] for r in result['segments'][0]['refs']],['19.png','2.png'])
  self.assertEqual(timeline,original)
  self.assertEqual(result,module.resolve_shared_assets(result))
 def test_limit_not_truncate(self):
  with self.assertRaisesRegex(ValueError,'上限 9'):module.resolve_shared_assets(self.timeline(' '.join(f'@图片{i}' for i in range(1,11))))
 def test_missing(self):
  with self.assertRaisesRegex(ValueError,'缺失'):module.resolve_shared_assets(self.timeline('@图片101'))
 def test_common_and_per_segment(self):
  t=self.timeline('@图片20');t['global'].update(prompt='@图片3',commonEnabled=True)
  t['segments'].append({'prompt':'@图片100'})
  r=module.resolve_shared_assets(t)
  self.assertEqual([x['imageFile'] for x in r['segments'][1]['refs']],['2.png','99.png'])
 def test_audio_video_and_mixed_tokens(self):
  t=self.timeline('@音频7 <Video 8> @图片1 @音频7')
  t['global']['assetLibrary'].update(audios=[{'index':6,'audioFile':'voice.wav'}],videos=[{'index':7,'videoFile':'clip.mp4'}])
  r=module.resolve_shared_assets(t)['segments'][0]
  self.assertEqual(r['prompt'],'<Audio 1> <Video 1> <Picture 1> <Audio 1>')
 def test_legacy_identity(self):
  t={'global':{},'segments':[]};self.assertIs(module.resolve_shared_assets(t),t)
 def test_duplicate_id(self):
  t=self.timeline('@图片1');t['global']['assetLibrary']['images'].append({'index':0,'imageFile':'other.png'})
  with self.assertRaisesRegex(ValueError,'重复'):module.resolve_shared_assets(t)
if __name__=='__main__':unittest.main()
