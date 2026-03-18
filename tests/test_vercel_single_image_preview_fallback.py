import importlib.util
import io
import json
import unittest
from pathlib import Path

from PIL import Image


def _load_vercel_backend_app():
    module_path = Path(__file__).resolve().parents[1] / "vercel-backend" / "app.py"
    spec = importlib.util.spec_from_file_location("gauset_vercel_backend_app", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load Vercel backend module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _ply_vertex_count(payload: bytes) -> int:
    marker = b"end_header\n"
    header_end = payload.find(marker)
    if header_end == -1:
        raise AssertionError("PLY payload did not include an end_header marker")
    header_text = payload[: header_end + len(marker)].decode("utf-8")
    for line in header_text.splitlines():
        if line.startswith("element vertex "):
            return int(line.split()[-1])
    raise AssertionError("PLY payload did not include an element vertex declaration")


class VercelSingleImagePreviewFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.app = _load_vercel_backend_app()

    def test_binary_splat_payload_is_densified_and_metadata_matches(self) -> None:
        image = Image.new("RGB", (960, 640), color=(18, 20, 22))
        for x in range(960):
            for y in range(640):
                if 260 <= x <= 720 and 90 <= y <= 590:
                    image.putpixel((x, y), (250, 118, 54))
                if 180 <= x <= 840 and 40 <= y <= 180 and (x + y) % 11 < 5:
                    image.putpixel((x, y), (247, 244, 236))

        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")

        payloads = self.app._binary_splat_payload(image_buffer.getvalue(), "tribe11.png")
        metadata = json.loads(payloads["metadata.json"].decode("utf-8"))
        point_count = _ply_vertex_count(payloads["splats.ply"])
        expected_source_count = self.app.SYNTH_PREVIEW_BASE_SIZE * self.app.SYNTH_PREVIEW_BASE_SIZE
        expected_density_multiplier = metadata["preview_enhancement"]["density"]["multiplier"]
        expected_point_count = expected_source_count * expected_density_multiplier

        self.assertEqual(point_count, expected_point_count)
        self.assertEqual(metadata["point_count"], expected_point_count)
        self.assertEqual(metadata["quality_tier"], "single_image_preview_dense_fallback")
        self.assertEqual(metadata["preview_enhancement"]["density"]["source_count"], expected_source_count)
        self.assertEqual(metadata["preview_enhancement"]["density"]["output_count"], expected_point_count)
        self.assertGreaterEqual(expected_density_multiplier, self.app.SYNTH_PREVIEW_DENSITY_MULTIPLIER)
        self.assertEqual(
            metadata["delivery"]["render_targets"]["preferred_point_budget"],
            expected_point_count,
        )
        self.assertEqual(metadata["rendering"]["preview_density_multiplier"], expected_density_multiplier)
        self.assertFalse(metadata["rendering"]["apply_preview_orientation"])
        self.assertGreaterEqual(
            metadata["preview_enhancement"]["exposure"]["mean_luma_after"],
            metadata["preview_enhancement"]["exposure"]["mean_luma_before"],
        )

    def test_dark_scene_preview_gets_extra_lift_and_density(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "public-scenes" / "03-neon-streets.png"
        payloads = self.app._binary_splat_payload(fixture_path.read_bytes(), fixture_path.name)
        metadata = json.loads(payloads["metadata.json"].decode("utf-8"))
        exposure = metadata["preview_enhancement"]["exposure"]
        density = metadata["preview_enhancement"]["density"]

        self.assertTrue(exposure["dark_scene"])
        self.assertEqual(exposure["profile"], "dark_scene_lift")
        self.assertGreaterEqual(exposure["mean_luma_after"], 0.42)
        self.assertGreaterEqual(
            density["multiplier"],
            self.app.SYNTH_PREVIEW_DENSITY_MULTIPLIER + self.app.SYNTH_PREVIEW_DARK_DENSITY_BONUS,
        )
        self.assertEqual(metadata["point_count"], density["source_count"] * density["multiplier"])

    def test_fallback_preview_metadata_stays_truthful_about_preview_only_delivery(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "public-scenes" / "03-neon-streets.png"
        payloads = self.app._binary_splat_payload(fixture_path.read_bytes(), fixture_path.name)
        metadata = json.loads(payloads["metadata.json"].decode("utf-8"))
        delivery = metadata["delivery"]
        release_gates = metadata["release_gates"]

        self.assertEqual(metadata["lane_truth"], "preview_only_single_image")
        self.assertEqual(metadata["reconstruction_status"], "preview_only")
        self.assertEqual(delivery["readiness"], "preview_only")
        self.assertIn("not a faithful reconstruction", delivery["summary"].lower())
        self.assertIn("single photo", delivery["blocking_issues"][0].lower())
        self.assertEqual(release_gates["status"], "blocked")
        self.assertFalse(release_gates["hero_ready"])
        self.assertFalse(release_gates["world_class_ready"])


if __name__ == "__main__":
    unittest.main()
