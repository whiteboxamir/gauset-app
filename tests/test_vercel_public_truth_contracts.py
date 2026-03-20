import importlib.util
import io
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))


@contextmanager
def _patched_env(env_overrides: dict[str, str | None]):
    original_env = {key: os.environ.get(key) for key in env_overrides}
    try:
        for key, value in env_overrides.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _load_vercel_backend_app(env_overrides: dict[str, str | None]):
    module_path = WORKSPACE_ROOT / "vercel-backend" / "app.py"
    module_name = f"gauset_vercel_backend_truth_{uuid.uuid4().hex}"
    with _patched_env(env_overrides):
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load Vercel backend module from {module_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module


def _png_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (96, 96), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class VercelPublicTruthContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="gauset-vercel-public-truth-")
        self.app = _load_vercel_backend_app(
            {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": self.temp_dir.name,
                "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
            }
        )
        self._storage_gate = patch.object(self.app, "_public_storage_write_safe", return_value=True)
        self._storage_gate.start()
        self.client = TestClient(self.app.app)

    def tearDown(self) -> None:
        self._storage_gate.stop()
        self.temp_dir.cleanup()

    def _upload_image(self, *, color: tuple[int, int, int]) -> dict:
        response = self.client.post(
            "/upload",
            files={"file": ("frame.png", _png_bytes(color), "image/png")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_source_provenance_uses_public_origin_labels(self) -> None:
        upload_provenance = self.app._build_source_provenance(
            {
                "image_id": "img_upload",
                "filename": "frame.png",
                "source_type": "upload",
            }
        )
        generated_provenance = self.app._build_source_provenance(
            {
                "image_id": "img_generated",
                "filename": "frame.png",
                "source_type": "generated",
                "generation_job_id": "job_generated",
            }
        )

        self.assertEqual(upload_provenance["origin"], "public_upload")
        self.assertEqual(generated_provenance["origin"], "public_provider_generation")

    def test_upload_response_stays_blocked_for_downstream_handoff(self) -> None:
        record = {
            "image_id": "img_upload",
            "filename": "frame.png",
            "filepath": "/tmp/frame.png",
            "url": "/storage/uploads/images/frame.png",
            "source_type": "upload",
        }

        payload = self.app._build_upload_response(record)
        self.assertEqual(payload["lane_metadata"]["readiness"], "source_only")
        self.assertFalse(payload["handoff_manifest"]["ready"])
        self.assertIn("downstream handoff remains blocked", payload["handoff_manifest"]["summary"])
        self.assertGreater(len(payload["handoff_manifest"]["blockers"]), 0)
        self.assertEqual(payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(payload["ingest_record"]["source"]["kind"], "upload")
        self.assertEqual(payload["ingest_record"]["workflow"]["save_ready"], False)
        self.assertEqual(payload["ingest_record"]["workspace_binding"]["scene_id"], None)
        self.assertEqual(payload["ingest_record"]["truth"]["production_readiness"], "blocked")
        self.assertEqual(payload["ingest_record"]["status"], "accepted")
        self.assertEqual(payload["ingest_record"]["truth"]["lane"], "upload")
        self.assertFalse(payload["ingest_record"]["workflow"]["share_ready"])

    def test_preview_and_asset_helper_posture_stays_blocked(self) -> None:
        world_source = self.app._build_world_source(
            lane="preview",
            ingest_channel="generate_environment",
            input_strategy="1 photo",
            primary_source={"source_type": "upload", "source_id": "img_upload", "filename": "frame.png"},
            upstream_sources=[{"source_type": "upload", "source_id": "img_upload", "filename": "frame.png"}],
        )

        preview_lane = self.app._preview_lane_metadata()
        preview_handoff = self.app._preview_handoff_manifest(world_source)
        asset_lane = self.app._asset_lane_metadata()
        asset_handoff = self.app._asset_handoff_manifest(world_source)

        self.assertEqual(preview_lane["readiness"], "preview_only")
        self.assertFalse(preview_handoff["ready"])
        self.assertGreater(len(preview_handoff["blockers"]), 0)
        self.assertEqual(asset_lane["readiness"], "editorial_object")
        self.assertFalse(asset_handoff["ready"])
        self.assertGreater(len(asset_handoff["blockers"]), 0)

    def test_generate_environment_job_emits_canonical_ingest_record(self) -> None:
        uploaded = self._upload_image(color=(80, 60, 140))

        response = self.client.post(
            "/generate/environment",
            json={"image_id": uploaded["image_id"]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        launch_payload = response.json()
        self.assertEqual(launch_payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(launch_payload["ingest_record"]["workspace_binding"]["scene_id"], launch_payload["scene_id"])
        self.assertFalse(launch_payload["ingest_record"]["workflow"]["save_ready"])
        self.assertEqual(launch_payload["ingest_record"]["truth"]["production_readiness"], "blocked")

        job_response = self.client.get(f"/jobs/{launch_payload['job_id']}")
        self.assertEqual(job_response.status_code, 200, job_response.text)
        job_payload = job_response.json()
        self.assertEqual(job_payload["status"], "completed")
        self.assertEqual(job_payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(job_payload["ingest_record"]["workspace_binding"]["scene_id"], launch_payload["scene_id"])
        self.assertTrue(job_payload["result"]["ingest_record"]["workflow"]["save_ready"])
        self.assertTrue(job_payload["result"]["ingest_record"]["workflow"]["review_ready"])
        self.assertEqual(job_payload["result"]["ingest_record"]["truth"]["production_readiness"], "review_only")

    def test_capture_session_payload_stays_worker_blocked_even_when_capture_ready(self) -> None:
        session = {
            "session_id": "capture_ready_session",
            "created_at": "2026-03-17T12:00:00Z",
            "target_images": self.app.CAPTURE_RECOMMENDED_IMAGES,
            "frames": [{"image_id": f"img_{index}"} for index in range(self.app.CAPTURE_MIN_IMAGES)],
        }

        with patch.object(self.app, "_hash_uploaded_image", side_effect=[f"hash_{index}" for index in range(self.app.CAPTURE_MIN_IMAGES)]):
            payload = self.app._capture_session_payload(session)
        self.assertTrue(payload["ready_for_reconstruction"])
        self.assertFalse(payload["reconstruction_available"])
        self.assertEqual(payload["lane_truth"], "gpu_worker_not_connected")
        self.assertFalse(payload["lane_metadata"]["available"])
        self.assertFalse(payload["handoff_manifest"]["ready"])
        self.assertIn("Dedicated multi-view reconstruction worker is not connected.", payload["handoff_manifest"]["blockers"])
        self.assertNotIn("Start reconstruction.", payload["quality_summary"]["recommended_next_actions"])
        self.assertEqual(payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(payload["ingest_record"]["source"]["kind"], "capture_session")
        self.assertEqual(payload["ingest_record"]["workflow"]["workspace_path"], "/mvp")
        self.assertEqual(payload["ingest_record"]["workflow"]["review_ready"], False)
        self.assertEqual(payload["ingest_record"]["truth"]["lane"], "reconstruction")
        self.assertEqual(payload["ingest_record"]["truth"]["lane_truth"], "gpu_worker_not_connected")
        self.assertEqual(payload["ingest_record"]["truth"]["production_readiness"], "blocked")
        self.assertFalse(payload["ingest_record"]["workflow"]["save_ready"])
        self.assertFalse(payload["ingest_record"]["workflow"]["review_ready"])
        self.assertFalse(payload["ingest_record"]["workflow"]["share_ready"])


if __name__ == "__main__":
    unittest.main()
