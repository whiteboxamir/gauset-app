import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from providers import ImageGenerationRequest, get_provider_registry, materialize_artifact  # noqa: E402
from providers.image_generation import (  # noqa: E402
    BytePlusSeedreamAdapter,
    GoogleImagenAdapter,
    ProviderArtifact,
    RunwayImageAdapter,
    _byteplus_artifacts,
    _google_prediction_artifacts,
    normalize_reference_image,
)


class _FakeResponse:
    def __init__(self, status_code: int = 200, json_data=None, text: str = "", headers=None) -> None:
        self.status_code = status_code
        self._json_data = json_data
        self.text = text
        self.headers = headers or {}

    def json(self):
        if self._json_data is None:
            raise ValueError("missing json")
        return self._json_data


class _FakeUploadClient:
    def __init__(self) -> None:
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url, data=None, files=None):
        self.calls.append({"url": url, "data": data, "files": files})
        return _FakeResponse(status_code=204)


class ProviderImageGenerationTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_provider_registry.cache_clear()

    def test_mock_provider_disabled_when_feature_flag_is_off(self) -> None:
        with patch.dict(os.environ, {"GAUSET_ENABLE_PROVIDER_IMAGE_GEN": "0", "GAUSET_PROVIDER_MOCK": "1"}, clear=False):
            get_provider_registry.cache_clear()
            registry = get_provider_registry()
            catalog = registry.list_catalog()
            mock_entry = next(entry for entry in catalog if entry.id == "mock")
            self.assertFalse(mock_entry.available)
            self.assertEqual(mock_entry.connection_status, "disabled")

    def test_mock_provider_generates_materialized_image(self) -> None:
        with patch.dict(os.environ, {"GAUSET_ENABLE_PROVIDER_IMAGE_GEN": "1", "GAUSET_PROVIDER_MOCK": "1"}, clear=False):
            get_provider_registry.cache_clear()
            registry = get_provider_registry()
            adapter = registry.get_image_adapter("mock")
            job = adapter.submit_image_job(
                ImageGenerationRequest(
                    provider="mock",
                    model="mock-cinematic-v1",
                    prompt="Production alley, grounded camera, wet asphalt",
                    count=1,
                )
            )
            self.assertEqual(job.status, "completed")
            self.assertEqual(len(job.outputs), 1)
            content, mime_type, filename = materialize_artifact(job.outputs[0])
            self.assertTrue(content.startswith(b"\x89PNG"))
            self.assertEqual(mime_type, "image/png")
            self.assertTrue(filename.endswith(".png"))

    def test_catalog_exposes_setup_metadata_for_real_providers(self) -> None:
        with patch.dict(os.environ, {"GAUSET_ENABLE_PROVIDER_IMAGE_GEN": "1"}, clear=False):
            get_provider_registry.cache_clear()
            registry = get_provider_registry()
            catalog = {entry.id: entry for entry in registry.list_catalog()}

            google_entry = catalog["google"]
            runway_entry = catalog["runway"]
            byteplus_entry = catalog["byteplus"]

            self.assertIn("GAUSET_GOOGLE_VERTEX_PROJECT", google_entry.required_env)
            self.assertIn("16:9", google_entry.supported_aspect_ratios)
            self.assertTrue((google_entry.documentation_url or "").startswith("https://"))

            self.assertIn("GAUSET_RUNWAY_API_KEY", runway_entry.required_env)
            self.assertEqual(runway_entry.max_reference_images, 3)
            self.assertEqual(runway_entry.max_outputs, 1)

            self.assertIn("GAUSET_BYTEPLUS_API_KEY", byteplus_entry.required_env)
            self.assertIn("seedream-4-5-251128", [model["id"] for model in byteplus_entry.models])

    def test_google_healthcheck_reports_missing_service_account_file(self) -> None:
        with patch.dict(
            os.environ,
            {
                "GAUSET_GOOGLE_VERTEX_PROJECT": "gauset-prod",
                "GAUSET_GOOGLE_SERVICE_ACCOUNT_FILE": "/tmp/gauset-missing-service-account.json",
            },
            clear=False,
        ):
            adapter = GoogleImagenAdapter()
            available, reason = adapter.healthcheck()
            self.assertFalse(available)
            self.assertIn("not found", reason)

    def test_google_prediction_artifacts_parse_nested_bytes(self) -> None:
        payload = {
            "predictions": [
                {
                    "images": [
                        {
                            "bytesBase64Encoded": "iVBORw0KGgo=",
                            "mimeType": "image/png",
                        }
                    ]
                }
            ]
        }
        outputs = _google_prediction_artifacts(payload)
        self.assertEqual(len(outputs), 1)
        self.assertEqual(outputs[0].image_bytes, b"\x89PNG\r\n\x1a\n")

    def test_runway_payload_uses_supported_ratio_and_inline_reference_objects(self) -> None:
        with patch.dict(os.environ, {"GAUSET_RUNWAY_API_KEY": "rw_test"}, clear=False):
            adapter = RunwayImageAdapter()
            request = ImageGenerationRequest(
                provider="runway",
                model="gen4_image",
                prompt="Grounded alley with production haze",
                negative_prompt="watermark",
                aspect_ratio="16:9",
                reference_images=[
                    normalize_reference_image("frame.png", "image/png", b"frame-bytes"),
                ],
            )
            payload = adapter._payload(request)
            self.assertEqual(payload["ratio"], "1280:720")
            self.assertEqual(payload["negativePrompt"], "watermark")
            self.assertEqual(payload["referenceImages"][0]["tag"], request.reference_images[0].image_id[:16])
            self.assertTrue(payload["referenceImages"][0]["uri"].startswith("data:image/png;base64,"))

    def test_runway_large_reference_uses_upload_bootstrap(self) -> None:
        fake_client = _FakeUploadClient()
        with patch.dict(
            os.environ,
            {
                "GAUSET_RUNWAY_API_KEY": "rw_test",
                "GAUSET_RUNWAY_UPLOAD_REFERENCES": "1",
            },
            clear=False,
        ), patch("providers.image_generation.httpx.post") as mock_post, patch(
            "providers.image_generation.httpx.Client", return_value=fake_client
        ):
            mock_post.return_value = _FakeResponse(
                json_data={
                    "uploadUrl": "https://uploads.runway.example/object",
                    "uri": "runway://asset/reference-1",
                    "fields": {"key": "asset-key"},
                }
            )

            adapter = RunwayImageAdapter()
            request = ImageGenerationRequest(
                provider="runway",
                model="gen4_image",
                prompt="Industrial night set",
                reference_images=[normalize_reference_image("big.png", "image/png", b"1234567890")],
            )
            payload = adapter._payload(request)

            self.assertEqual(payload["referenceImages"][0]["uri"], "runway://asset/reference-1")
            self.assertEqual(fake_client.calls[0]["data"], {"key": "asset-key"})
            self.assertEqual(fake_client.calls[0]["files"]["file"][0], "big.png")

    def test_byteplus_artifacts_parse_base64_payload(self) -> None:
        outputs = _byteplus_artifacts({"data": [{"b64_json": "iVBORw0KGgo=", "mime_type": "image/png"}]})
        self.assertEqual(len(outputs), 1)
        self.assertEqual(outputs[0].image_bytes, b"\x89PNG\r\n\x1a\n")

    def test_materialize_artifact_downloads_remote_url(self) -> None:
        artifact = ProviderArtifact(image_url="https://cdn.example/generated.png", mime_type="image/png")
        with patch("providers.image_generation.httpx.get") as mock_get:
            mock_get.return_value = _FakeResponse(
                json_data=None,
                text="",
                headers={"content-type": "image/png"},
            )
            mock_get.return_value.content = b"\x89PNG\r\n\x1a\n"
            content, mime_type, filename = materialize_artifact(artifact)
            self.assertEqual(content, b"\x89PNG\r\n\x1a\n")
            self.assertEqual(mime_type, "image/png")
            self.assertEqual(filename, "generated.png")

    def test_byteplus_adapter_defaults_to_latest_curated_model(self) -> None:
        adapter = BytePlusSeedreamAdapter()
        self.assertEqual(adapter.default_model_id(), "seedream-4-5-251128")


if __name__ == "__main__":
    unittest.main()
