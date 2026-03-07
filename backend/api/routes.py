import json
import platform
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from models.ml_sharp_wrapper import generate_environment
from models.triposr_wrapper import generate_asset

router = APIRouter()

# Resolve from project root (never process cwd).
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = PROJECT_ROOT / "uploads" / "images"
SCENES_DIR = PROJECT_ROOT / "scenes"
ASSETS_DIR = PROJECT_ROOT / "assets"

for directory in [UPLOADS_DIR, SCENES_DIR, ASSETS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# In-memory job queue state.
jobs: Dict[str, Dict[str, Any]] = {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def _resolve_uploaded_image_path(image_id: str) -> Path:
    matches = sorted(UPLOADS_DIR.glob(f"{image_id}.*"))
    if not matches:
        raise HTTPException(status_code=400, detail=f"Image {image_id} not found in uploads")
    return matches[0]


def _scene_urls(scene_id: str) -> Dict[str, str]:
    base = f"/storage/scenes/{scene_id}/environment"
    return {
        "splats": f"{base}/splats.ply",
        "cameras": f"{base}/cameras.json",
        "metadata": f"{base}/metadata.json",
    }


def _asset_urls(asset_id: str) -> Dict[str, str]:
    base = f"/storage/assets/{asset_id}"
    return {
        "mesh": f"{base}/mesh.glb",
        "texture": f"{base}/texture.png",
        "preview": f"{base}/preview.png",
    }


def _scene_versions_dir(scene_id: str) -> Path:
    return SCENES_DIR / scene_id / "versions"


def _scene_version_path(scene_id: str, version_id: str) -> Path:
    return _scene_versions_dir(scene_id) / f"{version_id}.json"


def _scene_comments_dir(scene_id: str) -> Path:
    return SCENES_DIR / scene_id / "comments"


def _scene_comments_path(scene_id: str, version_id: str) -> Path:
    return _scene_comments_dir(scene_id) / f"{version_id}.json"


def _scene_review_path(scene_id: str) -> Path:
    return SCENES_DIR / scene_id / "review.json"


def _scene_summary(scene_graph: Dict[str, Any]) -> Dict[str, Any]:
    assets = scene_graph.get("assets") if isinstance(scene_graph, dict) else []
    return {
        "asset_count": len(assets) if isinstance(assets, list) else 0,
        "has_environment": bool(scene_graph.get("environment")) if isinstance(scene_graph, dict) else False,
    }


def _load_version_file(path: Path) -> Dict[str, Any]:
    with path.open() as file_handle:
        return json.load(file_handle)


def _load_comments(scene_id: str, version_id: str) -> List[Dict[str, Any]]:
    comments_path = _scene_comments_path(scene_id, version_id)
    if not comments_path.exists():
        return []
    with comments_path.open() as file_handle:
        return json.load(file_handle)


def _default_review_payload(scene_id: str) -> Dict[str, Any]:
    return {
        "scene_id": scene_id,
        "metadata": {
            "project_name": "",
            "scene_title": "",
            "location_name": "",
            "owner": "",
            "notes": "",
        },
        "approval": {
            "state": "draft",
            "updated_at": None,
            "updated_by": None,
            "note": "",
            "history": [],
        },
    }


def _load_review(scene_id: str) -> Dict[str, Any]:
    review_path = _scene_review_path(scene_id)
    if not review_path.exists():
        return _default_review_payload(scene_id)
    with review_path.open() as file_handle:
        return json.load(file_handle)


def _torch_status() -> Dict[str, Any]:
    try:
        import torch  # type: ignore

        mps_available = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
        return {
            "installed": True,
            "version": getattr(torch, "__version__", "unknown"),
            "mps_available": mps_available,
        }
    except Exception as exc:  # pragma: no cover - defensive diagnostics
        return {
            "installed": False,
            "version": None,
            "mps_available": False,
            "error": str(exc),
        }


class SceneSaveRequest(BaseModel):
    scene_id: str
    scene_graph: Dict[str, Any]
    source: str = "manual"


class GenerateRequest(BaseModel):
    image_id: str


class VersionCommentRequest(BaseModel):
    author: str = "Reviewer"
    body: str
    anchor: str = "scene"


class SceneReviewRequest(BaseModel):
    metadata: Dict[str, str]
    approval_state: str
    updated_by: str = "Reviewer"
    note: str = ""


@router.get("/setup/status")
async def setup_status():
    return {
        "status": "ok",
        "python_version": platform.python_version(),
        "project_root": str(PROJECT_ROOT),
        "directories": {
            "uploads": UPLOADS_DIR.exists(),
            "assets": ASSETS_DIR.exists(),
            "scenes": SCENES_DIR.exists(),
        },
        "models": {
            "ml_sharp": (PROJECT_ROOT / "backend" / "ml-sharp").exists(),
            "triposr": (PROJECT_ROOT / "backend" / "TripoSR").exists(),
        },
        "torch": _torch_status(),
    }


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename in upload")

    image_id = uuid.uuid4().hex
    ext = Path(file.filename).suffix.lower() or ".png"
    filename = f"{image_id}{ext}"
    filepath = UPLOADS_DIR / filename

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    filepath.write_bytes(contents)

    return {
        "image_id": image_id,
        "filename": filename,
        "filepath": str(filepath),
        "url": f"/storage/uploads/images/{filename}",
    }


@router.post("/generate/environment")
async def generate_environment_api(request: GenerateRequest, background_tasks: BackgroundTasks):
    image_path = _resolve_uploaded_image_path(request.image_id)

    scene_id = f"scene_{str(uuid.uuid4())[:8]}"
    output_dir = SCENES_DIR / scene_id / "environment"
    output_dir.mkdir(parents=True, exist_ok=True)

    jobs[scene_id] = {
        "id": scene_id,
        "type": "environment",
        "status": "processing",
        "image_id": request.image_id,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
    }

    def task() -> None:
        try:
            generated_dir = Path(generate_environment(str(image_path), str(output_dir)))
            jobs[scene_id]["status"] = "completed"
            jobs[scene_id]["result"] = {
                "scene_id": scene_id,
                "environment_dir": str(generated_dir),
                "files": {
                    "splats": str(generated_dir / "splats.ply"),
                    "cameras": str(generated_dir / "cameras.json"),
                    "metadata": str(generated_dir / "metadata.json"),
                },
                "urls": _scene_urls(scene_id),
            }
        except Exception as exc:
            jobs[scene_id]["status"] = "failed"
            jobs[scene_id]["error"] = str(exc)
        finally:
            jobs[scene_id]["updated_at"] = _utc_now()

    background_tasks.add_task(task)
    return {
        "scene_id": scene_id,
        "job_id": scene_id,
        "status": "processing",
        "urls": _scene_urls(scene_id),
    }


@router.post("/generate/asset")
async def generate_asset_api(request: GenerateRequest, background_tasks: BackgroundTasks):
    image_path = _resolve_uploaded_image_path(request.image_id)

    asset_id = f"asset_{str(uuid.uuid4())[:8]}"
    output_dir = ASSETS_DIR / asset_id
    output_dir.mkdir(parents=True, exist_ok=True)

    jobs[asset_id] = {
        "id": asset_id,
        "type": "asset",
        "status": "processing",
        "image_id": request.image_id,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
    }

    def task() -> None:
        try:
            generated_dir = Path(generate_asset(str(image_path), str(output_dir)))
            jobs[asset_id]["status"] = "completed"
            jobs[asset_id]["result"] = {
                "asset_id": asset_id,
                "asset_dir": str(generated_dir),
                "files": {
                    "mesh": str(generated_dir / "mesh.glb"),
                    "texture": str(generated_dir / "texture.png"),
                    "preview": str(generated_dir / "preview.png"),
                },
                "urls": _asset_urls(asset_id),
            }
        except Exception as exc:
            jobs[asset_id]["status"] = "failed"
            jobs[asset_id]["error"] = str(exc)
        finally:
            jobs[asset_id]["updated_at"] = _utc_now()

    background_tasks.add_task(task)
    return {
        "asset_id": asset_id,
        "job_id": asset_id,
        "status": "processing",
        "urls": _asset_urls(asset_id),
    }


@router.post("/scene/save")
async def scene_save(request: SceneSaveRequest):
    scene_dir = SCENES_DIR / request.scene_id
    scene_dir.mkdir(parents=True, exist_ok=True)

    scene_path = scene_dir / "scene.json"
    versions_dir = _scene_versions_dir(request.scene_id)
    versions_dir.mkdir(parents=True, exist_ok=True)

    saved_at = _utc_now()
    version_id = _version_id()
    version_payload = {
        "scene_id": request.scene_id,
        "version_id": version_id,
        "saved_at": saved_at,
        "source": request.source,
        "summary": _scene_summary(request.scene_graph),
        "scene_graph": request.scene_graph,
    }

    with scene_path.open("w") as file_handle:
        json.dump(request.scene_graph, file_handle, indent=2)

    version_path = _scene_version_path(request.scene_id, version_id)
    with version_path.open("w") as file_handle:
        json.dump(version_payload, file_handle, indent=2)

    review_path = _scene_review_path(request.scene_id)
    if not review_path.exists():
        with review_path.open("w") as file_handle:
            json.dump(_default_review_payload(request.scene_id), file_handle, indent=2)

    return {
        "status": "saved",
        "scene_id": request.scene_id,
        "filepath": str(scene_path),
        "url": f"/storage/scenes/{request.scene_id}/scene.json",
        "saved_at": saved_at,
        "version_id": version_id,
        "versions_url": f"/scene/{request.scene_id}/versions",
        "summary": version_payload["summary"],
    }


@router.get("/scene/{scene_id}/versions")
async def list_scene_versions(scene_id: str):
    versions_dir = _scene_versions_dir(scene_id)
    if not versions_dir.exists():
        return {"scene_id": scene_id, "versions": []}

    versions: List[Dict[str, Any]] = []
    for path in sorted(versions_dir.glob("*.json"), reverse=True)[:20]:
        payload = _load_version_file(path)
        comment_count = len(_load_comments(scene_id, payload.get("version_id", path.stem)))
        versions.append(
            {
                "version_id": payload.get("version_id", path.stem),
                "saved_at": payload.get("saved_at"),
                "source": payload.get("source", "manual"),
                "summary": payload.get("summary", {}),
                "comment_count": comment_count,
            }
        )

    return {"scene_id": scene_id, "versions": versions}


@router.get("/scene/{scene_id}/versions/{version_id}")
async def get_scene_version(scene_id: str, version_id: str):
    version_path = _scene_version_path(scene_id, version_id)
    if not version_path.exists():
        raise HTTPException(status_code=404, detail="Scene version not found")
    return _load_version_file(version_path)


@router.get("/scene/{scene_id}/review")
async def get_scene_review(scene_id: str):
    scene_dir = SCENES_DIR / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail="Scene not found")
    return _load_review(scene_id)


@router.post("/scene/{scene_id}/review")
async def upsert_scene_review(scene_id: str, request: SceneReviewRequest):
    scene_dir = SCENES_DIR / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail="Scene not found")

    current_review = _load_review(scene_id)
    approval_history = current_review.get("approval", {}).get("history", [])
    next_approval = {
        "state": request.approval_state,
        "updated_at": _utc_now(),
        "updated_by": request.updated_by.strip() or "Reviewer",
        "note": request.note.strip(),
        "history": approval_history,
    }

    if not approval_history or approval_history[-1].get("state") != request.approval_state or approval_history[-1].get("note") != request.note.strip():
        next_approval["history"] = [
            *approval_history,
            {
                "state": request.approval_state,
                "updated_at": next_approval["updated_at"],
                "updated_by": next_approval["updated_by"],
                "note": next_approval["note"],
            },
        ]

    review_payload = {
        "scene_id": scene_id,
        "metadata": {
            "project_name": request.metadata.get("project_name", "").strip(),
            "scene_title": request.metadata.get("scene_title", "").strip(),
            "location_name": request.metadata.get("location_name", "").strip(),
            "owner": request.metadata.get("owner", "").strip(),
            "notes": request.metadata.get("notes", "").strip(),
        },
        "approval": next_approval,
    }

    review_path = _scene_review_path(scene_id)
    with review_path.open("w") as file_handle:
        json.dump(review_payload, file_handle, indent=2)

    return review_payload


@router.get("/scene/{scene_id}/versions/{version_id}/comments")
async def list_scene_comments(scene_id: str, version_id: str):
    version_path = _scene_version_path(scene_id, version_id)
    if not version_path.exists():
        raise HTTPException(status_code=404, detail="Scene version not found")
    return {
        "scene_id": scene_id,
        "version_id": version_id,
        "comments": _load_comments(scene_id, version_id),
    }


@router.post("/scene/{scene_id}/versions/{version_id}/comments")
async def create_scene_comment(scene_id: str, version_id: str, request: VersionCommentRequest):
    version_path = _scene_version_path(scene_id, version_id)
    if not version_path.exists():
        raise HTTPException(status_code=404, detail="Scene version not found")

    comments_dir = _scene_comments_dir(scene_id)
    comments_dir.mkdir(parents=True, exist_ok=True)
    comments = _load_comments(scene_id, version_id)
    comment = {
        "comment_id": uuid.uuid4().hex,
        "author": request.author.strip() or "Reviewer",
        "body": request.body.strip(),
        "anchor": request.anchor.strip() or "scene",
        "created_at": _utc_now(),
    }
    if not comment["body"]:
        raise HTTPException(status_code=400, detail="Comment body is required")
    comments.append(comment)

    comments_path = _scene_comments_path(scene_id, version_id)
    with comments_path.open("w") as file_handle:
        json.dump(comments, file_handle, indent=2)

    return {
        "scene_id": scene_id,
        "version_id": version_id,
        "comment": comment,
        "comment_count": len(comments),
    }


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]
