from __future__ import annotations

import base64
import io
import json
import os
import uuid
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from PIL import Image, ImageDraw, ImageOps

from config_env import load_local_env_files

try:  # pragma: no cover - dependency varies by environment
    import httpx
except Exception:  # pragma: no cover - defensive
    httpx = None

try:  # pragma: no cover - dependency varies by environment
    import google.auth as google_auth
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import service_account
except Exception:  # pragma: no cover - defensive
    google_auth = None
    GoogleAuthRequest = None
    service_account = None

load_local_env_files()

CORE_IMAGE_ASPECT_RATIOS = ("1:1", "4:3", "3:4", "16:9", "9:16")
EXTENDED_IMAGE_ASPECT_RATIOS = (*CORE_IMAGE_ASPECT_RATIOS, "3:2", "2:3")


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _first_str(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _mime_to_extension(mime_type: Optional[str], fallback: str = ".png") -> str:
    if not mime_type:
        return fallback
    normalized = mime_type.split(";")[0].strip().lower()
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
    }.get(normalized, fallback)


def _filename_from_url(url: str, fallback: str = "generated.png") -> str:
    candidate = Path(url.split("?", 1)[0]).name
    return candidate or fallback


def _aspect_ratio_to_size(aspect_ratio: Optional[str]) -> Optional[str]:
    mapping = {
        "1:1": "1024x1024",
        "4:3": "1152x896",
        "3:4": "896x1152",
        "16:9": "1536x864",
        "9:16": "864x1536",
        "3:2": "1216x832",
        "2:3": "832x1216",
    }
    return mapping.get((aspect_ratio or "").strip())


def _runway_ratio(aspect_ratio: Optional[str]) -> str:
    mapping = {
        "1:1": "1024:1024",
        "4:3": "1104:832",
        "3:4": "832:1104",
        "16:9": "1280:720",
        "9:16": "720:1280",
    }
    return mapping.get((aspect_ratio or "").strip(), "1280:720")


def _json_or_none(response: Any) -> Any:
    try:
        return response.json()
    except Exception:
        return None


def _provider_error_message(response: Any) -> str:
    payload = _json_or_none(response)
    candidates: List[Any] = []
    if isinstance(payload, dict):
        candidates.extend(
            [
                payload.get("message"),
                payload.get("detail"),
                payload.get("error_description"),
                payload.get("failureReason"),
            ]
        )
        error_value = payload.get("error")
        if isinstance(error_value, dict):
            candidates.extend([error_value.get("message"), error_value.get("detail"), error_value.get("code")])
        else:
            candidates.append(error_value)

    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    text = getattr(response, "text", "")
    if isinstance(text, str) and text.strip():
        return text.strip()[:300]
    return "Request failed."


def _ensure_success(response: Any, provider_label: str) -> Any:
    status_code = getattr(response, "status_code", 200)
    if isinstance(status_code, int) and status_code < 400:
        return response
    raise ProviderError(f"{provider_label} request failed ({status_code}): {_provider_error_message(response)}")


@dataclass
class ReferenceImage:
    image_id: str
    filename: str
    mime_type: str
    data: bytes

    def to_data_uri(self) -> str:
        encoded = base64.b64encode(self.data).decode("utf-8")
        return f"data:{self.mime_type};base64,{encoded}"


@dataclass
class ImageGenerationRequest:
    provider: str
    model: str
    prompt: str
    negative_prompt: Optional[str] = None
    aspect_ratio: Optional[str] = None
    count: int = 1
    seed: Optional[int] = None
    reference_images: List[ReferenceImage] = field(default_factory=list)


@dataclass
class ProviderArtifact:
    image_bytes: Optional[bytes] = None
    image_url: Optional[str] = None
    mime_type: Optional[str] = None
    filename: Optional[str] = None


@dataclass
class ProviderJob:
    provider_job_id: str
    status: str
    warnings: List[str] = field(default_factory=list)
    outputs: List[ProviderArtifact] = field(default_factory=list)
    error: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderModelInfo:
    id: str
    label: str
    supports_prompt_only: bool = True
    supports_references: bool = False
    supports_multi_output: bool = True
    supports_negative_prompt: bool = True

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "supports_prompt_only": self.supports_prompt_only,
            "supports_references": self.supports_references,
            "supports_multi_output": self.supports_multi_output,
            "supports_negative_prompt": self.supports_negative_prompt,
        }


@dataclass
class ProviderCatalogEntry:
    id: str
    label: str
    media_kind: str
    available: bool
    connection_status: str
    summary: str
    availability_reason: Optional[str]
    supports_prompt_only: bool
    supports_references: bool
    supports_multi_output: bool
    models: List[Dict[str, Any]]
    documentation_url: Optional[str] = None
    setup_hint: Optional[str] = None
    required_env: List[str] = field(default_factory=list)
    optional_env: List[str] = field(default_factory=list)
    supported_aspect_ratios: List[str] = field(default_factory=list)
    max_reference_images: int = 0
    max_outputs: int = 1
    default_model: Optional[str] = None

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "media_kind": self.media_kind,
            "available": self.available,
            "connection_status": self.connection_status,
            "summary": self.summary,
            "availability_reason": self.availability_reason,
            "supports_prompt_only": self.supports_prompt_only,
            "supports_references": self.supports_references,
            "supports_multi_output": self.supports_multi_output,
            "models": self.models,
            "documentation_url": self.documentation_url,
            "setup_hint": self.setup_hint,
            "required_env": self.required_env,
            "optional_env": self.optional_env,
            "supported_aspect_ratios": self.supported_aspect_ratios,
            "max_reference_images": self.max_reference_images,
            "max_outputs": self.max_outputs,
            "default_model": self.default_model,
        }


class ProviderError(RuntimeError):
    pass


class BaseProviderAdapter:
    provider_id = "base"
    label = "Base Provider"
    media_kind = "image"
    summary = ""
    supports_prompt_only = True
    supports_references = False
    supports_multi_output = True
    models: Sequence[ProviderModelInfo] = ()
    documentation_url = ""
    setup_hint = ""
    required_env_vars: Sequence[str] = ()
    optional_env_vars: Sequence[str] = ()
    supported_aspect_ratios: Sequence[str] = CORE_IMAGE_ASPECT_RATIOS
    max_reference_images = 0
    max_outputs = 1
    default_model_env_var = ""

    def healthcheck(self) -> tuple[bool, str]:
        return False, "Not implemented."

    def list_models(self) -> List[Dict[str, Any]]:
        return [model.to_payload() for model in self.models]

    def get_model_info(self, model_id: str) -> Optional[ProviderModelInfo]:
        for model in self.models:
            if model.id == model_id:
                return model
        return None

    def default_model_id(self) -> Optional[str]:
        configured_model = _first_str(os.getenv(self.default_model_env_var)) if self.default_model_env_var else None
        if configured_model and self.get_model_info(configured_model):
            return configured_model
        if self.models:
            return self.models[0].id
        return configured_model

    def submit_image_job(self, request: ImageGenerationRequest) -> ProviderJob:
        raise ProviderError(f"{self.label} does not support image generation.")

    def poll_job(self, provider_job_id: str) -> ProviderJob:
        raise ProviderError(f"{self.label} does not expose image polling.")

    def to_catalog_entry(self) -> ProviderCatalogEntry:
        available, reason = self.healthcheck()
        return ProviderCatalogEntry(
            id=self.provider_id,
            label=self.label,
            media_kind=self.media_kind,
            available=available,
            connection_status="configured" if available else "unavailable",
            summary=self.summary,
            availability_reason=None if available else reason,
            supports_prompt_only=self.supports_prompt_only,
            supports_references=self.supports_references,
            supports_multi_output=self.supports_multi_output,
            models=self.list_models(),
            documentation_url=self.documentation_url or None,
            setup_hint=self.setup_hint or None,
            required_env=list(self.required_env_vars),
            optional_env=list(self.optional_env_vars),
            supported_aspect_ratios=list(self.supported_aspect_ratios),
            max_reference_images=self.max_reference_images,
            max_outputs=self.max_outputs,
            default_model=self.default_model_id(),
        )

    def _ensure_httpx(self) -> None:
        if httpx is None:
            raise ProviderError("httpx is not installed in this backend environment.")


class StaticCatalogAdapter(BaseProviderAdapter):
    def __init__(
        self,
        *,
        provider_id: str,
        label: str,
        media_kind: str,
        summary: str,
        reason: str,
        models: Sequence[ProviderModelInfo] = (),
    ) -> None:
        self.provider_id = provider_id
        self.label = label
        self.media_kind = media_kind
        self.summary = summary
        self._reason = reason
        self.models = models
        self.supports_prompt_only = media_kind == "image"
        self.supports_references = False
        self.supports_multi_output = media_kind == "image"

    def healthcheck(self) -> tuple[bool, str]:
        return False, self._reason


class MockImageAdapter(BaseProviderAdapter):
    provider_id = "mock"
    label = "Mock Image Generator"
    media_kind = "image"
    summary = "Local deterministic generator for smoke tests and offline development."
    setup_hint = "Set GAUSET_PROVIDER_MOCK=1 when you want an offline provider for local review."
    required_env_vars = ("GAUSET_PROVIDER_MOCK",)
    supported_aspect_ratios = EXTENDED_IMAGE_ASPECT_RATIOS
    max_reference_images = 3
    max_outputs = 4
    supports_prompt_only = True
    supports_references = True
    supports_multi_output = True
    models = (
        ProviderModelInfo("mock-cinematic-v1", "Mock Cinematic v1", supports_references=True),
    )

    def healthcheck(self) -> tuple[bool, str]:
        if _env_flag("GAUSET_PROVIDER_MOCK", "0") or _env_flag("GAUSET_ALLOW_MOCK_MODE", "0"):
            return True, ""
        return False, "Mock provider is disabled. Set GAUSET_PROVIDER_MOCK=1 to enable it."

    def submit_image_job(self, request: ImageGenerationRequest) -> ProviderJob:
        available, reason = self.healthcheck()
        if not available:
            raise ProviderError(reason)

        count = max(1, min(int(request.count or 1), 4))
        outputs: List[ProviderArtifact] = []
        for index in range(count):
            outputs.append(
                ProviderArtifact(
                    image_bytes=_render_mock_image(request, index=index),
                    mime_type="image/png",
                    filename=f"{request.provider}_{index + 1}.png",
                )
            )
        return ProviderJob(
            provider_job_id=f"mock_{uuid.uuid4().hex[:12]}",
            status="completed",
            outputs=outputs,
        )


def _render_mock_image(request: ImageGenerationRequest, *, index: int) -> bytes:
    size = _aspect_ratio_to_canvas(request.aspect_ratio)
    base = Image.new("RGB", size, color=(17, 22, 34))
    draw = ImageDraw.Draw(base)
    accent = (48 + (index * 28), 180, 220)
    draw.rectangle((0, 0, size[0], size[1]), fill=(12, 16, 24))
    draw.rounded_rectangle((32, 32, size[0] - 32, size[1] - 32), radius=28, outline=accent, width=4)
    draw.text((56, 56), "GAUSET MOCK", fill=(220, 235, 255))
    draw.text((56, 108), f"Provider: {request.provider}", fill=(160, 190, 255))
    draw.text((56, 148), f"Model: {request.model}", fill=(160, 190, 255))
    draw.text((56, 196), f"Variant: {index + 1}", fill=accent)
    draw.multiline_text(
        (56, 256),
        _wrap_text(request.prompt or "Untitled prompt", width=44),
        fill=(240, 242, 245),
        spacing=8,
    )
    if request.reference_images:
        draw.text((56, size[1] - 98), f"Refs: {len(request.reference_images)}", fill=(240, 200, 120))
    buffer = io.BytesIO()
    base.save(buffer, format="PNG")
    return buffer.getvalue()


def _aspect_ratio_to_canvas(aspect_ratio: Optional[str]) -> tuple[int, int]:
    mapping = {
        "1:1": (1024, 1024),
        "4:3": (1152, 864),
        "3:4": (864, 1152),
        "16:9": (1280, 720),
        "9:16": (720, 1280),
        "3:2": (1200, 800),
        "2:3": (800, 1200),
    }
    return mapping.get((aspect_ratio or "").strip(), (1024, 1024))


def _wrap_text(text: str, width: int) -> str:
    tokens = text.strip().split()
    if not tokens:
        return "No prompt provided."
    lines: List[str] = []
    current: List[str] = []
    for token in tokens:
        candidate = " ".join([*current, token]).strip()
        if len(candidate) <= width:
            current.append(token)
            continue
        if current:
            lines.append(" ".join(current))
        current = [token]
    if current:
        lines.append(" ".join(current))
    return "\n".join(lines[:5])


class GoogleImagenAdapter(BaseProviderAdapter):
    provider_id = "google"
    label = "Google Imagen"
    media_kind = "image"
    summary = "Vertex AI Imagen text-to-image generation."
    documentation_url = "https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images"
    setup_hint = (
        "Set GAUSET_GOOGLE_VERTEX_PROJECT and authenticate with ADC "
        "(gcloud auth application-default login), GOOGLE_APPLICATION_CREDENTIALS, "
        "GAUSET_GOOGLE_SERVICE_ACCOUNT_FILE/JSON, or GAUSET_GOOGLE_VERTEX_ACCESS_TOKEN."
    )
    required_env_vars = ("GAUSET_GOOGLE_VERTEX_PROJECT",)
    optional_env_vars = (
        "GAUSET_GOOGLE_VERTEX_LOCATION",
        "GAUSET_GOOGLE_VERTEX_MODEL",
        "GAUSET_GOOGLE_VERTEX_ACCESS_TOKEN",
        "GAUSET_GOOGLE_SERVICE_ACCOUNT_FILE",
        "GAUSET_GOOGLE_SERVICE_ACCOUNT_JSON",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_CLOUD_PROJECT",
    )
    supported_aspect_ratios = CORE_IMAGE_ASPECT_RATIOS
    max_outputs = 4
    default_model_env_var = "GAUSET_GOOGLE_VERTEX_MODEL"
    supports_prompt_only = True
    supports_references = False
    supports_multi_output = True
    models = (
        ProviderModelInfo("imagen-4.0-generate-001", "Imagen 4 Generate"),
        ProviderModelInfo("imagen-4.0-fast-generate-001", "Imagen 4 Fast Generate"),
        ProviderModelInfo("imagen-4.0-ultra-generate-001", "Imagen 4 Ultra Generate"),
    )

    def __init__(self) -> None:
        self.project = _first_str(os.getenv("GAUSET_GOOGLE_VERTEX_PROJECT"), os.getenv("GOOGLE_CLOUD_PROJECT"))
        self.location = os.getenv("GAUSET_GOOGLE_VERTEX_LOCATION", "us-central1").strip() or "us-central1"
        self.base_url = os.getenv("GAUSET_GOOGLE_VERTEX_BASE_URL", "").strip()
        self.access_token = os.getenv("GAUSET_GOOGLE_VERTEX_ACCESS_TOKEN", "").strip()
        self.service_account_json = os.getenv("GAUSET_GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
        self.service_account_file = _first_str(
            os.getenv("GAUSET_GOOGLE_SERVICE_ACCOUNT_FILE"),
            os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        )

    def healthcheck(self) -> tuple[bool, str]:
        if not self.project:
            return False, "Missing GAUSET_GOOGLE_VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT."
        if self.access_token:
            return True, ""
        if self.service_account_file and not Path(self.service_account_file).exists():
            return False, f"Google credential file not found: {self.service_account_file}"
        if self.service_account_json:
            return True, ""
        if service_account is None or GoogleAuthRequest is None:
            return False, "google-auth is not installed."
        if self.service_account_file:
            return True, ""
        try:  # pragma: no cover - depends on runtime credentials
            if google_auth is None:
                return False, "google-auth is not installed."
            creds, _ = google_auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            return (creds is not None), "" if creds is not None else "No Google credentials available."
        except Exception as exc:  # pragma: no cover - defensive
            return False, str(exc)

    def submit_image_job(self, request: ImageGenerationRequest) -> ProviderJob:
        self._ensure_httpx()
        token = self._google_token()
        endpoint = self._endpoint_for_model(request.model)
        payload = {
            "instances": [{"prompt": request.prompt}],
            "parameters": {
                "sampleCount": max(1, min(int(request.count or 1), 4)),
            },
        }
        if request.negative_prompt:
            payload["parameters"]["negativePrompt"] = request.negative_prompt
        if request.aspect_ratio:
            payload["parameters"]["aspectRatio"] = request.aspect_ratio
        if request.seed is not None:
            payload["parameters"]["seed"] = int(request.seed)

        try:
            response = httpx.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=90.0,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} request failed: {exc}") from exc
        payload = _ensure_success(response, self.label).json()
        outputs = _google_prediction_artifacts(payload)
        if not outputs:
            raise ProviderError("Google Imagen returned no image predictions.")
        return ProviderJob(
            provider_job_id=f"google_{uuid.uuid4().hex[:12]}",
            status="completed",
            outputs=outputs,
            raw=payload if isinstance(payload, dict) else {},
        )

    def _endpoint_for_model(self, model: str) -> str:
        if self.base_url:
            return self.base_url.rstrip("/")
        return (
            f"https://{self.location}-aiplatform.googleapis.com/v1/projects/{self.project}"
            f"/locations/{self.location}/publishers/google/models/{model}:predict"
        )

    def _google_token(self) -> str:
        if self.access_token:
            return self.access_token
        if service_account is not None and GoogleAuthRequest is not None:
            if self.service_account_json:
                creds = service_account.Credentials.from_service_account_info(
                    json.loads(self.service_account_json),
                    scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
                creds.refresh(GoogleAuthRequest())
                if not creds.token:
                    raise ProviderError("Google credentials did not yield an access token.")
                return str(creds.token)
            if self.service_account_file:
                creds = service_account.Credentials.from_service_account_file(
                    self.service_account_file,
                    scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
                creds.refresh(GoogleAuthRequest())
                if not creds.token:
                    raise ProviderError("Google credentials did not yield an access token.")
                return str(creds.token)
        if GoogleAuthRequest is None:
            raise ProviderError("google-auth is not installed.")
        try:  # pragma: no cover - runtime credentials dependent
            if google_auth is None:
                raise ProviderError("google-auth is not installed.")
            creds, _ = google_auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            creds.refresh(GoogleAuthRequest())
        except Exception as exc:  # pragma: no cover - defensive
            raise ProviderError(f"Could not resolve Google credentials: {exc}") from exc
        if not getattr(creds, "token", None):
            raise ProviderError("Google credentials did not yield an access token.")
        return str(creds.token)


def _google_prediction_artifacts(payload: Any) -> List[ProviderArtifact]:
    outputs: List[ProviderArtifact] = []
    predictions = payload.get("predictions") if isinstance(payload, dict) else []
    if not isinstance(predictions, list):
        return outputs
    for prediction in predictions:
        if not isinstance(prediction, dict):
            continue
        nested_images = prediction.get("images")
        if isinstance(nested_images, list):
            for nested in nested_images:
                if isinstance(nested, dict) and isinstance(nested.get("bytesBase64Encoded"), str):
                    outputs.append(
                        ProviderArtifact(
                            image_bytes=base64.b64decode(nested["bytesBase64Encoded"]),
                            mime_type=nested.get("mimeType", "image/png"),
                            filename=f"google_{uuid.uuid4().hex[:8]}.png",
                        )
                    )
        encoded = prediction.get("bytesBase64Encoded")
        if isinstance(encoded, str):
            outputs.append(
                ProviderArtifact(
                    image_bytes=base64.b64decode(encoded),
                    mime_type=prediction.get("mimeType", "image/png"),
                    filename=f"google_{uuid.uuid4().hex[:8]}.png",
                )
            )
    return outputs


class RunwayImageAdapter(BaseProviderAdapter):
    provider_id = "runway"
    label = "Runway"
    media_kind = "image"
    summary = "Runway async text-to-image generation with optional reference images."
    documentation_url = "https://docs.dev.runwayml.com/"
    setup_hint = (
        "Create a server-side Runway API key, set GAUSET_RUNWAY_API_KEY, and restart the local backend. "
        "Large reference images are uploaded through the Runway uploads API automatically."
    )
    required_env_vars = ("GAUSET_RUNWAY_API_KEY",)
    optional_env_vars = (
        "GAUSET_RUNWAY_MODEL",
        "GAUSET_RUNWAY_BASE_URL",
        "GAUSET_RUNWAY_API_VERSION",
        "GAUSET_RUNWAY_UPLOAD_REFERENCES",
        "GAUSET_RUNWAY_INLINE_REFERENCE_MAX_BYTES",
    )
    supported_aspect_ratios = CORE_IMAGE_ASPECT_RATIOS
    max_reference_images = 3
    max_outputs = 1
    default_model_env_var = "GAUSET_RUNWAY_MODEL"
    supports_prompt_only = True
    supports_references = True
    supports_multi_output = False
    models = (
        ProviderModelInfo("gen4_image", "Gen-4 Image", supports_references=True, supports_multi_output=False),
        ProviderModelInfo("gen4_image_turbo", "Gen-4 Image Turbo", supports_references=True, supports_multi_output=False),
    )

    def __init__(self) -> None:
        self.api_key = os.getenv("GAUSET_RUNWAY_API_KEY", "").strip()
        self.base_url = os.getenv("GAUSET_RUNWAY_BASE_URL", "https://api.dev.runwayml.com/v1").strip().rstrip("/")
        self.api_version = os.getenv("GAUSET_RUNWAY_API_VERSION", "2024-11-06").strip() or "2024-11-06"
        try:
            self.inline_reference_max_bytes = max(
                1024,
                int(os.getenv("GAUSET_RUNWAY_INLINE_REFERENCE_MAX_BYTES", "4500000").strip() or "4500000"),
            )
        except ValueError:
            self.inline_reference_max_bytes = 4_500_000
        self.force_reference_uploads = _env_flag("GAUSET_RUNWAY_UPLOAD_REFERENCES", "0")

    def healthcheck(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "Missing GAUSET_RUNWAY_API_KEY."
        if httpx is None:
            return False, "httpx is not installed in this backend environment."
        return True, ""

    def submit_image_job(self, request: ImageGenerationRequest) -> ProviderJob:
        self._ensure_httpx()
        try:
            response = httpx.post(
                f"{self.base_url}/text_to_image",
                headers=self._headers(),
                json=self._payload(request),
                timeout=90.0,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} request failed: {exc}") from exc
        return self._parse_job(_ensure_success(response, self.label).json())

    def poll_job(self, provider_job_id: str) -> ProviderJob:
        self._ensure_httpx()
        try:
            response = httpx.get(
                f"{self.base_url}/tasks/{provider_job_id}",
                headers=self._headers(),
                timeout=60.0,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} polling failed: {exc}") from exc
        return self._parse_job(_ensure_success(response, self.label).json())

    def _payload(self, request: ImageGenerationRequest) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": request.model,
            "promptText": request.prompt,
            "ratio": _runway_ratio(request.aspect_ratio),
        }
        if request.seed is not None:
            payload["seed"] = int(request.seed)
        if request.negative_prompt:
            payload["negativePrompt"] = request.negative_prompt
        if request.reference_images:
            payload["referenceImages"] = [self._reference_payload(reference) for reference in request.reference_images[: self.max_reference_images]]
        return payload

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": self.api_version,
            "Runway-Version": self.api_version,
        }

    def _reference_payload(self, reference: ReferenceImage) -> Dict[str, str]:
        if self.force_reference_uploads or len(reference.data) > self.inline_reference_max_bytes:
            return self._upload_reference(reference)
        return {
            "uri": reference.to_data_uri(),
            "tag": reference.image_id[:16],
        }

    def _upload_reference(self, reference: ReferenceImage) -> Dict[str, str]:
        self._ensure_httpx()
        try:
            create_response = httpx.post(
                f"{self.base_url}/uploads",
                headers=self._headers(),
                json={
                    "filename": reference.filename,
                    "mimeType": reference.mime_type,
                },
                timeout=60.0,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} upload bootstrap failed: {exc}") from exc

        payload = _ensure_success(create_response, f"{self.label} upload bootstrap").json()
        upload_url = _first_str(payload.get("uploadUrl"), payload.get("upload_url"))
        runway_uri = _first_str(payload.get("uri"), payload.get("runwayUri"), payload.get("runway_uri"))
        fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
        if not upload_url or not runway_uri:
            raise ProviderError(f"{self.label} upload bootstrap did not return an upload URL and uri.")

        try:
            with httpx.Client(follow_redirects=True, timeout=90.0) as client:
                upload_response = client.post(
                    upload_url,
                    data=fields,
                    files={"file": (reference.filename, reference.data, reference.mime_type)},
                )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} reference upload failed: {exc}") from exc
        _ensure_success(upload_response, f"{self.label} reference upload")
        return {
            "uri": runway_uri,
            "tag": reference.image_id[:16],
        }

    def _parse_job(self, payload: Any) -> ProviderJob:
        data = payload if isinstance(payload, dict) else {}
        provider_job_id = _first_str(data.get("id"), data.get("taskId")) or f"runway_{uuid.uuid4().hex[:12]}"
        raw_status = (_first_str(data.get("status"), data.get("state")) or "processing").lower()
        status_map = {
            "pending": "processing",
            "queued": "processing",
            "processing": "processing",
            "running": "processing",
            "in_progress": "processing",
            "succeeded": "completed",
            "completed": "completed",
            "failed": "failed",
            "error": "failed",
            "cancelled": "failed",
        }
        status = status_map.get(raw_status, "processing")
        outputs: List[ProviderArtifact] = []
        raw_output = data.get("output")
        if isinstance(raw_output, list):
            output_candidates = raw_output
        elif raw_output is None:
            output_candidates = []
        else:
            output_candidates = [raw_output]

        for candidate in output_candidates:
            if isinstance(candidate, str):
                outputs.append(ProviderArtifact(image_url=candidate, filename=_filename_from_url(candidate)))
            elif isinstance(candidate, dict):
                direct_url = _first_str(
                    candidate.get("url"),
                    candidate.get("uri"),
                    candidate.get("downloadUrl"),
                    candidate.get("download_url"),
                )
                if direct_url:
                    outputs.append(ProviderArtifact(image_url=direct_url, filename=_filename_from_url(direct_url)))

                nested_assets = candidate.get("assets") if isinstance(candidate.get("assets"), list) else candidate.get("artifacts")
                if isinstance(nested_assets, list):
                    for asset in nested_assets:
                        if not isinstance(asset, dict):
                            continue
                        asset_url = _first_str(
                            asset.get("url"),
                            asset.get("uri"),
                            asset.get("downloadUrl"),
                            asset.get("download_url"),
                        )
                        if asset_url:
                            outputs.append(ProviderArtifact(image_url=asset_url, filename=_filename_from_url(asset_url)))

        error_value = data.get("error")
        error_message = _first_str(data.get("failureReason"), data.get("failure_reason"), data.get("failureCode"))
        if not error_message and isinstance(error_value, dict):
            error_message = _first_str(error_value.get("message"), error_value.get("detail"), error_value.get("code"))
        if not error_message and isinstance(error_value, str):
            error_message = error_value
        return ProviderJob(
            provider_job_id=provider_job_id,
            status=status,
            outputs=outputs,
            error=error_message,
            raw=data,
        )


class BytePlusSeedreamAdapter(BaseProviderAdapter):
    provider_id = "byteplus"
    label = "BytePlus Seedream"
    media_kind = "image"
    summary = "Seedream image generation via BytePlus ModelArk."
    documentation_url = "https://docs.byteplus.com/en/docs/ModelArk"
    setup_hint = (
        "Create a BytePlus ModelArk API key, set GAUSET_BYTEPLUS_API_KEY, and optionally override "
        "GAUSET_BYTEPLUS_MODEL or GAUSET_BYTEPLUS_BASE_URL if your account is pinned to a different deployment."
    )
    required_env_vars = ("GAUSET_BYTEPLUS_API_KEY",)
    optional_env_vars = (
        "GAUSET_BYTEPLUS_MODEL",
        "GAUSET_BYTEPLUS_BASE_URL",
    )
    supported_aspect_ratios = EXTENDED_IMAGE_ASPECT_RATIOS
    max_outputs = 4
    default_model_env_var = "GAUSET_BYTEPLUS_MODEL"
    supports_prompt_only = True
    supports_references = False
    supports_multi_output = True
    models = (
        ProviderModelInfo("seedream-4-5-251128", "Seedream 4.5"),
        ProviderModelInfo("seedream-4-0-250828", "Seedream 4.0"),
        ProviderModelInfo("seedream-3-0-t2i-250415", "Seedream 3.0 T2I"),
    )

    def __init__(self) -> None:
        self.api_key = os.getenv("GAUSET_BYTEPLUS_API_KEY", "").strip()
        self.base_url = os.getenv("GAUSET_BYTEPLUS_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3").strip().rstrip("/")

    def healthcheck(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "Missing GAUSET_BYTEPLUS_API_KEY."
        if httpx is None:
            return False, "httpx is not installed in this backend environment."
        return True, ""

    def submit_image_job(self, request: ImageGenerationRequest) -> ProviderJob:
        self._ensure_httpx()
        payload: Dict[str, Any] = {
            "model": request.model,
            "prompt": request.prompt,
            "n": max(1, min(int(request.count or 1), 4)),
            "response_format": "b64_json",
        }
        size = _aspect_ratio_to_size(request.aspect_ratio)
        if size:
            payload["size"] = size
        if request.seed is not None:
            payload["seed"] = int(request.seed)
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt

        try:
            response = httpx.post(
                f"{self.base_url}/images/generations",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=90.0,
            )
        except Exception as exc:  # pragma: no cover - network dependent
            raise ProviderError(f"{self.label} request failed: {exc}") from exc
        payload = _ensure_success(response, self.label).json()
        outputs = _byteplus_artifacts(payload)
        if not outputs:
            raise ProviderError("BytePlus Seedream returned no images.")
        return ProviderJob(
            provider_job_id=f"byteplus_{uuid.uuid4().hex[:12]}",
            status="completed",
            outputs=outputs,
            raw=payload if isinstance(payload, dict) else {},
        )


def _byteplus_artifacts(payload: Any) -> List[ProviderArtifact]:
    outputs: List[ProviderArtifact] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return outputs
    for item in data:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("b64_json"), str):
            outputs.append(
                ProviderArtifact(
                    image_bytes=base64.b64decode(item["b64_json"]),
                    mime_type=item.get("mime_type", "image/png"),
                    filename=f"seedream_{uuid.uuid4().hex[:8]}.png",
                )
            )
            continue
        url = _first_str(item.get("url"), item.get("uri"))
        if url:
            outputs.append(ProviderArtifact(image_url=url, filename=_filename_from_url(url)))
    return outputs


class ProviderRegistry:
    def __init__(self) -> None:
        self.feature_enabled = _env_flag("GAUSET_ENABLE_PROVIDER_IMAGE_GEN", "0")
        self.adapters: Dict[str, BaseProviderAdapter] = {
            adapter.provider_id: adapter
            for adapter in [
                MockImageAdapter(),
                GoogleImagenAdapter(),
                RunwayImageAdapter(),
                BytePlusSeedreamAdapter(),
                StaticCatalogAdapter(
                    provider_id="kling",
                    label="Kling",
                    media_kind="video",
                    summary="Reserved for a later video-generation lane.",
                    reason="Video-only provider is not wired into /generate/image.",
                ),
                StaticCatalogAdapter(
                    provider_id="seedance",
                    label="Seedance",
                    media_kind="video",
                    summary="Reserved for a later video-generation lane.",
                    reason="Video-only provider is not wired into /generate/image.",
                ),
            ]
        }

    def list_catalog(self) -> List[ProviderCatalogEntry]:
        catalog: List[ProviderCatalogEntry] = []
        for adapter in self.adapters.values():
            entry = adapter.to_catalog_entry()
            if not self.feature_enabled and entry.media_kind == "image":
                entry.available = False
                entry.connection_status = "disabled"
                entry.availability_reason = "Provider image generation is disabled. Set GAUSET_ENABLE_PROVIDER_IMAGE_GEN=1."
            catalog.append(entry)
        return catalog

    def get_adapter(self, provider_id: str) -> BaseProviderAdapter:
        adapter = self.adapters.get(provider_id)
        if adapter is None:
            raise ProviderError(f"Unknown provider: {provider_id}")
        return adapter

    def get_image_adapter(self, provider_id: str) -> BaseProviderAdapter:
        if not self.feature_enabled:
            raise ProviderError("Provider image generation is disabled in this backend.")
        adapter = self.get_adapter(provider_id)
        if adapter.media_kind != "image":
            raise ProviderError(f"{adapter.label} is not exposed through /generate/image.")
        available, reason = adapter.healthcheck()
        if not available:
            raise ProviderError(reason)
        return adapter

    def image_provider_summary(self) -> Dict[str, Any]:
        catalog = self.list_catalog()
        image_entries = [entry for entry in catalog if entry.media_kind == "image"]
        video_entries = [entry for entry in catalog if entry.media_kind == "video"]
        available_image_entries = [entry for entry in image_entries if entry.available]
        unavailable_image_entries = [entry for entry in image_entries if not entry.available]
        return {
            "enabled": self.feature_enabled,
            "available": bool(available_image_entries),
            "image_provider_count": len(image_entries),
            "available_image_provider_count": len(available_image_entries),
            "video_provider_count": len(video_entries),
            "configured_image_providers": [entry.id for entry in available_image_entries],
            "unavailable_image_providers": [entry.id for entry in unavailable_image_entries],
        }


@lru_cache(maxsize=1)
def get_provider_registry() -> ProviderRegistry:
    return ProviderRegistry()


def materialize_artifact(artifact: ProviderArtifact) -> tuple[bytes, str, str]:
    if artifact.image_bytes is not None:
        mime_type = artifact.mime_type or "image/png"
        filename = artifact.filename or f"generated{_mime_to_extension(mime_type)}"
        return artifact.image_bytes, mime_type, filename

    if not artifact.image_url:
        raise ProviderError("Provider artifact did not include bytes or a download URL.")
    if httpx is None:
        raise ProviderError("httpx is not installed in this backend environment.")

    try:
        response = httpx.get(artifact.image_url, timeout=90.0, follow_redirects=True)
    except Exception as exc:  # pragma: no cover - network dependent
        raise ProviderError(f"Could not download generated artifact: {exc}") from exc
    _ensure_success(response, "Provider artifact download")
    mime_type = response.headers.get("content-type", artifact.mime_type or "image/png")
    filename = artifact.filename or _filename_from_url(artifact.image_url, fallback=f"generated{_mime_to_extension(mime_type)}")
    return response.content, mime_type, filename


def normalize_reference_image(filename: str, content_type: Optional[str], data: bytes) -> ReferenceImage:
    mime_type = content_type or {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(Path(filename).suffix.lower(), "image/png")
    return ReferenceImage(
        image_id=uuid.uuid4().hex,
        filename=filename,
        mime_type=mime_type,
        data=data,
    )
