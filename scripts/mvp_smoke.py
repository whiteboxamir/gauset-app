#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "http://127.0.0.1:3015"
POLL_TIMEOUT_SECONDS = 180


def request(method: str, url: str, payload: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=payload, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def upload_file(api_base_url: str, file_path: Path) -> dict:
    boundary = "----GausetSmokeBoundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + file_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    status, raw = request(
        "POST",
        f"{api_base_url}/upload",
        payload=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    if status != 200:
        raise RuntimeError(f"upload failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def fetch_providers(api_base_url: str) -> dict:
    status, raw = request("GET", f"{api_base_url}/providers")
    if status != 200:
        raise RuntimeError(f"provider catalog failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def start_generation(api_base_url: str, kind: str, image_id: str) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/generate/{kind}",
        payload=json.dumps({"image_id": image_id}).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"generation start failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def start_image_generation(
    api_base_url: str,
    *,
    provider: str,
    model: str,
    prompt: str,
    reference_image_ids: list[str] | None = None,
) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/generate/image",
        payload=json.dumps(
            {
                "provider": provider,
                "model": model,
                "prompt": prompt,
                "aspect_ratio": "16:9",
                "count": 1,
                "reference_image_ids": reference_image_ids or [],
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"image generation start failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def create_capture_session(api_base_url: str, target_images: int = 8) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/capture/session",
        payload=json.dumps({"target_images": target_images}).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"capture session failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def add_capture_frames(api_base_url: str, session_id: str, image_ids: list[str]) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/capture/session/{session_id}/frames",
        payload=json.dumps({"image_ids": image_ids}).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"capture frame add failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def start_reconstruction(api_base_url: str, session_id: str) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/reconstruct/session/{session_id}",
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"reconstruction start failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def start_reconstruction_expect_failure(api_base_url: str, session_id: str, expected_status: int = 422) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/reconstruct/session/{session_id}",
        headers={"Content-Type": "application/json"},
    )
    if status != expected_status:
        raise RuntimeError(f"expected reconstruction failure {expected_status}, got {status}: {raw.decode(errors='ignore')}")
    try:
        return json.loads(raw.decode())
    except json.JSONDecodeError:
        return {"detail": raw.decode(errors="ignore")}


def poll_job(api_base_url: str, job_id: str) -> dict:
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        _, raw = request("GET", f"{api_base_url}/jobs/{job_id}")
        payload = json.loads(raw.decode())
        if payload["status"] in {"completed", "failed"}:
            return payload
        time.sleep(1)
    raise TimeoutError(f"timed out waiting for job {job_id}")


def head(url: str) -> int:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.status


def fetch_json(url: str) -> dict | list:
    _, raw = request("GET", url)
    return json.loads(raw.decode())


def save_scene(api_base_url: str, scene_id: str, scene_graph: dict) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/scene/save",
        payload=json.dumps({"scene_id": scene_id, "scene_graph": scene_graph, "source": "manual"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"scene save failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def post_comment(api_base_url: str, scene_id: str, version_id: str, body: str) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/scene/{scene_id}/versions/{version_id}/comments",
        payload=json.dumps({"author": "Smoke QA", "body": body, "anchor": "scene"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"comment save failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def update_review(api_base_url: str, scene_id: str) -> dict:
    status, raw = request(
        "POST",
        f"{api_base_url}/scene/{scene_id}/review",
        payload=json.dumps(
            {
                "metadata": {
                    "project_name": "Smoke Test Project",
                    "scene_title": "Proxy Validation",
                    "location_name": "Localhost",
                    "owner": "Smoke QA",
                    "notes": "Automated review metadata validation.",
                },
                "approval_state": "approved",
                "updated_by": "Smoke QA",
                "note": "Automated approval pass.",
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise RuntimeError(f"review update failed ({status}): {raw.decode(errors='ignore')}")
    return json.loads(raw.decode())


def review_shell_present(web_base_url: str, scene_id: str, version_id: str) -> bool:
    query = urllib.parse.urlencode({"scene": scene_id, "version": version_id})
    _, raw = request("GET", f"{web_base_url}/mvp/review?{query}")
    body = raw.decode(errors="ignore")
    return any(title in body for title in ("Persistent World Review", "Read-only Scene Review"))


def run_asset_smoke(api_base_url: str, file_path: Path) -> dict:
    upload = upload_file(api_base_url, file_path)
    generation = start_generation(api_base_url, "asset", upload["image_id"])
    job = poll_job(api_base_url, generation["job_id"])
    if job["status"] != "completed":
        raise RuntimeError(job.get("error") or "asset generation failed")
    preview_status = head(f"{api_base_url}{job['result']['urls']['preview']}")
    return {
        "type": "asset",
        "job_id": generation["job_id"],
        "asset_id": job["result"]["asset_id"],
        "preview_status": preview_status,
    }


def run_provider_smoke(api_base_url: str, file_path: Path) -> dict:
    provider_catalog = fetch_providers(api_base_url)
    providers = provider_catalog.get("providers") if isinstance(provider_catalog, dict) else []
    mock_provider = next(
        (
            provider
            for provider in providers
            if isinstance(provider, dict) and provider.get("id") == "mock" and provider.get("available") is True
        ),
        None,
    )
    if not isinstance(mock_provider, dict):
        raise RuntimeError("mock provider is unavailable; set GAUSET_ENABLE_PROVIDER_IMAGE_GEN=1 and GAUSET_PROVIDER_MOCK=1")

    reference = upload_file(api_base_url, file_path)
    model = mock_provider.get("models", [{}])[0].get("id", "mock-cinematic-v1")
    generation = start_image_generation(
        api_base_url,
        provider="mock",
        model=model,
        prompt="Persistent world scout pass, grounded camera, production texture cues",
        reference_image_ids=[reference["image_id"]],
    )
    job = poll_job(api_base_url, generation["job_id"])
    if job["status"] != "completed":
        raise RuntimeError(job.get("error") or "provider image generation failed")

    images = job.get("result", {}).get("images", [])
    if not images:
        raise RuntimeError(f"provider job returned no images: {json.dumps(job)}")
    generated = images[0]
    if generated.get("source_type") != "generated":
        raise RuntimeError(f"generated upload missing source_type: {json.dumps(generated)}")

    preview_generation = start_generation(api_base_url, "environment", generated["image_id"])
    preview_job = poll_job(api_base_url, preview_generation["job_id"])
    if preview_job["status"] != "completed":
        raise RuntimeError(preview_job.get("error") or "preview from generated image failed")

    asset_generation = start_generation(api_base_url, "asset", generated["image_id"])
    asset_job = poll_job(api_base_url, asset_generation["job_id"])
    if asset_job["status"] != "completed":
        raise RuntimeError(asset_job.get("error") or "asset from generated image failed")

    return {
        "type": "provider",
        "provider": "mock",
        "job_id": generation["job_id"],
        "generated_image_id": generated["image_id"],
        "preview_scene_id": preview_job["result"]["scene_id"],
        "asset_id": asset_job["result"]["asset_id"],
    }


def run_environment_smoke(api_base_url: str, web_base_url: str, file_path: Path) -> dict:
    upload = upload_file(api_base_url, file_path)
    generation = start_generation(api_base_url, "environment", upload["image_id"])
    job = poll_job(api_base_url, generation["job_id"])
    if job["status"] != "completed":
        raise RuntimeError(job.get("error") or "environment generation failed")
    splat_status = head(f"{api_base_url}{job['result']['urls']['splats']}")
    scene_id = job["result"]["scene_id"]
    saved = save_scene(
        api_base_url,
        scene_id,
        {
            "environment": {
                "id": scene_id,
                "urls": job["result"]["urls"],
            },
            "assets": [],
        },
    )
    review = update_review(api_base_url, scene_id)
    comment = post_comment(api_base_url, scene_id, saved["version_id"], "Environment smoke comment.")
    review_ready = review_shell_present(web_base_url, scene_id, saved["version_id"])
    return {
        "type": "environment",
        "job_id": generation["job_id"],
        "scene_id": scene_id,
        "splat_status": splat_status,
        "version_id": saved["version_id"],
        "approval_state": review["approval"]["state"],
        "comment_id": comment["comment"]["comment_id"],
        "review_shell_present": review_ready,
    }


def run_reconstruction_smoke(api_base_url: str, web_base_url: str, file_path: Path, capture_frames: int) -> dict:
    uploads = [upload_file(api_base_url, file_path) for _ in range(capture_frames)]
    session = create_capture_session(api_base_url, target_images=capture_frames)
    session = add_capture_frames(api_base_url, session["session_id"], [upload["image_id"] for upload in uploads])
    quality_summary = session.get("quality_summary") if isinstance(session.get("quality_summary"), dict) else {}
    blockers = session.get("reconstruction_blockers") if isinstance(session.get("reconstruction_blockers"), list) else []
    if session.get("ready_for_reconstruction"):
        raise RuntimeError(f"duplicate-heavy capture session incorrectly became ready: {json.dumps(session)}")
    if int(quality_summary.get("duplicate_frames") or 0) <= 0:
        raise RuntimeError(f"duplicate-heavy capture session did not report duplicates: {json.dumps(session)}")
    if not blockers:
        raise RuntimeError(f"duplicate-heavy capture session returned no blockers: {json.dumps(session)}")

    rejection = start_reconstruction_expect_failure(api_base_url, session["session_id"])
    rejection_detail = str(rejection.get("detail") or "").strip()
    if "duplicate" not in rejection_detail.lower() and "unique" not in rejection_detail.lower():
        raise RuntimeError(f"unexpected reconstruction rejection detail: {json.dumps(rejection)}")

    return {
        "type": "reconstruction_gate",
        "session_id": session["session_id"],
        "frame_count": capture_frames,
        "unique_frame_count": quality_summary.get("unique_frame_count"),
        "duplicate_frames": quality_summary.get("duplicate_frames"),
        "status": session.get("status"),
        "blocker_count": len(blockers),
        "rejection_detail": rejection_detail,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Gauset MVP smoke tests through the Next.js proxy.")
    parser.add_argument("--mode", choices=["asset", "environment", "provider", "reconstruction", "full"], default="full")
    parser.add_argument("--web-base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--asset-image", default="/Users/amirboz/gauset-app/backend/TripoSR/examples/chair.png")
    parser.add_argument("--environment-image", default="/Users/amirboz/gauset-app/backend/ml-sharp/data/teaser.jpg")
    parser.add_argument("--capture-frames", type=int, default=8)
    args = parser.parse_args()

    web_base_url = args.web_base_url.rstrip("/")
    api_base_url = f"{web_base_url}/api/mvp"
    results: list[dict] = []

    if args.mode in {"asset", "full"}:
        results.append(run_asset_smoke(api_base_url, Path(args.asset_image)))
    provider_mode_enabled = os.getenv("GAUSET_ENABLE_PROVIDER_IMAGE_GEN", "").strip().lower() in {"1", "true", "yes", "on"}
    mock_mode_enabled = os.getenv("GAUSET_PROVIDER_MOCK", "").strip().lower() in {"1", "true", "yes", "on"}

    if args.mode == "provider" or (args.mode == "full" and provider_mode_enabled and mock_mode_enabled):
        results.append(run_provider_smoke(api_base_url, Path(args.asset_image)))
    if args.mode in {"environment", "full"}:
        results.append(run_environment_smoke(api_base_url, web_base_url, Path(args.environment_image)))
    if args.mode in {"reconstruction", "full"}:
        results.append(run_reconstruction_smoke(api_base_url, web_base_url, Path(args.environment_image), args.capture_frames))

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
