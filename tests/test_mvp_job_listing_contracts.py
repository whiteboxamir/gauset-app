import importlib.util
import os
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(BACKEND_ROOT))

from api import routes  # noqa: E402
from server import app  # noqa: E402


def _load_vercel_backend_app(env_overrides: dict[str, str | None]):
    module_path = Path(__file__).resolve().parents[1] / "vercel-backend" / "app.py"
    original_env = {key: os.environ.get(key) for key in env_overrides}
    module_name = f"gauset_vercel_backend_app_{uuid.uuid4().hex}"

    try:
        for key, value in env_overrides.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load Vercel backend module from {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class LocalBackendJobListingContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_worker_token = os.environ.get("GAUSET_WORKER_TOKEN")
        os.environ["GAUSET_WORKER_TOKEN"] = "worker-token"
        routes.jobs.clear()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        routes.jobs.clear()
        if self.original_worker_token is None:
            os.environ.pop("GAUSET_WORKER_TOKEN", None)
        else:
            os.environ["GAUSET_WORKER_TOKEN"] = self.original_worker_token

    def test_local_job_listing_requires_worker_auth_and_filters_recent_jobs(self) -> None:
        routes.jobs.update(
            {
                "scene_allowed": {
                    "id": "scene_allowed",
                    "type": "environment",
                    "status": "completed",
                    "studio_id": "studio_local",
                    "user_id": "user_local",
                    "created_at": "2026-03-15T12:00:00Z",
                    "updated_at": "2026-03-15T12:05:00Z",
                },
                "asset_missing_user": {
                    "id": "asset_missing_user",
                    "type": "asset",
                    "status": "completed",
                    "studio_id": "studio_local",
                    "user_id": None,
                    "created_at": "2026-03-15T12:10:00Z",
                    "updated_at": "2026-03-15T12:10:00Z",
                },
                "scene_old": {
                    "id": "scene_old",
                    "type": "environment",
                    "status": "completed",
                    "studio_id": "studio_local",
                    "user_id": "user_local",
                    "created_at": "2026-03-14T10:00:00Z",
                    "updated_at": "2026-03-14T10:00:00Z",
                },
                "asset_other": {
                    "id": "asset_other",
                    "type": "asset",
                    "status": "completed",
                    "studio_id": "studio_other",
                    "user_id": "user_other",
                    "created_at": "2026-03-15T12:15:00Z",
                    "updated_at": "2026-03-15T12:15:00Z",
                },
            }
        )

        unauthorized = self.client.get("/jobs")
        self.assertEqual(unauthorized.status_code, 401)

        response = self.client.get(
            "/jobs",
            params={
                "studio_id": "studio_local",
                "status": "completed",
                "types": "environment,asset",
                "created_gte": "2026-03-15T00:00:00Z",
                "include_missing_context": "true",
            },
            headers={"x-gauset-worker-token": "worker-token"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        returned_ids = [job["id"] for job in payload["jobs"]]
        self.assertEqual(returned_ids, ["asset_missing_user", "scene_allowed"])
        self.assertEqual(payload["total_count"], 2)
        self.assertIsNone(payload["next_offset"])


class VercelBackendJobListingContractTests(unittest.TestCase):
    def test_vercel_job_listing_uses_index_and_worker_auth(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            original_worker_token = os.environ.get("GAUSET_BACKEND_WORKER_TOKEN")
            app_module = _load_vercel_backend_app(
                {
                    "BLOB_READ_WRITE_TOKEN": None,
                    "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                    "GAUSET_BACKEND_WORKER_TOKEN": "worker-token",
                    "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                    "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
                }
            )
            os.environ["GAUSET_BACKEND_WORKER_TOKEN"] = "worker-token"
            try:
                app_module._save_job(
                    "genimg_allowed",
                    {
                        "id": "genimg_allowed",
                        "type": "generated_image",
                        "status": "completed",
                        "studio_id": "studio_vercel",
                        "user_id": "user_vercel",
                        "created_at": "2026-03-15T08:00:00Z",
                        "updated_at": "2026-03-15T08:05:00Z",
                    },
                )
                app_module._save_job(
                    "asset_missing_user",
                    {
                        "id": "asset_missing_user",
                        "type": "asset",
                        "status": "completed",
                        "studio_id": "studio_vercel",
                        "user_id": None,
                        "created_at": "2026-03-15T08:10:00Z",
                        "updated_at": "2026-03-15T08:10:00Z",
                    },
                )
                app_module._save_job(
                    "asset_other",
                    {
                        "id": "asset_other",
                        "type": "asset",
                        "status": "completed",
                        "studio_id": "studio_other",
                        "user_id": "user_other",
                        "created_at": "2026-03-15T08:15:00Z",
                        "updated_at": "2026-03-15T08:15:00Z",
                    },
                )

                client = TestClient(app_module.app)

                unauthorized = client.get("/jobs")
                self.assertEqual(unauthorized.status_code, 401)

                response = client.get(
                    "/jobs",
                    params={
                        "studio_id": "studio_vercel",
                        "status": "completed",
                        "types": "generated_image,asset",
                        "include_missing_context": "true",
                    },
                    headers={"x-gauset-worker-token": "worker-token"},
                )
                self.assertEqual(response.status_code, 200)
                payload = response.json()
                returned_ids = [job["id"] for job in payload["jobs"]]
                self.assertEqual(returned_ids, ["asset_missing_user", "genimg_allowed"])
                self.assertEqual(payload["total_count"], 2)
                self.assertIsNone(payload["next_offset"])
            finally:
                if original_worker_token is None:
                    os.environ.pop("GAUSET_BACKEND_WORKER_TOKEN", None)
                else:
                    os.environ["GAUSET_BACKEND_WORKER_TOKEN"] = original_worker_token


if __name__ == "__main__":
    unittest.main()
