import io
import os
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(BACKEND_ROOT))

from api import routes  # noqa: E402
from providers import get_provider_registry  # noqa: E402
from server import app  # noqa: E402


def _png_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (96, 96), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class LocalProviderGenerationContractTests(unittest.TestCase):
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
        routes.jobs.clear()
        routes.capture_sessions.clear()
        self.client = TestClient(app)
        self.created_files: list[Path] = []

    def tearDown(self) -> None:
        routes.jobs.clear()
        routes.capture_sessions.clear()
        get_provider_registry.cache_clear()
        for path in self.created_files:
            path.unlink(missing_ok=True)
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

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
        self.created_files.append(Path(payload["filepath"]))
        return payload

    def test_providers_route_exposes_catalog_and_summary(self) -> None:
        response = self.client.get("/providers")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["summary"]["available"])
        self.assertIn("mock", payload["summary"]["configured_image_providers"])

        provider_ids = {provider["id"] for provider in payload["providers"]}
        self.assertIn("mock", provider_ids)
        self.assertIn("google", provider_ids)
        self.assertIn("runway", provider_ids)
        self.assertIn("byteplus", provider_ids)
        self.assertIn("kling", provider_ids)
        self.assertIn("seedance", provider_ids)

    def test_generate_image_job_materializes_uploads(self) -> None:
        response = self.client.post(
            "/generate/image",
            headers=self._worker_headers(),
            json={
                "provider": "mock",
                "model": "mock-cinematic-v1",
                "prompt": "sunlit brutalist courtyard with shallow pool",
                "aspect_ratio": "16:9",
                "count": 2,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "processing")
        self.assertTrue(payload["job_id"].startswith("genimg_"))

        job_response = self.client.get(f"/jobs/{payload['job_id']}", headers=self._worker_headers())
        self.assertEqual(job_response.status_code, 200)
        job_payload = job_response.json()

        self.assertEqual(job_payload["status"], "completed")
        self.assertEqual(job_payload["provider"], "mock")
        self.assertEqual(job_payload["model"], "mock-cinematic-v1")
        generated_images = job_payload["result"]["images"]
        self.assertEqual(len(generated_images), 2)

        first_image = generated_images[0]
        self.assertEqual(first_image["source_type"], "generated")
        self.assertEqual(first_image["provider"], "mock")
        self.assertEqual(first_image["model"], "mock-cinematic-v1")
        self.assertEqual(first_image["prompt"], "sunlit brutalist courtyard with shallow pool")
        self.assertEqual(first_image["generation_job_id"], payload["job_id"])
        self.assertEqual(first_image["ingest_record"]["contract"], "world-ingest/v1")
        self.assertEqual(first_image["ingest_record"]["source"]["kind"], "provider_generated_still")
        self.assertEqual(first_image["ingest_record"]["truth"]["lane"], "upload")
        self.assertEqual(first_image["ingest_record"]["truth"]["production_readiness"], "blocked")
        generated_path = Path(first_image["filepath"])
        self.assertTrue(generated_path.exists())
        self.created_files.extend(Path(image["filepath"]) for image in generated_images)

    def test_reconstruct_route_stays_truthful_until_worker_exists(self) -> None:
        uploaded = [
            self._upload_image(color=(20 + index * 8, 30 + index * 4, 90 + index * 3))
            for index in range(routes.CAPTURE_MIN_IMAGES)
        ]

        session_response = self.client.post("/capture/session", json={"target_images": routes.CAPTURE_RECOMMENDED_IMAGES})
        self.assertEqual(session_response.status_code, 200)
        session_id = session_response.json()["session_id"]

        add_frames_response = self.client.post(
            f"/capture/session/{session_id}/frames",
            json={"image_ids": [item["image_id"] for item in uploaded]},
        )
        self.assertEqual(add_frames_response.status_code, 200)
        self.assertTrue(add_frames_response.json()["ready_for_reconstruction"])

        reconstruct_response = self.client.post(
            f"/reconstruct/session/{session_id}",
            headers=self._worker_headers(),
        )
        self.assertEqual(reconstruct_response.status_code, 501)
        self.assertIn("dedicated multi-view Gaussian reconstruction worker", reconstruct_response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
