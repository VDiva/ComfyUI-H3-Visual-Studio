from pathlib import Path
import importlib.util,types
from unittest.mock import Mock,patch
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('merge_permissions',root/'merge_video.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
file=Mock();file.stat.return_value.st_mode=0o100644
with patch.object(m,'os',types.SimpleNamespace(name='posix',X_OK=1,access=Mock(side_effect=[False,True]))):m.ensure_executable(file)
file.chmod.assert_called_once_with(0o755)
file.reset_mock()
with patch.object(m,'os',types.SimpleNamespace(name='nt')):m.ensure_executable(file)
file.chmod.assert_not_called()
with patch.object(m,'os',types.SimpleNamespace(name='posix',X_OK=1,access=Mock(return_value=True))):m.ensure_executable(file)
file.chmod.assert_not_called()
with patch.object(m,'os',types.SimpleNamespace(name='posix',X_OK=1,access=Mock(return_value=False))):
 try:m.ensure_executable(file);raise AssertionError('noexec ignored')
 except ValueError as e:assert 'noexec' in str(e)
file.chmod.side_effect=PermissionError('read only')
with patch.object(m,'os',types.SimpleNamespace(name='posix',X_OK=1,access=Mock(return_value=False))):
 try:m.ensure_executable(file);raise AssertionError('permission ignored')
 except ValueError as e:assert '只读' in str(e)
print('PASS Linux execute-bit repair, existing permission and Windows skip, read-only/noexec errors')

import sys,tempfile
with patch.object(m.shutil,'which',return_value='system-ffmpeg'):
 assert m.ffmpeg_path()=='system-ffmpeg'
with tempfile.TemporaryDirectory() as temp:
 candidate=Path(temp)/'ffmpeg';candidate.write_bytes(b'test')
 with patch.object(m.shutil,'which',return_value=None),patch.dict(sys.modules,{'imageio_ffmpeg':types.SimpleNamespace(get_ffmpeg_exe=lambda:str(candidate))}):
  assert m.ffmpeg_path()==str(candidate)
with patch.object(m.shutil,'which',return_value=None),patch.dict(sys.modules,{'imageio_ffmpeg':None}):
 try:m.ffmpeg_path();raise AssertionError('missing FFmpeg accepted')
 except ValueError as error:assert 'imageio-ffmpeg' in str(error)
print('PASS system/imageio FFmpeg resolution and actionable missing-dependency error')
