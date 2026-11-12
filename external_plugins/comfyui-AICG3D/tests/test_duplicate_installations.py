import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("duplicate_fix", Path(__file__).resolve().parents[1] / "tools/fix_duplicate_installations.py")
fix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fix)


class DuplicateTests(unittest.TestCase):
    def test_dry_run_then_repair_preserves_files_and_other_plugins(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            nodes = root / "custom_nodes"
            keep = nodes / "comfyui-AICG3D"
            (keep / "aicg3d_h3easy").mkdir(parents=True)
            (keep / "aicg3d_h3easy/final_sequence_packed.py").write_text("# present")
            old = nodes / "aicg3d-h3-suite"
            old.mkdir()
            (old / "__init__.py").write_text("# old")
            (old / "pyproject.toml").write_text('[project]\nname = "aicg3d-h3-suite"\n')
            other = nodes / "Other"
            other.mkdir()
            (other / "__init__.py").write_text("# other")
            (other / "pyproject.toml").write_text('[project]\nname = "other"\n')
            self.assertEqual(fix.repair(keep), [old])
            self.assertTrue(old.exists())
            fix.repair(keep, True)
            self.assertFalse(old.exists())
            self.assertTrue(other.exists())
            backups = list((root / "disabled_custom_nodes").glob("*/aicg3d-h3-suite/__init__.py"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), "# old")
            self.assertEqual(fix.repair(keep, True), [])

    def test_wrong_location_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                fix.repair(Path(temp))

    def test_incomplete_retained_plugin_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            keep = Path(temp) / "custom_nodes/keep"
            keep.mkdir(parents=True)
            with self.assertRaises(ValueError):
                fix.repair(keep, True)


if __name__ == "__main__":
    unittest.main()
