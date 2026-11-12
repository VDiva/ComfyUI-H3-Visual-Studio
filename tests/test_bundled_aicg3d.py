"""Dependency-free regression tests for the bundled registration bridge."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bundle_bridge", ROOT / "director/bundled_aicg3d.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.saved = {n: m for n, m in sys.modules.items() if n.split(".")[0] in bridge.PREFIXES}
        for name in self.saved:
            sys.modules.pop(name)
        self.paths = list(sys.path)

    def tearDown(self):
        for name in list(sys.modules):
            if name.split(".")[0] in bridge.PREFIXES:
                sys.modules.pop(name)
        sys.modules.update(self.saved)
        sys.path[:] = self.paths

    def fixture(self, root, complete=True):
        package = root / "aicg3d"
        package.mkdir()
        (package / "__init__.py").write_text("")
        mapping = {name: name for name in bridge.REQUIRED} if complete else {}
        (package / "registry.py").write_text(f"def build():\n    return {mapping!r}, {{}}\n")

    def test_required_nodes_registered_and_runtime_path_retained(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            nodes, _ = bridge.load_bundled_nodes(root)
            self.assertEqual(set(nodes), set(bridge.REQUIRED))
            self.assertEqual(Path(sys.modules["aicg3d.registry"].__file__).parent.parent, root.resolve())
            self.assertIn(str(root.resolve()), sys.path)

    def test_foreign_namespace_refused_without_reusing_it(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            foreign = types.ModuleType("aicg3d")
            foreign.__file__ = str(root.parent / "other/aicg3d/__init__.py")
            sys.modules["aicg3d"] = foreign
            with self.assertRaisesRegex(RuntimeError, "Duplicate AICG3D"):
                bridge.load_bundled_nodes(root)
            self.assertIs(sys.modules["aicg3d"], foreign)

    def test_incomplete_registry_rolls_back_modules_and_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root, False)
            with self.assertRaisesRegex(RuntimeError, "incomplete"):
                bridge.load_bundled_nodes(root)
            self.assertNotIn("aicg3d.registry", sys.modules)
            self.assertNotIn(str(root.resolve()), sys.path)

    def test_actual_sources_and_frontend_present(self):
        bundle = ROOT / "external_plugins/comfyui-AICG3D"
        text = (bundle / "aicg3d_h3easy/final_sequence_packed.py").read_text(encoding="utf-8")
        for name in bridge.REQUIRED:
            self.assertIn(name.replace("AICG3D_H3", "MiniMaxH3Easy"), text)
        for source in (bundle / "web").rglob("*"):
            if source.is_file():
                dest = ROOT / "web/js/aicg3d" / source.relative_to(bundle / "web")
                self.assertTrue(dest.is_file(), str(dest))
                if source.suffix == ".js":
                    self.assertNotIn('../../scripts/', dest.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
