from __future__ import annotations

import json
import mimetypes
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _provider_error_message(payload: bytes) -> str:
    if not payload:
        return "No response body."
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except Exception:
        return payload.decode("utf-8", errors="ignore").strip() or "Unknown provider error."

    if isinstance(decoded, dict):
        for key in ("detail", "message", "error"):
            value = decoded.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return str(decoded)


def _guess_media_type(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def _encode_multipart_form_data(
    *,
    fields: Optional[Dict[str, str]] = None,
    files: Optional[List[tuple[str, str, bytes, str]]] = None,
) -> tuple[bytes, str]:
    boundary = f"----GausetMultipart{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in (fields or {}).items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for field_name, filename, data, content_type in files or []:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(data)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


class ProviderError(RuntimeError):
    pass


@dataclass
class EnvironmentGenerationRequest:
    filename: str
    image_bytes: bytes
    image_id: Optional[str] = None


@dataclass
class EnvironmentArtifact:
    key: str
    url: Optional[str] = None
    bytes_data: Optional[bytes] = None
    mime_type: Optional[str] = None
    filename: Optional[str] = None


@dataclass
class EnvironmentJob:
    provider_job_id: str
    status: str
    scene_id: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    outputs: Dict[str, EnvironmentArtifact] = field(default_factory=dict)
    error: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EnvironmentBridgeStatus:
    id: str
    label: str
    available: bool
    connection_status: str
    summary: str
    availability_reason: Optional[str]
    documentation_url: Optional[str] = None
    setup_hint: Optional[str] = None
    required_env: List[str] = field(default_factory=list)
    optional_env: List[str] = field(default_factory=list)

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "available": self.available,
            "connection_status": self.connection_status,
            "summary": self.summary,
            "availability_reason": self.availability_reason,
            "documentation_url": self.documentation_url,
            "setup_hint": self.setup_hint,
            "required_env": self.required_env,
            "optional_env": self.optional_env,
        }


class MlSharpWorkerBridge:
    bridge_id = "ml_sharp_worker"
    label = "ML-Sharp GPU Worker"
    summary = "Dispatches a still image to a dedicated ML-Sharp worker and retrieves a dense Gaussian PLY."
    setup_hint = (
        "Deploy the FastAPI worker, set GAUSET_IMAGE_TO_SPLAT_BACKEND_URL in the public backend, "
        "and optionally set a shared GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN / GAUSET_WORKER_TOKEN pair."
    )
    required_env_vars = ("GAUSET_IMAGE_TO_SPLAT_BACKEND_URL",)
    optional_env_vars = (
        "GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE",
        "GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN",
        "GAUSET_IMAGE_TO_SPLAT_HEALTHCHECK_URL",
    )

    def __init__(self) -> None:
        base_url = os.getenv("GAUSET_IMAGE_TO_SPLAT_BACKEND_URL", "").strip()
        self.base_url = base_url.rstrip("/")
        self.token = os.getenv("GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN", "").strip()
        self.healthcheck_url = os.getenv("GAUSET_IMAGE_TO_SPLAT_HEALTHCHECK_URL", "").strip()
        self.timeout_seconds = float(os.getenv("GAUSET_IMAGE_TO_SPLAT_TIMEOUT", "90"))

    def feature_enabled(self) -> bool:
        default_flag = "1" if self.base_url else "0"
        return _env_flag("GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE", default_flag)

    def _auth_headers(self) -> Dict[str, str]:
        if not self.token:
            return {}
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Gauset-Worker-Token": self.token,
        }

    def _absolute_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        return urllib.parse.urljoin(f"{self.base_url}/", path_or_url.lstrip("/"))

    def _request_bytes(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[bytes] = None,
    ) -> bytes:
        request_headers = {**self._auth_headers(), **(headers or {})}
        request = urllib.request.Request(url, data=body, method=method.upper(), headers=request_headers)

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            payload = exc.read() if exc.fp else b""
            raise ProviderError(
                f"{self.label} request failed ({exc.code}): {_provider_error_message(payload)}"
            ) from exc
        except Exception as exc:
            raise ProviderError(f"{self.label} request failed: {exc}") from exc

    def _request_json(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        payload: Optional[Dict[str, Any]] = None,
        body: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        request_body = body
        request_headers = dict(headers or {})
        if payload is not None:
            request_body = json.dumps(payload).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        request_headers.setdefault("Accept", "application/json")
        response_body = self._request_bytes(url, method=method, headers=request_headers, body=request_body)
        try:
            decoded = json.loads(response_body.decode("utf-8"))
        except Exception as exc:
            raise ProviderError(f"{self.label} returned invalid JSON from {url}: {exc}") from exc
        if not isinstance(decoded, dict):
            raise ProviderError(f"{self.label} returned an unexpected payload from {url}.")
        return decoded

    def healthcheck(self) -> tuple[bool, str]:
        if not self.feature_enabled():
            return False, "Image-to-splat bridge is disabled. Set GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE=1."
        if not self.base_url:
            return False, "GAUSET_IMAGE_TO_SPLAT_BACKEND_URL is not configured."

        health_url = self.healthcheck_url or self._absolute_url("/health")
        try:
            payload = self._request_json(health_url)
        except Exception as exc:
            return False, str(exc)

        if str(payload.get("status") or "").strip().lower() == "ok":
            return True, ""
        return False, "Remote ML-Sharp worker did not report healthy status."

    def to_status_payload(self) -> EnvironmentBridgeStatus:
        available, reason = self.healthcheck()
        connection_status = "configured" if available else ("disabled" if not self.feature_enabled() else "unavailable")
        return EnvironmentBridgeStatus(
            id=self.bridge_id,
            label=self.label,
            available=available,
            connection_status=connection_status,
            summary=self.summary,
            availability_reason=None if available else reason,
            setup_hint=self.setup_hint,
            required_env=list(self.required_env_vars),
            optional_env=list(self.optional_env_vars),
        )

    def submit_environment_job(self, request: EnvironmentGenerationRequest) -> EnvironmentJob:
        if not self.base_url:
            raise ProviderError("GAUSET_IMAGE_TO_SPLAT_BACKEND_URL is not configured.")

        upload_body, content_type = _encode_multipart_form_data(
            files=[
                (
                    "file",
                    request.filename,
                    request.image_bytes,
                    _guess_media_type(request.filename),
                )
            ]
        )
        upload_payload = self._request_json(
            self._absolute_url("/upload"),
            method="POST",
            headers={"Content-Type": content_type},
            body=upload_body,
        )
        image_id = str(upload_payload.get("image_id") or "").strip()
        if not image_id:
            raise ProviderError(f"{self.label} upload response did not include image_id.")

        generate_payload = self._request_json(
            self._absolute_url("/generate/environment"),
            method="POST",
            payload={"image_id": image_id},
        )
        provider_job_id = str(generate_payload.get("job_id") or generate_payload.get("scene_id") or "").strip()
        if not provider_job_id:
            raise ProviderError(f"{self.label} generation response did not include job_id.")

        scene_id = str(generate_payload.get("scene_id") or provider_job_id).strip() or None
        return EnvironmentJob(
            provider_job_id=provider_job_id,
            status=str(generate_payload.get("status") or "processing"),
            scene_id=scene_id,
            raw=generate_payload,
        )

    def poll_job(self, provider_job_id: str) -> EnvironmentJob:
        if not provider_job_id:
            raise ProviderError(f"{self.label} poll requested without a job id.")

        payload = self._request_json(self._absolute_url(f"/jobs/{provider_job_id}"))
        status = str(payload.get("status") or "processing")
        result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
        scene_id = str(result.get("scene_id") or payload.get("scene_id") or provider_job_id).strip() or None
        urls = result.get("urls") if isinstance(result.get("urls"), dict) else {}
        warnings = [str(warning) for warning in payload.get("warnings", []) if str(warning).strip()]

        outputs: Dict[str, EnvironmentArtifact] = {}
        if status == "completed" and scene_id:
            default_base = f"/storage/scenes/{scene_id}/environment"
            artifact_urls = {
                "splats": urls.get("splats") or f"{default_base}/splats.ply",
                "cameras": urls.get("cameras") or f"{default_base}/cameras.json",
                "metadata": urls.get("metadata") or f"{default_base}/metadata.json",
                "holdout_report": urls.get("holdout_report") or f"{default_base}/holdout-report.json",
                "capture_scorecard": urls.get("capture_scorecard") or f"{default_base}/capture-scorecard.json",
                "benchmark_report": urls.get("benchmark_report") or f"{default_base}/benchmark-report.json",
            }
            for key, value in artifact_urls.items():
                if not isinstance(value, str) or not value.strip():
                    continue
                outputs[key] = EnvironmentArtifact(
                    key=key,
                    url=self._absolute_url(value),
                    filename=Path(urllib.parse.urlparse(value).path).name or f"{key}.bin",
                    mime_type=_guess_media_type(value),
                )

        return EnvironmentJob(
            provider_job_id=str(payload.get("id") or provider_job_id),
            status=status,
            scene_id=scene_id,
            warnings=warnings[:6],
            outputs=outputs,
            error=str(payload.get("error")).strip() or None if payload.get("error") is not None else None,
            raw=payload,
        )


class EnvironmentBridgeRegistry:
    def __init__(self) -> None:
        self.bridge = MlSharpWorkerBridge()

    def get_bridge(self) -> MlSharpWorkerBridge:
        available, reason = self.bridge.healthcheck()
        if not available:
            raise ProviderError(reason)
        return self.bridge

    def status_payload(self) -> Dict[str, Any]:
        return self.bridge.to_status_payload().to_payload()


@lru_cache(maxsize=1)
def get_environment_bridge_registry() -> EnvironmentBridgeRegistry:
    return EnvironmentBridgeRegistry()


def materialize_environment_artifact(artifact: EnvironmentArtifact) -> tuple[bytes, str, str]:
    if artifact.bytes_data is not None:
        mime_type = artifact.mime_type or _guess_media_type(artifact.filename or artifact.key)
        filename = artifact.filename or f"{artifact.key}{Path(artifact.filename or '').suffix}"
        return artifact.bytes_data, mime_type, filename

    if not artifact.url:
        raise ProviderError("Environment artifact did not include bytes or a download URL.")

    headers = {"Accept": "*/*"}
    token = os.getenv("GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Gauset-Worker-Token"] = token

    request = urllib.request.Request(artifact.url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=float(os.getenv("GAUSET_IMAGE_TO_SPLAT_TIMEOUT", "90"))) as response:
            payload = response.read()
            mime_type = response.headers.get("content-type", artifact.mime_type or "application/octet-stream")
            filename = artifact.filename or Path(urllib.parse.urlparse(artifact.url).path).name or f"{artifact.key}.bin"
            return payload, mime_type, filename
    except urllib.error.HTTPError as exc:
        payload = exc.read() if exc.fp else b""
        raise ProviderError(
            f"Could not download environment artifact ({exc.code}): {_provider_error_message(payload)}"
        ) from exc
    except Exception as exc:
        raise ProviderError(f"Could not download environment artifact: {exc}") from exc
