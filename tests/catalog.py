import importlib.util, tempfile, json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('catalog_test',root/'model_download.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
key=m.DMAD_MODEL['key']
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
assert m.BACKEND_VERSION=='0.5.7'
print('PASS real DMAD catalog key/URL, old catalog fallback, disk reload, deduplication and backend version')
