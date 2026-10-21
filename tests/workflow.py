from pathlib import Path
import json,ast
root=Path(__file__).resolve().parents[1]
data=json.loads((root/"tests/.fixtures/官方可视化工作流.json").read_text(encoding="utf-8"))
nodes={n["id"]:n for n in data["nodes"]}
assert not any("Director" in n["type"] or "KJ" in n["type"] for n in nodes.values())
assert len([n for n in nodes.values() if n["type"]=="H3VisualProject"])==1
assert len([n for n in nodes.values() if n["type"]=="MiniMaxH3ReferenceToVideo"])==1
for lid,source,out,dest,slot,kind in data["links"]:
    assert nodes[source]["outputs"][out]["type"]==kind
    assert nodes[dest]["inputs"][slot]["type"]==kind
    assert nodes[dest]["inputs"][slot]["link"]==lid
    assert lid in nodes[source]["outputs"][out]["links"]
tree=ast.parse((root/'__init__.py').read_text(encoding='utf-8-sig'))
tree.body=[item for item in tree.body if isinstance(item,ast.ClassDef) and item.name=='H3VisualProject']
namespace={'json':json};exec(compile(tree,'__init__.py','exec'),namespace)
node=namespace['H3VisualProject']();assert node.read_project('{"pages":[]}')==('{"pages":[]}',)
try:node.read_project('[]');raise AssertionError("should reject arrays")
except ValueError:pass
print("PASS: workflow links and isolated metadata node; full server import requires ComfyUI")
