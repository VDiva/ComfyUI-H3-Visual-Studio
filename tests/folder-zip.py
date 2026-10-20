import importlib.util,io,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location("folder_zip",r/"folder_zip.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
data=m.template_zip({'entries':[{'path':'1_26/公共参考图/','directory':True},{'path':'1_26/素材组1/提示词.txt','text':'中文模板'}]})
with zipfile.ZipFile(io.BytesIO(data)) as z:assert z.read('1_26/素材组1/提示词.txt').decode()=='中文模板';assert '1_26/公共参考图/' in z.namelist()
for p in ['../bad','/absolute','a/../bad','C:/bad']:
 try:m.template_zip({'entries':[{'path':p,'text':'bad'}]});raise AssertionError('unsafe path')
 except ValueError:pass
print('PASS UTF8 archive, empty directory and path guards')
