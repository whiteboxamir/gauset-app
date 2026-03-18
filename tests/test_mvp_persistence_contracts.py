import json
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from api import routes  # noqa: E402
from server import app  # noqa: E402


class MvpPersistenceContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="gauset-mvp-persistence-")
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

        self.client = TestClient(app)

    def tearDown(self) -> None:
        routes.SCENES_DIR = self.original_scenes_dir
        routes.ASSETS_DIR = self.original_assets_dir
        routes.UPLOADS_DIR = self.original_uploads_dir
        self.temp_dir.cleanup()

    def _load_scene_artifacts(self, scene_id: str, version_id: str) -> tuple[dict, dict]:
        scene_path = routes.SCENES_DIR / scene_id / "scene.json"
        version_path = routes.SCENES_DIR / scene_id / "versions" / f"{version_id}.json"
        self.assertTrue(scene_path.exists())
        self.assertTrue(version_path.exists())
        return json.loads(scene_path.read_text()), json.loads(version_path.read_text())

    def _build_scene_document_v2(self, scene_id: str) -> dict:
        return {
            "version": 2,
            "rootIds": ["node_environment", "node_counter"],
            "nodes": {
                "node_environment": {
                    "id": "node_environment",
                    "kind": "splat",
                    "parentId": None,
                    "childIds": [],
                    "name": "Stage Environment",
                    "visible": True,
                    "locked": False,
                    "transform": {
                        "position": [0, 0, 0],
                        "rotation": [0, 0, 0, 1],
                        "scale": [1, 1, 1],
                    },
                },
                "node_counter": {
                    "id": "node_counter",
                    "kind": "mesh",
                    "parentId": None,
                    "childIds": [],
                    "name": "Counter sign",
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
                "node_counter": {
                    "id": "node_counter",
                    "assetId": "asset_counter",
                    "meshUrl": "/storage/assets/asset_counter/mesh.glb",
                    "textureUrl": "/storage/assets/asset_counter/texture.png",
                    "previewUrl": "/storage/assets/asset_counter/preview.png",
                    "metadata": {
                        "instanceId": "inst_counter",
                        "material": "matte",
                    },
                }
            },
            "splats": {
                "node_environment": {
                    "id": "node_environment",
                    "sceneId": scene_id,
                    "viewerUrl": f"/storage/scenes/{scene_id}/viewer/index.html",
                    "splatUrl": f"/storage/scenes/{scene_id}/environment/splats.ply",
                    "camerasUrl": f"/storage/scenes/{scene_id}/environment/cameras.json",
                    "metadataUrl": f"/storage/scenes/{scene_id}/environment/metadata.json",
                    "metadata": {
                        "lane": "preview",
                        "truth_label": "Instant Preview",
                        "quality_tier": "single_image_preview_ultra_dense",
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
                    }
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

    def test_scene_save_round_trips_full_scene_graph(self) -> None:
        scene_id = "scene_phase1_contract"
        scene_graph = {
            "environment": {
                "id": scene_id,
                "lane": "preview",
                "urls": {
                    "splats": f"/storage/scenes/{scene_id}/environment/splats.ply",
                    "metadata": f"/storage/scenes/{scene_id}/environment/metadata.json",
                },
                "metadata": {
                    "lane": "preview",
                    "truth_label": "Instant Preview",
                    "quality_tier": "single_image_preview_ultra_dense",
                },
            },
            "assets": [
                {
                    "id": "asset_counter",
                    "name": "Counter sign",
                    "mesh": "/storage/assets/asset_counter/mesh.glb",
                    "instanceId": "inst_counter",
                    "position": [1, 2, 3],
                    "rotation": [0, 0.5, 0],
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

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_graph": scene_graph,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"], {"asset_count": 1, "has_environment": True})

        scene_document, version_document = self._load_scene_artifacts(scene_id, payload["version_id"])
        self.assertEqual(scene_document["version"], 2)
        self.assertEqual(scene_document["direction"]["cameraViews"][0]["lens_mm"], 50)
        self.assertEqual(scene_document["direction"]["pins"][0]["type"], "egress")
        self.assertEqual(scene_document["direction"]["directorBrief"], scene_graph["director_brief"])
        self.assertEqual(scene_document["viewer"]["lens_mm"], 50.0)
        self.assertEqual(len(scene_document["direction"]["directorPath"]), 2)
        self.assertEqual(scene_document["meshes"]["inst_counter"]["assetId"], "asset_counter")
        self.assertEqual(version_document["scene_document"], scene_document)
        self.assertEqual(version_document["scene_graph"]["__scene_document_v2"], scene_document)
        self.assertEqual(version_document["scene_graph"]["camera_views"][0]["lens_mm"], 50)
        self.assertEqual(version_document["scene_graph"]["assets"][0]["instanceId"], "inst_counter")

    def test_scene_save_preserves_embedded_scene_document_v2_compat_field(self) -> None:
        scene_id = "scene_document_v2_contract"
        scene_document = self._build_scene_document_v2(scene_id)
        scene_graph = {
            "environment": {
                "id": scene_id,
                "lane": "preview",
                "urls": {
                    "splats": f"/storage/scenes/{scene_id}/environment/splats.ply",
                    "metadata": f"/storage/scenes/{scene_id}/environment/metadata.json",
                    "preview_projection": f"/storage/scenes/{scene_id}/environment/preview-projection.png",
                },
            },
            "assets": [
                {
                    "id": "asset_counter",
                    "mesh": "/storage/assets/asset_counter/mesh.glb",
                    "instanceId": "inst_counter",
                    "position": [1, 2, 3],
                    "rotation": [0, 0.5, 0],
                    "scale": [1, 1, 1],
                }
            ],
            "camera_views": [],
            "pins": [],
            "director_path": [],
            "director_brief": "",
            "viewer": {
                "fov": 27,
                "lens_mm": 50,
            },
            "__scene_document_v2": scene_document,
        }

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_graph": scene_graph,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"], {"asset_count": 1, "has_environment": True})

        saved_scene_document, version_document = self._load_scene_artifacts(scene_id, payload["version_id"])
        self.assertEqual(saved_scene_document, scene_document)
        self.assertEqual(version_document["scene_document"], scene_document)
        self.assertEqual(version_document["scene_graph"]["__scene_document_v2"]["version"], 2)
        self.assertEqual(
            version_document["scene_graph"]["environment"]["urls"]["preview_projection"],
            f"/storage/scenes/{scene_id}/environment/preview-projection.png",
        )
        self.assertEqual(version_document["scene_graph"]["assets"][0]["mesh"], "/storage/assets/asset_counter/mesh.glb")

    def test_scene_save_derives_compatibility_graph_from_scene_document_only(self) -> None:
        scene_id = "scene_document_only_contract"
        scene_document = self._build_scene_document_v2(scene_id)

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_document": scene_document,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"], {"asset_count": 1, "has_environment": True})

        saved_scene_document, version_document = self._load_scene_artifacts(scene_id, payload["version_id"])
        self.assertEqual(saved_scene_document, scene_document)
        self.assertEqual(version_document["scene_document"], scene_document)

        compatibility_scene_graph = version_document["scene_graph"]
        self.assertEqual(compatibility_scene_graph["__scene_document_v2"], scene_document)
        self.assertEqual(compatibility_scene_graph["environment"]["id"], scene_id)
        self.assertEqual(compatibility_scene_graph["environment"]["lane"], "preview")
        self.assertEqual(compatibility_scene_graph["environment"]["name"], "Stage Environment")
        self.assertEqual(
            compatibility_scene_graph["environment"]["urls"]["preview_projection"],
            f"/storage/scenes/{scene_id}/environment/preview-projection.png",
        )
        self.assertEqual(compatibility_scene_graph["assets"][0]["mesh"], "/storage/assets/asset_counter/mesh.glb")
        self.assertEqual(compatibility_scene_graph["assets"][0]["texture"], "/storage/assets/asset_counter/texture.png")
        self.assertEqual(compatibility_scene_graph["assets"][0]["preview"], "/storage/assets/asset_counter/preview.png")
        self.assertEqual(compatibility_scene_graph["assets"][0]["instanceId"], "inst_counter")
        self.assertEqual(compatibility_scene_graph["assets"][0]["position"], [1.0, 2.0, 3.0])
        self.assertEqual(compatibility_scene_graph["assets"][0]["rotation"], [0.0, 0.0, 0.0, 1.0])
        self.assertEqual(compatibility_scene_graph["assets"][0]["scale"], [1.0, 1.0, 1.0])
        self.assertEqual(compatibility_scene_graph["camera_views"][0]["lens_mm"], 50)
        self.assertEqual(compatibility_scene_graph["pins"][0]["type"], "egress")
        self.assertEqual(compatibility_scene_graph["director_brief"], "50mm push with clear left egress.")
        self.assertEqual(compatibility_scene_graph["viewer"]["lens_mm"], 50.0)

    def test_scene_save_rejects_mismatched_scene_document_and_scene_graph(self) -> None:
        scene_id = "scene_document_graph_mismatch_contract"
        scene_document = self._build_scene_document_v2(scene_id)
        scene_graph = {
            "environment": {
                "id": scene_id,
                "lane": "preview",
                "urls": {
                    "splats": f"/storage/scenes/{scene_id}/environment/splats.ply",
                    "metadata": f"/storage/scenes/{scene_id}/environment/metadata.json",
                    "preview_projection": f"/storage/scenes/{scene_id}/environment/preview-projection.png",
                },
            },
            "assets": [
                {
                    "id": "asset_counter",
                    "mesh": "/storage/assets/asset_counter/mesh.glb",
                    "texture": "/storage/assets/asset_counter/texture.png",
                    "preview": "/storage/assets/asset_counter/preview.png",
                    "instanceId": "inst_counter",
                    "position": [1, 2, 3],
                    "rotation": [0, 0, 0, 1],
                    "scale": [1, 1, 1],
                }
            ],
            "camera_views": scene_document["direction"]["cameraViews"],
            "pins": scene_document["direction"]["pins"],
            "director_path": scene_document["direction"]["directorPath"],
            "director_brief": "Mismatch on purpose.",
            "viewer": {
                "fov": 27,
                "lens_mm": 50,
            },
            "__scene_document_v2": scene_document,
        }

        response = self.client.post(
            "/scene/save",
            json={
                "scene_id": scene_id,
                "scene_document": scene_document,
                "scene_graph": scene_graph,
                "source": "manual",
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(),
            {
                "detail": {
                    "code": "SCENE_DOCUMENT_GRAPH_MISMATCH",
                    "message": "scene_document and scene_graph do not match. Remove scene_graph or resend a compatibility graph derived from the scene_document.",
                }
            },
        )
        self.assertFalse((routes.SCENES_DIR / scene_id / "scene.json").exists())
        versions_dir = routes.SCENES_DIR / scene_id / "versions"
        self.assertEqual(list(versions_dir.glob("*.json")), [])

    def test_review_round_trips_full_metadata_and_structured_issues(self) -> None:
        scene_id = "scene_review_contract"
        scene_dir = routes.SCENES_DIR / scene_id
        scene_dir.mkdir(parents=True, exist_ok=True)
        (scene_dir / "scene.json").write_text(json.dumps({"environment": None, "assets": []}, indent=2))

        response = self.client.post(
            f"/scene/{scene_id}/review",
            json={
                "metadata": {
                    "project_name": "Wave Contract Project",
                    "scene_title": "Contract smoke",
                    "location_name": "Barcelona backlot",
                    "owner": "Codex QA",
                    "notes": "Primary production context.",
                    "address": "Stage 7",
                    "shoot_day": "Day 12",
                    "permit_status": "approved",
                    "access_notes": "Use the east gate.",
                    "parking_notes": "Lot B only.",
                    "power_notes": "Bring distro to the far wall.",
                    "safety_notes": "Wind check before condor lift.",
                },
                "approval_state": "approved",
                "updated_by": "Codex QA",
                "note": "Ready for handoff.",
                "issues": [
                    {
                        "id": "issue_hero_power",
                        "title": "Confirm distro path",
                        "body": "Keep the hero power run off the walkway.",
                        "type": "lighting",
                        "severity": "high",
                        "status": "open",
                        "assignee": "G&E",
                        "author": "Codex QA",
                        "anchor_position": [1.0, 0.3, -0.8],
                        "anchor_view_id": "view_a",
                        "version_id": "ver_1",
                        "created_at": "2026-03-11T09:15:00Z",
                        "updated_at": "2026-03-11T09:15:00Z",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)

        review_payload = response.json()
        self.assertEqual(review_payload["metadata"]["address"], "Stage 7")
        self.assertEqual(review_payload["metadata"]["permit_status"], "approved")
        self.assertEqual(review_payload["approval"]["state"], "approved")
        self.assertEqual(len(review_payload["approval"]["history"]), 1)
        self.assertEqual(review_payload["issues"][0]["title"], "Confirm distro path")
        self.assertEqual(review_payload["issues"][0]["anchor_view_id"], "view_a")

        review_document = json.loads((scene_dir / "review.json").read_text())
        self.assertEqual(review_document, review_payload)

        get_response = self.client.get(f"/scene/{scene_id}/review")
        self.assertEqual(get_response.status_code, 200)
        loaded_review = get_response.json()
        self.assertEqual(loaded_review["metadata"]["power_notes"], "Bring distro to the far wall.")
        self.assertEqual(len(loaded_review["issues"]), 1)


if __name__ == "__main__":
    unittest.main()
