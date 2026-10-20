from pathlib import Path
import json,importlib.util,sys
root=Path(__file__).resolve().parents[1]
data=json.loads((root/"examples/官方可视化工作流.json").read_text(encoding="utf-8"))
nodes={n["id"]:n for n in data["nodes"]}
assert not any("Director" in n["type"] or "KJ" in n["type"] for n in nodes.values())
assert len([n for n in nodes.values() if n["type"]=="H3VisualProject"])==1
assert len([n for n in nodes.values() if n["type"]=="MiniMaxH3ReferenceToVideo"])==1
for lid,source,out,dest,slot,kind in data["links"]:
    assert nodes[source]["outputs"][out]["type"]==kind
    assert nodes[dest]["inputs"][slot]["type"]==kind
    assert nodes[dest]["inputs"][slot]["link"]==lid
    assert lid in nodes[source]["outputs"][out]["links"]
spec=importlib.util.spec_from_file_location("h3_studio",root/"__init__.py",submodule_search_locations=[str(root)])
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
node=m.H3VisualProject();assert node.read_project('{"pages":[]}')==('{"pages":[]}',)
try:node.read_project('[]');raise AssertionError("should reject arrays")
except ValueError:pass
print("PASS: official workflow links, no old runtime dependencies and metadata node import")
