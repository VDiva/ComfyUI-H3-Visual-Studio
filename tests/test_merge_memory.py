"""Merge scheduling regression tests; run in the ComfyUI Python environment."""
import ast
from pathlib import Path
import unittest

try:
    import torch
except ImportError:
    torch = None


@unittest.skipIf(torch is None, "PyTorch required")
class MergeTests(unittest.TestCase):
    def test_seam_order_and_input_preservation(self):
        path = Path(__file__).resolve().parents[1] / "director/segment_continuity.py"
        tree = ast.parse(path.read_text(encoding="utf-8-sig"))
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                    and n.name == "concat_continuous_chunks")
        node.returns = None
        for arg in node.args.args:
            arg.annotation = None
        namespace = {
            "torch": torch,
            "cat_frames_variable_size": lambda xs: torch.cat(xs),
            "CONTINUITY_HOLD_POP_ON_TAIL": True,
            "CONTINUITY_SPIKE_WEIGHT": 1,
            "_unfreeze_held_tail": lambda x: x + 1,
            "_break_hold_pop_window": lambda x, from_end: x * (2 if from_end else 3),
            "_ease_opening_spikes": lambda x: x + 2,
            "_soften_body0_toward_prev": lambda x, left: x + left[-1:],
            "_additive_opening_luma": lambda x, left: x * 0.5 + left[-1:],
            "_micro_seam_bridge": lambda left, right: (left + right[:1], right - left[-1:]),
        }
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), namespace)
        chunks = [torch.full((n, 2, 2, 3), float(i)) for i, n in enumerate((2, 3, 1, 4))]
        originals = [x.clone() for x in chunks]
        fixed = [chunks[0]]
        for chunk in chunks[1:]:
            left = (fixed[-1] + 1) * 2
            body = chunk * 3 + 2
            body = body + left[-1:]
            body = body * 0.5 + left[-1:]
            fixed[-1], body = left + body[:1], body - left[-1:]
            fixed.append(body)
        plan = type("Plan", (), {"continuity_enabled": True})()
        result = namespace["concat_continuous_chunks"](chunks, [], plan)
        self.assertTrue(torch.equal(result, torch.cat(fixed)))
        for chunk, original in zip(chunks, originals):
            self.assertTrue(torch.equal(chunk, original))


if __name__ == "__main__":
    unittest.main()
