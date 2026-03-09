# Backend Triage

## Start With These Checks

1. Check direct backend health:

```bash
curl -sS http://127.0.0.1:8000/health
curl -sS http://127.0.0.1:8000/setup/status
```

2. Check the frontend proxy:

```bash
curl -sS http://127.0.0.1:3015/api/mvp/health
curl -sS http://127.0.0.1:3015/api/mvp/setup/status
```

3. If you have a job or capture session already in flight:

```bash
curl -sS http://127.0.0.1:8000/jobs/<job_id>
curl -sS http://127.0.0.1:8000/capture/session/<session_id>
```

## Common Failures

### Frontend Proxy Returns `503 BACKEND_UNAVAILABLE`

Meaning:

- The Next.js proxy route is up, but it has no reachable backend base URL.

Check:

- Is the local backend running on `127.0.0.1:8000`?
- In deployment, is `GAUSET_BACKEND_URL` or `NEXT_PUBLIC_GAUSET_API_BASE_URL` set?

Action:

- Start the backend locally, or fix the deployed backend URL configuration.

### Frontend Proxy Returns `502 BACKEND_PROXY_ERROR`

Meaning:

- The frontend reached its proxy code, but the proxy could not contact the backend server.

Check:

- `curl -sS http://127.0.0.1:8000/health`
- backend bind address and port
- whether the backend process crashed after startup

Action:

- Restore direct backend health first, then retry through `/api/mvp/*`.

### Backend Fails To Start With `ModuleNotFoundError: cv2`

Meaning:

- The backend imports OpenCV in `backend/api/routes.py` and `backend/models/sharp_fusion_reconstructor.py`, but `./setup.sh` does not install it.

Action:

- Install an OpenCV package into `backend_venv`, then restart the backend.

### `/setup/status` Shows Missing Preview Or Asset Lanes

Meaning:

- Preview availability depends on `backend/ml-sharp` existing or `GAUSET_ML_SHARP_COMMAND` being set.
- Asset availability depends on `backend/TripoSR` existing or `GAUSET_TRIPOSR_COMMAND` being set.

Check:

- Did `./setup.sh` finish cloning both repos?
- Are the override environment variables set correctly?

Action:

- Rerun `./setup.sh`, or point the backend to working external commands with `GAUSET_ML_SHARP_COMMAND` and `GAUSET_TRIPOSR_COMMAND`.

### Reconstruction Is Unavailable In `/setup/status`

Meaning:

- Reconstruction is only available when preview tooling exists and `reconstruct_capture` imports successfully.

Check:

- the `errors.reconstruction_import` field in `/setup/status`
- local Python dependency state
- whether the SHARP and OpenCV stack is importable

Action:

- Fix the import failure first. If imports are healthy but the lane is still false, verify the preview toolchain is present.

### `POST /reconstruct/session/<session_id>` Returns `422`

Meaning:

- The capture set is not ready.

Check:

- `GET /capture/session/<session_id>`

Expected:

- `ready_for_reconstruction=true`
- `frame_count >= minimum_images`

Action:

- Add more overlapping images. The local backend minimum is `8`.

### `POST /reconstruct/session/<session_id>` Returns `503`

Meaning:

- The reconstruction worker is unavailable, or it failed to import during backend startup.

Check:

- `/setup/status`
- `errors.reconstruction_import`

Action:

- Treat this as an environment issue, not a frontend bug.

### Jobs Stay In `processing` Or End In `failed`

Check:

- `GET /jobs/<job_id>`
- the `error` field on the job record

Typical causes:

- `ML-Sharp repo not found at backend/ml-sharp`
- `TripoSR repo not found at backend/TripoSR`
- generator command failed
- output normalization failed because no `.ply` or `.glb` was produced

Action:

- Fix the underlying model toolchain first, then rerun the job.

### Review Or Comment Endpoints Return `404`

Meaning:

- The scene or version has not been saved yet.

Check:

- `GET /scene/<scene_id>/versions`

Action:

- Save the scene first, then retry review or comments against a real `version_id`.

### Storage URLs Return `404`

Meaning:

- The backend did not write all expected outputs, or the frontend proxy is pointing at the wrong backend.

Check:

- `uploads/`, `assets/`, and `scenes/` exist
- the job result contains the expected URLs
- direct backend storage URL works before checking the proxy URL

Action:

- Resolve the failed generation or proxy wiring before debugging the frontend viewer.

## Mock-Mode Warning

- `GAUSET_ALLOW_MOCK_MODE=1` permits ML-Sharp and TripoSR fallback output when inference fails.
- Use it only when you intentionally want degraded local unblock behavior.
- Do not treat mock output as release-ready. The hostile audits explicitly flag mock-like output.
