# Provider Image Generation Setup

This repo now supports server-side prompt-to-image generation for:

- Google Vertex Imagen
- Runway
- BytePlus Seedream
- `mock` for local review without live credentials

The internal `gauset-app` editor intake flow is wired to the local MVP backend routes:

- `GET /providers`
- `POST /generate/image`
- `POST /generate/environment`
- `POST /reconstruct/session/:id` for truthful reconstruction kickoff status

The editor intake flow exposes:

- `Import` for file uploads
- `Generate` for provider-backed still generation
- `Generate World` to chain a provider still directly into the Gaussian-splat preview lane

Release truth:

- `gauset-app` is the internal/staging surface for this lane.
- `gauset.com` remains the canonical public release surface until provider generation is separately certified there.
- The reconstruction kickoff route is present in `gauset-app`, but it still truthfully returns `501` until a dedicated multi-view worker is connected.

## Local config flow

1. Copy [`../.env.backend.example`](../.env.backend.example) to `.env.backend.local`.
2. Fill in the provider credentials you want to test.
3. Run `./setup.sh`.
4. Start the backend:

```bash
source backend_venv/bin/activate
python -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 8000
```

5. Start the frontend:

```bash
npm run dev
```

6. Open [http://127.0.0.1:3015/mvp](http://127.0.0.1:3015/mvp). `npm run dev` now starts the full local stack and reuses the backend from step 4 if it is already healthy.

The backend automatically loads these files, in order, if they exist:

- `.env.backend.local`
- `.env.providers.local`
- `.env.local`
- `.env.backend`
- `.env.providers`
- `.env`

Shell-exported environment variables still win over file-based values.

## Provider credentials

### Google Vertex Imagen

Required:

- `GAUSET_GOOGLE_VERTEX_PROJECT`

Recommended:

- `GAUSET_GOOGLE_VERTEX_LOCATION=us-central1`
- `GAUSET_GOOGLE_VERTEX_MODEL=imagen-4.0-generate-001`

Authentication options:

1. Application Default Credentials:
   - Run `gcloud auth application-default login`
2. Service-account file:
   - Set `GAUSET_GOOGLE_SERVICE_ACCOUNT_FILE=/absolute/path/to/key.json`
3. Service-account JSON inline:
   - Set `GAUSET_GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ...}'`
4. Short-lived bearer token:
   - Set `GAUSET_GOOGLE_VERTEX_ACCESS_TOKEN`

Minimum project setup:

- Vertex AI API enabled in the target Google Cloud project
- Credentials allowed to call Vertex AI image generation in the configured project/location

### Runway

Required:

- `GAUSET_RUNWAY_API_KEY`

Recommended:

- `GAUSET_RUNWAY_MODEL=gen4_image`
- `GAUSET_RUNWAY_API_VERSION=2024-11-06`

Optional reference handling:

- `GAUSET_RUNWAY_UPLOAD_REFERENCES=1`
  Use this if you want every reference image uploaded through the Runway uploads API.
- `GAUSET_RUNWAY_INLINE_REFERENCE_MAX_BYTES=4500000`
  Larger references are automatically uploaded even when `GAUSET_RUNWAY_UPLOAD_REFERENCES=0`.

### BytePlus Seedream

Required:

- `GAUSET_BYTEPLUS_API_KEY`

Recommended:

- `GAUSET_BYTEPLUS_MODEL=seedream-4-5-251128`

Optional:

- `GAUSET_BYTEPLUS_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3`

## Local review checklist

1. `curl -sS http://127.0.0.1:8000/providers`
   Confirm the providers you configured show `"available": true`.
2. `curl -sS -X POST http://127.0.0.1:8000/generate/image -H 'Content-Type: application/json' -d '{"provider":"mock","model":"mock-cinematic-v1","prompt":"production scout frame","aspect_ratio":"16:9","count":1}'`
   Confirm the backend returns a `job_id` and `/jobs/:id` resolves to `status=completed`.
3. In the editor, switch the left panel from `Import` to `Generate`.
4. Test `Generate Still`.
5. Test `Generate World`.
6. Confirm the generated still lands in the same tray as uploaded stills.
7. Confirm the generated still can also drive `Generate Preview`, `Generate Asset`, and capture-set actions.
8. Confirm reconstruction remains truthfully unavailable after a ready capture set until the worker exists.

## Current constraints

- Provider keys remain server-side only.
- Generated stills are normalized into the existing upload store and assigned a normal `image_id`.
- `Kling` and `Seedance` stay registry-visible as video-only placeholders. They are intentionally not exposed through the still-image intake lane yet.
- Local route presence does not mean the lane is staging-activated. Real provider operation still depends on valid env and credentials.
