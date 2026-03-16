import json
import mimetypes
import os
import platform
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from models.ml_sharp_wrapper import generate_environment
from models.triposr_wrapper import generate_asset
from providers import (
    ImageGenerationRequest,
    ProviderError,
    get_provider_registry,
    materialize_artifact,
    normalize_reference_image,
)

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
capture_sessions: Dict[str, Dict[str, Any]] = {}
upload_records: Dict[str, Dict[str, Any]] = {}

CAPTURE_MIN_IMAGES = 8
CAPTURE_RECOMMENDED_IMAGES = 12
CAPTURE_MAX_IMAGES = 32

SOURCE_PROVENANCE_VERSION = "gauset.source_provenance.v1"
WORLD_SOURCE_VERSION = "gauset.world_source.v1"
LANE_METADATA_VERSION = "gauset.lane_truth.v1"
HANDOFF_MANIFEST_VERSION = "gauset.handoff_manifest.v1"
HANDOFF_TARGETS = ["scene_document_v2", "external_world_package", "unreal_handoff_manifest"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def _normalize_warnings(*groups: Any, limit: int = 6) -> List[str]:
    normalized: List[str] = []
    seen: set[str] = set()
    for group in groups:
        if group is None:
            continue
        values = group if isinstance(group, (list, tuple, set)) else [group]
        for value in values:
            message = str(value or "").strip()
            if not message or message in seen:
                continue
            seen.add(message)
            normalized.append(message)
            if len(normalized) >= limit:
                return normalized
    return normalized


def _guess_media_type(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    if guessed:
        return guessed
    if path.endswith(".glb"):
        return "model/gltf-binary"
    if path.endswith(".ply"):
        return "application/octet-stream"
    return "application/octet-stream"


def _worker_token() -> str:
    return os.getenv("GAUSET_WORKER_TOKEN", "").strip()


def _require_worker_auth(request: Request) -> None:
    expected = _worker_token()
    if not expected:
        return

    authorization = request.headers.get("authorization", "").strip()
    explicit = request.headers.get("x-gauset-worker-token", "").strip()
    bearer = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    provided = explicit or bearer
    if provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized worker request")


def _job_context_from_request(request: Request) -> Dict[str, Any]:
    return {
        "studio_id": request.headers.get("x-gauset-studio-id", "").strip() or None,
        "user_id": request.headers.get("x-gauset-user-id", "").strip() or None,
    }


def _clamp_target_images(value: Any) -> int:
    try:
        target_images = int(value)
    except (TypeError, ValueError):
        target_images = CAPTURE_RECOMMENDED_IMAGES
    return max(CAPTURE_MIN_IMAGES, min(CAPTURE_MAX_IMAGES, target_images))


def _coverage_percent(frame_count: int, target_images: int) -> float:
    if target_images <= 0:
        return 0.0
    return round(min(100.0, (frame_count / target_images) * 100.0), 1)


def _text_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _list_of_text(values: Any, *, limit: int = 6) -> List[str]:
    if not isinstance(values, (list, tuple, set)):
        values = [values]
    return _normalize_warnings(*values, limit=limit)


def _read_json_dict(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_json_dict(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def _source_kind_for_type(source_type: str) -> str:
    return "provider_generated_still" if source_type == "generated" else "uploaded_still"


def _source_origin_for_type(source_type: str) -> str:
    return "local_provider_generation" if source_type == "generated" else "local_upload"


def _source_ingest_channel_for_type(source_type: str) -> str:
    return "generate_image" if source_type == "generated" else "upload"


def _build_source_provenance(record: Dict[str, Any]) -> Dict[str, Any]:
    source_type = str(record.get("source_type") or "upload").strip() or "upload"
    return {
        "schema_version": SOURCE_PROVENANCE_VERSION,
        "kind": _source_kind_for_type(source_type),
        "origin": _source_origin_for_type(source_type),
        "ingest_channel": _source_ingest_channel_for_type(source_type),
        "source_type": source_type,
        "image_id": str(record.get("image_id") or "").strip(),
        "filename": str(record.get("filename") or "").strip(),
        "original_filename": _text_or_none(record.get("original_filename")),
        "provider": _text_or_none(record.get("provider")),
        "model": _text_or_none(record.get("model")),
        "prompt": _text_or_none(record.get("prompt")),
        "generation_job_id": _text_or_none(record.get("generation_job_id")),
        "future_world_source_kinds": ["capture_set", "external_world_package", "downstream_handoff_manifest"],
    }


def _normalize_upload_record(
    payload: Dict[str, Any] | None,
    *,
    image_id: str,
    image_path: Path,
) -> Dict[str, Any]:
    record = payload if isinstance(payload, dict) else {}
    source_type = str(record.get("source_type") or "upload").strip() or "upload"
    normalized = {
        "image_id": image_id,
        "filename": str(record.get("filename") or image_path.name).strip() or image_path.name,
        "original_filename": str(record.get("original_filename") or record.get("filename") or image_path.name).strip()
        or image_path.name,
        "filepath": str(image_path),
        "url": f"/storage/uploads/images/{image_path.name}",
        "created_at": str(record.get("created_at") or _utc_now()).strip() or _utc_now(),
        "source_type": source_type,
        "provider": _text_or_none(record.get("provider")),
        "model": _text_or_none(record.get("model")),
        "prompt": _text_or_none(record.get("prompt")),
        "generation_job_id": _text_or_none(record.get("generation_job_id")),
    }
    source_provenance = record.get("source_provenance") if isinstance(record.get("source_provenance"), dict) else None
    normalized["source_provenance"] = source_provenance or _build_source_provenance(normalized)
    return normalized


def _build_upload_response(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "image_id": record["image_id"],
        "filename": record["filename"],
        "filepath": record["filepath"],
        "url": record["url"],
        "source_type": record["source_type"],
        "provider": record.get("provider"),
        "model": record.get("model"),
        "prompt": record.get("prompt"),
        "generation_job_id": record.get("generation_job_id"),
        "source_provenance": record.get("source_provenance"),
    }


def _build_world_source(
    *,
    lane: str,
    ingest_channel: str,
    input_strategy: str,
    primary_source: Dict[str, Any],
    upstream_sources: List[Dict[str, Any]] | None = None,
    session_id: str | None = None,
    frame_count: int | None = None,
) -> Dict[str, Any]:
    sources = [source for source in (upstream_sources or [primary_source]) if isinstance(source, dict)]
    return {
        "schema_version": WORLD_SOURCE_VERSION,
        "kind": str(primary_source.get("kind") or "uploaded_still").strip() or "uploaded_still",
        "origin": "local_backend_ingest",
        "ingest_channel": ingest_channel,
        "lane": lane,
        "input_strategy": input_strategy,
        "primary_source": primary_source,
        "upstream_sources": sources,
        "upstream_image_ids": [
            str(source.get("image_id") or "").strip()
            for source in sources
            if str(source.get("image_id") or "").strip()
        ],
        "capture_session_id": session_id,
        "frame_count": frame_count,
        "future_ingest_support": ["external_world_package", "downstream_handoff_manifest"],
    }


def _build_lane_metadata(
    *,
    lane: str,
    lane_truth: str,
    available: bool,
    readiness: str,
    summary: str,
    blockers: List[str] | None = None,
    production_ready: bool = False,
    hero_ready: bool = False,
    world_class_ready: bool = False,
) -> Dict[str, Any]:
    return {
        "schema_version": LANE_METADATA_VERSION,
        "lane": lane,
        "truth": lane_truth,
        "available": available,
        "readiness": readiness,
        "summary": summary,
        "blockers": _list_of_text(blockers or [], limit=8),
        "production_ready": production_ready,
        "hero_ready": hero_ready,
        "world_class_ready": world_class_ready,
    }


def _build_handoff_manifest(
    *,
    lane: str,
    world_source: Dict[str, Any],
    ready: bool,
    summary: str,
    blockers: List[str] | None = None,
) -> Dict[str, Any]:
    return {
        "schema_version": HANDOFF_MANIFEST_VERSION,
        "lane": lane,
        "ready": ready,
        "summary": summary,
        "targets": list(HANDOFF_TARGETS),
        "source_kind": str(world_source.get("kind") or "").strip() or None,
        "blockers": _list_of_text(blockers or [], limit=8),
    }


def _preview_delivery_defaults() -> Dict[str, Any]:
    return {
        "readiness": "preview_only",
        "label": "Preview only",
        "summary": "This output is a truthful single-still preview, not a faithful reconstruction or production-ready handoff.",
        "blocking_issues": [
            "Single-still preview does not satisfy multi-view reconstruction or production delivery gates.",
        ],
        "next_actions": [
            "Collect a multi-view capture set or ingest an explicit external world package for faithful world handoff.",
        ],
    }


def _asset_delivery_defaults() -> Dict[str, Any]:
    return {
        "readiness": "editorial_object",
        "label": "Local asset draft",
        "summary": "This single-image asset is suitable for editor blocking and look review, not world reconstruction or production-ready downstream handoff.",
        "blocking_issues": [
            "Single-image asset extraction is not benchmarked for production-ready downstream delivery.",
        ],
        "next_actions": [
            "Review the mesh and texture in the editor before packaging a downstream handoff manifest.",
        ],
    }


def _merge_generation_metadata(
    metadata_path: Path,
    *,
    lane: str,
    lane_truth: str,
    upload_record: Dict[str, Any],
    ingest_channel: str,
    input_strategy: str,
    delivery_defaults: Dict[str, Any],
    production_ready: bool = False,
    hero_ready: bool = False,
    world_class_ready: bool = False,
    extra_fields: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    metadata = _read_json_dict(metadata_path)
    source_provenance = (
        upload_record.get("source_provenance")
        if isinstance(upload_record.get("source_provenance"), dict)
        else _build_source_provenance(upload_record)
    )
    world_source = _build_world_source(
        lane=lane,
        ingest_channel=ingest_channel,
        input_strategy=input_strategy,
        primary_source=source_provenance,
    )
    existing_delivery = metadata.get("delivery") if isinstance(metadata.get("delivery"), dict) else {}
    delivery = {
        **delivery_defaults,
        **existing_delivery,
        "blocking_issues": _list_of_text(
            existing_delivery.get("blocking_issues", delivery_defaults.get("blocking_issues", [])),
            limit=8,
        ),
        "next_actions": _list_of_text(
            existing_delivery.get("next_actions", delivery_defaults.get("next_actions", [])),
            limit=8,
        ),
    }
    lane_metadata = _build_lane_metadata(
        lane=lane,
        lane_truth=lane_truth,
        available=True,
        readiness=str(delivery.get("readiness") or "draft").strip() or "draft",
        summary=str(delivery.get("summary") or metadata.get("truth_label") or f"{lane.title()} output ready.").strip()
        or f"{lane.title()} output ready.",
        blockers=list(delivery.get("blocking_issues") or []),
        production_ready=production_ready,
        hero_ready=hero_ready,
        world_class_ready=world_class_ready,
    )
    handoff_manifest = _build_handoff_manifest(
        lane=lane,
        world_source=world_source,
        ready=production_ready,
        summary=(
            "Payload carries explicit world-source and lane metadata for future downstream handoff manifests."
            if not production_ready
            else "Payload passed its current delivery gate and is ready for downstream handoff packaging."
        ),
        blockers=list(delivery.get("blocking_issues") or []),
    )

    metadata.update(
        {
            "lane": lane,
            "lane_truth": lane_truth,
            "input_image_id": upload_record["image_id"],
            "input_filename": upload_record.get("original_filename") or upload_record["filename"],
            "input_source_type": upload_record["source_type"],
            "source_provenance": source_provenance,
            "world_source": world_source,
            "lane_metadata": lane_metadata,
            "delivery": delivery,
            "handoff_manifest": handoff_manifest,
            **(extra_fields or {}),
        }
    )
    _write_json_dict(metadata_path, metadata)
    return metadata


def _resolve_storage_path(storage_path: str) -> Path:
    relative = Path(storage_path)
    if relative.is_absolute() or not relative.parts:
        raise HTTPException(status_code=404, detail="Stored file not found")

    root_name = relative.parts[0]
    safe_roots = {
        "uploads": UPLOADS_DIR.parent.resolve(),
        "scenes": SCENES_DIR.resolve(),
        "assets": ASSETS_DIR.resolve(),
    }
    root = safe_roots.get(root_name)
    if root is None:
        raise HTTPException(status_code=404, detail="Stored file not found")

    resolved = (PROJECT_ROOT / relative).resolve()
    if root != resolved and root not in resolved.parents:
        raise HTTPException(status_code=404, detail="Stored file not found")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Stored file not found")
    return resolved


def _ensure_environment_support_files(output_dir: Path) -> None:
    metadata_path = output_dir / "metadata.json"
    if not metadata_path.exists():
        return

    try:
        metadata = json.loads(metadata_path.read_text())
    except Exception:
        return

    support_payloads = {
        "capture-scorecard.json": metadata.get("capture", {}),
        "holdout-report.json": metadata.get("holdout", {}),
        "benchmark-report.json": metadata.get("comparison", metadata.get("benchmark_status", {})),
    }
    for filename, payload in support_payloads.items():
        path = output_dir / filename
        if path.exists():
            continue
        path.write_text(json.dumps(payload, indent=2))


def _resolve_uploaded_image_path(image_id: str) -> Path:
    matches = sorted(UPLOADS_DIR.glob(f"{image_id}.*"))
    if not matches:
        raise HTTPException(status_code=400, detail=f"Image {image_id} not found in uploads")
    return matches[0]


def _load_upload_record(image_id: str) -> Dict[str, Any]:
    image_path = _resolve_uploaded_image_path(image_id)
    record = _normalize_upload_record(upload_records.get(image_id), image_id=image_id, image_path=image_path)
    upload_records[image_id] = record
    return record


def _require_generated_files(output_dir: Path, expected_files: Dict[str, str], *, label: str) -> Dict[str, str]:
    files: Dict[str, str] = {}
    missing: List[str] = []
    for key, filename in expected_files.items():
        path = output_dir / filename
        if not path.exists() or not path.is_file():
            missing.append(filename)
            continue
        files[key] = str(path)

    if missing:
        missing_list = ", ".join(missing)
        raise RuntimeError(f"{label} completed without required artifacts: {missing_list}")
    return files


def _scene_urls(scene_id: str) -> Dict[str, str]:
    base = f"/storage/scenes/{scene_id}/environment"
    return {
        "viewer": base,
        "splats": f"{base}/splats.ply",
        "cameras": f"{base}/cameras.json",
        "metadata": f"{base}/metadata.json",
        "preview_projection": f"{base}/preview-projection.png",
        "holdout_report": f"{base}/holdout-report.json",
        "capture_scorecard": f"{base}/capture-scorecard.json",
        "benchmark_report": f"{base}/benchmark-report.json",
    }


def _asset_urls(asset_id: str) -> Dict[str, str]:
    base = f"/storage/assets/{asset_id}"
    return {
        "mesh": f"{base}/mesh.glb",
        "texture": f"{base}/texture.png",
        "preview": f"{base}/preview.png",
        "metadata": f"{base}/metadata.json",
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


def _capture_guidance() -> List[str]:
    return [
        "Walk an arc around the subject or environment instead of shooting from one locked view.",
        "Keep 60-80% overlap between neighboring frames.",
        "Avoid motion blur, mirrors, and fast-moving people crossing the scene.",
        "Collect a full orbit or forward path with some height variation before reconstructing.",
    ]


class SceneSaveRequest(BaseModel):
    scene_id: str
    scene_graph: Dict[str, Any]
    source: str = "manual"


class GenerateRequest(BaseModel):
    image_id: str


class GenerateImageRequest(BaseModel):
    provider: str
    model: str | None = None
    prompt: str
    negative_prompt: str | None = None
    aspect_ratio: str | None = None
    count: int = 1
    seed: int | None = None
    reference_image_ids: List[str] = Field(default_factory=list)


class VersionCommentRequest(BaseModel):
    author: str = "Reviewer"
    body: str
    anchor: str = "scene"


class SceneReviewRequest(BaseModel):
    metadata: Dict[str, str]
    approval_state: str
    updated_by: str = "Reviewer"
    note: str = ""


class CaptureSessionCreateRequest(BaseModel):
    target_images: int = CAPTURE_RECOMMENDED_IMAGES


class CaptureSessionFrameRequest(BaseModel):
    image_ids: List[str] = Field(default_factory=list)


def _build_capture_frame_record(image_id: str) -> Dict[str, Any]:
    upload_record = _load_upload_record(image_id)
    image_path = Path(upload_record["filepath"])
    return {
        "image_id": image_id,
        "filename": image_path.name,
        "url": f"/storage/uploads/images/{image_path.name}",
        "added_at": _utc_now(),
        "source_type": upload_record.get("source_type"),
        "provider": upload_record.get("provider"),
        "model": upload_record.get("model"),
        "prompt": upload_record.get("prompt"),
        "generation_job_id": upload_record.get("generation_job_id"),
        "source_provenance": upload_record.get("source_provenance"),
    }


def _hash_uploaded_image(image_id: str) -> str:
    image_path = _resolve_uploaded_image_path(image_id)
    return hashlib.sha1(image_path.read_bytes()).hexdigest()


def _store_upload_bytes(
    contents: bytes,
    original_filename: str,
    *,
    source_type: str = "upload",
    provider: str | None = None,
    model: str | None = None,
    prompt: str | None = None,
    generation_job_id: str | None = None,
) -> Dict[str, Any]:
    image_id = uuid.uuid4().hex
    ext = Path(original_filename).suffix.lower() or ".png"
    filename = f"{image_id}{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(contents)
    record = _normalize_upload_record(
        {
            "image_id": image_id,
            "filename": filename,
            "original_filename": original_filename,
            "filepath": str(filepath),
            "url": f"/storage/uploads/images/{filename}",
            "created_at": _utc_now(),
            "source_type": source_type,
            "provider": provider,
            "model": model,
            "prompt": prompt,
            "generation_job_id": generation_job_id,
        },
        image_id=image_id,
        image_path=filepath,
    )
    upload_records[image_id] = record
    return _build_upload_response(record)


def _load_reference_images(image_ids: List[str]) -> List[Any]:
    references: List[Any] = []
    for image_id in image_ids:
        upload_record = _load_upload_record(image_id)
        image_path = Path(upload_record["filepath"])
        references.append(
            normalize_reference_image(
                upload_record.get("original_filename") or image_path.name,
                None,
                image_path.read_bytes(),
            )
        )
    return references


def _finalize_generated_image_job(job_payload: Dict[str, Any], provider_job: Any) -> Dict[str, Any]:
    warnings = _normalize_warnings(job_payload.get("warnings", []), getattr(provider_job, "warnings", []))
    images: List[Dict[str, Any]] = []

    for artifact in getattr(provider_job, "outputs", []) or []:
        try:
            content_bytes, _, original_filename = materialize_artifact(artifact)
            images.append(
                _store_upload_bytes(
                    content_bytes,
                    original_filename or "generated.png",
                    source_type="generated",
                    provider=str(job_payload.get("provider") or "").strip() or None,
                    model=str(job_payload.get("model") or "").strip() or None,
                    prompt=str(job_payload.get("prompt") or "").strip() or None,
                    generation_job_id=str(job_payload.get("id") or "").strip() or None,
                )
            )
        except Exception as exc:  # pragma: no cover - defensive
            warnings = _normalize_warnings(warnings, str(exc))

    if images:
        if getattr(provider_job, "error", None):
            warnings = _normalize_warnings(warnings, str(provider_job.error))
        job_payload["status"] = "completed"
        job_payload["error"] = None
        job_payload["result"] = {"images": images}
    else:
        job_payload["status"] = "failed"
        job_payload["error"] = getattr(provider_job, "error", None) or (
            warnings[0] if warnings else "Image generation returned no usable outputs."
        )
        job_payload["result"] = {"images": []}

    job_payload["warnings"] = warnings
    job_payload["updated_at"] = _utc_now()
    jobs[job_payload["id"]] = job_payload
    return job_payload


def _refresh_generated_image_job(job_payload: Dict[str, Any]) -> Dict[str, Any]:
    if job_payload.get("type") != "generated_image" or job_payload.get("status") != "processing":
        return job_payload

    provider_job_id = str(job_payload.get("provider_job_id") or "").strip()
    if not provider_job_id:
        return job_payload

    try:
        adapter = get_provider_registry().get_image_adapter(str(job_payload.get("provider") or ""))
        provider_job = adapter.poll_job(provider_job_id)
    except Exception as exc:
        job_payload["status"] = "failed"
        job_payload["error"] = str(exc)
        job_payload["updated_at"] = _utc_now()
        jobs[job_payload["id"]] = job_payload
        return job_payload

    job_payload["provider_job_id"] = provider_job.provider_job_id or provider_job_id
    if provider_job.status == "processing":
        job_payload["warnings"] = _normalize_warnings(job_payload.get("warnings", []), provider_job.warnings)
        job_payload["updated_at"] = _utc_now()
        jobs[job_payload["id"]] = job_payload
        return job_payload

    if provider_job.status == "failed":
        job_payload["status"] = "failed"
        job_payload["warnings"] = _normalize_warnings(job_payload.get("warnings", []), provider_job.warnings)
        job_payload["error"] = provider_job.error or "Provider generation failed."
        job_payload["updated_at"] = _utc_now()
        jobs[job_payload["id"]] = job_payload
        return job_payload

    return _finalize_generated_image_job(job_payload, provider_job)


def _capture_session_payload(session: Dict[str, Any]) -> Dict[str, Any]:
    frames = session.get("frames", [])
    frame_hashes = [_hash_uploaded_image(frame["image_id"]) for frame in frames]
    unique_hashes = list(dict.fromkeys(frame_hashes))
    frame_count = len(frames)
    unique_frame_count = len(unique_hashes)
    duplicate_frames = max(frame_count - unique_frame_count, 0)
    duplicate_ratio = duplicate_frames / frame_count if frame_count else 0.0

    blockers: List[str] = []
    if frame_count >= CAPTURE_MIN_IMAGES and unique_frame_count < CAPTURE_MIN_IMAGES:
        blockers.append(
            f"Only {unique_frame_count} unique views are available; add more distinct camera positions before reconstruction."
        )
    if duplicate_frames > 0 and frame_count >= CAPTURE_MIN_IMAGES:
        blockers.append("Duplicate or near-identical frames are in the capture set. Replace them with new overlap views.")

    ready = frame_count >= CAPTURE_MIN_IMAGES and unique_frame_count >= CAPTURE_MIN_IMAGES
    status = "ready" if ready else "blocked" if blockers else "collecting"
    recommended_images = _clamp_target_images(session.get("target_images", CAPTURE_RECOMMENDED_IMAGES))
    coverage_percent = _coverage_percent(frame_count, recommended_images)
    frame_sources = [
        frame.get("source_provenance")
        for frame in frames
        if isinstance(frame.get("source_provenance"), dict)
    ]
    capture_world_source = _build_world_source(
        lane="reconstruction",
        ingest_channel="capture_session",
        input_strategy=f"{CAPTURE_MIN_IMAGES}-{CAPTURE_MAX_IMAGES} overlapping photos",
        primary_source={
            "schema_version": SOURCE_PROVENANCE_VERSION,
            "kind": "capture_set",
            "origin": "local_capture_session",
            "ingest_channel": "capture_session",
            "source_type": "capture",
            "session_id": session["session_id"],
            "frame_count": frame_count,
            "upstream_source_kinds": sorted(
                {
                    str(source.get("kind") or "").strip()
                    for source in frame_sources
                    if str(source.get("kind") or "").strip()
                }
            ),
            "future_world_source_kinds": ["external_world_package", "downstream_handoff_manifest"],
        },
        upstream_sources=frame_sources,
        session_id=session["session_id"],
        frame_count=frame_count,
    )
    lane_metadata = _build_lane_metadata(
        lane="reconstruction",
        lane_truth="gpu_worker_not_connected",
        available=False,
        readiness="capture_ready_waiting_worker" if ready else "capture_blocked" if blockers else "capture_collecting",
        summary=(
            "Capture set passes local QC, but the dedicated multi-view reconstruction worker is not connected in this backend."
            if ready
            else "Capture quality is still being assembled for a future reconstruction lane."
        ),
        blockers=[] if not ready else ["Dedicated multi-view reconstruction worker is not connected."],
        production_ready=False,
        hero_ready=False,
        world_class_ready=False,
    )
    handoff_manifest = _build_handoff_manifest(
        lane="reconstruction",
        world_source=capture_world_source,
        ready=False,
        summary="Capture session truth is explicit, but downstream handoff remains blocked until the dedicated reconstruction worker exists.",
        blockers=list(lane_metadata.get("blockers") or []),
    )
    next_actions = (
        [
            "Capture set passes local QC, but the dedicated multi-view worker is not connected yet.",
            "Keep collecting stronger overlap for a future reconstruction pass.",
        ]
        if ready
        else ["Collect more overlapping views."]
    )

    payload = {
        "session_id": session["session_id"],
        "lane": "reconstruction",
        "lane_truth": "gpu_worker_not_connected",
        "status": status,
        "created_at": session["created_at"],
        "updated_at": _utc_now(),
        "minimum_images": CAPTURE_MIN_IMAGES,
        "recommended_images": recommended_images,
        "max_images": CAPTURE_MAX_IMAGES,
        "frame_count": frame_count,
        "coverage_percent": coverage_percent,
        "ready_for_reconstruction": ready,
        "reconstruction_available": False,
        "frames": frames,
        "guidance": _capture_guidance(),
        "reconstruction_blockers": blockers,
        "source_provenance": capture_world_source.get("primary_source"),
        "world_source": capture_world_source,
        "lane_metadata": lane_metadata,
        "handoff_manifest": handoff_manifest,
        "quality_summary": {
            "score": round(max(0.0, 10.0 - duplicate_ratio * 10.0), 1),
            "coverage_score": round(min(10.0, frame_count / max(CAPTURE_MIN_IMAGES, 1) * 10.0), 1),
            "band": "capture_ready" if ready else "capture_blocked" if blockers else "capture_building",
            "readiness": "ready" if ready else "blocked" if blockers else "building",
            "frame_count": frame_count,
            "unique_frame_count": unique_frame_count,
            "duplicate_ratio": round(duplicate_ratio, 4),
            "sharp_frame_count": unique_frame_count,
            "duplicate_frames": duplicate_frames,
            "warnings": blockers,
            "recommended_next_actions": next_actions,
            "reconstruction_gate": {
                "allowed": False,
                "label": "ready" if ready else "blocked" if blockers else "building",
                "capture_contract_met": ready,
                "unique_frame_count": unique_frame_count,
                "minimum_sharp_frames": CAPTURE_MIN_IMAGES,
                "blockers": blockers,
                "available": False,
                "lane_truth": "gpu_worker_not_connected",
                "worker_connected": False,
            },
        },
    }
    session.update(payload)
    return payload


@router.get("/setup/status")
async def setup_status():
    torch_status = _torch_status()
    ml_sharp_available = bool((PROJECT_ROOT / "backend" / "ml-sharp").exists() and torch_status.get("installed"))
    triposr_available = bool((PROJECT_ROOT / "backend" / "TripoSR").exists())
    provider_summary = get_provider_registry().image_provider_summary()
    backend_truth = (
        "This local backend can run ML-Sharp single-image preview and asset generation directly. "
        "Benchmark-grade multi-view reconstruction is still not wired into this server."
        if ml_sharp_available
        else "This local backend is missing the ML-Sharp preview worker. Preview generation will fall back or remain unavailable."
    )
    preview_summary = (
        "Generate a dense single-image Gaussian preview through the native ML-Sharp worker."
        if ml_sharp_available
        else "Generate a single-photo Gaussian preview when the ML-Sharp worker is restored."
    )
    preview_truth = (
        "This output is produced by a single-image Gaussian model running locally. Hidden geometry can still be hallucinated."
        if ml_sharp_available
        else "This output path depends on the ML-Sharp worker and is not currently connected."
    )

    return {
        "status": "ok",
        "python_version": platform.python_version(),
        "backend": {
            "label": "Local Generation Backend",
            "kind": "native-ml-sharp-and-asset" if ml_sharp_available else "local-asset-only",
            "deployment": "local",
            "truth": backend_truth,
            "lane_truth": "local_single_image_lrm_and_asset_only" if ml_sharp_available else "local_asset_only",
        },
        "lane_truth": {
            "preview": "single_image_lrm_preview" if ml_sharp_available else "preview_worker_missing",
            "reconstruction": "gpu_worker_not_connected",
            "asset": "single_image_asset" if triposr_available else "asset_worker_missing",
        },
        "reconstruction_backend": {
            "name": "gpu_worker_missing",
            "kind": "unavailable_in_local_preview_backend",
            "gpu_worker_connected": False,
            "native_gaussian_training": False,
            "world_class_ready": False,
        },
        "benchmark_status": {
            "status": "not_benchmarked",
            "locked_suite": "real_space_world_class_v1",
            "summary": "The local backend is not benchmarked as a real-space reconstruction system.",
        },
        "release_gates": {
            "truthful_preview_lane": ml_sharp_available,
            "gpu_reconstruction_connected": False,
            "native_gaussian_training": False,
            "holdout_metrics": False,
            "market_benchmarking": False,
        },
        "capabilities": {
            "preview": {
                "available": ml_sharp_available,
                "label": "Image-to-Splat Preview" if ml_sharp_available else "Preview Worker Missing",
                "summary": preview_summary,
                "truth": preview_truth,
                "lane_truth": "single_image_lrm_preview" if ml_sharp_available else "preview_worker_missing",
                "input_strategy": "1 photo",
                "min_images": 1,
                "recommended_images": 1,
            },
            "reconstruction": {
                "available": False,
                "label": "Production Reconstruction",
                "summary": "Collect a multi-view capture set for real 3D Gaussian reconstruction.",
                "truth": "This local server can run the single-image ML-Sharp preview worker, but it does not expose a benchmarked multi-view reconstruction lane yet.",
                "lane_truth": "gpu_worker_not_connected",
                "input_strategy": "8-32 overlapping photos or short orbit video",
                "min_images": CAPTURE_MIN_IMAGES,
                "recommended_images": CAPTURE_RECOMMENDED_IMAGES,
            },
            "asset": {
                "available": triposr_available,
                "label": "Single-Image Asset",
                "summary": "Generate a hero prop mesh from one reference image.",
                "truth": "This lane is object-focused generation, not environment reconstruction.",
                "lane_truth": "single_image_asset" if triposr_available else "asset_worker_missing",
                "input_strategy": "1 photo",
                "min_images": 1,
                "recommended_images": 1,
            },
        },
        "capture": {
            "minimum_images": CAPTURE_MIN_IMAGES,
            "recommended_images": CAPTURE_RECOMMENDED_IMAGES,
            "max_images": CAPTURE_MAX_IMAGES,
            "guidance": _capture_guidance(),
        },
        "project_root": str(PROJECT_ROOT),
        "directories": {
            "uploads": UPLOADS_DIR.exists(),
            "assets": ASSETS_DIR.exists(),
            "scenes": SCENES_DIR.exists(),
        },
        "models": {
            "preview_generator": "ml_sharp_local_worker" if ml_sharp_available else None,
            "asset_generator": "triposr_local_worker" if triposr_available else None,
            "ml_sharp": ml_sharp_available,
            "triposr": triposr_available,
        },
        "generator": {
            "environment": "ml_sharp_local_worker" if ml_sharp_available else None,
            "asset": "triposr_local_worker" if triposr_available else None,
        },
        "torch": torch_status,
        "image_to_splat_bridge": {
            "id": "ml_sharp_local_worker",
            "label": "ML-Sharp Local Worker",
            "available": ml_sharp_available,
            "connection_status": "configured" if ml_sharp_available else "unavailable",
            "summary": "Runs single-image Gaussian preview generation directly inside the local backend.",
            "availability_reason": None if ml_sharp_available else "ML-Sharp is not installed or torch is unavailable in the local backend.",
            "required_env": [],
            "optional_env": ["GAUSET_IMAGE_TO_SPLAT_BACKEND_URL", "GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN"],
        },
        "provider_generation": provider_summary,
    }


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/providers")
async def list_generation_providers():
    registry = get_provider_registry()
    return {
        "enabled": registry.feature_enabled,
        "summary": registry.image_provider_summary(),
        "providers": [entry.to_payload() for entry in registry.list_catalog()],
    }


@router.post("/upload")
async def upload_image(http_request: Request, file: UploadFile = File(...)):
    _require_worker_auth(http_request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename in upload")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return _store_upload_bytes(contents, file.filename, source_type="upload")


@router.post("/generate/image")
async def generate_image_api(payload: GenerateImageRequest, http_request: Request):
    _require_worker_auth(http_request)
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    registry = get_provider_registry()
    try:
        adapter = registry.get_image_adapter(payload.provider)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    requested_model = payload.model.strip() if isinstance(payload.model, str) else ""
    resolved_model = requested_model or (adapter.default_model_id() or "")
    selected_model = adapter.get_model_info(resolved_model) if resolved_model else None
    if requested_model and selected_model is None and adapter.models:
        available_model_ids = ", ".join(model.id for model in adapter.models)
        raise HTTPException(
            status_code=400,
            detail=f"Unknown {adapter.label} model '{requested_model}'. Available models: {available_model_ids}",
        )
    if not resolved_model:
        raise HTTPException(status_code=400, detail=f"{adapter.label} does not have a default model configured.")

    model_supports_references = (
        selected_model.supports_references if selected_model is not None else adapter.supports_references
    )
    if payload.reference_image_ids and not model_supports_references:
        raise HTTPException(status_code=400, detail=f"{adapter.label} does not support reference images in this lane.")

    negative_prompt = payload.negative_prompt.strip() if payload.negative_prompt else None
    if negative_prompt and selected_model is not None and not selected_model.supports_negative_prompt:
        raise HTTPException(
            status_code=400,
            detail=f"{selected_model.label} does not support negative prompts in this lane.",
        )

    aspect_ratio = payload.aspect_ratio.strip() if payload.aspect_ratio else None
    if aspect_ratio and adapter.supported_aspect_ratios and aspect_ratio not in adapter.supported_aspect_ratios:
        raise HTTPException(
            status_code=400,
            detail=f"{adapter.label} does not support aspect ratio {aspect_ratio}.",
        )

    if payload.reference_image_ids and adapter.max_reference_images and len(payload.reference_image_ids) > adapter.max_reference_images:
        raise HTTPException(
            status_code=400,
            detail=f"{adapter.label} accepts up to {adapter.max_reference_images} reference images.",
        )

    requested_count = max(1, int(payload.count or 1))
    count = max(1, min(requested_count, max(1, int(adapter.max_outputs or 1))))
    request_warnings: List[str] = []
    if selected_model is not None and not selected_model.supports_multi_output:
        if requested_count > 1:
            request_warnings.append(f"{selected_model.label} only supports 1 output in this lane.")
        count = 1
    elif not adapter.supports_multi_output:
        if requested_count > 1:
            request_warnings.append(f"{adapter.label} only supports 1 output in this lane.")
        count = 1
    elif count < requested_count:
        suffix = "s" if count != 1 else ""
        request_warnings.append(f"{adapter.label} capped this request at {count} output{suffix}.")

    shared_request = ImageGenerationRequest(
        provider=payload.provider,
        model=resolved_model,
        prompt=prompt,
        negative_prompt=negative_prompt,
        aspect_ratio=aspect_ratio,
        count=count,
        seed=payload.seed,
        reference_images=_load_reference_images(payload.reference_image_ids),
    )

    job_id = f"genimg_{uuid.uuid4().hex[:8]}"
    job_payload = {
        "id": job_id,
        "type": "generated_image",
        "status": "processing",
        **_job_context_from_request(http_request),
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
        "provider": payload.provider,
        "model": shared_request.model,
        "provider_job_id": None,
        "source_type": "generated",
        "warnings": _normalize_warnings(request_warnings),
        "prompt": prompt,
        "input": {
            "negative_prompt": shared_request.negative_prompt,
            "aspect_ratio": shared_request.aspect_ratio,
            "count": shared_request.count,
            "seed": shared_request.seed,
            "reference_image_ids": payload.reference_image_ids,
        },
    }
    jobs[job_id] = job_payload

    try:
        provider_job = adapter.submit_image_job(shared_request)
        job_payload["provider_job_id"] = provider_job.provider_job_id
        job_payload["warnings"] = _normalize_warnings(job_payload.get("warnings", []), provider_job.warnings)
        if provider_job.status == "completed":
            _finalize_generated_image_job(job_payload, provider_job)
        elif provider_job.status == "failed":
            job_payload["status"] = "failed"
            job_payload["error"] = provider_job.error or "Provider generation failed."
            job_payload["updated_at"] = _utc_now()
            jobs[job_id] = job_payload
        else:
            job_payload["updated_at"] = _utc_now()
            jobs[job_id] = job_payload
    except Exception as exc:  # pragma: no cover - provider dependent
        job_payload["status"] = "failed"
        job_payload["error"] = str(exc)
        job_payload["updated_at"] = _utc_now()
        jobs[job_id] = job_payload

    return {
        "job_id": job_id,
        "status": "processing",
        "provider": payload.provider,
        "model": shared_request.model,
    }


@router.post("/capture/session")
async def create_capture_session(request: CaptureSessionCreateRequest):
    session_id = f"capture_{uuid.uuid4().hex[:8]}"
    session = {
        "session_id": session_id,
        "created_at": _utc_now(),
        "frames": [],
        "target_images": _clamp_target_images(request.target_images),
    }
    capture_sessions[session_id] = session
    return _capture_session_payload(session)


@router.get("/capture/session/{session_id}")
async def get_capture_session(session_id: str):
    session = capture_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Capture session not found")
    return _capture_session_payload(session)


@router.post("/capture/session/{session_id}/frames")
async def add_capture_session_frames(session_id: str, request: CaptureSessionFrameRequest):
    session = capture_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Capture session not found")
    if not request.image_ids:
        raise HTTPException(status_code=400, detail="At least one image id is required")

    existing_frame_ids = {frame["image_id"] for frame in session.get("frames", [])}
    for image_id in request.image_ids:
        if image_id in existing_frame_ids:
            continue
        if len(session["frames"]) >= CAPTURE_MAX_IMAGES:
            break
        session["frames"].append(_build_capture_frame_record(image_id))
        existing_frame_ids.add(image_id)

    return _capture_session_payload(session)


@router.post("/reconstruct/session/{session_id}")
async def start_reconstruction(session_id: str, http_request: Request):
    _require_worker_auth(http_request)
    session = capture_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Capture session not found")

    payload = _capture_session_payload(session)
    if not payload.get("ready_for_reconstruction"):
        raise HTTPException(
            status_code=422,
            detail=f"Capture set needs at least {payload['minimum_images']} overlapping photos before reconstruction can start.",
        )

    raise HTTPException(
        status_code=501,
        detail="This backend can collect capture sets, but a dedicated multi-view Gaussian reconstruction worker is not connected yet.",
    )


@router.post("/generate/environment")
async def generate_environment_api(payload: GenerateRequest, background_tasks: BackgroundTasks, http_request: Request):
    _require_worker_auth(http_request)
    upload_record = _load_upload_record(payload.image_id)
    image_path = Path(upload_record["filepath"])
    source_provenance = (
        upload_record.get("source_provenance")
        if isinstance(upload_record.get("source_provenance"), dict)
        else _build_source_provenance(upload_record)
    )
    pending_world_source = _build_world_source(
        lane="preview",
        ingest_channel="generate_environment",
        input_strategy="1 photo",
        primary_source=source_provenance,
    )

    scene_id = f"scene_{str(uuid.uuid4())[:8]}"
    output_dir = SCENES_DIR / scene_id / "environment"
    output_dir.mkdir(parents=True, exist_ok=True)

    jobs[scene_id] = {
        "id": scene_id,
        "type": "environment",
        "status": "processing",
        "image_id": payload.image_id,
        "source_type": upload_record["source_type"],
        "source_provenance": source_provenance,
        "world_source": pending_world_source,
        "lane_truth": "single_image_lrm_preview",
        "lane_metadata": _build_lane_metadata(
            lane="preview",
            lane_truth="single_image_lrm_preview",
            available=True,
            readiness="processing",
            summary="Single-image preview job is processing.",
        ),
        "handoff_manifest": _build_handoff_manifest(
            lane="preview",
            world_source=pending_world_source,
            ready=False,
            summary="Single-image preview job is still processing, so no downstream handoff can be claimed yet.",
            blockers=["Job still processing."],
        ),
        **_job_context_from_request(http_request),
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
    }

    def task() -> None:
        try:
            generated_dir = Path(generate_environment(str(image_path), str(output_dir)))
            _ensure_environment_support_files(generated_dir)
            metadata = _merge_generation_metadata(
                generated_dir / "metadata.json",
                lane="preview",
                lane_truth="single_image_lrm_preview",
                upload_record=upload_record,
                ingest_channel="generate_environment",
                input_strategy="1 photo",
                delivery_defaults=_preview_delivery_defaults(),
            )
            files = _require_generated_files(
                generated_dir,
                {
                    "splats": "splats.ply",
                    "cameras": "cameras.json",
                    "metadata": "metadata.json",
                    "preview_projection": "preview-projection.png",
                    "holdout_report": "holdout-report.json",
                    "capture_scorecard": "capture-scorecard.json",
                    "benchmark_report": "benchmark-report.json",
                },
                label="Environment generation",
            )
            lane_metadata = (
                metadata.get("lane_metadata")
                if isinstance(metadata.get("lane_metadata"), dict)
                else _build_lane_metadata(
                    lane="preview",
                    lane_truth="single_image_lrm_preview",
                    available=True,
                    readiness="preview_only",
                    summary="Single-image preview ready.",
                )
            )
            handoff_manifest = (
                metadata.get("handoff_manifest")
                if isinstance(metadata.get("handoff_manifest"), dict)
                else _build_handoff_manifest(
                    lane="preview",
                    world_source=pending_world_source,
                    ready=False,
                    summary="Preview metadata was normalized, but downstream handoff remains blocked.",
                )
            )
            jobs[scene_id]["status"] = "completed"
            jobs[scene_id]["lane_truth"] = str(metadata.get("lane_truth") or "single_image_lrm_preview")
            jobs[scene_id]["lane_metadata"] = lane_metadata
            jobs[scene_id]["handoff_manifest"] = handoff_manifest
            jobs[scene_id]["result"] = {
                "scene_id": scene_id,
                "environment_dir": str(generated_dir),
                "files": files,
                "urls": _scene_urls(scene_id),
                "metadata": metadata,
                "source_type": upload_record["source_type"],
                "source_provenance": source_provenance,
                "world_source": metadata.get("world_source") or pending_world_source,
                "lane_truth": str(metadata.get("lane_truth") or "single_image_lrm_preview"),
                "lane_metadata": lane_metadata,
                "handoff_manifest": handoff_manifest,
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
        "source_type": upload_record["source_type"],
        "source_provenance": source_provenance,
        "world_source": pending_world_source,
    }


@router.post("/generate/asset")
async def generate_asset_api(payload: GenerateRequest, background_tasks: BackgroundTasks, http_request: Request):
    _require_worker_auth(http_request)
    upload_record = _load_upload_record(payload.image_id)
    image_path = Path(upload_record["filepath"])
    source_provenance = (
        upload_record.get("source_provenance")
        if isinstance(upload_record.get("source_provenance"), dict)
        else _build_source_provenance(upload_record)
    )
    pending_world_source = _build_world_source(
        lane="asset",
        ingest_channel="generate_asset",
        input_strategy="1 photo",
        primary_source=source_provenance,
    )

    asset_id = f"asset_{str(uuid.uuid4())[:8]}"
    output_dir = ASSETS_DIR / asset_id
    output_dir.mkdir(parents=True, exist_ok=True)

    jobs[asset_id] = {
        "id": asset_id,
        "type": "asset",
        "status": "processing",
        "image_id": payload.image_id,
        "source_type": upload_record["source_type"],
        "source_provenance": source_provenance,
        "world_source": pending_world_source,
        "lane_truth": "single_image_asset",
        "lane_metadata": _build_lane_metadata(
            lane="asset",
            lane_truth="single_image_asset",
            available=True,
            readiness="processing",
            summary="Single-image asset job is processing.",
        ),
        "handoff_manifest": _build_handoff_manifest(
            lane="asset",
            world_source=pending_world_source,
            ready=False,
            summary="Single-image asset job is still processing, so downstream handoff remains blocked.",
            blockers=["Job still processing."],
        ),
        **_job_context_from_request(http_request),
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
    }

    def task() -> None:
        try:
            generated_dir = Path(generate_asset(str(image_path), str(output_dir)))
            metadata = _merge_generation_metadata(
                generated_dir / "metadata.json",
                lane="asset",
                lane_truth="single_image_asset",
                upload_record=upload_record,
                ingest_channel="generate_asset",
                input_strategy="1 photo",
                delivery_defaults=_asset_delivery_defaults(),
                extra_fields={
                    "truth_label": "Single-Image Asset",
                    "quality_tier": "single_image_asset",
                    "faithfulness": "object-focused synthesis",
                    "execution_mode": "real",
                    "files": {
                        "mesh": "mesh.glb",
                        "texture": "texture.png",
                        "preview": "preview.png",
                    },
                },
            )
            files = _require_generated_files(
                generated_dir,
                {
                    "mesh": "mesh.glb",
                    "texture": "texture.png",
                    "preview": "preview.png",
                    "metadata": "metadata.json",
                },
                label="Asset generation",
            )
            lane_metadata = (
                metadata.get("lane_metadata")
                if isinstance(metadata.get("lane_metadata"), dict)
                else _build_lane_metadata(
                    lane="asset",
                    lane_truth="single_image_asset",
                    available=True,
                    readiness="editorial_object",
                    summary="Single-image asset ready.",
                )
            )
            handoff_manifest = (
                metadata.get("handoff_manifest")
                if isinstance(metadata.get("handoff_manifest"), dict)
                else _build_handoff_manifest(
                    lane="asset",
                    world_source=pending_world_source,
                    ready=False,
                    summary="Asset metadata was normalized, but downstream handoff remains blocked.",
                )
            )
            jobs[asset_id]["status"] = "completed"
            jobs[asset_id]["lane_truth"] = str(metadata.get("lane_truth") or "single_image_asset")
            jobs[asset_id]["lane_metadata"] = lane_metadata
            jobs[asset_id]["handoff_manifest"] = handoff_manifest
            jobs[asset_id]["result"] = {
                "asset_id": asset_id,
                "asset_dir": str(generated_dir),
                "files": files,
                "urls": _asset_urls(asset_id),
                "metadata": metadata,
                "source_type": upload_record["source_type"],
                "source_provenance": source_provenance,
                "world_source": metadata.get("world_source") or pending_world_source,
                "lane_truth": str(metadata.get("lane_truth") or "single_image_asset"),
                "lane_metadata": lane_metadata,
                "handoff_manifest": handoff_manifest,
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
        "source_type": upload_record["source_type"],
        "source_provenance": source_provenance,
        "world_source": pending_world_source,
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
async def get_job_status(job_id: str, http_request: Request):
    _require_worker_auth(http_request)
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = jobs[job_id]
    if isinstance(payload, dict) and payload.get("status") == "processing" and payload.get("type") == "generated_image":
        payload = _refresh_generated_image_job(payload)
    return payload


@router.api_route("/storage/{storage_path:path}", methods=["GET", "HEAD"])
async def storage_proxy(storage_path: str, http_request: Request):
    _require_worker_auth(http_request)
    file_path = _resolve_storage_path(storage_path)
    return FileResponse(file_path, media_type=_guess_media_type(storage_path), filename=file_path.name)
