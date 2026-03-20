import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(BACKEND_ROOT))

from api import routes  # noqa: E402
from models import ml_sharp_wrapper  # noqa: E402
from providers import ProviderArtifact, ProviderJob, get_provider_registry  # noqa: E402
from server import app  # noqa: E402


def _png_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (96, 96), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class LocalBackendTruthContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_env = {
            "GAUSET_WORKER_TOKEN": os.environ.get("GAUSET_WORKER_TOKEN"),
            "GAUSET_ENABLE_PROVIDER_IMAGE_GEN": os.environ.get("GAUSET_ENABLE_PROVIDER_IMAGE_GEN"),
            "GAUSET_PROVIDER_MOCK": os.environ.get("GAUSET_PROVIDER_MOCK"),
        }
        os.environ["GAUSET_WORKER_TOKEN"] = "worker-token"
        os.environ["GAUSET_ENABLE_PROVIDER_IMAGE_GEN"] = "1"
        os.environ["GAUSET_PROVIDER_MOCK"] = "1"
        get_provider_registry.cache_clear()

        self.temp_dir = tempfile.TemporaryDirectory(prefix="gauset-local-backend-truth-")
        self.root = Path(self.temp_dir.name)
        self.original_scenes_dir = routes.SCENES_DIR
        self.original_assets_dir = routes.ASSETS_DIR
        self.original_uploads_dir = routes.UPLOADS_DIR

        routes.SCENES_DIR = self.root / "scenes"
        routes.ASSETS_DIR = self.root / "assets"
        routes.UPLOADS_DIR = self.root / "uploads" / "images"

        routes.SCENES_DIR.mkdir(parents=True, exist_ok=True)
        routes.ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        routes.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

        routes.jobs.clear()
        routes.capture_sessions.clear()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        routes.jobs.clear()
        routes.capture_sessions.clear()
        routes.SCENES_DIR = self.original_scenes_dir
        routes.ASSETS_DIR = self.original_assets_dir
        routes.UPLOADS_DIR = self.original_uploads_dir
        get_provider_registry.cache_clear()
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.temp_dir.cleanup()

    def _worker_headers(self) -> dict[str, str]:
        return {"x-gauset-worker-token": "worker-token"}

    def _upload_image(self, *, color: tuple[int, int, int]) -> dict:
        response = self.client.post(
            "/upload",
            headers=self._worker_headers(),
            files={"file": ("capture.png", _png_bytes(color), "image/png")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(payload["ingest_record"]["source"]["kind"], "upload")
        self.assertEqual(payload["ingest_record"]["truth"]["lane"], "upload")
        self.assertEqual(payload["ingest_record"]["truth"]["production_readiness"], "blocked")
        self.assertFalse(payload["ingest_record"]["workflow"]["share_ready"])
        return payload

    def test_setup_status_reports_preview_truth_without_reconstruction_connectivity(self) -> None:
        class _ProviderRegistry:
            def image_provider_summary(self) -> dict[str, object]:
                return {
                    "enabled": True,
                    "available": True,
                    "image_provider_count": 1,
                    "available_image_provider_count": 1,
                    "video_provider_count": 0,
                    "configured_image_providers": ["mock"],
                    "unavailable_image_providers": [],
                }

        with patch.object(routes, "_torch_status", return_value={"installed": True}), patch.object(
            routes,
            "get_provider_registry",
            return_value=_ProviderRegistry(),
        ):
            response = self.client.get("/setup/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["lane_truth"]["preview"], "single_image_lrm_preview")
        self.assertEqual(payload["lane_truth"]["reconstruction"], "gpu_worker_not_connected")
        self.assertTrue(payload["capabilities"]["preview"]["available"])
        self.assertFalse(payload["capabilities"]["reconstruction"]["available"])
        self.assertEqual(payload["reconstruction_backend"]["name"], "gpu_worker_missing")
        self.assertFalse(payload["reconstruction_backend"]["gpu_worker_connected"])
        self.assertFalse(payload["reconstruction_backend"]["native_gaussian_training"])
        self.assertTrue(payload["release_gates"]["truthful_preview_lane"])
        self.assertFalse(payload["release_gates"]["gpu_reconstruction_connected"])
        self.assertFalse(payload["release_gates"]["native_gaussian_training"])

    def test_generate_image_job_warns_when_output_count_is_capped(self) -> None:
        response = self.client.post(
            "/generate/image",
            headers=self._worker_headers(),
            json={
                "provider": "mock",
                "model": "mock-cinematic-v1",
                "prompt": "production alley, low camera, wet asphalt",
                "count": 8,
            },
        )
        self.assertEqual(response.status_code, 200)

        job_response = self.client.get(f"/jobs/{response.json()['job_id']}", headers=self._worker_headers())
        self.assertEqual(job_response.status_code, 200)
        job_payload = job_response.json()

        self.assertEqual(job_payload["status"], "completed")
        self.assertEqual(job_payload["input"]["count"], 4)
        self.assertEqual(len(job_payload["result"]["images"]), 4)
        self.assertIn("Mock Image Generator capped this request at 4 outputs.", job_payload["warnings"])

    def test_job_listing_refreshes_processing_generated_image_jobs(self) -> None:
        class _PollingAdapter:
            def poll_job(self, provider_job_id: str) -> ProviderJob:
                return ProviderJob(
                    provider_job_id=provider_job_id,
                    status="completed",
                    outputs=[
                        ProviderArtifact(
                            image_bytes=_png_bytes((40, 80, 180)),
                            mime_type="image/png",
                            filename="polled.png",
                        )
                    ],
                )

        class _PollingRegistry:
            def get_image_adapter(self, provider_id: str) -> _PollingAdapter:
                return _PollingAdapter()

        routes.jobs["genimg_refresh"] = {
            "id": "genimg_refresh",
            "type": "generated_image",
            "status": "processing",
            "provider": "mock",
            "model": "mock-cinematic-v1",
            "provider_job_id": "provider_job_refresh",
            "prompt": "rainy dock at dusk",
            "warnings": [],
            "result": None,
            "error": None,
            "created_at": "2026-03-15T12:00:00Z",
            "updated_at": "2026-03-15T12:00:00Z",
            "studio_id": "studio_local",
            "user_id": "user_local",
            "input": {
                "negative_prompt": None,
                "aspect_ratio": None,
                "count": 1,
                "seed": None,
                "reference_image_ids": [],
            },
        }

        with patch.object(routes, "get_provider_registry", return_value=_PollingRegistry()):
            response = self.client.get("/jobs", headers=self._worker_headers())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total_count"], 1)
        refreshed = payload["jobs"][0]
        self.assertEqual(refreshed["id"], "genimg_refresh")
        self.assertEqual(refreshed["status"], "completed")
        self.assertEqual(len(refreshed["result"]["images"]), 1)
        self.assertTrue(Path(refreshed["result"]["images"][0]["filepath"]).exists())

    def test_capture_session_uses_requested_target_images_for_coverage_and_fetch(self) -> None:
        response = self.client.post("/capture/session", json={"target_images": 20})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        session_id = payload["session_id"]
        self.assertEqual(payload["recommended_images"], 20)
        self.assertEqual(payload["coverage_percent"], 0.0)
        self.assertEqual(payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(payload["ingest_record"]["source"]["kind"], "capture_session")
        self.assertEqual(payload["ingest_record"]["truth"]["lane_truth"], "gpu_worker_not_connected")
        self.assertFalse(payload["ingest_record"]["workflow"]["save_ready"])

        get_response = self.client.get(f"/capture/session/{session_id}")
        self.assertEqual(get_response.status_code, 200)
        fetched_session = get_response.json()
        self.assertEqual(fetched_session["recommended_images"], 20)
        self.assertEqual(fetched_session["ingest_record"]["contract"], "world-ingest/v1")

        uploaded = [self._upload_image(color=(40 + (index * 10), 60, 120)) for index in range(5)]
        add_frames_response = self.client.post(
            f"/capture/session/{session_id}/frames",
            json={"image_ids": [item["image_id"] for item in uploaded]},
        )
        self.assertEqual(add_frames_response.status_code, 200)
        updated = add_frames_response.json()
        self.assertEqual(updated["status"], "collecting")
        self.assertEqual(updated["frame_count"], 5)
        self.assertEqual(updated["recommended_images"], 20)
        self.assertEqual(updated["coverage_percent"], 25.0)
        self.assertFalse(updated["ready_for_reconstruction"])
        self.assertEqual(updated["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(updated["ingest_record"]["source"]["kind"], "capture_session")
        self.assertFalse(updated["ingest_record"]["workflow"]["review_ready"])

        fetched = self.client.get(f"/capture/session/{session_id}").json()
        self.assertEqual(fetched["coverage_percent"], 25.0)
        self.assertEqual(fetched["frame_count"], 5)
        self.assertEqual(fetched["ingest_record"]["contract"], "world-ingest/v1")

    def test_upload_and_preview_metadata_emit_canonical_ingest_records(self) -> None:
        uploaded = self._upload_image(color=(70, 90, 140))
        upload_record = routes._load_upload_record(uploaded["image_id"])
        upload_payload = routes._build_upload_response(upload_record)

        self.assertEqual(upload_payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(upload_payload["ingest_record"]["source"]["kind"], "upload")
        self.assertEqual(upload_payload["ingest_record"]["truth"]["production_readiness"], "blocked")
        self.assertFalse(upload_payload["ingest_record"]["workflow"]["review_ready"])

        scene_id = "scene_ingest_contract_preview"
        metadata_path = routes.SCENES_DIR / scene_id / "environment" / "metadata.json"
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps({"truth_label": "Preview world accepted"}, indent=2))
        preview_metadata = routes._merge_generation_metadata(
            metadata_path,
            lane="preview",
            lane_truth="single_image_lrm_preview",
            upload_record=upload_record,
            ingest_channel="generate_environment",
            input_strategy="1 photo",
            delivery_defaults=routes._preview_delivery_defaults(),
        )

        self.assertEqual(preview_metadata["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(preview_metadata["ingest_record"]["source"]["kind"], "upload")
        self.assertEqual(preview_metadata["ingest_record"]["workspace_binding"]["scene_id"], scene_id)
        self.assertEqual(preview_metadata["ingest_record"]["truth"]["production_readiness"], "review_only")
        self.assertEqual(preview_metadata["ingest_record"]["workflow"]["workspace_path"], f"/mvp?scene={scene_id}")

    def test_generate_environment_job_emits_canonical_ingest_records(self) -> None:
        uploaded = self._upload_image(color=(90, 80, 130))

        response = self.client.post(
            "/generate/environment",
            headers=self._worker_headers(),
            json={"image_id": uploaded["image_id"]},
        )
        self.assertEqual(response.status_code, 200)
        launch_payload = response.json()
        self.assertEqual(launch_payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(launch_payload["ingest_record"]["workspace_binding"]["scene_id"], launch_payload["scene_id"])
        self.assertFalse(launch_payload["ingest_record"]["workflow"]["save_ready"])

        job_response = self.client.get(f"/jobs/{launch_payload['job_id']}", headers=self._worker_headers())
        self.assertEqual(job_response.status_code, 200)
        job_payload = job_response.json()
        self.assertEqual(job_payload["status"], "completed")
        self.assertEqual(job_payload["ingest_record"]["contract"], "world-ingest/v1")
        self.assertTrue(job_payload["result"]["ingest_record"]["workflow"]["save_ready"])
        self.assertTrue(job_payload["result"]["ingest_record"]["workflow"]["review_ready"])
        self.assertEqual(job_payload["result"]["ingest_record"]["truth"]["production_readiness"], "review_only")

    def test_generate_environment_job_fails_when_required_artifacts_are_missing(self) -> None:
        uploaded = self._upload_image(color=(80, 60, 140))

        def _broken_environment(image_path: str, output_dir: str) -> str:
            output = Path(output_dir)
            output.mkdir(parents=True, exist_ok=True)
            (output / "splats.ply").write_text("ply")
            (output / "cameras.json").write_text("[]")
            (output / "metadata.json").write_text("{}")
            return str(output)

        with patch.object(routes, "generate_environment", side_effect=_broken_environment):
            response = self.client.post(
                "/generate/environment",
                headers=self._worker_headers(),
                json={"image_id": uploaded["image_id"]},
            )

        self.assertEqual(response.status_code, 200)
        job_response = self.client.get(f"/jobs/{response.json()['job_id']}", headers=self._worker_headers())
        self.assertEqual(job_response.status_code, 200)
        job_payload = job_response.json()
        self.assertEqual(job_payload["status"], "failed")
        self.assertIn("preview-projection.png", job_payload["error"])

    def test_generate_asset_job_fails_when_required_artifacts_are_missing(self) -> None:
        uploaded = self._upload_image(color=(110, 80, 40))

        def _broken_asset(image_path: str, output_dir: str) -> str:
            output = Path(output_dir)
            output.mkdir(parents=True, exist_ok=True)
            (output / "mesh.glb").write_text("mesh")
            return str(output)

        with patch.object(routes, "generate_asset", side_effect=_broken_asset):
            response = self.client.post(
                "/generate/asset",
                headers=self._worker_headers(),
                json={"image_id": uploaded["image_id"]},
            )

        self.assertEqual(response.status_code, 200)
        job_response = self.client.get(f"/jobs/{response.json()['job_id']}", headers=self._worker_headers())
        self.assertEqual(job_response.status_code, 200)
        job_payload = job_response.json()
        self.assertEqual(job_payload["status"], "failed")
        self.assertIn("texture.png", job_payload["error"])
        self.assertIn("preview.png", job_payload["error"])


class MlSharpMockFallbackTests(unittest.TestCase):
    def test_mock_fallback_writes_truthful_environment_support_files(self) -> None:
        with tempfile.TemporaryDirectory(prefix="gauset-ml-sharp-mock-") as temp_dir:
            temp_root = Path(temp_dir)
            input_image = temp_root / "input.png"
            output_dir = temp_root / "environment"
            Image.new("RGB", (128, 96), color=(52, 64, 88)).save(input_image)

            with patch.dict(os.environ, {"GAUSET_ALLOW_MOCK_MODE": "1"}, clear=False), patch.object(
                ml_sharp_wrapper,
                "_run_ml_sharp_predict",
                side_effect=RuntimeError("forced mock fallback"),
            ):
                result_dir = Path(ml_sharp_wrapper.generate_environment(str(input_image), str(output_dir)))

            metadata = json.loads((result_dir / "metadata.json").read_text())
            capture = json.loads((result_dir / "capture-scorecard.json").read_text())
            comparison = json.loads((result_dir / "benchmark-report.json").read_text())

            self.assertTrue((result_dir / "splats.ply").exists())
            self.assertTrue((result_dir / "cameras.json").exists())
            self.assertTrue((result_dir / "preview-projection.png").exists())
            self.assertEqual(metadata["execution_mode"], "mock")
            self.assertEqual(metadata["preview_projection"], "preview-projection.png")
            self.assertEqual(metadata["quality_tier"], "single_image_preview_mock")
            self.assertIn("mock fallback", metadata["note"])
            self.assertEqual(capture["status"], "single_image_mock_capture")
            self.assertEqual(comparison["benchmark_status"], "not_benchmarked")


if __name__ == "__main__":
    unittest.main()
