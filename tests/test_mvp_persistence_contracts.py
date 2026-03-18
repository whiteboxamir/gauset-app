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

        scene_path = routes.SCENES_DIR / scene_id / "scene.json"
        version_path = routes.SCENES_DIR / scene_id / "versions" / f"{payload['version_id']}.json"
        self.assertTrue(scene_path.exists())
        self.assertTrue(version_path.exists())

        scene_document = json.loads(scene_path.read_text())
        version_document = json.loads(version_path.read_text())
        self.assertEqual(scene_document["camera_views"][0]["lens_mm"], 50)
        self.assertEqual(scene_document["pins"][0]["type"], "egress")
        self.assertEqual(scene_document["director_brief"], scene_graph["director_brief"])
        self.assertEqual(scene_document["viewer"]["lens_mm"], 50)
        self.assertEqual(len(scene_document["director_path"]), 2)
        self.assertEqual(version_document["scene_graph"], scene_document)

    def test_scene_save_preserves_embedded_scene_document_v2_compat_field(self) -> None:
        scene_id = "scene_document_v2_contract"
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
            "__scene_document_v2": {
                "version": 2,
                "rootIds": [],
                "nodes": {},
                "groups": {},
                "cameras": {},
                "lights": {},
                "meshes": {},
                "splats": {},
                "direction": {
                    "cameraViews": [],
                    "pins": [],
                    "directorPath": [],
                    "directorBrief": "",
                },
                "review": None,
                "viewer": {
                    "fov": 27,
                    "lens_mm": 50,
                    "activeCameraNodeId": None,
                },
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

        version_path = routes.SCENES_DIR / scene_id / "versions" / f"{payload['version_id']}.json"
        version_document = json.loads(version_path.read_text())
        self.assertEqual(version_document["scene_graph"]["__scene_document_v2"]["version"], 2)
        self.assertEqual(
            version_document["scene_graph"]["environment"]["urls"]["preview_projection"],
            f"/storage/scenes/{scene_id}/environment/preview-projection.png",
        )
        self.assertEqual(version_document["scene_graph"]["assets"][0]["mesh"], "/storage/assets/asset_counter/mesh.glb")

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
