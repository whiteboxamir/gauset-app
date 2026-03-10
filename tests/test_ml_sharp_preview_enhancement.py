import json
import sys
import tempfile
import unittest
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "ml-sharp" / "src"))

from models.ml_sharp_wrapper import (  # noqa: E402
    DEFAULT_PREVIEW_DENSITY_MULTIPLIER,
    _enhance_preview_outputs,
    _merge_preview_metadata,
)
from sharp.utils.gaussians import Gaussians3D, load_ply, save_ply  # noqa: E402


class MlSharpPreviewEnhancementTests(unittest.TestCase):
    def test_enhancement_increases_density_and_lifts_exposure(self) -> None:
        with tempfile.TemporaryDirectory(prefix="gauset-ml-sharp-test-") as temp_dir:
            output_dir = Path(temp_dir)
            gaussians = Gaussians3D(
                mean_vectors=torch.tensor(
                    [[[0.0, 0.0, 4.0], [0.1, -0.05, 4.2]]],
                    dtype=torch.float32,
                ),
                singular_values=torch.tensor(
                    [[[0.06, 0.05, 0.02], [0.05, 0.04, 0.02]]],
                    dtype=torch.float32,
                ),
                quaternions=torch.tensor(
                    [[[1.0, 0.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]]],
                    dtype=torch.float32,
                ),
                colors=torch.tensor(
                    [[[0.12, 0.10, 0.09], [0.22, 0.18, 0.16]]],
                    dtype=torch.float32,
                ),
                opacities=torch.tensor([[0.82, 0.74]], dtype=torch.float32),
            )

            save_ply(gaussians, 640.0, (64, 64), output_dir / "splats.ply")
            (output_dir / "metadata.json").write_text(json.dumps({"lane": "preview", "delivery": {"axes": {}}}, indent=2))
            (output_dir / "cameras.json").write_text("[]")

            before_gaussians, _ = load_ply(output_dir / "splats.ply")
            before_colors = before_gaussians.colors.flatten(0, 1)
            before_luma = (before_colors[:, 0] * 0.299) + (before_colors[:, 1] * 0.587) + (before_colors[:, 2] * 0.114)

            enhancement = _enhance_preview_outputs(output_dir)
            _merge_preview_metadata(output_dir / "metadata.json", enhancement, Path("/tmp/input.png"))

            after_gaussians, _ = load_ply(output_dir / "splats.ply")
            after_colors = after_gaussians.colors.flatten(0, 1)
            after_luma = (after_colors[:, 0] * 0.299) + (after_colors[:, 1] * 0.587) + (after_colors[:, 2] * 0.114)
            metadata = json.loads((output_dir / "metadata.json").read_text())

            self.assertEqual(after_colors.shape[0], before_colors.shape[0] * DEFAULT_PREVIEW_DENSITY_MULTIPLIER)
            self.assertGreater(float(after_luma.mean()), float(before_luma.mean()))
            self.assertEqual(metadata["point_count"], after_colors.shape[0])
            self.assertEqual(metadata["quality_tier"], "single_image_preview_ultra_dense")
            self.assertEqual(metadata["preview_enhancement"]["density"]["multiplier"], DEFAULT_PREVIEW_DENSITY_MULTIPLIER)


if __name__ == "__main__":
    unittest.main()
