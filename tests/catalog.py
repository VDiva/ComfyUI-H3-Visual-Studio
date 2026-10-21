import importlib.util, tempfile, json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('catalog_test',root/'model_download.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
key=m.DMAD_MODEL['key']
rows={r['key']:r for r in m.load_catalog()}
for category,name,repo in [
 ('diffusion_models','minimax_h3_fl2va_pruned_int8_convrot.safetensors','Comfy-Org/MiniMax-H3'),
 ('diffusion_models','minimax_h3_ref2va_pruned_w4a8_mixed.safetensors','Kijai/MiniMax-H3-experimental'),
 ('loras','minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors','Comfy-Org/MiniMax-H3')]:
 row=rows['models/'+category+'/'+name]
 assert row['source']=='https://huggingface.co/'+repo and row['url'].endswith('/'+name)
 assert row['size']>0 and len(row['sha256'])==64
assert next(r for r in m.load_catalog() if r['key']==key)['url']==m.DMAD_MODEL['url']
with tempfile.TemporaryDirectory() as temp:
    m.CATALOG_PATH=Path(temp)/'catalog.json'
    m.CATALOG_PATH.write_text('[]',encoding='utf-8')
    assert m.load_catalog()==[m.DMAD_MODEL]
    other={'key':'models/vae/example.safetensors','category':'vae','name':'example.safetensors'}
    m.CATALOG_PATH.write_text(json.dumps([other]),encoding='utf-8')
    assert other in m.load_catalog(), 'catalog must reload after disk update'
    m.CATALOG_PATH.write_text(json.dumps([dict(m.DMAD_MODEL,url='https://invalid.example')]),encoding='utf-8')
    assert m.load_catalog()==[m.DMAD_MODEL], 'DMAD fallback must use trusted fixed URL without duplicates'
assert m.BACKEND_VERSION=='0.5.12'
print('PASS real DMAD catalog key/URL, old catalog fallback, disk reload, deduplication and backend version')
