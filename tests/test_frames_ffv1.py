"""Lossless cache round-trip and writable-buffer regression checks."""
import tempfile
import unittest
from pathlib import Path

try:
    import torch
    from lib.frames_ffv1 import (
        decode_frames_ffv1, encode_frames_ffv1, frames_codec_available,
    )
except ImportError:
    torch = None


@unittest.skipIf(torch is None, "PyTorch and NumPy required")
class FrameCacheTests(unittest.TestCase):
    def test_round_trip_is_exact_and_writable(self):
        if not frames_codec_available():
            self.skipTest("FFmpeg required")
        frames = torch.arange(5 * 16 * 16 * 3).remainder(256).to(torch.uint8)
        frames = frames.reshape(5, 16, 16, 3)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "frames.mkv"
            encode_frames_ffv1(path, frames)
            decoded = decode_frames_ffv1(path)
        # The backing buffer must survive the subprocess and local variables.
        self.assertTrue(torch.equal(decoded, frames))
        decoded[0].zero_()
        self.assertEqual(int(decoded[0].sum()), 0)
        self.assertTrue(torch.equal(decoded[1:], frames[1:]))


if __name__ == "__main__":
    unittest.main()
