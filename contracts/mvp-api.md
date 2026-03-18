# MVP Frontend Proxy and Backend Contract Snapshot

Snapshot date: 2026-03-09.

## Scope

This snapshot covers:

- The MVP frontend proxy under `/api/mvp/*`
- The local Python backend used by the proxy in development
- The Vercel Python backend used for deployed preview and asset lanes
- Current frontend request and response expectations in the MVP editor

## Topology

### Confirmed

- The frontend talks to `MVP_API_BASE_URL = "/api/mvp"`.
- The proxy route exists at `/api/mvp/[...path]` and forwards every request to an upstream backend base URL.
- In local development, the default upstream is `http://127.0.0.1:8000` unless `GAUSET_BACKEND_URL` or `NEXT_PUBLIC_GAUSET_API_BASE_URL` is set.
- The Vercel backend routes `/api` and `/api/*` into one FastAPI app and strips the `/api` prefix before dispatch.

### Inferred

- `/api/mvp` itself is not exposed because the proxy route is catch-all, not optional catch-all.
- The editor expects the proxy to be the single public entry point even when storage URLs are later persisted inside scene JSON.

## Proxy Contract

### Confirmed behavior

- Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Query params are copied to the upstream URL.
- Request bodies are forwarded for non-`GET` and non-`HEAD` methods.
- Hop-by-hop headers are stripped on both request and response.
- `content-encoding` and `content-length` are removed from upstream responses before returning them to the browser.
- Redirects are handled manually at the fetch layer and then surfaced back as plain responses.

### Confirmed proxy error envelopes

- If no backend base URL is configured:
  - Storage requests under `storage/*` return plain-text `503`.
  - All other requests return JSON `503`:
    - `code: "BACKEND_UNAVAILABLE"`
    - `message`
    - `checklist: string[]`
- If the proxy route is reachable but upstream fetch fails:
  - Storage requests under `storage/*` return plain-text `502`.
  - All other requests return JSON `502`:
    - `code: "BACKEND_PROXY_ERROR"`
    - `message`
    - `detail`

See:

- `schemas/proxy.backend-unavailable.error.json`
- `schemas/proxy.backend-proxy-error.error.json`

## Backend Differences

| Area | Local FastAPI backend | Vercel FastAPI backend |
| --- | --- | --- |
| Health root | `GET /health` only | `GET /` and `GET /health` |
| Job persistence | In-memory only | Stored under `jobs/{job_id}.json` |
| Upload response | Includes `analysis`; `filepath` is absolute | No `analysis`; `filepath` is a storage path |
| Preview generation | Real async background task | Synchronous generation, but still returns `"status": "processing"` |
| Asset generation | Real async background task | Synchronous generation, but still returns `"status": "processing"` |
| Reconstruction | Can run if worker imports and lane is available | Always `501` after readiness checks |
| Capture QA | Includes per-frame `analysis` and session `quality_summary` | No frame analysis and no `quality_summary` |
| Scene save | Stores the submitted workspace scene graph | Stores the submitted workspace scene graph |
| Review payload | Stores normalized metadata, approval history, and structured issues | Stores normalized metadata, approval history, and structured issues |
| Review existence check | Any scene directory is enough | Requires `scene.json`, `versions_index.json`, or `review.json` |
| Storage serving | Static mounts under `/storage/uploads`, `/storage/assets`, `/storage/scenes` | Dynamic `/storage/{storage_path:path}` route, optionally `307` redirecting to blob URLs |

## Endpoint Reference

### Health and setup

#### `GET /api/mvp/health`

Confirmed:

- Proxy target: `GET /health`
- Local response: `{ "status": "ok" }`
- Vercel response: `{ "status": "ok" }`

Errors:

- Proxy `503` or `502` envelopes if upstream is unavailable

See:

- `schemas/health.response.confirmed.json`

#### `GET /api/mvp/setup/status`

Confirmed common fields:

- `status`
- `python_version`
- `backend`
- `capabilities.preview`
- `capabilities.reconstruction`
- `capabilities.asset`
- `capture.minimum_images`
- `capture.recommended_images`
- `capture.max_images`
- `capture.guidance`
- `directories`
- `models`
- `torch`

Confirmed local-only additions:

- `project_root`
- `errors.reconstruction_import`
- Dynamic model availability booleans based on local folders and imports

Confirmed Vercel-only additions:

- `storage_mode`
- `generator.environment`
- `generator.asset`

Inferred:

- The frontend only relies on a normalized subset of this payload for lane availability, backend truth copy, and capture limits.

See:

- `schemas/setup-status.local.confirmed.json`
- `schemas/setup-status.vercel.confirmed.json`

### Upload

#### `POST /api/mvp/upload`

Request:

- `multipart/form-data`
- Required part: `file`

Confirmed local success shape:

- `image_id`
- `filename`
- `filepath` as absolute filesystem path
- `url` as `/storage/uploads/images/{filename}`
- `analysis` with technical scoring and warnings

Confirmed Vercel success shape:

- `image_id`
- `filename`
- `filepath` as `uploads/images/{filename}`
- `url` as `/storage/uploads/images/{filename}`

Confirmed errors:

- `400 Missing filename in upload`
- `400 Uploaded file is empty`

See:

- `schemas/upload.response.local.confirmed.json`
- `schemas/upload.response.vercel.confirmed.json`

### Preview lane

#### `POST /api/mvp/generate/environment`

Request JSON:

```json
{
  "image_id": "string"
}
```

Confirmed response shape in both backends:

- `scene_id`
- `job_id`
- `status: "processing"`
- `urls.splats`
- `urls.cameras`
- `urls.metadata`

Confirmed local behavior:

- Resolves uploads from `uploads/images/{image_id}.*`
- Missing upload returns `400 Image {image_id} not found in uploads`
- Background task updates an in-memory job record
- Final job record includes absolute `environment_dir` and absolute `files` paths

Confirmed Vercel behavior:

- Missing upload metadata returns `404 Uploaded image not found`
- Generation finishes before the HTTP response returns
- Final job record is written to storage and includes storage-relative paths

Inferred:

- The frontend always polls `/api/mvp/jobs/{job_id}` before treating the preview as ready.
- The editor expects the loaded environment object to carry `lane`, `urls`, optional `files`, and optional `metadata`.

See:

- `schemas/generate-environment.response.confirmed.json`
- `schemas/job.environment.local.completed.confirmed.json`

### Asset lane

#### `POST /api/mvp/generate/asset`

Request JSON:

```json
{
  "image_id": "string"
}
```

Confirmed response shape in both backends:

- `asset_id`
- `job_id`
- `status: "processing"`
- `urls.mesh`
- `urls.texture`
- `urls.preview`

Confirmed local behavior:

- Missing upload returns `400 Image {image_id} not found in uploads`
- Background task updates an in-memory job record
- Final job record includes absolute `asset_dir` and absolute `files` paths

Confirmed Vercel behavior:

- Missing upload metadata returns `404 Uploaded image not found`
- Generation finishes before the HTTP response returns
- Final job record is persisted and uses storage-relative paths

Inferred:

- The editor builds asset scene entries with `id`, `name`, `mesh`, `texture`, `preview`, `instanceId`, `position`, `rotation`, and `scale`. The backend does not validate those asset instance fields when the scene is later saved.

See:

- `schemas/generate-asset.response.confirmed.json`
- `schemas/job.asset.vercel.completed.confirmed.json`

### Jobs

#### `GET /api/mvp/jobs/{job_id}`

Confirmed common fields:

- `id`
- `type`
- `status`
- `created_at`
- `updated_at`
- `error`
- `result`

Confirmed status values from route code and frontend polling:

- `processing`
- `completed`
- `failed`

Confirmed result variants:

- Preview jobs: `scene_id`, `environment_dir`, `files`, `urls`
- Asset jobs: `asset_id`, `asset_dir`, `files`, `urls`
- Local reconstruction jobs: preview-style scene result plus `stats`

Confirmed errors:

- Local: `404 Job not found`
- Vercel: `404 Job not found`

Important confirmed divergence:

- Local jobs disappear on process restart because they live only in memory.
- Vercel jobs are stored under `jobs/{job_id}.json`.

### Capture Session

#### `POST /api/mvp/capture/session`

Request JSON:

```json
{
  "target_images": 12
}
```

Confirmed:

- `target_images` defaults to `12`
- `target_images` is clamped to the inclusive range `8..32`
- Response always identifies `lane: "reconstruction"`

Confirmed common response fields:

- `session_id`
- `lane`
- `status`
- `created_at`
- `updated_at`
- `minimum_images`
- `recommended_images`
- `max_images`
- `frame_count`
- `coverage_percent`
- `ready_for_reconstruction`
- `frames`
- `guidance`

Confirmed local-only additions:

- `quality_summary` exists from session creation onward
- `quality_summary.unique_frame_count`
- `quality_summary.duplicate_ratio`
- `quality_summary.reconstruction_gate`

See:

- `schemas/capture-session.local.ready.confirmed.json`
- `schemas/capture-session.vercel.ready.confirmed.json`

#### `GET /api/mvp/capture/session/{session_id}`

Confirmed:

- Returns a normalized session payload and persists refreshed QA fields when stale

Confirmed errors:

- Local: `404 Capture session not found`
- Vercel: `404 Capture session not found`

#### `POST /api/mvp/capture/session/{session_id}/frames`

Request JSON:

```json
{
  "image_ids": ["id1", "id2"]
}
```

Confirmed:

- Empty array returns `400 At least one uploaded image is required`
- Duplicate `image_id`s are silently skipped
- Additional images beyond `max_images` are silently skipped
- `coverage_percent` is calculated against `recommended_images`
- Local status becomes `"ready"` only when the reconstruction gate passes
- Local status becomes `"blocked"` when minimum count is reached but duplicates or quality blockers remain
- Vercel status becomes `"ready"` once `frame_count >= minimum_images`, otherwise `"collecting"`

Confirmed local frame fields:

- `image_id`
- `filename`
- `url`
- `added_at`
- `analysis`

Confirmed Vercel frame fields:

- `image_id`
- `filename`
- `url`
- `added_at`

Confirmed local-only session updates:

- `quality_summary.score`
- `quality_summary.band`
- `quality_summary.frame_count`
- `quality_summary.unique_frame_count`
- `quality_summary.duplicate_ratio`
- `quality_summary.sharp_frame_count`
- `quality_summary.duplicate_frames`
- `quality_summary.reconstruction_gate.allowed`
- `quality_summary.reconstruction_gate.unique_frame_count`
- `quality_summary.reconstruction_gate.blockers`
- `quality_summary.warnings`
- `reconstruction_blockers`

Confirmed upload lookup differences:

- Local missing upload returns `400 Image {image_id} not found in uploads`
- Vercel missing upload returns `404 Uploaded image not found`

### Reconstruction

#### `POST /api/mvp/reconstruct/session/{session_id}`

Confirmed shared precondition:

- If the capture set is not ready, both backends return `422` with:
  - `Capture set needs at least {minimum_images} overlapping photos before reconstruction can start.`

Confirmed local success shape:

- Returns the capture session payload updated to include:
  - `status: "queued"`
  - `job_id`
  - `scene_id`
  - `urls`

Confirmed local runtime transitions:

- Session status moves through `queued`, then `running`, then `completed`
- On failure the session is reset to `ready`, gains `last_error`, and the job becomes `failed`

Confirmed local failure cases:

- `503` if the reconstruction worker is unavailable or failed to import

Confirmed Vercel behavior:

- Always returns `501 This backend can collect capture sets, but a dedicated multi-view Gaussian reconstruction worker is not connected yet.`

See:

- `schemas/reconstruct-session.local.queued.confirmed.json`

### Scene Save

#### `POST /api/mvp/scene/save`

Request JSON:

- Confirmed required fields:
  - `scene_id: string`
  - at least one of:
    - `scene_document: object`
    - `scene_graph: object`
- Confirmed optional field:
  - `scene_document: object`
  - `scene_graph: object`
  - `source`, default `"manual"`

Confirmed local behavior:

- Writes `scenes/{scene_id}/scene.json`
- Writes `scenes/{scene_id}/versions/{version_id}.json`
- Stores the canonical `scene_document` when it is provided
- Stores a compatibility `scene_graph` alongside the canonical scene document in version payloads

Confirmed Vercel behavior:

- Writes `scenes/{scene_id}/scene.json`
- Writes `scenes/{scene_id}/versions/{version_id}.json`
- Updates `scenes/{scene_id}/versions_index.json`
- Accepts `scene_document` and/or `scene_graph`
- Stores the canonical `scene_document`
- Returns a compatibility `scene_graph` for backward compatibility

Confirmed response shape:

- `status: "saved"`
- `scene_id`
- `filepath`
- `url`
- `saved_at`
- `version_id`
- `versions_url`
- `summary.asset_count`
- `summary.has_environment`

Inferred frontend behavior:

- The editor currently sends `source` as `"manual"` or `"autosave"`.
- The editor persists proxy-prefixed URLs such as `/api/mvp/storage/scenes/...` inside `scene_graph.environment.urls` and `/api/mvp/storage/assets/...` inside asset entries.

See:

- `schemas/scene-save.request.frontend.inferred.json`
- `schemas/scene-save.response.confirmed.json`

### Version History

#### `GET /api/mvp/scene/{scene_id}/versions`

Confirmed:

- Returns `{ "scene_id": "...", "versions": [...] }`
- At most 20 versions are returned
- Each version list item contains:
  - `version_id`
  - `saved_at`
  - `source`
  - `summary`
  - `comment_count`

Confirmed empty-state behavior:

- Local: returns `versions: []` when the `versions/` directory does not exist
- Vercel: returns `versions: []` when `versions_index.json` does not exist

#### `GET /api/mvp/scene/{scene_id}/versions/{version_id}`

Confirmed:

- Returns the full saved version payload:
  - `scene_id`
  - `version_id`
  - `saved_at`
  - `source`
  - `summary`
  - `scene_document`
  - `scene_graph`

Confirmed errors:

- `404 Scene version not found`

See:

- `schemas/scene-version.response.confirmed.json`

### Review

#### `GET /api/mvp/scene/{scene_id}/review`

Confirmed local behavior:

- If `scenes/{scene_id}` exists, returns either `review.json` or a default draft payload
- Generated preview scenes qualify even before manual save because the scene directory already exists

Confirmed Vercel behavior:

- Returns `404 Scene not found` unless one of these exists:
  - `scenes/{scene_id}/scene.json`
  - `scenes/{scene_id}/versions_index.json`
  - `scenes/{scene_id}/review.json`
- If the scene exists but no review file exists, returns a default draft payload

Default review payload shape:

- `scene_id`
- `metadata.project_name`
- `metadata.scene_title`
- `metadata.location_name`
- `metadata.owner`
- `metadata.notes`
- `approval.state` default `"draft"`
- `approval.updated_at` default `null`
- `approval.updated_by` default `null`
- `approval.note` default `""`
- `approval.history` default `[]`

#### `POST /api/mvp/scene/{scene_id}/review`

Request JSON:

```json
{
  "metadata": {
    "project_name": "string",
    "scene_title": "string",
    "location_name": "string",
    "owner": "string",
    "notes": "string"
  },
  "approval_state": "string",
  "updated_by": "string",
  "note": "string"
}
```

Confirmed:

- `approval_state` is accepted as any string; there is no enum validation
- Only the five named metadata keys are written back
- `updated_by` and every metadata value are trimmed
- Approval history appends only when the new `state` or `note` differs from the last history entry

Inferred:

- The current frontend uses `draft` and `in_review` and derives `updated_by` from `metadata.owner`.

See:

- `schemas/scene-review.response.confirmed.json`

### Version Comments

#### `GET /api/mvp/scene/{scene_id}/versions/{version_id}/comments`

Confirmed:

- Requires the version to exist
- Returns:
  - `scene_id`
  - `version_id`
  - `comments`

Confirmed empty-state behavior:

- Returns `comments: []` when the version exists but no comment file exists

#### `POST /api/mvp/scene/{scene_id}/versions/{version_id}/comments`

Request JSON:

```json
{
  "author": "Reviewer",
  "body": "Comment text",
  "anchor": "scene"
}
```

Confirmed:

- `author` defaults to `"Reviewer"`
- `anchor` defaults to `"scene"`
- Blank trimmed `body` returns `400 Comment body is required`
- Success response includes:
  - `scene_id`
  - `version_id`
  - `comment`
  - `comment_count`

See:

- `schemas/version-comment.response.confirmed.json`

### Storage URL patterns

Confirmed surfaced URL families:

- Upload image: `/storage/uploads/images/{filename}`
- Generated environment assets:
  - `/storage/scenes/{scene_id}/environment/splats.ply`
  - `/storage/scenes/{scene_id}/environment/cameras.json`
  - `/storage/scenes/{scene_id}/environment/metadata.json`
- Generated asset files:
  - `/storage/assets/{asset_id}/mesh.glb`
  - `/storage/assets/{asset_id}/texture.png`
  - `/storage/assets/{asset_id}/preview.png`
- Saved scene document:
  - `/storage/scenes/{scene_id}/scene.json`

Confirmed but not surfaced by the generation response URLs:

- `/storage/assets/{asset_id}/metadata.json`
- `/storage/scenes/{scene_id}/versions/{version_id}.json`
- `/storage/scenes/{scene_id}/review.json`
- `/storage/scenes/{scene_id}/comments/{version_id}.json`
- Vercel-only persisted helper file: `/storage/scenes/{scene_id}/versions_index.json`

Confirmed serving differences:

- Local backend uses Starlette static mounts for `/storage/uploads`, `/storage/assets`, and `/storage/scenes`.
- Vercel uses `GET` and `HEAD` on `/storage/{storage_path:path}`.
- Vercel storage returns `307` to a blob public URL when blob mode is active and the object exists.
- Vercel returns `404 Stored file not found` when the object is missing.

## Open Contract Risks

- Local preview metadata is decorator-based and may contain extra keys produced by the underlying generator beyond the frontend-normalized subset.
- Local reconstruction job `result.stats` is not typed by the frontend and depends on `reconstruct_capture(...)`.
- The frontend scene graph shape is only loosely coupled to backend validation, so editor-side schema drift can be saved without server rejection, especially in the local backend.
