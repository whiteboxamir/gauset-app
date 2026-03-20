from __future__ import annotations

import hashlib
import hmac
import io
import json
import math
import mimetypes
import os
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import trimesh
from PIL import Image, ImageOps
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SHARED_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_SHARED_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_SHARED_ROOT))

from config_env import load_local_env_files
from providers import EnvironmentGenerationRequest, get_environment_bridge_registry, materialize_environment_artifact
from providers import ImageGenerationRequest as ProviderImageRequest
from providers import ProviderError, get_provider_registry, materialize_artifact, normalize_reference_image

try:
    import vercel_blob
except ImportError:  # pragma: no cover - only needed in deployed blob mode
    vercel_blob = None

load_local_env_files()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


SOURCE_PROVENANCE_VERSION = "gauset.source_provenance.v1"
WORLD_SOURCE_VERSION = "gauset.world_source.v1"
LANE_METADATA_VERSION = "gauset.lane_truth.v1"
HANDOFF_MANIFEST_VERSION = "gauset.handoff_manifest.v1"
HANDOFF_TARGETS = ["scene_document_v2", "external_world_package", "unreal_handoff_manifest"]
WORLD_INGEST_RECORD_VERSION = "world-ingest/v1"
SCENE_DOCUMENT_GRAPH_MISMATCH_CODE = "SCENE_DOCUMENT_GRAPH_MISMATCH"
BROWSER_UPLOAD_GRANT_VERSION = "gauset-browser-upload-v2"
browser_upload_grant_nonces: Dict[str, int] = {}


def _response_field(payload: Any, key: str) -> Optional[str]:
    if isinstance(payload, dict):
        value = payload.get(key)
    else:
        value = getattr(payload, key, None)
    return value if isinstance(value, str) else None


def _source_kind_for_type(source_type: str) -> str:
    return "provider_generated_still" if source_type == "generated" else "upload"


def _normalize_ingest_source_kind(source_kind: str) -> str:
    normalized = str(source_kind or "").strip() or "upload"
    return "upload" if normalized == "uploaded_still" else normalized


def _source_origin_for_type(source_type: str) -> str:
    return "public_provider_generation" if source_type == "generated" else "public_upload"


def _source_ingest_channel_for_type(source_type: str) -> str:
    return "generate_image" if source_type == "generated" else "upload"


def _text_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _list_of_text(values: Any, *, limit: int = 6) -> List[str]:
    if not isinstance(values, (list, tuple, set)):
        values = [values]
    normalized: List[str] = []
    seen: set[str] = set()
    for value in values:
        text = _text_or_none(value)
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
        if len(normalized) >= limit:
            break
    return normalized


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
        "original_filename": _text_or_none(record.get("original_filename")) or str(record.get("filename") or "").strip(),
        "provider": _text_or_none(record.get("provider")),
        "model": _text_or_none(record.get("model")),
        "prompt": _text_or_none(record.get("prompt")),
        "generation_job_id": _text_or_none(record.get("generation_job_id")),
        "future_world_source_kinds": ["capture_set", "external_world_package", "downstream_handoff_manifest"],
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
    kind = str(primary_source.get("kind") or "upload").strip() or "upload"
    if kind == "uploaded_still":
        kind = "upload"
    return {
        "schema_version": WORLD_SOURCE_VERSION,
        "kind": kind,
        "origin": str(primary_source.get("origin") or "local_backend_ingest").strip() or "local_backend_ingest",
        "ingest_channel": ingest_channel,
        "lane": lane,
        "input_strategy": input_strategy,
        "primary_source": primary_source,
        "upstream_sources": sources,
        "upstream_image_ids": [str(source.get("image_id") or "").strip() for source in sources if str(source.get("image_id") or "").strip()],
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
        "lane_truth": lane_truth,
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


def _build_ingest_record(
    *,
    ingest_id: str,
    source_kind: str,
    source_label: str,
    vendor: str | None,
    source_uri: str | None,
    origin: str | None,
    ingest_channel: str | None,
    media_type: str | None,
    scene_id: str | None,
    version_id: str | None = None,
    lane: str | None = None,
    truth_label: str | None = None,
    lane_truth: str | None = None,
    blockers: List[str] | None = None,
    production_readiness: str = "blocked",
    files: Dict[str, Any] | None = None,
    entrypoints: Dict[str, Any] | None = None,
    save_ready: bool = False,
    review_ready: bool = False,
    share_ready: bool = False,
) -> Dict[str, Any]:
    normalized_files = {
        key: str(value).strip()
        for key, value in (files or {}).items()
        if str(key).strip() and str(value).strip()
    }
    normalized_entrypoints = {
        key: str(value).strip()
        for key, value in (entrypoints or {}).items()
        if str(key).strip() and str(value).strip()
    }
    return {
        "contract": WORLD_INGEST_RECORD_VERSION,
        "ingest_id": ingest_id,
        "status": "accepted",
        "source": {
            "kind": source_kind,
            "label": source_label,
            "vendor": vendor,
            "captured_at": _utc_now(),
            "source_uri": source_uri,
            "origin": origin,
            "ingest_channel": ingest_channel,
        },
        "package": {
            "media_type": media_type,
            "checksum_sha256": None,
            "entrypoints": normalized_entrypoints,
            "files": normalized_files,
        },
        "scene_document": None,
        "compatibility_scene_graph": None,
        "workspace_binding": {
            "project_id": None,
            "scene_id": scene_id,
        },
        "versioning": {
            "version_id": version_id,
            "version_locked": bool(version_id),
        },
        "workflow": {
            "workspace_path": normalized_entrypoints.get("workspace"),
            "review_path": normalized_entrypoints.get("review"),
            "share_path": normalized_entrypoints.get("share"),
            "save_ready": save_ready,
            "review_ready": review_ready,
            "share_ready": share_ready,
        },
        "truth": {
            "lane": lane,
            "truth_label": truth_label,
            "lane_truth": lane_truth,
            "production_readiness": production_readiness,
            "blockers": _list_of_text(blockers or [], limit=8),
        },
    }


def _upload_lane_metadata() -> Dict[str, Any]:
    return _build_lane_metadata(
        lane="upload",
        lane_truth="single_image_upload",
        available=True,
        readiness="source_only",
        summary=(
            "Source image uploaded. It can seed preview or asset generation, but it is not a downstream-ready "
            "world handoff."
        ),
        blockers=["Single uploaded image is only a source input, not a packaged downstream handoff."],
    )


def _upload_handoff_manifest(world_source: Dict[str, Any]) -> Dict[str, Any]:
    return _build_handoff_manifest(
        lane="upload",
        world_source=world_source,
        ready=False,
        summary=(
            "Uploaded source image carries provenance only; downstream handoff remains blocked until a real "
            "deliverable is packaged."
        ),
        blockers=["Uploaded source image is not a downstream-ready world handoff."],
    )


def _preview_lane_metadata() -> Dict[str, Any]:
    return _build_lane_metadata(
        lane="preview",
        lane_truth="single_image_lrm_preview",
        available=True,
        readiness="preview_only",
        summary=(
            "Single-image preview generation completed. Output is suitable for look review, not production-ready "
            "downstream handoff."
        ),
        blockers=["Single-image preview remains an approximate single-photo result, not a production-ready handoff."],
    )


def _preview_handoff_manifest(world_source: Dict[str, Any]) -> Dict[str, Any]:
    return _build_handoff_manifest(
        lane="preview",
        world_source=world_source,
        ready=False,
        summary="Preview metadata is explicit, but downstream handoff remains blocked for this single-image lane.",
        blockers=["Single-image preview does not satisfy production-ready downstream handoff gates."],
    )


def _asset_lane_metadata() -> Dict[str, Any]:
    return _build_lane_metadata(
        lane="asset",
        lane_truth="single_image_asset",
        available=True,
        readiness="editorial_object",
        summary=(
            "Single-image asset generation completed. Output is suitable for editor blocking and look review, "
            "not production-ready downstream handoff."
        ),
        blockers=["Single-image asset extraction is not benchmarked for production-ready downstream delivery."],
    )


def _asset_handoff_manifest(world_source: Dict[str, Any]) -> Dict[str, Any]:
    return _build_handoff_manifest(
        lane="asset",
        world_source=world_source,
        ready=False,
        summary="Asset metadata is explicit, but downstream handoff remains blocked for this single-image asset lane.",
        blockers=["Single-image asset does not satisfy production-ready downstream handoff gates."],
    )


class StorageBackend:
    def write_bytes(self, path: str, data: bytes) -> None:
        raise NotImplementedError

    def read_bytes(self, path: str) -> bytes:
        raise NotImplementedError

    def exists(self, path: str) -> bool:
        raise NotImplementedError

    def public_url(self, path: str) -> Optional[str]:
        return None

    def mode(self) -> str:
        raise NotImplementedError


class StorageBackendError(RuntimeError):
    def __init__(self, detail: str, *, status_code: int = 503) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _full_path(self, path: str) -> Path:
        full_path = self.root / Path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        return full_path

    def write_bytes(self, path: str, data: bytes) -> None:
        self._full_path(path).write_bytes(data)

    def read_bytes(self, path: str) -> bytes:
        full_path = self.root / Path(path)
        if not full_path.exists():
            raise FileNotFoundError(path)
        return full_path.read_bytes()

    def exists(self, path: str) -> bool:
        return (self.root / Path(path)).exists()

    def mode(self) -> str:
        return "filesystem"


class BlobStorageBackend(StorageBackend):
    def __init__(self) -> None:
        if vercel_blob is None:
            raise RuntimeError("vercel_blob is required when BLOB_READ_WRITE_TOKEN is configured.")

        probe_path = f"system/__store_probe__/{uuid.uuid4().hex}.txt"
        probe = vercel_blob.put(probe_path, b"gauset", verbose=False)
        probe_url = _response_field(probe, "url")
        if not probe_url:
            raise RuntimeError("Could not determine Vercel Blob store URL.")

        parsed = urllib.parse.urlparse(probe_url)
        self.base_url = f"{parsed.scheme}://{parsed.netloc}"

    def _blob_url(self, path: str, *, fresh: bool = False) -> str:
        encoded_path = urllib.parse.quote(path, safe="/")
        suffix = f"?v={uuid.uuid4().hex}" if fresh else ""
        return f"{self.base_url}/{encoded_path}{suffix}"

    def write_bytes(self, path: str, data: bytes) -> None:
        try:
            vercel_blob.put(path, data, {"allowOverwrite": True}, verbose=False)
        except Exception as exc:
            raise StorageBackendError(f"Blob storage write failed: {exc}", status_code=502) from exc

    def read_bytes(self, path: str) -> bytes:
        request = urllib.request.Request(self._blob_url(path, fresh=True), method="GET")
        try:
            with urllib.request.urlopen(request) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError(path) from exc
            raise StorageBackendError(
                f"Blob storage read failed ({exc.code}): {exc.reason or 'request failed'}",
                status_code=502,
            ) from exc
        except Exception as exc:
            raise StorageBackendError(f"Blob storage read failed: {exc}", status_code=502) from exc

    def exists(self, path: str) -> bool:
        try:
            self.read_bytes(path)
            return True
        except FileNotFoundError:
            return False

    def public_url(self, path: str) -> Optional[str]:
        return self._blob_url(path)

    def mode(self) -> str:
        return "blob"


class UnavailableStorageBackend(StorageBackend):
    def __init__(self, mode: str, detail: str) -> None:
        self._mode = mode
        self.detail = detail

    def _raise(self) -> None:
        raise StorageBackendError(self.detail, status_code=503)

    def write_bytes(self, path: str, data: bytes) -> None:
        self._raise()

    def read_bytes(self, path: str) -> bytes:
        self._raise()

    def exists(self, path: str) -> bool:
        self._raise()

    def mode(self) -> str:
        return self._mode


PUBLIC_WRITE_STORAGE_CHECKLIST = [
    "Configure BLOB_READ_WRITE_TOKEN for this public deployment.",
    "Redeploy the public MVP backend so uploads, scenes, and generated assets persist durably.",
    "Verify /api/mvp/setup/status reports storage_mode=blob before re-enabling write lanes.",
]

PUBLIC_WRITE_STORAGE_ERROR_CHECKLIST = [
    "Confirm the blob storage runtime is installed and the configured token is valid for this deployment.",
    "Fix the blob storage initialization failure and redeploy the public MVP backend.",
    "Verify /api/mvp/setup/status reports storage_mode=blob before re-enabling write lanes.",
]


def _storage_backend() -> tuple[StorageBackend, Dict[str, Any]]:
    blob_token = os.getenv("BLOB_READ_WRITE_TOKEN", "").strip()
    if blob_token:
        try:
            backend = BlobStorageBackend()
        except Exception as exc:
            detail = f"Public MVP writes are disabled because configured blob storage is unavailable in this deployment: {exc}"
            return (
                UnavailableStorageBackend("unavailable", detail),
                {
                    "mode": "unavailable",
                    "configured_mode": "blob",
                    "runtime_status": "error",
                    "durable": False,
                    "public_write_safe": False,
                    "summary": (
                        "Blob storage is configured for this public deployment, but initialization failed, "
                        "so write lanes stay safety-disabled until that runtime issue is fixed."
                    ),
                    "availability_reason": detail,
                    "required_env": [],
                    "checklist": PUBLIC_WRITE_STORAGE_ERROR_CHECKLIST,
                    "initialization_error": str(exc),
                },
            )
        return (
            backend,
            {
                "mode": "blob",
                "configured_mode": "blob",
                "runtime_status": "ready",
                "durable": True,
                "public_write_safe": True,
                "summary": "Durable blob storage is configured for public MVP uploads, scenes, and generated assets.",
                "availability_reason": None,
                "required_env": [],
                "checklist": PUBLIC_WRITE_STORAGE_CHECKLIST,
                "initialization_error": None,
            },
        )

    local_root = Path(os.getenv("GAUSET_MVP_STORAGE_ROOT", "/tmp/gauset-mvp-storage")).resolve()
    return (
        LocalStorageBackend(local_root),
        {
            "mode": "filesystem",
            "configured_mode": "filesystem",
            "runtime_status": "ready",
            "durable": False,
            "public_write_safe": False,
            "summary": (
                "Filesystem storage is not durable on the public MVP deployment, so write lanes are safety-disabled "
                "until blob storage is configured."
            ),
            "availability_reason": (
                "Public MVP writes are disabled because this deployment is using filesystem storage. "
                "Configure durable blob storage before enabling uploads, preview generation, asset extraction, "
                "capture sessions, scene saves, reviews, or comments."
            ),
            "required_env": ["BLOB_READ_WRITE_TOKEN"],
            "checklist": PUBLIC_WRITE_STORAGE_CHECKLIST,
            "initialization_error": None,
        },
    )


STORAGE, STORAGE_STATUS = _storage_backend()


def _public_storage_write_safe() -> bool:
    return bool(STORAGE_STATUS["public_write_safe"])


def _public_storage_block_reason() -> str:
    return str(STORAGE_STATUS["availability_reason"] or "Public MVP writes are disabled in this deployment.")


def _public_storage_summary() -> str:
    return str(STORAGE_STATUS["summary"])


def _storage_status_payload() -> Dict[str, Any]:
    return {
        "mode": STORAGE_STATUS["mode"],
        "configured_mode": STORAGE_STATUS["configured_mode"],
        "runtime_status": STORAGE_STATUS["runtime_status"],
        "durable": STORAGE_STATUS["durable"],
        "public_write_safe": STORAGE_STATUS["public_write_safe"],
        "summary": STORAGE_STATUS["summary"],
        "availability_reason": STORAGE_STATUS["availability_reason"],
        "required_env": list(STORAGE_STATUS["required_env"]),
        "checklist": list(STORAGE_STATUS["checklist"]),
        "initialization_error": STORAGE_STATUS["initialization_error"],
    }


def _require_public_write_storage() -> None:
    if _public_storage_write_safe():
        return
    raise HTTPException(status_code=503, detail=_public_storage_block_reason())


def _worker_token() -> str:
    return (
        os.getenv("GAUSET_BACKEND_WORKER_TOKEN", "").strip()
        or os.getenv("GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN", "").strip()
        or os.getenv("GAUSET_WORKER_TOKEN", "").strip()
    )


def _request_has_worker_auth(request: Request) -> bool:
    expected = _worker_token()
    if not expected:
        return True

    authorization = request.headers.get("authorization", "").strip()
    explicit = request.headers.get("x-gauset-worker-token", "").strip()
    bearer = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    provided = explicit or bearer
    return provided == expected


def _require_worker_auth(request: Request) -> None:
    if not _request_has_worker_auth(request):
        raise HTTPException(status_code=401, detail="Unauthorized worker request")


def _browser_upload_grant_secret() -> str:
    return (
        os.getenv("GAUSET_BROWSER_UPLOAD_SECRET", "").strip()
        or os.getenv("GAUSET_BACKEND_WORKER_TOKEN", "").strip()
        or os.getenv("GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN", "").strip()
        or os.getenv("GAUSET_WORKER_TOKEN", "").strip()
    )


def _normalize_upload_audience(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urllib.parse.urlparse(text)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    normalized_path = (parsed.path or "/").rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{normalized_path}"


def _current_request_upload_audience(request: Request) -> str:
    return _normalize_upload_audience(str(request.url))


def _prune_browser_upload_grant_nonces() -> None:
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    stale_nonces = [nonce for nonce, expires_at in browser_upload_grant_nonces.items() if expires_at <= now_ms]
    for nonce in stale_nonces:
        browser_upload_grant_nonces.pop(nonce, None)


def _reserve_browser_upload_grant_nonce(nonce: str, expires_at: int) -> bool:
    _prune_browser_upload_grant_nonces()
    if nonce in browser_upload_grant_nonces:
        return False
    browser_upload_grant_nonces[nonce] = expires_at
    return True


def _browser_upload_grant_message(
    filename: str,
    content_type: str,
    size_bytes: int,
    expires_at: int,
    audience: str,
    nonce: str,
) -> str:
    normalized_content_type = str(content_type or "").strip().lower()
    return "\n".join(
        [
            BROWSER_UPLOAD_GRANT_VERSION,
            str(filename or "").strip(),
            normalized_content_type,
            str(int(size_bytes)),
            str(int(expires_at)),
            str(audience or "").strip(),
            str(nonce or "").strip(),
        ]
    )


def _validate_browser_upload_grant_headers(request: Request, *, filename: str, content_type: str) -> Optional[Dict[str, int]]:
    secret = _browser_upload_grant_secret()
    if not secret:
        return None

    signed_filename = request.headers.get("x-gauset-upload-filename", "").strip()
    signed_content_type = request.headers.get("x-gauset-upload-content-type", "").strip().lower()
    signed_size = request.headers.get("x-gauset-upload-size", "").strip()
    signed_expires = request.headers.get("x-gauset-upload-expires", "").strip()
    signed_audience = request.headers.get("x-gauset-upload-audience", "").strip()
    signed_nonce = request.headers.get("x-gauset-upload-nonce", "").strip()
    provided_signature = request.headers.get("x-gauset-upload-signature", "").strip()
    if not (signed_filename and signed_content_type and signed_size and signed_expires and signed_audience and signed_nonce and provided_signature):
        return None

    if signed_filename != str(filename or "").strip():
        return None
    if signed_content_type != str(content_type or "").strip().lower():
        return None

    try:
        expected_size = int(signed_size)
        expires_at = int(signed_expires)
    except ValueError:
        return None

    request_audience = _current_request_upload_audience(request)
    if not request_audience or signed_audience != request_audience:
        return None
    if expected_size <= 0 or expected_size > DIRECT_UPLOAD_MAX_BYTES:
        return None
    if expires_at < int(datetime.now(timezone.utc).timestamp() * 1000):
        return None
    if len(signed_nonce) < 16 or not all(character.isalnum() or character in "-_" for character in signed_nonce):
        return None

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        _browser_upload_grant_message(
            signed_filename,
            signed_content_type,
            expected_size,
            expires_at,
            signed_audience,
            signed_nonce,
        ).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(provided_signature, expected_signature):
        return None
    if not _reserve_browser_upload_grant_nonce(signed_nonce, expires_at):
        return None

    return {
        "expected_size": expected_size,
        "expires_at": expires_at,
    }


def _job_context_from_request(request: Request) -> Dict[str, Any]:
    return {
        "studio_id": request.headers.get("x-gauset-studio-id", "").strip() or None,
        "user_id": request.headers.get("x-gauset-user-id", "").strip() or None,
    }


def _parse_job_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _normalize_host(value: Optional[str]) -> str:
    normalized = str(value or "").strip()
    if normalized.startswith("http://"):
        normalized = normalized[7:]
    elif normalized.startswith("https://"):
        normalized = normalized[8:]
    return normalized.rstrip("/")


def _shorten_sha(value: Optional[str]) -> str:
    normalized = str(value or "").strip()
    return normalized[:7] if normalized else "no-sha"


def _deployment_fingerprint() -> Dict[str, str]:
    commit_sha = (
        os.getenv("VERCEL_GIT_COMMIT_SHA", "").strip()
        or os.getenv("GIT_COMMIT_SHA", "").strip()
        or os.getenv("NEXT_PUBLIC_GIT_COMMIT_SHA", "").strip()
    )
    commit_ref = (
        os.getenv("VERCEL_GIT_COMMIT_REF", "").strip()
        or os.getenv("GIT_BRANCH", "").strip()
        or os.getenv("NEXT_PUBLIC_GIT_COMMIT_REF", "").strip()
    )
    vercel_env = os.getenv("VERCEL_ENV", "").strip()
    deployment_host = (
        _normalize_host(os.getenv("VERCEL_PROJECT_PRODUCTION_URL"))
        or _normalize_host(os.getenv("VERCEL_URL"))
        or _normalize_host(os.getenv("NEXT_PUBLIC_VERCEL_URL"))
        or _normalize_host(os.getenv("NEXT_PUBLIC_GAUSET_APP_HOST"))
        or "local"
    )
    deployment_id = os.getenv("VERCEL_DEPLOYMENT_ID", "").strip()
    runtime_target = "vercel" if os.getenv("VERCEL") == "1" else "local-production" if os.getenv("NODE_ENV") == "production" else "local-development"
    commit_short = _shorten_sha(commit_sha)
    build_label = " · ".join(part for part in [deployment_host, vercel_env or runtime_target, commit_short] if part)
    return {
        "build_label": build_label,
        "commit_ref": commit_ref,
        "commit_sha": commit_sha,
        "commit_short": commit_short,
        "deployment_host": deployment_host,
        "deployment_id": deployment_id,
        "runtime_target": runtime_target,
        "vercel_env": vercel_env,
    }

CAPTURE_MIN_IMAGES = 8
CAPTURE_RECOMMENDED_IMAGES = 12
CAPTURE_MAX_IMAGES = 32
DIRECT_UPLOAD_MAX_BYTES = 64 * 1024 * 1024
ALLOWED_REMOTE_UPLOAD_HOST_SUFFIX = ".blob.vercel-storage.com"
SYNTH_PREVIEW_BASE_SIZE = max(256, int(os.getenv("GAUSET_SYNTH_PREVIEW_SIZE", "384")))
SYNTH_PREVIEW_DENSITY_MULTIPLIER = max(1, int(os.getenv("GAUSET_SYNTH_PREVIEW_DENSITY_MULTIPLIER", "5")))
SYNTH_PREVIEW_JITTER_RADIUS = float(os.getenv("GAUSET_SYNTH_PREVIEW_JITTER_RADIUS", "0.38"))
SYNTH_PREVIEW_SCALE_SHRINK = float(os.getenv("GAUSET_SYNTH_PREVIEW_SCALE_SHRINK", "0.84"))
SYNTH_PREVIEW_SATURATION_BOOST = float(os.getenv("GAUSET_SYNTH_PREVIEW_SATURATION_BOOST", "1.08"))
SYNTH_PREVIEW_TARGET_P75 = float(os.getenv("GAUSET_SYNTH_PREVIEW_TARGET_P75", "0.74"))
SYNTH_PREVIEW_TARGET_MEAN = float(os.getenv("GAUSET_SYNTH_PREVIEW_TARGET_MEAN", "0.44"))
SYNTH_PREVIEW_MAX_GAIN = float(os.getenv("GAUSET_SYNTH_PREVIEW_MAX_GAIN", "1.7"))
SYNTH_PREVIEW_MIN_GAMMA = float(os.getenv("GAUSET_SYNTH_PREVIEW_MIN_GAMMA", "0.84"))
SYNTH_PREVIEW_MAX_GAMMA = float(os.getenv("GAUSET_SYNTH_PREVIEW_MAX_GAMMA", "1.0"))
SYNTH_PREVIEW_ALPHA_FLOOR = float(os.getenv("GAUSET_SYNTH_PREVIEW_ALPHA_FLOOR", "0.12"))
SYNTH_PREVIEW_DARK_SCENE_MEAN_THRESHOLD = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_SCENE_MEAN_THRESHOLD", "0.26"))
SYNTH_PREVIEW_DARK_SCENE_P75_THRESHOLD = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_SCENE_P75_THRESHOLD", "0.28"))
SYNTH_PREVIEW_DARK_TARGET_P75 = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_TARGET_P75", "0.82"))
SYNTH_PREVIEW_DARK_TARGET_MEAN = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_TARGET_MEAN", "0.5"))
SYNTH_PREVIEW_DARK_MAX_GAIN = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_MAX_GAIN", "2.1"))
SYNTH_PREVIEW_DARK_MIN_GAMMA = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_MIN_GAMMA", "0.76"))
SYNTH_PREVIEW_DARK_SATURATION_BOOST = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_SATURATION_BOOST", "1.1"))
SYNTH_PREVIEW_DARK_DENSITY_BONUS = max(0, int(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_DENSITY_BONUS", "1")))
SYNTH_PREVIEW_DARK_ALPHA_FLOOR = float(os.getenv("GAUSET_SYNTH_PREVIEW_DARK_ALPHA_FLOOR", "0.15"))


def _write_json(path: str, payload: Any) -> None:
    STORAGE.write_bytes(path, json.dumps(payload, indent=2).encode("utf-8"))


def _read_json(path: str) -> Any:
    return json.loads(STORAGE.read_bytes(path).decode("utf-8"))


def _guess_media_type(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    if guessed:
        return guessed
    if path.endswith(".glb"):
        return "model/gltf-binary"
    if path.endswith(".ply"):
        return "application/octet-stream"
    return "application/octet-stream"


def _is_allowed_remote_upload_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    return parsed.scheme == "https" and parsed.hostname is not None and parsed.hostname.endswith(ALLOWED_REMOTE_UPLOAD_HOST_SUFFIX)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _logit(value: np.ndarray) -> np.ndarray:
    epsilon = 1e-4
    value = np.clip(value, epsilon, 1.0 - epsilon)
    return np.log(value / (1.0 - value))


def _preview_luma(colors: np.ndarray) -> np.ndarray:
    return (colors[..., 0] * 0.299) + (colors[..., 1] * 0.587) + (colors[..., 2] * 0.114)


def _compute_preview_color_stats(colors: np.ndarray) -> Dict[str, Any]:
    luma = _preview_luma(colors)
    flattened = colors.reshape(-1, 3)
    return {
        "mean_rgb": [round(float(value), 4) for value in flattened.mean(axis=0)],
        "mean_luma": round(float(luma.mean()), 4),
        "p75_luma": round(float(np.quantile(luma, 0.75)), 4),
        "p90_luma": round(float(np.quantile(luma, 0.90)), 4),
    }


def _resolve_preview_lift_profile(mean_luma: float, p75_luma: float) -> Dict[str, Any]:
    dark_scene = mean_luma <= SYNTH_PREVIEW_DARK_SCENE_MEAN_THRESHOLD or p75_luma <= SYNTH_PREVIEW_DARK_SCENE_P75_THRESHOLD
    if dark_scene:
        return {
            "name": "dark_scene_lift",
            "dark_scene": True,
            "target_p75": SYNTH_PREVIEW_DARK_TARGET_P75,
            "target_mean": SYNTH_PREVIEW_DARK_TARGET_MEAN,
            "max_gain": SYNTH_PREVIEW_DARK_MAX_GAIN,
            "min_gamma": SYNTH_PREVIEW_DARK_MIN_GAMMA,
            "saturation_boost": SYNTH_PREVIEW_DARK_SATURATION_BOOST,
        }

    return {
        "name": "standard",
        "dark_scene": False,
        "target_p75": SYNTH_PREVIEW_TARGET_P75,
        "target_mean": SYNTH_PREVIEW_TARGET_MEAN,
        "max_gain": SYNTH_PREVIEW_MAX_GAIN,
        "min_gamma": SYNTH_PREVIEW_MIN_GAMMA,
        "saturation_boost": SYNTH_PREVIEW_SATURATION_BOOST,
    }


def _apply_preview_exposure_correction(colors: np.ndarray) -> tuple[np.ndarray, Dict[str, Any]]:
    luma = _preview_luma(colors)
    mean_luma = float(luma.mean())
    p75_luma = float(np.quantile(luma, 0.75))
    profile = _resolve_preview_lift_profile(mean_luma, p75_luma)

    gain = max(1.0, min(profile["max_gain"], profile["target_p75"] / max(p75_luma, 1e-3)))
    lifted = np.clip(colors * gain, 0.0, 1.0)

    post_gain_luma = _preview_luma(lifted)
    post_gain_mean = float(post_gain_luma.mean())
    gamma = 1.0
    if post_gain_mean < profile["target_mean"]:
        gamma = float(
            max(
                profile["min_gamma"],
                min(
                    SYNTH_PREVIEW_MAX_GAMMA,
                    math.log(profile["target_mean"]) / math.log(max(post_gain_mean, 1e-3)),
                ),
            )
        )

    gamma_corrected = np.clip(lifted, 0.0, 1.0) ** gamma
    neutral = _preview_luma(gamma_corrected)[..., None]
    corrected = np.clip(neutral + (gamma_corrected - neutral) * profile["saturation_boost"], 0.0, 1.0)
    final_luma = _preview_luma(corrected)

    return corrected.astype(np.float32), {
        "profile": profile["name"],
        "dark_scene": profile["dark_scene"],
        "gain": round(gain, 4),
        "gamma": round(gamma, 4),
        "saturation_boost": round(profile["saturation_boost"], 4),
        "target_mean": round(profile["target_mean"], 4),
        "target_p75": round(profile["target_p75"], 4),
        "max_gain": round(profile["max_gain"], 4),
        "min_gamma": round(profile["min_gamma"], 4),
        "mean_luma_before": round(mean_luma, 4),
        "mean_luma_after": round(float(final_luma.mean()), 4),
        "p75_luma_before": round(p75_luma, 4),
        "p75_luma_after": round(float(np.quantile(final_luma, 0.75)), 4),
    }


def _densify_synth_preview(
    *,
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    depth: np.ndarray,
    edges: np.ndarray,
    colors: np.ndarray,
    base_alpha: np.ndarray,
    scale_0: np.ndarray,
    scale_1: np.ndarray,
    scale_2: np.ndarray,
    density_multiplier: int,
    per_copy_alpha_floor: float,
) -> tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    height, width = z.shape
    density_multiplier = max(1, density_multiplier)
    source_count = int(width * height)

    if density_multiplier == 1:
        return {
            "x": x.reshape(-1).astype(np.float32),
            "y": y.reshape(-1).astype(np.float32),
            "z": z.reshape(-1).astype(np.float32),
            "f_dc_0": colors[..., 0].reshape(-1).astype(np.float32),
            "f_dc_1": colors[..., 1].reshape(-1).astype(np.float32),
            "f_dc_2": colors[..., 2].reshape(-1).astype(np.float32),
            "opacity": _logit(base_alpha).reshape(-1).astype(np.float32),
            "scale_0": scale_0.reshape(-1).astype(np.float32),
            "scale_1": scale_1.reshape(-1).astype(np.float32),
            "scale_2": scale_2.reshape(-1).astype(np.float32),
        }, {
            "multiplier": 1,
            "source_count": source_count,
            "output_count": source_count,
            "jitter_radius": round(SYNTH_PREVIEW_JITTER_RADIUS, 4),
            "scale_shrink": 1.0,
        }

    patterns = np.array(
        [
            [0.0, 0.0],
            [0.70710678, 0.70710678],
            [-0.70710678, 0.70710678],
            [0.70710678, -0.70710678],
            [-0.70710678, -0.70710678],
            [1.0, 0.0],
            [-1.0, 0.0],
            [0.0, 1.0],
            [0.0, -1.0],
        ],
        dtype=np.float32,
    )
    if density_multiplier > patterns.shape[0]:
        repeats = math.ceil(density_multiplier / patterns.shape[0])
        patterns = np.tile(patterns, (repeats, 1))
    patterns = patterns[:density_multiplier]

    pixel_span_x = np.full_like(depth, 1.56 / max(width, 1), dtype=np.float32)
    pixel_span_y = np.full_like(depth, 1.08 / max(height, 1), dtype=np.float32)
    jitter_strength = SYNTH_PREVIEW_JITTER_RADIUS * (0.55 + (0.45 * np.clip(edges + (0.35 * depth), 0.0, 1.0)))
    per_copy_alpha = 1.0 - np.power(1.0 - np.clip(base_alpha, 0.0, 0.995), 1.0 / density_multiplier)
    per_copy_alpha = np.clip(per_copy_alpha, per_copy_alpha_floor, 0.995)

    copy_shrink = np.ones(density_multiplier, dtype=np.float32)
    if density_multiplier > 1:
        copy_shrink[1:] = SYNTH_PREVIEW_SCALE_SHRINK
    copy_scale_adjust = np.log(np.clip(copy_shrink, 1e-3, None)).astype(np.float32)

    payload: Dict[str, List[np.ndarray]] = {
        "x": [],
        "y": [],
        "z": [],
        "f_dc_0": [],
        "f_dc_1": [],
        "f_dc_2": [],
        "opacity": [],
        "scale_0": [],
        "scale_1": [],
        "scale_2": [],
    }

    for copy_index, (offset_x_factor, offset_y_factor) in enumerate(patterns):
        offset_scale = 0.0 if copy_index == 0 else 1.0
        world_offset_x = pixel_span_x * offset_x_factor * jitter_strength * offset_scale
        world_offset_y = pixel_span_y * offset_y_factor * jitter_strength * offset_scale
        world_offset_z = (depth - 0.5) * 0.008 * (offset_x_factor + offset_y_factor) * offset_scale

        payload["x"].append((x + world_offset_x).reshape(-1).astype(np.float32))
        payload["y"].append((y + world_offset_y).reshape(-1).astype(np.float32))
        payload["z"].append((z + world_offset_z).reshape(-1).astype(np.float32))
        payload["f_dc_0"].append(colors[..., 0].reshape(-1).astype(np.float32))
        payload["f_dc_1"].append(colors[..., 1].reshape(-1).astype(np.float32))
        payload["f_dc_2"].append(colors[..., 2].reshape(-1).astype(np.float32))
        payload["opacity"].append(_logit(per_copy_alpha).reshape(-1).astype(np.float32))
        payload["scale_0"].append((scale_0 + copy_scale_adjust[copy_index]).reshape(-1).astype(np.float32))
        payload["scale_1"].append((scale_1 + copy_scale_adjust[copy_index]).reshape(-1).astype(np.float32))
        payload["scale_2"].append((scale_2 + copy_scale_adjust[copy_index]).reshape(-1).astype(np.float32))

    return {key: np.concatenate(value, axis=0) for key, value in payload.items()}, {
        "multiplier": density_multiplier,
        "source_count": source_count,
        "output_count": source_count * density_multiplier,
        "jitter_radius": round(SYNTH_PREVIEW_JITTER_RADIUS, 4),
        "scale_shrink": round(SYNTH_PREVIEW_SCALE_SHRINK, 4),
    }


def _image_signals(image: Image.Image, size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    square = Image.open(io.BytesIO(_square_image(image, size)))
    pixels = np.asarray(square, dtype=np.float32) / 255.0
    luma = (pixels[..., 0] * 0.299) + (pixels[..., 1] * 0.587) + (pixels[..., 2] * 0.114)
    saturation = pixels.max(axis=2) - pixels.min(axis=2)
    grad_x = np.abs(np.diff(luma, axis=1, prepend=luma[:, :1]))
    grad_y = np.abs(np.diff(luma, axis=0, prepend=luma[:1, :]))
    edges = np.clip((grad_x + grad_y) * 1.8, 0.0, 1.0)
    return pixels, luma, saturation, edges


def _binary_splat_payload(image_bytes: bytes, filename: str) -> Dict[str, bytes]:
    image = _load_image(image_bytes)
    pixels, luma, saturation, edges = _image_signals(image, SYNTH_PREVIEW_BASE_SIZE)
    height, width, _ = pixels.shape

    xs = np.linspace(0.0, 1.0, width, dtype=np.float32)
    ys = np.linspace(0.0, 1.0, height, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(xs, ys)

    # Keep fallback previews as a front-facing scout card with mild local relief.
    depth = (
        0.48 * (1.0 - luma)
        + 0.30 * edges
        + 0.22 * saturation
    )
    depth = (depth - depth.min()) / max(float(depth.max() - depth.min()), 1e-6)

    z = 1.45 + (depth * 0.42)
    x = (grid_x - 0.5) * 1.56
    y = (0.5 - grid_y) * 1.08 + ((luma - 0.5) * 0.04)

    raw_colors = np.clip(np.power(pixels, 0.95), 0.0, 1.0)
    color_stats_before = _compute_preview_color_stats(raw_colors)
    colors, exposure = _apply_preview_exposure_correction(raw_colors)
    color_stats_after = _compute_preview_color_stats(colors)
    density_multiplier = SYNTH_PREVIEW_DENSITY_MULTIPLIER + (SYNTH_PREVIEW_DARK_DENSITY_BONUS if exposure["dark_scene"] else 0)
    per_copy_alpha_floor = SYNTH_PREVIEW_DARK_ALPHA_FLOOR if exposure["dark_scene"] else SYNTH_PREVIEW_ALPHA_FLOOR
    sh_c0 = 0.28209479177387814
    base_alpha = np.clip(0.76 + (0.16 * saturation) - (0.06 * edges) + (0.04 * (1.0 - luma)), 0.44, 0.992)
    scale_0 = -5.25 + (0.85 * depth) - (0.22 * edges)
    scale_1 = -5.4 + (0.72 * depth) - (0.18 * edges)
    scale_2 = -6.2 + (0.5 * edges)
    densified_payload, densification = _densify_synth_preview(
        x=x,
        y=y,
        z=z,
        depth=depth,
        edges=edges,
        colors=(colors - 0.5) / sh_c0,
        base_alpha=base_alpha,
        scale_0=scale_0,
        scale_1=scale_1,
        scale_2=scale_2,
        density_multiplier=density_multiplier,
        per_copy_alpha_floor=per_copy_alpha_floor,
    )

    count = densified_payload["x"].shape[0]
    vertex_dtype = np.dtype(
        [
            ("x", "<f4"),
            ("y", "<f4"),
            ("z", "<f4"),
            ("f_dc_0", "<f4"),
            ("f_dc_1", "<f4"),
            ("f_dc_2", "<f4"),
            ("opacity", "<f4"),
            ("scale_0", "<f4"),
            ("scale_1", "<f4"),
            ("scale_2", "<f4"),
            ("rot_0", "<f4"),
            ("rot_1", "<f4"),
            ("rot_2", "<f4"),
            ("rot_3", "<f4"),
        ]
    )
    vertices = np.empty(count, dtype=vertex_dtype)
    vertices["x"] = densified_payload["x"]
    vertices["y"] = densified_payload["y"]
    vertices["z"] = densified_payload["z"]
    vertices["f_dc_0"] = densified_payload["f_dc_0"]
    vertices["f_dc_1"] = densified_payload["f_dc_1"]
    vertices["f_dc_2"] = densified_payload["f_dc_2"]
    vertices["opacity"] = densified_payload["opacity"]
    vertices["scale_0"] = densified_payload["scale_0"]
    vertices["scale_1"] = densified_payload["scale_1"]
    vertices["scale_2"] = densified_payload["scale_2"]
    vertices["rot_0"] = 0.0
    vertices["rot_1"] = 0.0
    vertices["rot_2"] = 0.0
    vertices["rot_3"] = 1.0

    header = "\n".join(
        [
            "ply",
            "format binary_little_endian 1.0",
            f"element vertex {count}",
            "property float x",
            "property float y",
            "property float z",
            "property float f_dc_0",
            "property float f_dc_1",
            "property float f_dc_2",
            "property float opacity",
            "property float scale_0",
            "property float scale_1",
            "property float scale_2",
            "property float rot_0",
            "property float rot_1",
            "property float rot_2",
            "property float rot_3",
            "element extrinsic 16",
            "property float extrinsic",
            "element intrinsic 9",
            "property float intrinsic",
            "element image_size 2",
            "property uint image_size",
            "element frame 2",
            "property int frame",
            "element disparity 2",
            "property float disparity",
            "element color_space 1",
            "property uchar color_space",
            "element version 3",
            "property uchar version",
            "end_header",
            "",
        ]
    ).encode("utf-8")

    extrinsic = np.eye(4, dtype="<f4").reshape(-1)
    intrinsic = np.array(
        [
            280.0,
            0.0,
            width / 2.0,
            0.0,
            280.0,
            height / 2.0,
            0.0,
            0.0,
            1.0,
        ],
        dtype="<f4",
    )
    disparity = np.array(
        [1.0 / float(z.max() + 1e-4), 1.0 / float(z.min() + 1e-4)],
        dtype="<f4",
    )
    image_size = np.array([width, height], dtype="<u4")
    frame = np.array([0, 1], dtype="<i4")
    color_space = np.array([1], dtype=np.uint8)
    version = np.array([1, 0, 0], dtype=np.uint8)

    cameras = [
        {
            "name": "hero",
            "position": [0.0, 1.5, 3.4],
            "target": [0.0, 0.1, 0.8],
            "fov": 48,
        },
        {
            "name": "left_orbit",
            "position": [-1.7, 1.2, 3.1],
            "target": [0.0, 0.0, 1.0],
            "fov": 50,
        },
        {
            "name": "right_orbit",
            "position": [1.7, 1.2, 3.1],
            "target": [0.0, 0.0, 1.0],
            "fov": 50,
        },
    ]
    metadata = {
        "generator": "gauset-mvp-backend",
        "lane": "preview",
        "mode": "heuristic",
        "model": "gauset-depth-synth-v2",
        "execution_mode": "real",
        "truth_label": "Instant Preview",
        "quality_tier": "single_image_preview_dense_fallback",
        "faithfulness": "approximate",
        "lane_truth": "preview_only_single_image",
        "capture_mode": "single_still",
        "reconstruction_status": "preview_only",
        "reconstruction_backend": "single_image_depth_preview",
        "training_backend": "single_image_depth_preview",
        "benchmark_status": "not_applicable_preview_only",
        "input_strategy": "1 photo",
        "recommended_capture": "8-32 overlapping photos or a short orbit video",
        "capture_requirements": {
            "minimum_images": CAPTURE_MIN_IMAGES,
            "recommended_images": CAPTURE_RECOMMENDED_IMAGES,
            "max_images": CAPTURE_MAX_IMAGES,
        },
        "capture": {
            "status": "single_still_preview",
            "capture_mode": "single_still",
            "frame_count": 1,
            "target_contract": {
                "minimum_images": 16,
                "recommended_images": 24,
                "maximum_images": 40,
                "detail_pass_required": True,
                "locked_exposure_required": True,
                "height_variation_required": True,
            },
            "summary": "Single-image preview can scout framing and tone, but it does not satisfy real-space capture requirements.",
        },
        "training": {
            "backend": "single_image_depth_preview",
            "kind": "single_view_depth_synthesis",
            "native_gaussian_training": False,
            "artifact_format": "sharp_ply",
            "viewer_renderer": "sharp_gaussian_direct",
            "world_class_ready": False,
        },
        "holdout": {
            "status": "not_applicable_preview_only",
            "available": False,
            "metrics_available": False,
            "passed": False,
            "summary": "Holdout metrics do not exist for the single-image preview lane.",
        },
        "comparison": {
            "benchmark_status": "not_benchmarked",
            "benchmarked": False,
            "summary": "Preview output is not eligible for market benchmark comparison against real reconstruction tools.",
        },
        "release_gates": {
            "status": "blocked",
            "hero_ready": False,
            "world_class_ready": False,
            "summary": "Preview output is intentionally blocked from hero or world-class promotion.",
            "checks": {
                "truthful_lane_label": True,
                "hero_capture_contract": False,
                "verified_sfm": False,
                "native_gaussian_training": False,
                "holdout_metrics": False,
                "benchmarked_against_market": False,
                "viewer_budget_verified": False,
            },
            "failed": [
                "hero capture contract",
                "verified sfm",
                "native gaussian training",
                "holdout metrics",
                "benchmarked against market",
                "viewer budget verified",
            ],
        },
        "delivery": {
            "score": 38.0,
            "readiness": "preview_only",
            "label": "Preview only",
            "summary": (
                "This output is a truthful single-still preview, densified for stronger framing and look scouting, "
                "not a faithful reconstruction or production-ready handoff."
            ),
            "recommended_viewer_mode": "editor",
            "blocking_issues": [
                "A single photo cannot resolve hidden geometry or full scene coverage.",
            ],
            "next_actions": [
                "Capture an 8-32 image overlapping set or short orbit video for true reconstruction.",
            ],
            "axes": {
                "geometry": {"score": 18.0, "status": "critical", "note": "Single-view geometry is fundamentally underconstrained."},
                "color": {"score": 72.0, "status": "watch", "note": "Fallback preview color is exposure-lifted for better look development, but it is not fused across views."},
                "coverage": {"score": 6.0, "status": "critical", "note": "Only one camera angle is available."},
                "density": {"score": 74.0, "status": "watch", "note": "Fallback preview density is expanded with jittered splat supersampling for a fuller viewer result."},
            },
            "render_targets": {
                "desktop_fps": 60,
                "mobile_fps": 30,
                "preferred_point_budget": count,
            },
        },
        "rendering": {
            "color_encoding": "sh_dc_rgb",
            "viewer_decode": "srgb = clamp(f_dc * 0.28209479177388 + 0.5, 0, 1)",
            "has_explicit_vertex_colors": False,
            "viewer_renderer": "sharp_gaussian_direct",
            "source_format": "sharp_ply_dense_preview_fallback",
            "preview_density_multiplier": densification["multiplier"],
            "apply_preview_orientation": False,
            "viewer_source": "/storage/scene/environment",
        },
        "preview_enhancement": {
            "source_renderer": "gauset-depth-synth-fallback",
            "point_count_before": densification["source_count"],
            "point_count_after": densification["output_count"],
            "density": densification,
            "exposure": exposure,
            "color_stats_before": color_stats_before,
            "color_stats_after": color_stats_after,
        },
        "input_filename": filename,
        "generated_at": _utc_now(),
        "dimensions": {"width": image.width, "height": image.height},
        "splat_dimensions": {"width": width, "height": height},
        "point_count": count,
        "storage_mode": STORAGE.mode(),
    }

    splat_bytes = b"".join(
        [
            header,
            vertices.tobytes(),
            extrinsic.tobytes(),
            intrinsic.tobytes(),
            image_size.tobytes(),
            frame.tobytes(),
            disparity.tobytes(),
            color_space.tobytes(),
            version.tobytes(),
        ]
    )

    return {
        "splats.ply": splat_bytes,
        "cameras.json": json.dumps(cameras, indent=2).encode("utf-8"),
        "metadata.json": json.dumps(metadata, indent=2).encode("utf-8"),
        "capture-scorecard.json": json.dumps(metadata["capture"], indent=2).encode("utf-8"),
        "holdout-report.json": json.dumps(metadata["holdout"], indent=2).encode("utf-8"),
        "benchmark-report.json": json.dumps(metadata["comparison"], indent=2).encode("utf-8"),
    }


def _relief_mesh_payload(image_bytes: bytes, filename: str) -> Dict[str, bytes]:
    image = _load_image(image_bytes)
    pixels, luma, saturation, edges = _image_signals(image, 128)
    height, width, _ = pixels.shape

    xs = np.linspace(-0.65, 0.65, width, dtype=np.float32)
    ys = np.linspace(0.85, -0.55, height, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(xs, ys)
    z = (
        0.04
        + 0.16 * (1.0 - luma)
        + 0.12 * edges
        + 0.05 * saturation
    ).astype(np.float32)

    vertices = np.stack([grid_x, grid_y, z], axis=-1).reshape(-1, 3)
    colors = (np.clip(pixels, 0.0, 1.0) * 255.0).astype(np.uint8).reshape(-1, 3)
    alpha = np.full((colors.shape[0], 1), 255, dtype=np.uint8)
    vertex_colors = np.concatenate([colors, alpha], axis=1)

    faces: List[List[int]] = []
    for row in range(height - 1):
        for col in range(width - 1):
            a = row * width + col
            b = a + 1
            c = a + width
            d = c + 1
            faces.append([a, c, b])
            faces.append([b, c, d])

    mesh = trimesh.Trimesh(vertices=vertices, faces=np.asarray(faces, dtype=np.int32), process=False)
    mesh.visual.vertex_colors = vertex_colors

    glb_bytes = mesh.export(file_type="glb")
    if isinstance(glb_bytes, str):
        glb_bytes = glb_bytes.encode("utf-8")

    metadata = {
        "generator": "gauset-mvp-backend",
        "lane": "asset",
        "mode": "heuristic",
        "model": "gauset-relief-mesh-v1",
        "execution_mode": "real",
        "truth_label": "Single-Image Asset",
        "quality_tier": "single_image_asset",
        "faithfulness": "object-focused synthesis",
        "input_strategy": "1 photo",
        "input_filename": filename,
        "generated_at": _utc_now(),
        "dimensions": {"width": image.width, "height": image.height},
        "mesh_vertices": int(len(vertices)),
        "mesh_triangles": int(len(faces)),
    }

    return {
        "mesh.glb": glb_bytes,
        "texture.png": _square_image(image, 1024),
        "preview.png": _square_image(image, 768),
        "metadata.json": json.dumps(metadata, indent=2).encode("utf-8"),
    }


def _load_image(image_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(image_bytes))
    image.load()
    return ImageOps.exif_transpose(image).convert("RGB")


def _square_image(image: Image.Image, size: int) -> bytes:
    background = Image.new("RGB", (size, size), image.resize((1, 1)).getpixel((0, 0)))
    fitted = ImageOps.contain(image, (size, size))
    offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    background.paste(fitted, offset)
    buffer = io.BytesIO()
    background.save(buffer, format="PNG")
    return buffer.getvalue()


def _write_ascii_ply(points: List[tuple[float, float, float, int, int, int]]) -> bytes:
    lines = [
        "ply",
        "format ascii 1.0",
        f"element vertex {len(points)}",
        "property float x",
        "property float y",
        "property float z",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        "end_header",
    ]
    lines.extend(
        f"{x:.5f} {y:.5f} {z:.5f} {r} {g} {b}" for x, y, z, r, g, b in points
    )
    return "\n".join(lines).encode("utf-8")


def _environment_payload(image_bytes: bytes, filename: str) -> Dict[str, bytes]:
    return _binary_splat_payload(image_bytes, filename)


def _asset_payload(image_bytes: bytes, filename: str) -> Dict[str, bytes]:
    return _relief_mesh_payload(image_bytes, filename)


def _upload_meta_path(image_id: str) -> str:
    return f"uploads/meta/{image_id}.json"


def _job_path(job_id: str) -> str:
    return f"jobs/{job_id}.json"


def _job_index_path() -> str:
    return "jobs/index.json"


def _scene_path(scene_id: str) -> str:
    return f"scenes/{scene_id}/scene.json"


def _scene_version_path(scene_id: str, version_id: str) -> str:
    return f"scenes/{scene_id}/versions/{version_id}.json"


def _scene_review_path(scene_id: str) -> str:
    return f"scenes/{scene_id}/review.json"


def _scene_comments_path(scene_id: str, version_id: str) -> str:
    return f"scenes/{scene_id}/comments/{version_id}.json"


def _scene_versions_index_path(scene_id: str) -> str:
    return f"scenes/{scene_id}/versions_index.json"


def _capture_session_path(session_id: str) -> str:
    return f"captures/{session_id}.json"


def _scene_exists(scene_id: str) -> bool:
    return any(
        STORAGE.exists(path)
        for path in (
            _scene_path(scene_id),
            _scene_versions_index_path(scene_id),
            _scene_review_path(scene_id),
        )
    )


def _scene_urls(scene_id: str) -> Dict[str, str]:
    base = f"/storage/scenes/{scene_id}/environment"
    return {
        "viewer": base,
        "splats": f"{base}/splats.ply",
        "cameras": f"{base}/cameras.json",
        "metadata": f"{base}/metadata.json",
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
    }


def _build_upload_response(record: Dict[str, Any]) -> Dict[str, Any]:
    source_provenance = record.get("source_provenance")
    if not isinstance(source_provenance, dict):
        source_provenance = _build_source_provenance(record)

    world_source = record.get("world_source")
    if not isinstance(world_source, dict):
        world_source = _build_world_source(
            lane="upload",
            ingest_channel="upload",
            input_strategy="1 uploaded source image",
            primary_source=source_provenance,
            upstream_sources=[source_provenance],
        )

    lane_metadata = _upload_lane_metadata()
    handoff_manifest = _upload_handoff_manifest(world_source)
    ingest_record = _build_ingest_record(
        ingest_id=f"ingest_{str(record['image_id']).strip()}",
        source_kind=_normalize_ingest_source_kind(source_provenance.get("kind") or "upload"),
        source_label=str(record.get("original_filename") or record.get("filename") or record["image_id"]).strip() or str(record["image_id"]),
        vendor=_text_or_none(record.get("provider")),
        source_uri=str(record.get("url") or f"/storage/{record.get('storage_path')}").strip() or None,
        origin=_text_or_none(source_provenance.get("origin")),
        ingest_channel=_text_or_none(source_provenance.get("ingest_channel")) or "upload",
        media_type=_guess_media_type(str(record.get("filepath") or record.get("storage_path") or "")),
        scene_id=None,
        lane="upload",
        truth_label="Uploaded source only",
        lane_truth="single_image_upload",
        blockers=["Uploaded source image is only a source input, not a durable world handoff."],
        production_readiness="blocked",
        files={"source": record.get("url") or f"/storage/{record.get('storage_path')}"},
        entrypoints={"source": record.get("url") or f"/storage/{record.get('storage_path')}"},
    )

    payload: Dict[str, Any] = {
        "image_id": record["image_id"],
        "filename": record.get("stored_filename") or record.get("filename"),
        "filepath": record.get("storage_path") or record.get("filepath"),
        "url": record.get("url") or f"/storage/{record.get('storage_path')}",
        "source_provenance": source_provenance,
        "world_source": world_source,
        "lane_metadata": lane_metadata,
        "handoff_manifest": handoff_manifest,
        "ingest_record": ingest_record,
    }
    for key in ("source_type", "provider", "model", "prompt", "generation_job_id"):
        if record.get(key) is not None:
            payload[key] = record.get(key)
    return payload


def _write_upload_record(
    *,
    image_id: str,
    original_filename: str,
    stored_filename: str,
    storage_path: str,
    source_type: str,
    provider: str | None = None,
    model: str | None = None,
    prompt: str | None = None,
    generation_job_id: str | None = None,
) -> Dict[str, Any]:
    payload = {
        "image_id": image_id,
        "filename": original_filename,
        "stored_filename": stored_filename,
        "storage_path": storage_path,
        "filepath": storage_path,
        "url": f"/storage/{storage_path}",
        "created_at": _utc_now(),
        "source_type": source_type,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "generation_job_id": generation_job_id,
    }
    payload["source_provenance"] = _build_source_provenance(payload)
    payload["world_source"] = _build_world_source(
        lane="upload",
        ingest_channel="upload",
        input_strategy="1 uploaded source image",
        primary_source=payload["source_provenance"],
        upstream_sources=[payload["source_provenance"]],
    )
    payload["lane_metadata"] = _upload_lane_metadata()
    payload["handoff_manifest"] = _upload_handoff_manifest(payload["world_source"])
    payload["ingest_record"] = _build_ingest_record(
        ingest_id=f"ingest_{payload['image_id']}",
        source_kind=_normalize_ingest_source_kind(payload["source_provenance"].get("kind") or "upload"),
        source_label=str(payload.get("filename") or payload["image_id"]).strip() or payload["image_id"],
        vendor=_text_or_none(payload.get("provider")),
        source_uri=str(payload.get("url") or "").strip() or None,
        origin=_text_or_none(payload["source_provenance"].get("origin")),
        ingest_channel=_text_or_none(payload["source_provenance"].get("ingest_channel")) or "upload",
        media_type=_guess_media_type(str(payload.get("storage_path") or payload.get("filepath") or "")),
        scene_id=None,
        lane="upload",
        truth_label="Uploaded source only",
        lane_truth="single_image_upload",
        blockers=["Uploaded source image is only a source input, not a durable world handoff."],
        production_readiness="blocked",
        files={"source": payload.get("url")},
        entrypoints={"source": payload.get("url")},
    )
    _write_json(_upload_meta_path(image_id), payload)
    return payload


def _store_upload_bytes(
    *,
    contents: bytes,
    original_filename: str,
    source_type: str,
    provider: str | None = None,
    model: str | None = None,
    prompt: str | None = None,
    generation_job_id: str | None = None,
) -> Dict[str, Any]:
    image_id = uuid.uuid4().hex
    extension = Path(original_filename).suffix.lower() or ".png"
    stored_filename = f"{image_id}{extension}"
    storage_path = f"uploads/images/{stored_filename}"
    STORAGE.write_bytes(storage_path, contents)
    record = _write_upload_record(
        image_id=image_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        storage_path=storage_path,
        source_type=source_type,
        provider=provider,
        model=model,
        prompt=prompt,
        generation_job_id=generation_job_id,
    )
    return _build_upload_response(record)


def _store_remote_upload(
    *,
    url: str,
    original_filename: str,
    content_type: str | None = None,
    size_bytes: int | None = None,
) -> Dict[str, Any]:
    if not _is_allowed_remote_upload_url(url):
        raise HTTPException(status_code=400, detail="Uploaded blob URL is not allowed")

    expected_content_type = str(content_type or "").strip().lower()
    if expected_content_type and not expected_content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image stills can be ingested into the workspace")

    if isinstance(size_bytes, int) and size_bytes > DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Uploaded still exceeds the current 64 MB ingest limit")

    request = urllib.request.Request(url, method="GET", headers={"Accept": "image/*"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            resolved_content_type = (response.headers.get_content_type() or "").lower()
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > DIRECT_UPLOAD_MAX_BYTES:
                        raise HTTPException(status_code=400, detail="Uploaded still exceeds the current 64 MB ingest limit")
                except ValueError:
                    pass
            if resolved_content_type and not resolved_content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Uploaded blob did not resolve to an image still")

            contents = response.read(DIRECT_UPLOAD_MAX_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch uploaded still ({exc.code})") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch uploaded still: {exc.reason}") from exc

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded still is empty")
    if len(contents) > DIRECT_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Uploaded still exceeds the current 64 MB ingest limit")
    if isinstance(size_bytes, int) and size_bytes > 0 and len(contents) != size_bytes:
        raise HTTPException(status_code=400, detail="Uploaded still size changed before ingest completed")

    return _store_upload_bytes(
        contents=contents,
        original_filename=original_filename,
        source_type="upload",
    )


def _load_reference_images(image_ids: List[str]) -> List[Any]:
    references: List[Any] = []
    for image_id in image_ids:
        record = _load_upload_record(image_id)
        storage_path = str(record["storage_path"])
        reference_name = record.get("stored_filename") or record.get("filename") or Path(storage_path).name
        references.append(
            normalize_reference_image(
                str(reference_name),
                None,
                STORAGE.read_bytes(storage_path),
            )
        )
    return references


def _default_review_metadata() -> Dict[str, str]:
    return {
        "project_name": "",
        "scene_title": "",
        "location_name": "",
        "owner": "",
        "notes": "",
        "address": "",
        "shoot_day": "",
        "permit_status": "",
        "access_notes": "",
        "parking_notes": "",
        "power_notes": "",
        "safety_notes": "",
    }


def _normalize_review_issue(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(payload.get("id") or uuid.uuid4().hex),
        "title": str(payload.get("title") or "").strip(),
        "body": str(payload.get("body") or "").strip(),
        "type": str(payload.get("type") or "general").strip() or "general",
        "severity": str(payload.get("severity") or "medium").strip() or "medium",
        "status": str(payload.get("status") or "open").strip() or "open",
        "assignee": str(payload.get("assignee") or "").strip(),
        "author": str(payload.get("author") or "Reviewer").strip() or "Reviewer",
        "anchor_position": payload.get("anchor_position") if isinstance(payload.get("anchor_position"), list) else None,
        "anchor_view_id": str(payload.get("anchor_view_id") or "").strip() or None,
        "version_id": str(payload.get("version_id") or "").strip() or None,
        "created_at": str(payload.get("created_at") or _utc_now()),
        "updated_at": str(payload.get("updated_at") or _utc_now()),
    }


def _normalize_review_payload(scene_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    metadata_input = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    approval_input = payload.get("approval") if isinstance(payload.get("approval"), dict) else {}
    issues_input = payload.get("issues") if isinstance(payload.get("issues"), list) else []
    normalized_metadata = _default_review_metadata()

    for key in normalized_metadata.keys():
        normalized_metadata[key] = str(metadata_input.get(key, "") or "").strip()

    history = approval_input.get("history") if isinstance(approval_input.get("history"), list) else []
    normalized_issues = [
        _normalize_review_issue(issue)
        for issue in issues_input
        if isinstance(issue, dict)
        and (str(issue.get("title") or "").strip() or str(issue.get("body") or "").strip())
    ]

    return {
        "scene_id": scene_id,
        "metadata": normalized_metadata,
        "approval": {
            "state": str(approval_input.get("state") or "draft"),
            "updated_at": approval_input.get("updated_at"),
            "updated_by": approval_input.get("updated_by"),
            "note": str(approval_input.get("note") or "").strip(),
            "history": history,
        },
        "issues": normalized_issues,
    }


def _normalize_scene_graph(scene_graph: Any) -> Dict[str, Any]:
    payload = scene_graph if isinstance(scene_graph, dict) else {}
    viewer_input = payload.get("viewer") if isinstance(payload.get("viewer"), dict) else {}
    return {
        "environment": payload.get("environment"),
        "assets": payload.get("assets") if isinstance(payload.get("assets"), list) else [],
        "camera_views": payload.get("camera_views") if isinstance(payload.get("camera_views"), list) else [],
        "pins": payload.get("pins") if isinstance(payload.get("pins"), list) else [],
        "director_path": payload.get("director_path") if isinstance(payload.get("director_path"), list) else [],
        "director_brief": str(payload.get("director_brief") or ""),
        "viewer": {
            "fov": float(viewer_input.get("fov")) if isinstance(viewer_input.get("fov"), (int, float)) else 45.0,
            "lens_mm": float(viewer_input.get("lens_mm")) if isinstance(viewer_input.get("lens_mm"), (int, float)) else 35.0,
        },
    }


def _extract_embedded_scene_document(scene_graph: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not isinstance(scene_graph, dict):
        return None
    embedded_document = scene_graph.get("__scene_document_v2")
    if isinstance(embedded_document, dict) and embedded_document.get("version") == 2:
        return embedded_document
    return None


def _document_node_order(scene_document: Dict[str, Any]) -> List[str]:
    nodes = scene_document.get("nodes") if isinstance(scene_document.get("nodes"), dict) else {}
    root_ids = scene_document.get("rootIds") if isinstance(scene_document.get("rootIds"), list) else []
    ordered: List[str] = []
    seen: set[str] = set()

    def walk(node_id: Any) -> None:
        if not isinstance(node_id, str) or not node_id or node_id in seen:
            return
        seen.add(node_id)
        ordered.append(node_id)
        node = nodes.get(node_id) if isinstance(nodes, dict) else None
        child_ids = node.get("childIds") if isinstance(node, dict) and isinstance(node.get("childIds"), list) else []
        for child_id in child_ids:
            walk(child_id)

    for root_id in root_ids:
        walk(root_id)
    for node_id in nodes:
        walk(node_id)
    return ordered


def _normalize_position_tuple(value: Any, default: List[float] | None = None) -> List[float]:
    fallback = default or [0.0, 0.0, 0.0]
    if isinstance(value, list) and len(value) == 3 and all(isinstance(item, (int, float)) for item in value):
        return [float(item) for item in value]
    return list(fallback)


def _normalize_rotation_tuple(value: Any, default: List[float] | None = None) -> List[float]:
    fallback = default or [0.0, 0.0, 0.0, 1.0]
    if isinstance(value, list):
        if len(value) == 4 and all(isinstance(item, (int, float)) for item in value):
            return [float(item) for item in value]
        if len(value) == 3 and all(isinstance(item, (int, float)) for item in value):
            return [float(value[0]), float(value[1]), float(value[2]), 1.0]
    return list(fallback)


def _empty_scene_document_v2() -> Dict[str, Any]:
    return {
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
            "fov": 45.0,
            "lens_mm": 35.0,
            "activeCameraNodeId": None,
        },
    }


def _scene_graph_to_canonical_scene_document(scene_graph: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(scene_graph, dict):
        return _empty_scene_document_v2()

    embedded_scene_document = _extract_embedded_scene_document(scene_graph)
    if embedded_scene_document is not None:
        return embedded_scene_document

    if scene_graph.get("version") == 2:
        return scene_graph

    normalized = _normalize_scene_graph(scene_graph)
    document = _empty_scene_document_v2()
    document["direction"] = {
        "cameraViews": normalized.get("camera_views") if isinstance(normalized.get("camera_views"), list) else [],
        "pins": normalized.get("pins") if isinstance(normalized.get("pins"), list) else [],
        "directorPath": normalized.get("director_path") if isinstance(normalized.get("director_path"), list) else [],
        "directorBrief": str(normalized.get("director_brief") or ""),
    }
    document["viewer"] = {
        "fov": normalized["viewer"]["fov"],
        "lens_mm": normalized["viewer"]["lens_mm"],
        "activeCameraNodeId": "camera_viewer",
    }

    environment = normalized.get("environment") if isinstance(normalized.get("environment"), dict) else None
    if environment is not None:
        environment_id = str(environment.get("id") or "environment")
        node_id = f"splat_{environment_id}"
        urls = environment.get("urls") if isinstance(environment.get("urls"), dict) else {}
        document["rootIds"].append(node_id)
        document["nodes"][node_id] = {
            "id": node_id,
            "kind": "splat",
            "parentId": None,
            "childIds": [],
            "name": str(environment.get("name") or environment.get("sourceLabel") or environment.get("label") or "Environment"),
            "visible": bool(environment.get("visible", True)),
            "locked": bool(environment.get("locked", False)),
            "transform": {
                "position": [0.0, 0.0, 0.0],
                "rotation": [0.0, 0.0, 0.0, 1.0],
                "scale": [1.0, 1.0, 1.0],
            },
        }
        document["splats"][node_id] = {
            "id": node_id,
            "sceneId": environment.get("id"),
            "viewerUrl": urls.get("viewer") if isinstance(urls.get("viewer"), str) else None,
            "splatUrl": urls.get("splats") if isinstance(urls.get("splats"), str) else None,
            "camerasUrl": urls.get("cameras") if isinstance(urls.get("cameras"), str) else None,
            "metadataUrl": urls.get("metadata") if isinstance(urls.get("metadata"), str) else None,
            "metadata": environment.get("metadata") if isinstance(environment.get("metadata"), dict) else {},
        }

    for index, asset in enumerate(normalized.get("assets") if isinstance(normalized.get("assets"), list) else []):
        if not isinstance(asset, dict):
            continue
        node_id = str(asset.get("instanceId") or asset.get("instance_id") or asset.get("id") or f"mesh_{index + 1}")
        asset_id = str(asset.get("asset_id") or asset.get("id") or node_id)
        document["rootIds"].append(node_id)
        document["nodes"][node_id] = {
            "id": node_id,
            "kind": "mesh",
            "parentId": None,
            "childIds": [],
            "name": str(asset.get("name") or asset_id),
            "visible": bool(asset.get("visible", True)),
            "locked": bool(asset.get("locked", False)),
            "transform": {
                "position": _normalize_position_tuple(asset.get("position")),
                "rotation": _normalize_rotation_tuple(asset.get("rotation")),
                "scale": _normalize_position_tuple(asset.get("scale"), [1.0, 1.0, 1.0]),
            },
        }
        document["meshes"][node_id] = {
            "id": node_id,
            "assetId": asset_id,
            "meshUrl": asset.get("mesh") if isinstance(asset.get("mesh"), str) else None,
            "textureUrl": asset.get("texture") if isinstance(asset.get("texture"), str) else None,
            "previewUrl": asset.get("preview") if isinstance(asset.get("preview"), str) else None,
            "metadata": {
                **(asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}),
                "id": asset.get("id") or asset_id,
                "asset_id": asset.get("asset_id") or asset_id,
                "instanceId": asset.get("instanceId") or asset.get("instance_id") or node_id,
            },
        }

    document["rootIds"].append("camera_viewer")
    document["nodes"]["camera_viewer"] = {
        "id": "camera_viewer",
        "kind": "camera",
        "parentId": None,
        "childIds": [],
        "name": "Viewer Camera",
        "visible": True,
        "locked": False,
        "transform": {
            "position": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0, 1.0],
            "scale": [1.0, 1.0, 1.0],
        },
    }
    document["cameras"]["camera_viewer"] = {
        "id": "camera_viewer",
        "fov": normalized["viewer"]["fov"],
        "lens_mm": normalized["viewer"]["lens_mm"],
        "near": 0.1,
        "far": 1000.0,
        "role": "viewer",
    }
    return document


def _scene_document_to_compatibility_scene_graph(scene_document: Dict[str, Any]) -> Dict[str, Any]:
    if scene_document.get("version") != 2:
        return _normalize_scene_graph(scene_document)

    nodes = scene_document.get("nodes") if isinstance(scene_document.get("nodes"), dict) else {}
    meshes = scene_document.get("meshes") if isinstance(scene_document.get("meshes"), dict) else {}
    splats = scene_document.get("splats") if isinstance(scene_document.get("splats"), dict) else {}
    direction = scene_document.get("direction") if isinstance(scene_document.get("direction"), dict) else {}
    viewer = scene_document.get("viewer") if isinstance(scene_document.get("viewer"), dict) else {}

    environment = None
    assets: List[Dict[str, Any]] = []

    for node_id in _document_node_order(scene_document):
        node = nodes.get(node_id) if isinstance(nodes, dict) else None
        if not isinstance(node, dict):
            continue

        transform = node.get("transform") if isinstance(node.get("transform"), dict) else {}
        kind = node.get("kind")
        visible = node.get("visible")
        is_visible = visible if isinstance(visible, bool) else True
        locked = node.get("locked")
        is_locked = locked if isinstance(locked, bool) else False
        if kind == "splat" and environment is None and is_visible:
            splat = splats.get(node_id) if isinstance(splats, dict) else None
            if isinstance(splat, dict):
                metadata = splat.get("metadata") if isinstance(splat.get("metadata"), dict) else {}
                metadata_urls = metadata.get("urls") if isinstance(metadata.get("urls"), dict) else {}
                environment = {
                    **metadata,
                    "id": splat.get("sceneId"),
                    "name": node.get("name") or "Environment",
                    "visible": is_visible,
                    "locked": is_locked,
                    "urls": {
                        **metadata_urls,
                        "viewer": splat.get("viewerUrl"),
                        "splats": splat.get("splatUrl"),
                        "cameras": splat.get("camerasUrl"),
                        "metadata": splat.get("metadataUrl"),
                    },
                }
        elif kind == "mesh" and is_visible:
            mesh = meshes.get(node_id) if isinstance(meshes, dict) else None
            if not isinstance(mesh, dict):
                continue
            metadata = mesh.get("metadata") if isinstance(mesh.get("metadata"), dict) else {}
            asset_id = mesh.get("assetId") if isinstance(mesh.get("assetId"), str) and mesh.get("assetId") else node_id
            assets.append(
                {
                    **metadata,
                    "asset_id": metadata.get("asset_id") or asset_id,
                    "id": metadata.get("id") or asset_id,
                    "name": metadata.get("name") or node.get("name") or asset_id,
                    "mesh": mesh.get("meshUrl"),
                    "texture": mesh.get("textureUrl"),
                    "preview": mesh.get("previewUrl"),
                    "instanceId": metadata.get("instanceId") or metadata.get("instance_id"),
                    "visible": is_visible,
                    "locked": is_locked,
                    "position": _normalize_position_tuple(transform.get("position")),
                    "rotation": _normalize_rotation_tuple(transform.get("rotation")),
                    "scale": _normalize_position_tuple(transform.get("scale"), [1.0, 1.0, 1.0]),
                }
            )

    return {
        "environment": environment,
        "assets": assets,
        "camera_views": direction.get("cameraViews") if isinstance(direction.get("cameraViews"), list) else [],
        "pins": direction.get("pins") if isinstance(direction.get("pins"), list) else [],
        "director_path": direction.get("directorPath") if isinstance(direction.get("directorPath"), list) else [],
        "director_brief": str(direction.get("directorBrief") or ""),
        "viewer": {
            "fov": float(viewer.get("fov")) if isinstance(viewer.get("fov"), (int, float)) else 45.0,
            "lens_mm": float(viewer.get("lens_mm")) if isinstance(viewer.get("lens_mm"), (int, float)) else 35.0,
        },
        "__scene_document_v2": scene_document,
    }


def _normalize_scene_graph_for_compare(scene_graph: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_scene_graph(scene_graph)
    environment = normalized.get("environment") if isinstance(normalized.get("environment"), dict) else None
    normalized_environment = None
    if environment is not None:
        normalized_environment = {
            "id": environment.get("id"),
            "lane": environment.get("lane"),
            "urls": environment.get("urls") if isinstance(environment.get("urls"), dict) else {},
            "metadata": environment.get("metadata") if isinstance(environment.get("metadata"), dict) else {},
        }

    normalized_assets: List[Dict[str, Any]] = []
    for asset in normalized.get("assets") if isinstance(normalized.get("assets"), list) else []:
        if not isinstance(asset, dict):
            continue
        normalized_assets.append(
            {
                "asset_id": asset.get("asset_id"),
                "id": asset.get("id"),
                "name": asset.get("name"),
                "mesh": asset.get("mesh"),
                "texture": asset.get("texture"),
                "preview": asset.get("preview"),
                "instanceId": asset.get("instanceId") or asset.get("instance_id"),
                "position": _normalize_position_tuple(asset.get("position")),
                "rotation": _normalize_rotation_tuple(asset.get("rotation")),
                "scale": _normalize_position_tuple(asset.get("scale"), [1.0, 1.0, 1.0]),
            }
        )

    normalized_assets.sort(key=lambda asset: json.dumps(asset, sort_keys=True))

    return {
        "environment": normalized_environment,
        "assets": normalized_assets,
        "camera_views": normalized.get("camera_views"),
        "pins": normalized.get("pins"),
        "director_path": normalized.get("director_path"),
        "director_brief": normalized.get("director_brief"),
        "viewer": normalized.get("viewer"),
    }


def _scene_graph_mismatch_error() -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": SCENE_DOCUMENT_GRAPH_MISMATCH_CODE,
            "message": "scene_document and scene_graph do not match. Remove scene_graph or resend a compatibility graph derived from the scene_document.",
        },
    )


def _default_review_payload(scene_id: str) -> Dict[str, Any]:
    return _normalize_review_payload(
        scene_id,
        {
            "scene_id": scene_id,
            "metadata": _default_review_metadata(),
            "approval": {
                "state": "draft",
                "updated_at": None,
                "updated_by": None,
                "note": "",
                "history": [],
            },
            "issues": [],
        },
    )


def _scene_summary(scene_graph: Dict[str, Any]) -> Dict[str, Any]:
    assets = scene_graph.get("assets") if isinstance(scene_graph, dict) else []
    return {
        "asset_count": len(assets) if isinstance(assets, list) else 0,
        "has_environment": bool(scene_graph.get("environment")) if isinstance(scene_graph, dict) else False,
    }


def _load_upload_record(image_id: str) -> Dict[str, Any]:
    upload_meta_path = _upload_meta_path(image_id)
    if not STORAGE.exists(upload_meta_path):
        raise HTTPException(status_code=404, detail="Uploaded image not found")
    payload = _read_json(upload_meta_path)
    if not isinstance(payload, dict):
        payload = {}
    payload["source_provenance"] = (
        payload.get("source_provenance")
        if isinstance(payload.get("source_provenance"), dict)
        else _build_source_provenance(payload)
    )
    return payload


def _load_scene_review(scene_id: str) -> Dict[str, Any]:
    path = _scene_review_path(scene_id)
    if not STORAGE.exists(path):
        return _default_review_payload(scene_id)
    return _normalize_review_payload(scene_id, _read_json(path))


def _count_review_issues(scene_id: str, version_id: str) -> int:
    review_payload = _load_scene_review(scene_id)
    issues = review_payload.get("issues") if isinstance(review_payload, dict) else []
    if not isinstance(issues, list):
        return 0
    return sum(1 for issue in issues if isinstance(issue, dict) and issue.get("version_id") == version_id)


def _load_scene_comments(scene_id: str, version_id: str) -> List[Dict[str, Any]]:
    path = _scene_comments_path(scene_id, version_id)
    if not STORAGE.exists(path):
        return []
    return _read_json(path)


def _load_version_payload(scene_id: str, version_id: str) -> Dict[str, Any]:
    path = _scene_version_path(scene_id, version_id)
    if not STORAGE.exists(path):
        raise HTTPException(status_code=404, detail="Scene version not found")
    return _read_json(path)


def _load_job_index() -> List[Dict[str, Any]]:
    path = _job_index_path()
    if not STORAGE.exists(path):
        return []
    payload = _read_json(path)
    return payload if isinstance(payload, list) else []


def _job_index_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(payload.get("id") or ""),
        "type": str(payload.get("type") or ""),
        "status": str(payload.get("status") or ""),
        "studio_id": payload.get("studio_id"),
        "user_id": payload.get("user_id"),
        "image_id": payload.get("image_id"),
        "created_at": payload.get("created_at"),
        "updated_at": payload.get("updated_at"),
    }


def _job_matches_filters(
    payload: Dict[str, Any],
    *,
    studio_id: str | None,
    statuses: set[str],
    types: set[str],
    created_gte: Optional[datetime],
    updated_gte: Optional[datetime],
    include_missing_context: bool,
) -> bool:
    payload_studio_id = str(payload.get("studio_id") or "").strip() or None
    payload_status = str(payload.get("status") or "").strip()
    payload_type = str(payload.get("type") or "").strip()

    if studio_id:
        if payload_studio_id != studio_id:
            if not include_missing_context or payload_studio_id is not None:
                return False
        elif payload_studio_id is None and not include_missing_context:
            return False

    if statuses and payload_status not in statuses:
        return False

    if types and payload_type not in types:
        return False

    created_at = _parse_job_timestamp(payload.get("created_at"))
    updated_at = _parse_job_timestamp(payload.get("updated_at"))
    if created_gte and (created_at is None or created_at < created_gte):
        return False
    if updated_gte and (updated_at is None or updated_at < updated_gte):
        return False

    return True


def _save_job(job_id: str, payload: Dict[str, Any]) -> None:
    _write_json(_job_path(job_id), payload)
    summaries = [entry for entry in _load_job_index() if str(entry.get("id") or "") != job_id]
    summaries.append(_job_index_summary(payload))
    summaries.sort(
        key=lambda entry: (
            str(entry.get("updated_at") or ""),
            str(entry.get("created_at") or ""),
            str(entry.get("id") or ""),
        ),
        reverse=True,
    )
    _write_json(_job_index_path(), summaries)


def _finalize_generated_image_job(job_payload: Dict[str, Any], provider_job: Any) -> Dict[str, Any]:
    warnings = [str(warning) for warning in job_payload.get("warnings", []) if str(warning).strip()]
    warnings.extend(str(warning) for warning in getattr(provider_job, "warnings", []) if str(warning).strip())
    images: List[Dict[str, Any]] = []

    for artifact in getattr(provider_job, "outputs", []) or []:
        try:
            content_bytes, _, original_filename = materialize_artifact(artifact)
            images.append(
                _store_upload_bytes(
                    contents=content_bytes,
                    original_filename=original_filename or "generated.png",
                    source_type="generated",
                    provider=job_payload["provider"],
                    model=job_payload["model"],
                    prompt=job_payload["prompt"],
                    generation_job_id=job_payload["id"],
                )
            )
        except Exception as exc:  # pragma: no cover - defensive
            warnings.append(str(exc))

    if images:
        if provider_job.error:
            warnings.append(str(provider_job.error))
        job_payload["status"] = "completed"
        job_payload["error"] = None
        job_payload["result"] = {"images": images}
    else:
        job_payload["status"] = "failed"
        job_payload["error"] = provider_job.error or (warnings[0] if warnings else "Image generation returned no usable outputs.")
        job_payload["result"] = {"images": []}

    job_payload["warnings"] = warnings[:6]
    job_payload["updated_at"] = _utc_now()
    _save_job(job_payload["id"], job_payload)
    return job_payload


def _refresh_generated_image_job(job_payload: Dict[str, Any]) -> Dict[str, Any]:
    if job_payload.get("type") != "generated_image" or job_payload.get("status") != "processing":
        return job_payload

    provider_job_id = str(job_payload.get("provider_job_id") or "").strip()
    if not provider_job_id:
        return job_payload

    try:
        adapter = get_provider_registry().get_image_adapter(str(job_payload["provider"]))
        provider_job = adapter.poll_job(provider_job_id)
    except Exception as exc:
        job_payload["status"] = "failed"
        job_payload["error"] = str(exc)
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    job_payload["provider_job_id"] = provider_job.provider_job_id or provider_job_id
    if provider_job.status == "processing":
        job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    if provider_job.status == "failed":
        job_payload["status"] = "failed"
        job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]
        job_payload["error"] = provider_job.error or "Provider generation failed."
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    return _finalize_generated_image_job(job_payload, provider_job)


def _environment_storage_paths(scene_id: str) -> Dict[str, str]:
    root = f"scenes/{scene_id}/environment"
    return {
        "root": root,
        "splats": f"{root}/splats.ply",
        "cameras": f"{root}/cameras.json",
        "metadata": f"{root}/metadata.json",
        "holdout_report": f"{root}/holdout-report.json",
        "capture_scorecard": f"{root}/capture-scorecard.json",
        "benchmark_report": f"{root}/benchmark-report.json",
    }


def _write_environment_support_files(scene_id: str, metadata: Dict[str, Any]) -> None:
    paths = _environment_storage_paths(scene_id)
    support_payloads = {
        paths["capture_scorecard"]: metadata.get("capture", {}),
        paths["holdout_report"]: metadata.get("holdout", {}),
        paths["benchmark_report"]: metadata.get("comparison", metadata.get("benchmark_status", {})),
    }
    for path, payload in support_payloads.items():
        if STORAGE.exists(path):
            continue
        _write_json(path, payload)


def _default_environment_metadata(scene_id: str) -> Dict[str, Any]:
    return {
        "generator": "gauset-mvp-backend",
        "lane": "preview",
        "truth_label": "Image-to-Splat Preview",
        "quality_tier": "single_image_lrm_preview",
        "faithfulness": "approximate",
        "execution_mode": "real",
        "reconstruction_backend": "ml_sharp_gpu_worker",
        "training_backend": "ml_sharp_gpu_worker",
        "rendering": {
            "viewer_renderer": "sharp_gaussian_direct",
            "source_format": "sharp_ply_dense_preview",
            "viewer_source": f"/storage/scenes/{scene_id}/environment",
        },
    }


def _normalize_environment_metadata(scene_id: str) -> Dict[str, Any]:
    paths = _environment_storage_paths(scene_id)
    if STORAGE.exists(paths["metadata"]):
        raw_metadata = _read_json(paths["metadata"])
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
    else:
        metadata = {}

    defaults = _default_environment_metadata(scene_id)
    rendering = metadata.get("rendering") if isinstance(metadata.get("rendering"), dict) else {}
    metadata = {
        **defaults,
        **metadata,
        "rendering": {
            **defaults["rendering"],
            **rendering,
            "viewer_source": f"/storage/scenes/{scene_id}/environment",
        },
    }
    _write_json(paths["metadata"], metadata)
    _write_environment_support_files(scene_id, metadata)
    return metadata


def _finalize_environment_job(job_payload: Dict[str, Any], provider_job: Any) -> Dict[str, Any]:
    warnings = [str(warning) for warning in job_payload.get("warnings", []) if str(warning).strip()]
    warnings.extend(str(warning) for warning in getattr(provider_job, "warnings", []) if str(warning).strip())

    scene_id = str(job_payload.get("id") or "").strip()
    paths = _environment_storage_paths(scene_id)
    stored_keys: set[str] = set()

    for key, artifact in (getattr(provider_job, "outputs", {}) or {}).items():
        if key not in paths:
            continue
        try:
            content_bytes, _, _ = materialize_environment_artifact(artifact)
            STORAGE.write_bytes(paths[key], content_bytes)
            stored_keys.add(key)
        except Exception as exc:  # pragma: no cover - defensive
            warnings.append(f"{key}: {exc}")

    if "splats" not in stored_keys and not STORAGE.exists(paths["splats"]):
        job_payload["status"] = "failed"
        job_payload["error"] = provider_job.error or "Image-to-splat worker finished without a splat artifact."
        job_payload["warnings"] = warnings[:6]
        job_payload["updated_at"] = _utc_now()
        _save_job(scene_id, job_payload)
        return job_payload

    if "cameras" not in stored_keys and not STORAGE.exists(paths["cameras"]):
        STORAGE.write_bytes(paths["cameras"], b"[]\n")

    source_provenance = job_payload.get("source_provenance")
    if not isinstance(source_provenance, dict):
        source_provenance = _build_source_provenance(
            {
                "image_id": job_payload.get("image_id", ""),
                "source_type": "upload",
                "filename": "",
                "source_id": job_payload.get("image_id", ""),
            }
        )

    world_source = job_payload.get("world_source")
    if not isinstance(world_source, dict):
        world_source = _build_world_source(
            lane="preview",
            ingest_channel="generate_environment",
            input_strategy="1 photo",
            primary_source=source_provenance,
            upstream_sources=[source_provenance],
            frame_count=1,
        )

    lane_metadata = job_payload.get("lane_metadata")
    if not isinstance(lane_metadata, dict):
        lane_metadata = _preview_lane_metadata()
    else:
        lane_metadata = _preview_lane_metadata()

    handoff_manifest = job_payload.get("handoff_manifest")
    if not isinstance(handoff_manifest, dict):
        handoff_manifest = _preview_handoff_manifest(world_source)
    else:
        handoff_manifest = _preview_handoff_manifest(world_source)

    job_payload["source_type"] = str(job_payload.get("source_type") or source_provenance.get("source_type") or "upload")
    job_payload["source_provenance"] = source_provenance
    job_payload["world_source"] = world_source
    job_payload["lane_metadata"] = lane_metadata
    job_payload["handoff_manifest"] = handoff_manifest
    job_payload["ingest_record"] = _build_ingest_record(
        ingest_id=f"ingest_{scene_id}",
        source_kind=_normalize_ingest_source_kind(world_source.get("kind") or "upload"),
        source_label=str(job_payload.get("filename") or job_payload.get("image_id") or scene_id).strip() or scene_id,
        vendor=_text_or_none(job_payload.get("provider")),
        source_uri=str(job_payload.get("url") or "").strip() or None,
        origin=_text_or_none(source_provenance.get("origin")) or _text_or_none(world_source.get("origin")),
        ingest_channel="generate_environment",
        media_type="application/x-gauset-scene-document+json",
        scene_id=scene_id,
        lane="preview",
        truth_label="Preview world accepted",
        lane_truth=str(lane_metadata.get("lane_truth") or "single_image_lrm_preview"),
        blockers=list(lane_metadata.get("blockers") or []),
        production_readiness="review_only",
        files=_scene_urls(scene_id),
        entrypoints={
            "workspace": f"/mvp?scene={scene_id}",
            "review": f"/mvp/review?scene={scene_id}",
            "metadata": _scene_urls(scene_id).get("metadata"),
        },
        save_ready=True,
        review_ready=True,
        share_ready=False,
    )

    metadata = _normalize_environment_metadata(scene_id)
    metadata["source_provenance"] = source_provenance
    metadata["world_source"] = world_source
    metadata["lane_metadata"] = lane_metadata
    metadata["handoff_manifest"] = handoff_manifest
    metadata["ingest_record"] = job_payload["ingest_record"]
    _write_json(paths["metadata"], metadata)
    _write_environment_support_files(scene_id, metadata)
    result = {
        "scene_id": scene_id,
        "remote_scene_id": getattr(provider_job, "scene_id", None),
        "environment_dir": paths["root"],
        "files": {
            "splats": paths["splats"],
            "cameras": paths["cameras"],
            "metadata": paths["metadata"],
            "holdout_report": paths["holdout_report"],
            "capture_scorecard": paths["capture_scorecard"],
            "benchmark_report": paths["benchmark_report"],
        },
        "urls": _scene_urls(scene_id),
        "source_format": metadata.get("rendering", {}).get("source_format", "sharp_ply_dense_preview"),
        "viewer_renderer": metadata.get("rendering", {}).get("viewer_renderer", "sharp_gaussian_direct"),
        "training_backend": metadata.get("training_backend", "ml_sharp_gpu_worker"),
        "provider": job_payload.get("environment_provider"),
        "source_type": job_payload.get("source_type"),
        "source_provenance": source_provenance,
        "world_source": world_source,
        "lane_metadata": lane_metadata,
        "handoff_manifest": handoff_manifest,
        "ingest_record": job_payload.get("ingest_record"),
    }
    job_payload["status"] = "completed"
    job_payload["error"] = None
    job_payload["result"] = result
    job_payload["warnings"] = warnings[:6]
    job_payload["updated_at"] = _utc_now()
    _save_job(scene_id, job_payload)
    return job_payload


def _refresh_environment_job(job_payload: Dict[str, Any]) -> Dict[str, Any]:
    if job_payload.get("type") != "environment" or job_payload.get("status") != "processing":
        return job_payload

    provider_job_id = str(job_payload.get("provider_job_id") or "").strip()
    if not provider_job_id:
        return job_payload

    try:
        bridge = get_environment_bridge_registry().get_bridge()
        provider_job = bridge.poll_job(provider_job_id)
    except Exception as exc:
        job_payload["status"] = "failed"
        job_payload["error"] = str(exc)
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    job_payload["provider_job_id"] = provider_job.provider_job_id or provider_job_id
    job_payload["remote_scene_id"] = provider_job.scene_id or job_payload.get("remote_scene_id")
    if provider_job.status == "processing":
        job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    if provider_job.status == "failed":
        job_payload["status"] = "failed"
        job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]
        job_payload["error"] = provider_job.error or "Image-to-splat worker failed."
        job_payload["updated_at"] = _utc_now()
        _save_job(job_payload["id"], job_payload)
        return job_payload

    return _finalize_environment_job(job_payload, provider_job)


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


class RemoteUploadIngestRequest(BaseModel):
    url: str
    original_filename: str
    content_type: str | None = None
    size_bytes: int | None = None


class CaptureSessionCreateRequest(BaseModel):
    target_images: int = CAPTURE_RECOMMENDED_IMAGES


class CaptureSessionFramesRequest(BaseModel):
    image_ids: List[str]


class SceneSaveRequest(BaseModel):
    scene_id: str
    scene_graph: Dict[str, Any] | None = None
    scene_document: Dict[str, Any] | None = None
    source: str = "manual"


def _normalize_scene_save_payload(
    *,
    scene_graph: Dict[str, Any] | None,
    scene_document: Dict[str, Any] | None,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    raw_scene_document = scene_document if isinstance(scene_document, dict) else None
    raw_scene_graph = scene_graph if isinstance(scene_graph, dict) else None
    embedded_scene_document = _extract_embedded_scene_document(raw_scene_graph)

    if raw_scene_document is not None:
        canonical_scene = raw_scene_document if raw_scene_document.get("version") == 2 else _scene_graph_to_canonical_scene_document(raw_scene_document)
        compatibility_scene_graph = _scene_document_to_compatibility_scene_graph(canonical_scene)
        if raw_scene_graph is not None:
            if embedded_scene_document is not None and embedded_scene_document != canonical_scene:
                raise _scene_graph_mismatch_error()
            if _normalize_scene_graph_for_compare(raw_scene_graph) != _normalize_scene_graph_for_compare(compatibility_scene_graph):
                raise _scene_graph_mismatch_error()
        return canonical_scene, compatibility_scene_graph

    canonical_scene = embedded_scene_document or _scene_graph_to_canonical_scene_document(raw_scene_graph)
    compatibility_scene_graph = _scene_document_to_compatibility_scene_graph(canonical_scene)
    return canonical_scene, compatibility_scene_graph


def _build_generation_provenance_payload(
    *,
    upload_record: Dict[str, Any],
    lane: str,
    ingest_channel: str,
    input_strategy: str,
) -> Dict[str, Any]:
    source_provenance = upload_record.get("source_provenance")
    if not isinstance(source_provenance, dict):
        source_provenance = _build_source_provenance(upload_record)

    world_source = _build_world_source(
        lane=lane,
        ingest_channel=ingest_channel,
        input_strategy=input_strategy,
        primary_source=source_provenance,
        upstream_sources=[source_provenance],
    )
    lane_truth = f"single_image_{lane}"
    if lane == "preview":
        lane_truth = "single_image_lrm_preview"

    return {
        "source_type": upload_record.get("source_type") or "upload",
        "source_provenance": source_provenance,
        "world_source": world_source,
        "lane_metadata": _build_lane_metadata(
            lane=lane,
            lane_truth=lane_truth,
            available=True,
            readiness="processing",
            summary=f"Single-item {lane} job is processing.",
            blockers=["Job still processing."],
        ),
        "handoff_manifest": _build_handoff_manifest(
            lane=lane,
            world_source=world_source,
            ready=False,
            summary=f"{lane.title()} handoff remains blocked until processing completes.",
            blockers=["Processing is still in progress."],
        ),
    }


class VersionCommentRequest(BaseModel):
    author: str = "Reviewer"
    body: str
    anchor: str = "scene"


class SceneReviewRequest(BaseModel):
    metadata: Dict[str, str]
    approval_state: str
    updated_by: str = "Reviewer"
    note: str = ""
    issues: List[Dict[str, Any]] = []


def _capture_guidance() -> List[str]:
    return [
        "Walk an arc around the subject or environment instead of shooting from one locked view.",
        "Keep 60-80% overlap between neighboring frames.",
        "Avoid motion blur, mirrors, and fast-moving people crossing the scene.",
        "Collect a full orbit or forward path with some height variation before reconstructing.",
    ]


def _clamp_target_images(value: int) -> int:
    return max(CAPTURE_MIN_IMAGES, min(CAPTURE_MAX_IMAGES, int(value)))


def _coverage_percent(frame_count: int, target_images: int) -> int:
    if target_images <= 0:
        return 0
    return min(100, round((frame_count / target_images) * 100))


def _build_capture_frame_record(image_id: str) -> Dict[str, Any]:
    upload_record = _load_upload_record(image_id)
    storage_path = str(upload_record["storage_path"])
    filename = upload_record.get("stored_filename") or upload_record.get("filename") or Path(storage_path).name
    source_provenance = upload_record.get("source_provenance")
    if not isinstance(source_provenance, dict):
        source_provenance = _build_source_provenance(upload_record)
    return {
        "image_id": image_id,
        "filename": filename,
        "url": upload_record.get("url") or f"/storage/{storage_path}",
        "added_at": _utc_now(),
        "source_provenance": source_provenance,
    }


def _hash_uploaded_image(image_id: str) -> str:
    upload_record = _load_upload_record(image_id)
    return hashlib.sha1(STORAGE.read_bytes(str(upload_record["storage_path"]))).hexdigest()


def _capture_session_payload(session: Dict[str, Any]) -> Dict[str, Any]:
    frames = session.get("frames", [])
    frame_hashes = [
        _hash_uploaded_image(str(frame["image_id"]))
        for frame in frames
        if isinstance(frame, dict) and str(frame.get("image_id") or "").strip()
    ]
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
    recommended_images = _clamp_target_images(
        int(session.get("target_images") or session.get("recommended_images") or CAPTURE_RECOMMENDED_IMAGES)
    )
    coverage_percent = _coverage_percent(frame_count, recommended_images)

    session_id = str(session.get("session_id") or f"capture_{str(uuid.uuid4())[:8]}")
    upstream_sources: List[Dict[str, Any]] = [
        frame["source_provenance"]
        for frame in frames
        if isinstance(frame, dict)
        and isinstance(frame.get("source_provenance"), dict)
        and frame.get("source_provenance")
    ]
    source_provenance = session.get("source_provenance")
    if not isinstance(source_provenance, dict):
        source_provenance = upstream_sources[0] if upstream_sources else None

    world_source = session.get("world_source")
    if not isinstance(world_source, dict):
        world_source = (
            _build_world_source(
                lane="reconstruction",
                ingest_channel="capture_session",
                input_strategy="8-32 overlapping photos or short orbit video",
                primary_source=source_provenance or {"source_type": "upload", "source_id": "", "filename": ""},
                upstream_sources=upstream_sources,
                session_id=session_id,
                frame_count=frame_count,
            )
            if source_provenance or upstream_sources
            else None
        )
    else:
        world_source = world_source if world_source else None

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
    )
    handoff_manifest = _build_handoff_manifest(
        lane="reconstruction",
        world_source=world_source
        or _build_world_source(
            lane="reconstruction",
            ingest_channel="capture_session",
            input_strategy="8-32 overlapping photos or short orbit video",
            primary_source=source_provenance or {"source_type": "upload", "source_id": "", "filename": ""},
            upstream_sources=upstream_sources,
            session_id=session_id,
            frame_count=frame_count,
        ),
        ready=False,
        summary="Capture session truth is explicit, but downstream handoff remains blocked until the dedicated reconstruction worker exists.",
        blockers=list(lane_metadata.get("blockers") or []),
    )
    ingest_record = _build_ingest_record(
        ingest_id=f"ingest_{session_id}",
        source_kind="capture_session",
        source_label=f"Capture session {session_id}",
        vendor=None,
        source_uri=None,
        origin=_text_or_none(world_source.get("origin")) if isinstance(world_source, dict) else None,
        ingest_channel="capture_session",
        media_type="application/x-gauset-capture-session+json",
        scene_id=None,
        lane="reconstruction",
        truth_label="Capture session pending reconstruction worker",
        lane_truth="gpu_worker_not_connected",
        blockers=list(lane_metadata.get("blockers") or []),
        production_readiness="blocked",
        files={"capture_session": session_id},
        entrypoints={"workspace": "/mvp", "review": "/mvp/review"},
        save_ready=False,
        review_ready=False,
        share_ready=False,
    )

    payload = {
        "session_id": session_id,
        "lane": "reconstruction",
        "lane_truth": "gpu_worker_not_connected",
        "status": status,
        "created_at": str(session.get("created_at") or _utc_now()),
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
        "source_provenance": source_provenance,
        "world_source": world_source,
        "lane_metadata": lane_metadata,
        "handoff_manifest": handoff_manifest,
        "ingest_record": ingest_record,
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
            "recommended_next_actions": (
                [
                    "Capture set passes local QC, but the dedicated multi-view worker is not connected yet.",
                    "Keep collecting stronger overlap for a future reconstruction pass.",
                ]
                if ready
                else ["Collect more overlapping views."]
            ),
            "reconstruction_gate": {
                "allowed": ready,
                "label": "ready" if ready else "blocked" if blockers else "building",
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


def _load_capture_session(session_id: str) -> Dict[str, Any]:
    path = _capture_session_path(session_id)
    if not STORAGE.exists(path):
        raise HTTPException(status_code=404, detail="Capture session not found")
    payload = _read_json(path)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Capture session payload is invalid")
    return _capture_session_payload(payload)


def _save_capture_session(payload: Dict[str, Any]) -> None:
    _write_json(_capture_session_path(payload["session_id"]), payload)


app = FastAPI(title="Gauset MVP Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StorageBackendError)
async def handle_storage_backend_error(request: Request, exc: StorageBackendError) -> Response:
    scope_path = str(request.scope.get("path") or "")
    if scope_path.startswith("/storage/"):
        return Response(content=exc.detail, media_type="text/plain", status_code=exc.status_code)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.middleware("http")
async def strip_vercel_api_prefix(request, call_next):
    path = request.scope.get("path", "")
    if path == "/api":
        request.scope["path"] = "/"
    elif path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
    return await call_next(request)


@app.get("/")
async def root() -> Dict[str, str]:
    return {"service": "gauset-mvp-backend", "status": "ok"}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/deployment")
async def deployment() -> Dict[str, Any]:
    return {"status": "ok", "fingerprint": _deployment_fingerprint()}


@app.get("/setup/status")
async def setup_status() -> Dict[str, Any]:
    provider_summary = get_provider_registry().image_provider_summary()
    environment_bridge = get_environment_bridge_registry().status_payload()
    bridge_available = bool(environment_bridge.get("available"))
    public_write_safe = _public_storage_write_safe()
    preview_available = public_write_safe
    asset_available = public_write_safe
    preview_summary = (
        "Generate a dense single-image Gaussian preview through the ML-Sharp GPU worker."
        if public_write_safe and bridge_available
        else "Generate a single-photo Gaussian preview for nearby camera moves."
    )
    if not public_write_safe:
        preview_summary = "Preview writes are disabled until durable blob storage is operational for this public deployment."
    preview_truth = (
        "This output is produced by a single-image Gaussian model through a dedicated GPU worker. Hidden geometry can still be hallucinated."
        if public_write_safe and bridge_available
        else "This output is a synthesized preview, not a faithful multi-view reconstruction."
    )
    asset_summary = "Generate a hero prop mesh from one reference image."
    asset_truth = "This lane is object-focused generation, not environment reconstruction."
    if not public_write_safe:
        asset_summary = "Asset extraction is disabled until durable blob storage is operational for this public deployment."
        asset_truth = "This lane is safety-disabled because generated files cannot persist durably in the current public storage mode."
    backend_truth = (
        "This deployment dispatches single-image preview jobs to a dedicated ML-Sharp GPU worker and stores the resulting Gaussian splats in durable public blob storage."
        if public_write_safe and bridge_available
        else "This deployment provides single-photo preview and asset generation. Production-grade multi-view Gaussian reconstruction requires a separate GPU worker."
    )
    if not public_write_safe:
        backend_truth = _public_storage_block_reason()
    return {
        "status": "ok",
        "python_version": os.sys.version.split()[0],
        "backend": {
            "label": "Production Preview Backend",
            "kind": (
                "image-to-splat-bridge-and-asset"
                if public_write_safe and bridge_available
                else "single-image-preview-and-asset"
                if public_write_safe
                else "public-preview-read-only-safety-mode"
            ),
            "deployment": "vercel",
            "truth": backend_truth,
            "lane_truth": (
                "public_single_image_lrm_and_asset_only"
                if public_write_safe and bridge_available
                else "public_preview_and_asset_only"
                if public_write_safe
                else "public_write_lanes_disabled_unsafe_storage"
            ),
        },
        "lane_truth": {
            "preview": "single_image_lrm_preview" if public_write_safe and bridge_available else "preview_only_single_image",
            "reconstruction": "gpu_worker_not_connected",
            "asset": "single_image_asset",
        },
        "reconstruction_backend": {
            "name": "gpu_worker_missing",
            "kind": "unavailable_in_public_preview_backend",
            "gpu_worker_connected": False,
            "native_gaussian_training": False,
            "world_class_ready": False,
        },
        "benchmark_status": {
            "status": "not_benchmarked",
            "locked_suite": "real_space_world_class_v1",
            "summary": "The public preview deployment is not benchmarked as a real-space reconstruction system.",
        },
        "release_gates": {
            "truthful_preview_lane": preview_available,
            "gpu_reconstruction_connected": False,
            "native_gaussian_training": False,
            "holdout_metrics": False,
            "market_benchmarking": False,
            "durable_public_storage": public_write_safe,
        },
        "capabilities": {
            "preview": {
                "available": preview_available,
                "label": "Image-to-Splat Preview" if public_write_safe and bridge_available else "Instant Preview",
                "summary": preview_summary,
                "truth": preview_truth,
                "lane_truth": "single_image_lrm_preview" if public_write_safe and bridge_available else "preview_only_single_image",
                "input_strategy": "1 photo",
                "min_images": 1,
                "recommended_images": 1,
            },
            "reconstruction": {
                "available": False,
                "label": "Production Reconstruction",
                "summary": "Collect a multi-view capture set for real 3D Gaussian reconstruction.",
                "truth": "The public backend can collect capture frames, but it does not run pose estimation or Gaussian optimization yet.",
                "lane_truth": "gpu_worker_not_connected",
                "input_strategy": "8-32 overlapping photos or short orbit video",
                "min_images": CAPTURE_MIN_IMAGES,
                "recommended_images": CAPTURE_RECOMMENDED_IMAGES,
            },
            "asset": {
                "available": asset_available,
                "label": "Single-Image Asset",
                "summary": asset_summary,
                "truth": asset_truth,
                "lane_truth": "single_image_asset",
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
        "storage_mode": STORAGE_STATUS["mode"],
        "storage": _storage_status_payload(),
        "generator": {
            "environment": "ml_sharp_gpu_worker" if bridge_available else "gauset-depth-synth-v1",
            "asset": "gauset-relief-mesh-v1",
        },
        "directories": {
            "uploads": True,
            "assets": True,
            "scenes": True,
        },
        "models": {
            "preview_generator": "ml_sharp_gpu_worker" if bridge_available else "gauset-depth-synth-v1",
            "asset_generator": "gauset-relief-mesh-v1",
            "ml_sharp": bridge_available,
            "triposr": False,
        },
        "torch": {
            "installed": True,
            "version": "service",
            "mps_available": False,
        },
        "image_to_splat_bridge": environment_bridge,
        "provider_generation": provider_summary,
    }


@app.get("/providers")
async def list_generation_providers() -> Dict[str, Any]:
    registry = get_provider_registry()
    return {
        "enabled": registry.feature_enabled,
        "summary": registry.image_provider_summary(),
        "providers": [entry.to_payload() for entry in registry.list_catalog()],
    }


@app.post("/upload")
async def upload_image(request: Request, file: UploadFile = File(...)) -> Dict[str, Any]:
    _require_public_write_storage()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename in upload")

    grant_headers = None
    if not _request_has_worker_auth(request):
        grant_headers = _validate_browser_upload_grant_headers(
            request,
            filename=file.filename,
            content_type=(file.content_type or "application/octet-stream"),
        )
        if not grant_headers:
            raise HTTPException(status_code=401, detail="Unauthorized worker request")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if grant_headers and len(contents) != grant_headers["expected_size"]:
        raise HTTPException(status_code=400, detail="Uploaded file size did not match the signed upload grant")

    return _store_upload_bytes(
        contents=contents,
        original_filename=file.filename,
        source_type="upload",
    )


@app.post("/upload/ingest")
async def ingest_uploaded_blob(request: RemoteUploadIngestRequest) -> Dict[str, Any]:
    _require_public_write_storage()
    original_filename = request.original_filename.strip()
    if not original_filename:
        raise HTTPException(status_code=400, detail="Missing filename in uploaded still ingest")

    return _store_remote_upload(
        url=request.url,
        original_filename=original_filename,
        content_type=request.content_type,
        size_bytes=request.size_bytes,
    )


@app.post("/generate/image")
async def generate_image(request: GenerateImageRequest, http_request: Request) -> Dict[str, Any]:
    _require_public_write_storage()
    job_context = _job_context_from_request(http_request)
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    registry = get_provider_registry()
    try:
        adapter = registry.get_image_adapter(request.provider)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    requested_model = request.model.strip() if isinstance(request.model, str) else ""
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

    model_supports_references = selected_model.supports_references if selected_model is not None else adapter.supports_references
    if request.reference_image_ids and not model_supports_references:
        raise HTTPException(status_code=400, detail=f"{adapter.label} does not support reference images in this lane.")

    negative_prompt = request.negative_prompt.strip() if request.negative_prompt else None
    if negative_prompt and selected_model is not None and not selected_model.supports_negative_prompt:
        raise HTTPException(
            status_code=400,
            detail=f"{selected_model.label} does not support negative prompts in this lane.",
        )

    aspect_ratio = request.aspect_ratio.strip() if request.aspect_ratio else None
    if aspect_ratio and adapter.supported_aspect_ratios and aspect_ratio not in adapter.supported_aspect_ratios:
        raise HTTPException(
            status_code=400,
            detail=f"{adapter.label} does not support aspect ratio {aspect_ratio}.",
        )

    if request.reference_image_ids and adapter.max_reference_images and len(request.reference_image_ids) > adapter.max_reference_images:
        raise HTTPException(
            status_code=400,
            detail=f"{adapter.label} accepts up to {adapter.max_reference_images} reference images.",
        )

    count = max(1, min(int(request.count or 1), max(1, int(adapter.max_outputs or 1))))
    if selected_model is not None and not selected_model.supports_multi_output:
        count = 1
    elif not adapter.supports_multi_output:
        count = 1

    shared_request = ProviderImageRequest(
        provider=request.provider,
        model=resolved_model,
        prompt=prompt,
        negative_prompt=negative_prompt,
        aspect_ratio=aspect_ratio,
        count=count,
        seed=request.seed,
        reference_images=_load_reference_images(request.reference_image_ids),
    )

    job_id = f"genimg_{uuid.uuid4().hex[:8]}"
    job_payload = {
        "id": job_id,
        "type": "generated_image",
        "status": "processing",
        **job_context,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
        "provider": request.provider,
        "model": shared_request.model,
        "provider_job_id": None,
        "source_type": "generated",
        "warnings": [],
        "prompt": prompt,
        "input": {
            "negative_prompt": shared_request.negative_prompt,
            "aspect_ratio": shared_request.aspect_ratio,
            "count": shared_request.count,
            "seed": shared_request.seed,
            "reference_image_ids": request.reference_image_ids,
        },
    }
    _save_job(job_id, job_payload)

    try:
        provider_job = adapter.submit_image_job(shared_request)
        job_payload["provider_job_id"] = provider_job.provider_job_id
        job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]
        if provider_job.status == "completed":
            _finalize_generated_image_job(job_payload, provider_job)
        elif provider_job.status == "failed":
            job_payload["status"] = "failed"
            job_payload["error"] = provider_job.error or "Provider generation failed."
            job_payload["updated_at"] = _utc_now()
            _save_job(job_id, job_payload)
        else:
            job_payload["updated_at"] = _utc_now()
            _save_job(job_id, job_payload)
    except Exception as exc:  # pragma: no cover - provider dependent
        job_payload["status"] = "failed"
        job_payload["error"] = str(exc)
        job_payload["updated_at"] = _utc_now()
        _save_job(job_id, job_payload)

    return {
        "job_id": job_id,
        "status": "processing",
        "provider": request.provider,
        "model": shared_request.model,
    }


@app.post("/generate/environment")
async def generate_environment(request: GenerateRequest, http_request: Request) -> Dict[str, Any]:
    _require_public_write_storage()
    job_context = _job_context_from_request(http_request)
    scene_id = f"scene_{str(uuid.uuid4())[:8]}"
    image_record = None
    pending_ingest_record = _build_ingest_record(
        ingest_id=f"ingest_{scene_id}",
        source_kind="upload",
        source_label=str(request.image_id).strip() or scene_id,
        vendor=None,
        source_uri=None,
        origin=None,
        ingest_channel="generate_environment",
        media_type="application/x-gauset-scene-document+json",
        scene_id=scene_id,
        lane="preview",
        truth_label="Preview world is processing",
        lane_truth="single_image_preview_processing",
        blockers=["Job still processing."],
        production_readiness="blocked",
        files=_scene_urls(scene_id),
        entrypoints={
            "workspace": f"/mvp?scene={scene_id}",
            "review": f"/mvp/review?scene={scene_id}",
            "metadata": _scene_urls(scene_id).get("metadata"),
        },
        save_ready=False,
        review_ready=False,
        share_ready=False,
    )
    job_payload = {
        "id": scene_id,
        "type": "environment",
        "status": "processing",
        "image_id": request.image_id,
        **job_context,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
        "environment_provider": None,
        "provider_job_id": None,
        "remote_scene_id": None,
        "warnings": [],
        "ingest_record": pending_ingest_record,
    }
    image_record = None
    _save_job(scene_id, job_payload)

    try:
        upload_record = _load_upload_record(request.image_id)
        image_record = upload_record
        provenance_payload = _build_generation_provenance_payload(
            upload_record=upload_record,
            lane="preview",
            ingest_channel="generate_environment",
            input_strategy="1 photo",
        )
        job_payload.update(provenance_payload)
        pending_ingest_record = _build_ingest_record(
            ingest_id=f"ingest_{scene_id}",
            source_kind=str(job_payload["world_source"].get("kind") or "upload").strip() or "upload",
            source_label=str(upload_record.get("stored_filename") or upload_record.get("filename") or scene_id).strip() or scene_id,
            vendor=_text_or_none(upload_record.get("provider")),
            source_uri=str(upload_record.get("url") or f"/storage/{upload_record.get('storage_path')}").strip() or None,
            origin=_text_or_none(job_payload["source_provenance"].get("origin")) or _text_or_none(job_payload["world_source"].get("origin")),
            ingest_channel="generate_environment",
            media_type="application/x-gauset-scene-document+json",
            scene_id=scene_id,
            lane="preview",
            truth_label="Preview world is processing",
            lane_truth="single_image_preview_processing",
            blockers=["Job still processing."],
            production_readiness="blocked",
            files=_scene_urls(scene_id),
            entrypoints={
                "workspace": f"/mvp?scene={scene_id}",
                "review": f"/mvp/review?scene={scene_id}",
                "metadata": _scene_urls(scene_id).get("metadata"),
            },
            save_ready=False,
            review_ready=False,
            share_ready=False,
        )
        job_payload["ingest_record"] = pending_ingest_record
        image_path = upload_record["storage_path"]
        image_bytes = STORAGE.read_bytes(image_path)
        bridge_status = get_environment_bridge_registry().status_payload()
        if bridge_status.get("available"):
            bridge = get_environment_bridge_registry().get_bridge()
            provider_job = bridge.submit_environment_job(
                EnvironmentGenerationRequest(
                    filename=upload_record.get("stored_filename") or upload_record["filename"],
                    image_bytes=image_bytes,
                    image_id=request.image_id,
                )
            )
            job_payload["environment_provider"] = bridge.bridge_id
            job_payload["provider_job_id"] = provider_job.provider_job_id
            job_payload["remote_scene_id"] = provider_job.scene_id
            job_payload["warnings"] = [str(warning) for warning in provider_job.warnings][:6]

            if provider_job.status == "completed":
                _finalize_environment_job(job_payload, bridge.poll_job(provider_job.provider_job_id))
            elif provider_job.status == "failed":
                job_payload["status"] = "failed"
                job_payload["error"] = provider_job.error or "Image-to-splat worker failed."
                job_payload["updated_at"] = _utc_now()
                _save_job(scene_id, job_payload)
            else:
                job_payload["updated_at"] = _utc_now()
                _save_job(scene_id, job_payload)
        else:
            payloads = _environment_payload(image_bytes, upload_record["filename"])
            for name, blob in payloads.items():
                STORAGE.write_bytes(f"scenes/{scene_id}/environment/{name}", blob)
            metadata = _normalize_environment_metadata(scene_id)
            source_provenance = job_payload.get("source_provenance")
            if not isinstance(source_provenance, dict):
                source_provenance = _build_source_provenance(upload_record)
            world_source = job_payload.get("world_source")
            if not isinstance(world_source, dict):
                world_source = _build_world_source(
                    lane="preview",
                    ingest_channel="generate_environment",
                    input_strategy="1 photo",
                    primary_source=source_provenance,
                    upstream_sources=[source_provenance],
                )
            lane_metadata = job_payload.get("lane_metadata")
            if not isinstance(lane_metadata, dict):
                lane_metadata = _preview_lane_metadata()
            else:
                lane_metadata = _preview_lane_metadata()
            handoff_manifest = job_payload.get("handoff_manifest")
            if not isinstance(handoff_manifest, dict):
                handoff_manifest = _preview_handoff_manifest(world_source)
            else:
                handoff_manifest = _preview_handoff_manifest(world_source)

            result = {
                "scene_id": scene_id,
                "environment_dir": f"scenes/{scene_id}/environment",
                "files": {
                    "splats": f"scenes/{scene_id}/environment/splats.ply",
                    "cameras": f"scenes/{scene_id}/environment/cameras.json",
                    "metadata": f"scenes/{scene_id}/environment/metadata.json",
                    "holdout_report": f"scenes/{scene_id}/environment/holdout-report.json",
                    "capture_scorecard": f"scenes/{scene_id}/environment/capture-scorecard.json",
                    "benchmark_report": f"scenes/{scene_id}/environment/benchmark-report.json",
                },
                "urls": _scene_urls(scene_id),
                "source_type": job_payload.get("source_type") or upload_record.get("source_type") or "upload",
                "source_provenance": source_provenance,
                "world_source": world_source,
                "lane_metadata": lane_metadata,
                "handoff_manifest": handoff_manifest,
                "ingest_record": _build_ingest_record(
                    ingest_id=f"ingest_{scene_id}",
                    source_kind=str(world_source.get("kind") or "upload").strip() or "upload",
                    source_label=str(upload_record.get("stored_filename") or upload_record.get("filename") or scene_id).strip() or scene_id,
                    vendor=_text_or_none(upload_record.get("provider")),
                    source_uri=str(upload_record.get("url") or f"/storage/{upload_record.get('storage_path')}").strip() or None,
                    origin=_text_or_none(source_provenance.get("origin")) or _text_or_none(world_source.get("origin")),
                    ingest_channel="generate_environment",
                    media_type="application/x-gauset-scene-document+json",
                    scene_id=scene_id,
                    lane="preview",
                    truth_label="Preview world accepted",
                    lane_truth=str(lane_metadata.get("lane_truth") or "single_image_lrm_preview"),
                    blockers=list(lane_metadata.get("blockers") or []),
                    production_readiness="review_only",
                    files=_scene_urls(scene_id),
                    entrypoints={
                        "workspace": f"/mvp?scene={scene_id}",
                        "review": f"/mvp/review?scene={scene_id}",
                        "metadata": _scene_urls(scene_id).get("metadata"),
                    },
                    save_ready=True,
                    review_ready=True,
                    share_ready=False,
                ),
                "source_format": metadata.get("rendering", {}).get("source_format", "sharp_ply"),
                "viewer_renderer": metadata.get("rendering", {}).get("viewer_renderer", "sharp_gaussian_direct"),
                "training_backend": metadata.get("training_backend", "single_image_depth_preview"),
            }
            metadata["source_provenance"] = source_provenance
            metadata["world_source"] = world_source
            metadata["lane_metadata"] = lane_metadata
            metadata["handoff_manifest"] = handoff_manifest
            metadata["ingest_record"] = result["ingest_record"]
            paths = _environment_storage_paths(scene_id)
            _write_json(paths["metadata"], metadata)
            _write_environment_support_files(scene_id, metadata)
            job_payload["status"] = "completed"
            job_payload["updated_at"] = _utc_now()
            job_payload["source_type"] = (
                job_payload.get("source_type") or upload_record.get("source_type") or "upload"
            )
            job_payload["source_provenance"] = source_provenance
            job_payload["world_source"] = world_source
            job_payload["lane_metadata"] = lane_metadata
            job_payload["handoff_manifest"] = handoff_manifest
            job_payload["ingest_record"] = result["ingest_record"]
            job_payload["result"] = result
            _save_job(scene_id, job_payload)
    except ProviderError as exc:
        print(f"[environment] provider failed for {request.image_id}: {exc}")
        job_payload["status"] = "failed"
        job_payload["updated_at"] = _utc_now()
        job_payload["error"] = str(exc)
        if image_record is not None:
            job_payload["source_type"] = image_record.get("source_type") or "upload"
        _save_job(scene_id, job_payload)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[environment] generation failed for {request.image_id}: {exc}")
        job_payload["status"] = "failed"
        job_payload["updated_at"] = _utc_now()
        job_payload["error"] = str(exc)
        if image_record is not None:
            job_payload["source_type"] = image_record.get("source_type") or "upload"
        _save_job(scene_id, job_payload)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "scene_id": scene_id,
        "job_id": scene_id,
        "status": "processing",
        "urls": _scene_urls(scene_id),
        "source_type": job_payload.get("source_type"),
        "source_provenance": job_payload.get("source_provenance"),
        "world_source": job_payload.get("world_source"),
        "lane_metadata": job_payload.get("lane_metadata"),
        "handoff_manifest": job_payload.get("handoff_manifest"),
        "ingest_record": job_payload.get("ingest_record"),
    }


@app.post("/generate/asset")
async def generate_asset(request: GenerateRequest, http_request: Request) -> Dict[str, Any]:
    _require_public_write_storage()
    job_context = _job_context_from_request(http_request)
    asset_id = f"asset_{str(uuid.uuid4())[:8]}"
    image_record = None
    job_payload = {
        "id": asset_id,
        "type": "asset",
        "status": "processing",
        "image_id": request.image_id,
        **job_context,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "error": None,
        "result": None,
    }
    image_record = None
    _save_job(asset_id, job_payload)

    try:
        upload_record = _load_upload_record(request.image_id)
        image_record = upload_record
        provenance_payload = _build_generation_provenance_payload(
            upload_record=upload_record,
            lane="asset",
            ingest_channel="generate_asset",
            input_strategy="1 photo",
        )
        job_payload.update(provenance_payload)
        image_path = upload_record["storage_path"]
        image_bytes = STORAGE.read_bytes(image_path)
        payloads = _asset_payload(image_bytes, upload_record["filename"])
        job_payload["source_type"] = upload_record.get("source_type") or "upload"
        for name, blob in payloads.items():
            STORAGE.write_bytes(f"assets/{asset_id}/{name}", blob)

        result = {
            "asset_id": asset_id,
            "asset_dir": f"assets/{asset_id}",
            "files": {
                "mesh": f"assets/{asset_id}/mesh.glb",
                "texture": f"assets/{asset_id}/texture.png",
                "preview": f"assets/{asset_id}/preview.png",
            },
            "urls": _asset_urls(asset_id),
        }
        job_payload["status"] = "completed"
        job_payload["updated_at"] = _utc_now()
        world_source = job_payload.get("world_source")
        if not isinstance(world_source, dict):
            world_source = _build_world_source(
                lane="asset",
                ingest_channel="generate_asset",
                input_strategy="1 photo",
                primary_source=job_payload.get("source_provenance") or {"source_type": "upload", "source_id": "", "filename": ""},
                upstream_sources=[job_payload.get("source_provenance")] if isinstance(job_payload.get("source_provenance"), dict) else [],
            )
            job_payload["world_source"] = world_source
        job_payload["lane_metadata"] = _asset_lane_metadata()
        job_payload["handoff_manifest"] = _asset_handoff_manifest(world_source)
        job_payload["result"] = {
            **result,
            "source_type": job_payload.get("source_type"),
            "source_provenance": job_payload.get("source_provenance"),
            "world_source": job_payload.get("world_source"),
            "lane_metadata": job_payload.get("lane_metadata"),
            "handoff_manifest": job_payload.get("handoff_manifest"),
        }
        _save_job(asset_id, job_payload)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[asset] generation failed for {request.image_id}: {exc}")
        job_payload["status"] = "failed"
        job_payload["updated_at"] = _utc_now()
        job_payload["error"] = str(exc)
        if image_record is not None:
            job_payload["source_type"] = image_record.get("source_type") or "upload"
        _save_job(asset_id, job_payload)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "asset_id": asset_id,
        "job_id": asset_id,
        "status": "processing",
        "urls": _asset_urls(asset_id),
        "source_type": job_payload.get("source_type"),
        "source_provenance": job_payload.get("source_provenance"),
        "world_source": job_payload.get("world_source"),
        "lane_metadata": job_payload.get("lane_metadata"),
        "handoff_manifest": job_payload.get("handoff_manifest"),
    }


@app.post("/capture/session")
async def create_capture_session(request: CaptureSessionCreateRequest) -> Dict[str, Any]:
    _require_public_write_storage()
    payload = _capture_session_payload(
        {
            "session_id": f"capture_{str(uuid.uuid4())[:8]}",
            "created_at": _utc_now(),
            "frames": [],
            "target_images": _clamp_target_images(request.target_images),
        }
    )
    _save_capture_session(payload)
    return payload


@app.get("/capture/session/{session_id}")
async def get_capture_session(session_id: str) -> Dict[str, Any]:
    return _load_capture_session(session_id)


@app.post("/capture/session/{session_id}/frames")
async def add_capture_frames(session_id: str, request: CaptureSessionFramesRequest) -> Dict[str, Any]:
    _require_public_write_storage()
    if not request.image_ids:
        raise HTTPException(status_code=400, detail="At least one uploaded image is required")

    payload = _load_capture_session(session_id)
    known_ids = {frame["image_id"] for frame in payload.get("frames", []) if isinstance(frame, dict)}

    for image_id in request.image_ids:
        if image_id in known_ids or len(payload["frames"]) >= payload["max_images"]:
            continue
        payload["frames"].append(_build_capture_frame_record(image_id))
        known_ids.add(image_id)

    payload = _capture_session_payload(payload)
    _save_capture_session(payload)
    return payload


@app.post("/reconstruct/session/{session_id}")
async def start_reconstruction(session_id: str) -> Dict[str, Any]:
    _require_public_write_storage()
    payload = _load_capture_session(session_id)
    if not payload.get("ready_for_reconstruction"):
        raise HTTPException(
            status_code=422,
            detail=f"Capture set needs at least {payload['minimum_images']} overlapping photos before reconstruction can start.",
        )
    raise HTTPException(
        status_code=501,
        detail="This backend can collect capture sets, but a dedicated multi-view Gaussian reconstruction worker is not connected yet.",
    )


@app.get("/jobs")
async def list_jobs(
    http_request: Request,
    studio_id: str | None = None,
    status: str | None = None,
    types: str | None = None,
    created_gte: str | None = None,
    updated_gte: str | None = None,
    include_missing_context: bool = False,
    offset: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
) -> Dict[str, Any]:
    _require_worker_auth(http_request)

    statuses = {entry.strip() for entry in (status or "").split(",") if entry.strip()}
    job_types = {entry.strip() for entry in (types or "").split(",") if entry.strip()}
    created_since = _parse_job_timestamp(created_gte)
    updated_since = _parse_job_timestamp(updated_gte)
    normalized_studio_id = studio_id.strip() if isinstance(studio_id, str) and studio_id.strip() else None

    filtered_summaries = [
        summary
        for summary in _load_job_index()
        if isinstance(summary, dict)
        and _job_matches_filters(
            summary,
            studio_id=normalized_studio_id,
            statuses=statuses,
            types=job_types,
            created_gte=created_since,
            updated_gte=updated_since,
            include_missing_context=include_missing_context,
        )
    ]

    normalized_offset = max(0, int(offset))
    page_summaries = filtered_summaries[normalized_offset : normalized_offset + limit]
    jobs: List[Dict[str, Any]] = []
    for summary in page_summaries:
        job_id = str(summary.get("id") or "").strip()
        if not job_id:
            continue
        path = _job_path(job_id)
        if not STORAGE.exists(path):
            continue
        payload = _read_json(path)
        if isinstance(payload, dict):
            jobs.append(payload)

    next_offset = normalized_offset + len(page_summaries)
    return {
        "jobs": jobs,
        "next_offset": next_offset if next_offset < len(filtered_summaries) else None,
        "total_count": len(filtered_summaries),
    }


@app.get("/jobs/{job_id}")
async def job_status(job_id: str) -> Dict[str, Any]:
    path = _job_path(job_id)
    if not STORAGE.exists(path):
        raise HTTPException(status_code=404, detail="Job not found")
    payload = _read_json(path)
    if isinstance(payload, dict) and payload.get("status") == "processing":
        if payload.get("type") == "generated_image":
            payload = _refresh_generated_image_job(payload)
        elif payload.get("type") == "environment" and payload.get("provider_job_id"):
            payload = _refresh_environment_job(payload)
    return payload


@app.post("/scene/save")
async def save_scene(request: SceneSaveRequest) -> Dict[str, Any]:
    _require_public_write_storage()
    if request.scene_document is None and request.scene_graph is None:
        raise HTTPException(status_code=400, detail="Either scene_graph or scene_document is required.")

    scene_document, scene_graph = _normalize_scene_save_payload(
        scene_graph=request.scene_graph,
        scene_document=request.scene_document,
    )
    saved_at = _utc_now()
    version_id = _version_id()

    version_payload = {
        "scene_id": request.scene_id,
        "version_id": version_id,
        "saved_at": saved_at,
        "source": request.source,
        "summary": _scene_summary(scene_graph),
        "scene_document": scene_document,
        "scene_graph": scene_graph,
    }

    _write_json(_scene_path(request.scene_id), scene_document)
    _write_json(_scene_version_path(request.scene_id, version_id), version_payload)
    version_index_path = _scene_versions_index_path(request.scene_id)
    existing_versions = _read_json(version_index_path) if STORAGE.exists(version_index_path) else []
    ordered_versions = [version_id, *[item for item in existing_versions if item != version_id]]
    _write_json(version_index_path, ordered_versions[:20])

    return {
        "status": "saved",
        "scene_id": request.scene_id,
        "filepath": _scene_path(request.scene_id),
        "url": f"/storage/scenes/{request.scene_id}/scene.json",
        "saved_at": saved_at,
        "version_id": version_id,
        "versions_url": f"/scene/{request.scene_id}/versions",
        "summary": version_payload["summary"],
    }


@app.get("/scene/{scene_id}/versions")
async def list_scene_versions(scene_id: str) -> Dict[str, Any]:
    versions: List[Dict[str, Any]] = []

    index_path = _scene_versions_index_path(scene_id)
    if STORAGE.exists(index_path):
        version_ids = _read_json(index_path)
        for version_id in version_ids[:20]:
            payload = _load_version_payload(scene_id, version_id)
            versions.append(
                {
                    "version_id": version_id,
                    "saved_at": payload.get("saved_at"),
                    "source": payload.get("source", "manual"),
                    "summary": payload.get("summary", {}),
                    "comment_count": len(_load_scene_comments(scene_id, version_id)) + _count_review_issues(scene_id, version_id),
                }
            )

    return {"scene_id": scene_id, "versions": versions}


@app.get("/scene/{scene_id}/versions/{version_id}")
async def get_scene_version(scene_id: str, version_id: str) -> Dict[str, Any]:
    return _load_version_payload(scene_id, version_id)


@app.get("/scene/{scene_id}/review")
async def get_scene_review(scene_id: str) -> Dict[str, Any]:
    if not _scene_exists(scene_id):
        raise HTTPException(status_code=404, detail="Scene not found")
    return _load_scene_review(scene_id)


@app.post("/scene/{scene_id}/review")
async def upsert_scene_review(scene_id: str, request: SceneReviewRequest) -> Dict[str, Any]:
    _require_public_write_storage()
    if not _scene_exists(scene_id):
        raise HTTPException(status_code=404, detail="Scene not found")

    current = _load_scene_review(scene_id)
    history = current.get("approval", {}).get("history", [])
    approval = {
        "state": request.approval_state,
        "updated_at": _utc_now(),
        "updated_by": request.updated_by.strip() or "Reviewer",
        "note": request.note.strip(),
        "history": history,
    }
    if (
        not history
        or history[-1].get("state") != approval["state"]
        or history[-1].get("note") != approval["note"]
    ):
        approval["history"] = [
            *history,
            {
                "state": approval["state"],
                "updated_at": approval["updated_at"],
                "updated_by": approval["updated_by"],
                "note": approval["note"],
            },
        ]

    payload = {
        "scene_id": scene_id,
        "metadata": request.metadata,
        "approval": approval,
        "issues": request.issues,
    }
    review_payload = _normalize_review_payload(scene_id, payload)
    _write_json(_scene_review_path(scene_id), review_payload)
    return review_payload


@app.get("/scene/{scene_id}/versions/{version_id}/comments")
async def list_scene_comments(scene_id: str, version_id: str) -> Dict[str, Any]:
    _load_version_payload(scene_id, version_id)
    return {
        "scene_id": scene_id,
        "version_id": version_id,
        "comments": _load_scene_comments(scene_id, version_id),
    }


@app.post("/scene/{scene_id}/versions/{version_id}/comments")
async def create_scene_comment(
    scene_id: str,
    version_id: str,
    request: VersionCommentRequest,
) -> Dict[str, Any]:
    _require_public_write_storage()
    _load_version_payload(scene_id, version_id)
    comment = {
        "comment_id": uuid.uuid4().hex,
        "author": request.author.strip() or "Reviewer",
        "body": request.body.strip(),
        "anchor": request.anchor.strip() or "scene",
        "created_at": _utc_now(),
    }
    if not comment["body"]:
        raise HTTPException(status_code=400, detail="Comment body is required")

    comments = _load_scene_comments(scene_id, version_id)
    comments.append(comment)
    _write_json(_scene_comments_path(scene_id, version_id), comments)

    return {
        "scene_id": scene_id,
        "version_id": version_id,
        "comment": comment,
        "comment_count": len(comments),
    }


@app.api_route("/storage/{storage_path:path}", methods=["GET", "HEAD"])
async def storage_proxy(storage_path: str) -> Response:
    public_url = STORAGE.public_url(storage_path)
    if public_url and STORAGE.exists(storage_path):
        return RedirectResponse(url=public_url, status_code=307)

    try:
        payload = STORAGE.read_bytes(storage_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Stored file not found") from exc

    return Response(content=payload, media_type=_guess_media_type(storage_path))
