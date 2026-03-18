import importlib.util
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


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
    module_name = f"gauset_vercel_backend_app_contract_{uuid.uuid4().hex}"
    with _patched_env(env_overrides):
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load Vercel backend module from {module_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        for model_name in (
            "GenerateRequest",
            "GenerateImageRequest",
            "CaptureSessionCreateRequest",
            "CaptureSessionFramesRequest",
            "SceneSaveRequest",
            "VersionCommentRequest",
            "SceneReviewRequest",
        ):
            model = getattr(module, model_name, None)
            if model is not None and hasattr(model, "model_rebuild"):
                model.model_rebuild(_types_namespace=vars(module))
        return module


def _scene_document_fixture(scene_id: str) -> dict:
    environment_node_id = "splat_env"
    asset_node_id = "mesh_counter"
    return {
        "version": 2,
        "rootIds": [environment_node_id, asset_node_id],
        "nodes": {
            environment_node_id: {
                "id": environment_node_id,
                "kind": "splat",
                "parentId": None,
                "childIds": [],
                "name": "Hero Environment",
                "visible": True,
                "locked": False,
                "transform": {
                    "position": [0, 0, 0],
                    "rotation": [0, 0, 0, 1],
                    "scale": [1, 1, 1],
                },
            },
            asset_node_id: {
                "id": asset_node_id,
                "kind": "mesh",
                "parentId": None,
                "childIds": [],
                "name": "Counter Sign",
                "visible": True,
                "locked": False,
                "transform": {
                    "position": [1, 2, 3],
                    "rotation": [0, 0, 0, 1],
                    "scale": [1, 1, 1],
                },
            },
        },
        "groups": {},
        "cameras": {},
        "lights": {},
        "meshes": {
            asset_node_id: {
                "id": asset_node_id,
                "assetId": "asset_counter",
                "meshUrl": "/storage/assets/asset_counter/mesh.glb",
                "textureUrl": "/storage/assets/asset_counter/texture.png",
                "previewUrl": "/storage/assets/asset_counter/preview.png",
                "metadata": {
                    "id": "asset_counter",
                    "instanceId": "inst_counter",
                    "category": "set-dressing",
                },
            }
        },
        "splats": {
            environment_node_id: {
                "id": environment_node_id,
                "sceneId": scene_id,
                "viewerUrl": f"/storage/scenes/{scene_id}/viewer/index.html",
                "splatUrl": f"/storage/scenes/{scene_id}/environment/splats.ply",
                "camerasUrl": f"/storage/scenes/{scene_id}/environment/cameras.json",
                "metadataUrl": f"/storage/scenes/{scene_id}/environment/metadata.json",
                "metadata": {
                    "lane": "preview",
                    "statusLabel": "Instant Preview",
                    "metadata": {
                        "truth_label": "Instant Preview",
                    },
                    "urls": {
                        "preview_projection": f"/storage/scenes/{scene_id}/environment/preview-projection.png",
                    },
                },
            }
        },
        "direction": {
            "cameraViews": [
                {
                    "id": "view_a",
                    "label": "Wide",
                    "position": [5, 4, 6],
                    "target": [0, 0, 0],
                    "fov": 27,
                    "lens_mm": 50,
                    "note": "Hold the doorway reveal.",
                }
            ],
            "pins": [
                {
                    "id": "pin_egress",
                    "label": "Left egress",
                    "type": "egress",
                    "position": [1.2, 0.1, -0.4],
                    "created_at": "2026-03-11T09:00:00Z",
                }
            ],
            "directorPath": [
                {
                    "time": 0.0,
                    "position": [5, 4, 6],
                    "target": [0, 0, 0],
                    "rotation": [0, 0, 0, 1],
                    "fov": 27,
                },
                {
                    "time": 0.32,
                    "position": [4.5, 4.1, 5.4],
                    "target": [0, 0, 0],
                    "rotation": [0, 0.1, 0, 0.99],
                    "fov": 27,
                },
            ],
            "directorBrief": "50mm push with clear left egress.",
        },
        "review": None,
        "viewer": {
            "fov": 27,
            "lens_mm": 50,
            "activeCameraNodeId": None,
        },
    }


def _legacy_scene_graph_fixture(scene_id: str) -> dict:
    return {
        "environment": {
            "id": scene_id,
            "lane": "preview",
            "statusLabel": "Instant Preview",
            "metadata": {
                "truth_label": "Instant Preview",
            },
            "urls": {
                "viewer": f"/storage/scenes/{scene_id}/viewer/index.html",
                "splats": f"/storage/scenes/{scene_id}/environment/splats.ply",
                "cameras": f"/storage/scenes/{scene_id}/environment/cameras.json",
                "metadata": f"/storage/scenes/{scene_id}/environment/metadata.json",
                "preview_projection": f"/storage/scenes/{scene_id}/environment/preview-projection.png",
            },
        },
        "assets": [
            {
                "id": "asset_counter",
                "name": "Counter Sign",
                "mesh": "/storage/assets/asset_counter/mesh.glb",
                "texture": "/storage/assets/asset_counter/texture.png",
                "preview": "/storage/assets/asset_counter/preview.png",
                "instanceId": "inst_counter",
                "position": [1, 2, 3],
                "rotation": [0, 0, 0, 1],
                "scale": [1, 1, 1],
            }
        ],
        "camera_views": [
            {
                "id": "view_a",
                "label": "Wide",
                "position": [5, 4, 6],
                "target": [0, 0, 0],
                "fov": 27,
                "lens_mm": 50,
                "note": "Hold the doorway reveal.",
            }
        ],
        "pins": [
            {
                "id": "pin_egress",
                "label": "Left egress",
                "type": "egress",
                "position": [1.2, 0.1, -0.4],
                "created_at": "2026-03-11T09:00:00Z",
            }
        ],
        "director_path": [
            {
                "time": 0.0,
                "position": [5, 4, 6],
                "target": [0, 0, 0],
                "rotation": [0, 0, 0, 1],
                "fov": 27,
            },
            {
                "time": 0.32,
                "position": [4.5, 4.1, 5.4],
                "target": [0, 0, 0],
                "rotation": [0, 0.1, 0, 0.99],
                "fov": 27,
            },
        ],
        "director_brief": "50mm push with clear left egress.",
        "viewer": {
            "fov": 27,
            "lens_mm": 50,
        },
    }


class VercelPublicSaveContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="gauset-vercel-public-save-")
        self.storage_root = Path(self.temp_dir.name)
        self.app_module = _load_vercel_backend_app(
            {
                "BLOB_READ_WRITE_TOKEN": None,
                "GAUSET_MVP_STORAGE_ROOT": str(self.storage_root),
                "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE": "0",
                "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL": None,
            }
        )
        self._storage_gate = patch.object(self.app_module, "_public_storage_write_safe", return_value=True)
        self._storage_gate.start()
        self.client = TestClient(self.app_module.app)

    def tearDown(self) -> None:
        self._storage_gate.stop()
        self.temp_dir.cleanup()

    def test_scene_document_only_save_derives_compatibility_scene_graph(self) -> None:
        scene_id = "scene_public_document_only"
        scene_document = _scene_document_fixture(scene_id)

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_document": scene_document,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        save_payload = response.json()
        self.assertEqual(save_payload["summary"], {"asset_count": 1, "has_environment": True})

        version_response = self.client.get(f"/scene/{scene_id}/versions/{save_payload['version_id']}")
        self.assertEqual(version_response.status_code, 200, version_response.text)
        version_payload = version_response.json()

        self.assertEqual(version_payload["scene_document"], scene_document)
        self.assertEqual(version_payload["scene_graph"]["__scene_document_v2"], scene_document)
        self.assertEqual(version_payload["scene_graph"]["environment"]["id"], scene_id)
        self.assertEqual(
            version_payload["scene_graph"]["environment"]["urls"]["splats"],
            f"/storage/scenes/{scene_id}/environment/splats.ply",
        )
        self.assertEqual(
            version_payload["scene_graph"]["environment"]["urls"]["preview_projection"],
            f"/storage/scenes/{scene_id}/environment/preview-projection.png",
        )
        self.assertEqual(version_payload["scene_graph"]["assets"][0]["id"], "asset_counter")
        self.assertEqual(version_payload["scene_graph"]["assets"][0]["mesh"], "/storage/assets/asset_counter/mesh.glb")
        self.assertEqual(version_payload["scene_graph"]["assets"][0]["position"], [1, 2, 3])
        self.assertEqual(version_payload["scene_graph"]["camera_views"][0]["lens_mm"], 50)
        self.assertEqual(version_payload["scene_graph"]["pins"][0]["type"], "egress")
        self.assertEqual(len(version_payload["scene_graph"]["director_path"]), 2)
        self.assertEqual(
            version_payload["scene_graph"]["director_brief"],
            scene_document["direction"]["directorBrief"],
        )
        self.assertEqual(version_payload["scene_graph"]["viewer"], {"fov": 27, "lens_mm": 50})

    def test_legacy_scene_graph_only_save_migrates_to_canonical_scene_document(self) -> None:
        scene_id = "scene_public_legacy_graph_only"
        scene_graph = _legacy_scene_graph_fixture(scene_id)

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_graph": scene_graph,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        save_payload = response.json()

        version_response = self.client.get(f"/scene/{scene_id}/versions/{save_payload['version_id']}")
        self.assertEqual(version_response.status_code, 200, version_response.text)
        version_payload = version_response.json()

        self.assertEqual(version_payload["scene_document"]["version"], 2)
        self.assertEqual(version_payload["scene_document"]["direction"]["directorBrief"], scene_graph["director_brief"])
        self.assertEqual(version_payload["scene_document"]["viewer"]["lens_mm"], scene_graph["viewer"]["lens_mm"])
        self.assertEqual(len(version_payload["scene_document"]["direction"]["cameraViews"]), 1)
        self.assertEqual(len(version_payload["scene_document"]["direction"]["pins"]), 1)
        self.assertEqual(len(version_payload["scene_document"]["direction"]["directorPath"]), 2)
        self.assertEqual(version_payload["scene_graph"]["__scene_document_v2"], version_payload["scene_document"])
        self.assertEqual(version_payload["scene_graph"]["environment"]["id"], scene_id)
        self.assertEqual(version_payload["scene_graph"]["assets"][0]["mesh"], "/storage/assets/asset_counter/mesh.glb")

    def test_save_rejects_scene_graph_that_does_not_match_canonical_scene_document(self) -> None:
        scene_id = "scene_public_mismatch_contract"
        scene_document = _scene_document_fixture(scene_id)
        mismatched_scene_graph = _legacy_scene_graph_fixture(scene_id)
        mismatched_scene_graph["director_brief"] = "Mismatched graph brief"
        mismatched_scene_graph["viewer"]["lens_mm"] = 32
        mismatched_scene_graph["pins"] = []

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_document": scene_document,
                "scene_graph": mismatched_scene_graph,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 409, response.text)
        payload = response.json()
        self.assertIn("scene_document", str(payload.get("detail", "")))
        self.assertIn("scene_graph", str(payload.get("detail", "")))


if __name__ == "__main__":
    unittest.main()
