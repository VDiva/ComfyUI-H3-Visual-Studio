"""Check real node INPUT_TYPES without importing torch / a running ComfyUI."""
import ast, json, types, logging
from pathlib import Path
root=Path(__file__).resolve().parents[1]
ns={'__name__':'schema_check', 'logging':logging, 'comfy':types.SimpleNamespace(samplers=types.SimpleNamespace(KSampler=types.SimpleNamespace(SAMPLERS=['euler','res_multistep','lcm'],SCHEDULERS=['simple','beta'])))}
for relative in ['director_core/director/refine_pack.py','director_core/director/selflift/pack.py']:
    for item in ast.parse((root/relative).read_text(encoding='utf-8-sig')).body:
        if isinstance(item,ast.Assign):
            try: value=ast.literal_eval(item.value)
            except (ValueError,TypeError): continue
            for target in item.targets:
                if isinstance(target,ast.Name):ns[target.id]=value
ns.update(list_h3_latent_upscale_models=lambda:['minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors'],
          ASPECT_RATIO_CHOICES=[ns['FOLLOW_DIRECTOR_ASPECT']],
          task_type_combo_options=lambda:(['r2v'],{'default':'r2v'}))
def load(relative, selected=None):
    tree=ast.parse((root/relative).read_text(encoding='utf-8-sig'))
    tree.body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef,ast.Assign)) and (selected is None or isinstance(n,ast.Assign) or getattr(n,'name',None) in selected)]
    exec(compile(tree,relative,'exec'),ns)
load('director_core/nodes/director_common.py',{'timeline_required_inputs','director_perf_inputs'})
load('director_core/nodes/director.py')
load('director_core/nodes/director_refine.py')
load('director_core/nodes/director_selflift.py')
load('director_bridge.py')
graphs=json.loads((root/'tests/.fixtures/director-schema.json').read_text(encoding='utf-8-sig'))
for node in [node for graph in graphs for node in graph.values()]:
    cls=ns.get(node['class_type'])
    if cls is None:continue
    schema=cls.INPUT_TYPES()
    for key, spec in schema.get('required',{}).items():
        assert key in node['inputs'], (node['class_type'],'missing',key)
        val=node['inputs'][key]
        if isinstance(spec[0],list) and not isinstance(val,list):assert val in spec[0], (key,val,spec[0])
    allowed=set(schema.get('required',{}))|set(schema.get('optional',{}))
    assert set(node['inputs'])<=allowed,(node['class_type'],set(node['inputs'])-allowed)
for file in root.rglob('*.py'):
    ast.parse(file.read_text(encoding='utf-8-sig'),filename=str(file))
print('PASS Director node schema contract and all Python source syntax')
