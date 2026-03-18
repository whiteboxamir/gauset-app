import importlib.util
import os
import sys
import tempfile
import types
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


_MISSING = object()
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


def _load_vercel_backend_app(
    env_overrides: dict[str, str | None],
    *,
    injected_modules: dict[str, object | None] | None = None,
):
    module_path = Path(__file__).resolve().parents[1] / "vercel-backend" / "app.py"
    original_env = {key: os.environ.get(key) for key in env_overrides}
    original_modules = {
        key: sys.modules.get(key, _MISSING)
        for key in (injected_modules or {})
    }
    module_name = f"gauset_vercel_backend_app_{uuid.uuid4().hex}"

    try:
        for key, value in (injected_modules or {}).items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value

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
        for key, value in original_modules.items():
            if value is _MISSING:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value


def _load_internal_mvp_backend_app(
    env_overrides: dict[str, str | None],
    *,
    injected_modules: dict[str, object | None] | None = None,
):
    module_path = Path(__file__).resolve().parents[1] / "api" / "_mvp_backend" / "vercel_backend" / "app.py"
    package_paths = {
        "api": Path(__file__).resolve().parents[1] / "api",
        "api._mvp_backend": Path(__file__).resolve().parents[1] / "api" / "_mvp_backend",
        "api._mvp_backend.vercel_backend": Path(__file__).resolve().parents[1] / "api" / "_mvp_backend" / "vercel_backend",
    }
    original_env = {key: os.environ.get(key) for key in env_overrides}
    original_modules = {
        key: sys.modules.get(key, _MISSING)
        for key in [*(injected_modules or {}), *package_paths]
    }
    module_name = f"api._mvp_backend.vercel_backend.app_test_{uuid.uuid4().hex}"

    try:
        for key, value in (injected_modules or {}).items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value

        for package_name, package_path in package_paths.items():
            package_module = types.ModuleType(package_name)
            package_module.__path__ = [str(package_path)]
            package_module.__package__ = package_name
            sys.modules[package_name] = package_module

        for key, value in env_overrides.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load internal MVP backend module from {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        for key, value in original_modules.items():
            if value is _MISSING:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value


def _ready_blob_module() -> types.ModuleType:
    fake_blob = types.ModuleType("vercel_blob")

    def _successful_put(*args, **kwargs):
        return {"url": "https://gauset-public-assets.vercel-storage.com/system/probe.txt"}

    fake_blob.put = _successful_put
    return fake_blob


def _expected_fingerprint() -> dict[str, str]:
    return {
        "build_label": "backend-preview-gauset.vercel.app · preview · abcdef1",
        "commit_ref": "codex/backend-parity",
        "commit_sha": "abcdef1234567890",
        "commit_short": "abcdef1",
        "deployment_host": "backend-preview-gauset.vercel.app",
        "deployment_id": "dpl_backend123",
        "runtime_target": "vercel",
        "vercel_env": "preview",
    }


class VercelPublicStorageGuardrailTests(unittest.TestCase):
    def test_setup_status_disables_public_write_lanes_without_blob_storage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            app_module = _load_vercel_backend_app(
                {
                    "BLOB_READ_WRITE_TOKEN": None,
                    "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                    "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                    "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
                }
            )
            client = TestClient(app_module.app)

            response = client.get("/setup/status")
            self.assertEqual(response.status_code, 200)
            payload = response.json()

            self.assertEqual(payload["storage_mode"], "filesystem")
            self.assertFalse(payload["storage"]["public_write_safe"])
            self.assertFalse(payload["storage"]["durable"])
            self.assertFalse(payload["capabilities"]["preview"]["available"])
            self.assertFalse(payload["capabilities"]["asset"]["available"])
            self.assertIn("filesystem storage", payload["backend"]["truth"].lower())
            self.assertIn("BLOB_READ_WRITE_TOKEN", payload["storage"]["required_env"])

    def test_upload_is_rejected_when_public_storage_is_not_durable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            app_module = _load_vercel_backend_app(
                {
                    "BLOB_READ_WRITE_TOKEN": None,
                    "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                    "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                    "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
                }
            )
            client = TestClient(app_module.app)

            response = client.post(
                "/upload",
                files={"file": ("frame.png", b"not-empty", "image/png")},
            )
            self.assertEqual(response.status_code, 503)
            payload = response.json()
            self.assertIn("filesystem storage", str(payload.get("detail", "")).lower())

    def test_setup_status_reports_blob_runtime_failures_without_crashing_service(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fake_blob = types.ModuleType("vercel_blob")

            def _failing_put(*args, **kwargs):
                raise RuntimeError("blob probe failed")

            fake_blob.put = _failing_put
            app_module = _load_vercel_backend_app(
                {
                    "BLOB_READ_WRITE_TOKEN": "blob-token",
                    "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                    "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                    "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
                },
                injected_modules={"vercel_blob": fake_blob},
            )
            client = TestClient(app_module.app)

            response = client.get("/setup/status")
            self.assertEqual(response.status_code, 200)
            payload = response.json()

            self.assertEqual(payload["storage_mode"], "unavailable")
            self.assertEqual(payload["storage"]["configured_mode"], "blob")
            self.assertEqual(payload["storage"]["runtime_status"], "error")
            self.assertFalse(payload["storage"]["public_write_safe"])
            self.assertIn("blob probe failed", payload["storage"]["availability_reason"])
            self.assertIn("blob storage is configured", payload["storage"]["summary"].lower())
            self.assertIn("blob probe failed", payload["storage"]["initialization_error"])

            upload_response = client.post(
                "/upload",
                files={"file": ("frame.png", b"not-empty", "image/png")},
            )
            self.assertEqual(upload_response.status_code, 503)
            self.assertIn("blob storage is unavailable", str(upload_response.json().get("detail", "")).lower())

    def test_deployment_route_matches_expected_fingerprint_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "VERCEL": "1",
                "VERCEL_ENV": "preview",
                "VERCEL_URL": "backend-preview-gauset.vercel.app",
                "VERCEL_GIT_COMMIT_SHA": "abcdef1234567890",
                "VERCEL_GIT_COMMIT_REF": "codex/backend-parity",
                "VERCEL_DEPLOYMENT_ID": "dpl_backend123",
                "NEXT_PUBLIC_GAUSET_APP_HOST": None,
                "NEXT_PUBLIC_VERCEL_URL": None,
            }
            with _patched_env(env_overrides):
                app_module = _load_vercel_backend_app(env_overrides)
                client = TestClient(app_module.app)

                response = client.get("/deployment")
                self.assertEqual(response.status_code, 200)
                payload = response.json()

                self.assertEqual(payload["status"], "ok")
                self.assertEqual(payload["fingerprint"], _expected_fingerprint())

    def test_setup_status_keeps_preview_bridge_truthful_without_claiming_reconstruction_connectivity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": "blob-token",
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "1",
                "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": "https://bridge.gaused.test",
            }
            app_module = _load_vercel_backend_app(
                env_overrides,
                injected_modules={"vercel_blob": _ready_blob_module()},
            )
            client = TestClient(app_module.app)

            class _BridgeRegistry:
                def status_payload(self) -> dict[str, object]:
                    return {"available": True}

            with patch.object(app_module, "get_environment_bridge_registry", return_value=_BridgeRegistry()):
                response = client.get("/setup/status")

            self.assertEqual(response.status_code, 200)
            payload = response.json()

            self.assertTrue(payload["storage"]["public_write_safe"])
            self.assertTrue(payload["capabilities"]["preview"]["available"])
            self.assertFalse(payload["capabilities"]["reconstruction"]["available"])
            self.assertEqual(payload["reconstruction_backend"]["name"], "gpu_worker_missing")
            self.assertFalse(payload["reconstruction_backend"]["gpu_worker_connected"])
            self.assertFalse(payload["reconstruction_backend"]["native_gaussian_training"])
            self.assertTrue(payload["release_gates"]["truthful_preview_lane"])
            self.assertFalse(payload["release_gates"]["gpu_reconstruction_connected"])
            self.assertFalse(payload["release_gates"]["native_gaussian_training"])

    def test_deployment_route_falls_back_to_local_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "VERCEL": None,
                "VERCEL_ENV": None,
                "VERCEL_URL": None,
                "VERCEL_PROJECT_PRODUCTION_URL": None,
                "VERCEL_GIT_COMMIT_SHA": None,
                "VERCEL_GIT_COMMIT_REF": None,
                "VERCEL_DEPLOYMENT_ID": None,
                "NEXT_PUBLIC_GAUSET_APP_HOST": None,
                "NEXT_PUBLIC_VERCEL_URL": None,
                "NODE_ENV": None,
            }
            with _patched_env(env_overrides):
                app_module = _load_vercel_backend_app(env_overrides)
                client = TestClient(app_module.app)

                response = client.get("/deployment")
                self.assertEqual(response.status_code, 200)
                payload = response.json()

                self.assertEqual(payload["fingerprint"]["deployment_host"], "local")
                self.assertEqual(payload["fingerprint"]["runtime_target"], "local-development")
                self.assertEqual(payload["fingerprint"]["commit_short"], "no-sha")
                self.assertEqual(payload["fingerprint"]["build_label"], "local · local-development · no-sha")

    def test_internal_mvp_backend_deployment_route_matches_expected_fingerprint_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "VERCEL": "1",
                "VERCEL_ENV": "preview",
                "VERCEL_URL": "backend-preview-gauset.vercel.app",
                "VERCEL_GIT_COMMIT_SHA": "abcdef1234567890",
                "VERCEL_GIT_COMMIT_REF": "codex/backend-parity",
                "VERCEL_DEPLOYMENT_ID": "dpl_backend123",
                "NEXT_PUBLIC_GAUSET_APP_HOST": None,
                "NEXT_PUBLIC_VERCEL_URL": None,
            }
            with _patched_env(env_overrides):
                app_module = _load_internal_mvp_backend_app(env_overrides)
                client = TestClient(app_module.app)

                response = client.get("/deployment")
                self.assertEqual(response.status_code, 200)
                payload = response.json()

                self.assertEqual(payload["status"], "ok")
                self.assertEqual(payload["fingerprint"], _expected_fingerprint())

    def test_internal_mvp_backend_setup_status_disables_writes_and_keeps_reconstruction_flags_off(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "1",
                "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": "https://bridge.gaused.test",
            }
            app_module = _load_internal_mvp_backend_app(env_overrides)
            client = TestClient(app_module.app)

            class _BridgeRegistry:
                def status_payload(self) -> dict[str, object]:
                    return {"available": True}

            with patch.object(app_module, "get_environment_bridge_registry", return_value=_BridgeRegistry()):
                response = client.get("/setup/status")

            self.assertEqual(response.status_code, 200)
            payload = response.json()

            self.assertEqual(payload["storage_mode"], "filesystem")
            self.assertFalse(payload["storage"]["public_write_safe"])
            self.assertFalse(payload["capabilities"]["preview"]["available"])
            self.assertFalse(payload["capabilities"]["reconstruction"]["available"])
            self.assertEqual(payload["reconstruction_backend"]["name"], "gpu_worker_missing")
            self.assertFalse(payload["reconstruction_backend"]["gpu_worker_connected"])
            self.assertFalse(payload["reconstruction_backend"]["native_gaussian_training"])
            self.assertFalse(payload["release_gates"]["truthful_preview_lane"])
            self.assertFalse(payload["release_gates"]["gpu_reconstruction_connected"])
            self.assertFalse(payload["release_gates"]["native_gaussian_training"])

    def test_internal_mvp_backend_upload_is_rejected_without_durable_storage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env_overrides = {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": temp_dir,
                "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
            }
            app_module = _load_internal_mvp_backend_app(env_overrides)
            client = TestClient(app_module.app)

            response = client.post(
                "/upload",
                files={"file": ("frame.png", b"not-empty", "image/png")},
            )
            self.assertEqual(response.status_code, 503)
            self.assertIn("filesystem storage", str(response.json().get("detail", "")).lower())


if __name__ == "__main__":
    unittest.main()
