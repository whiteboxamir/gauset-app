# Release Sanity

This runbook is for `/Users/amirboz/gauset-app` and the `gauset-app` Vercel project only. Do not use it as the release path for `gauset.com`; that site must ship from `/Users/amirboz/gauset`.

## Scope

This runbook checks the deployed `/mvp` shell, the frontend proxy under `/api/mvp/*`, and the public preview and asset generation lanes.

## Assumptions

- Default public base URL is `https://gauset-app.vercel.app`.
- Run `npm run verify:boundary` before release work if there is any doubt about the current repo/project link.
- The frontend deployment proxies to a separate backend deployment through `GAUSET_BACKEND_URL` or `NEXT_PUBLIC_GAUSET_API_BASE_URL`.
- The public backend is expected to expose preview and asset generation, but not real reconstruction.
- If storage is served from a different origin, set `GAUSET_MVP_STORAGE_BASE_URL` before running the hostile public audit.

## Step 1: Shell And Proxy Health

```bash
curl -sSI https://gauset-app.vercel.app/mvp
curl -sS https://gauset-app.vercel.app/api/mvp/health
curl -sS https://gauset-app.vercel.app/api/mvp/setup/status
```

Pass criteria:

- `/mvp` returns `200`
- `/api/mvp/health` returns `{"status":"ok"}`
- `/api/mvp/setup/status` returns `status: ok`

## Step 2: Validate Public Capability Expectations

From `/api/mvp/setup/status`, confirm:

- `capabilities.preview.available=true`
- `capabilities.asset.available=true`
- `capabilities.reconstruction.available=false`
- backend truth indicates single-photo preview and asset generation, not production reconstruction

Fail the release if:

- preview or asset is unavailable
- the proxy returns `BACKEND_UNAVAILABLE` or `BACKEND_PROXY_ERROR`
- the storage or backend origin is clearly miswired

## Step 3: Browser-Level Public Smoke

Run the Playwright public suite:

```bash
npx playwright test tests/mvp.public.spec.js
```

Optional base URL override:

```bash
GAUSET_MVP_BASE_URL=https://<deployment-host> npx playwright test tests/mvp.public.spec.js
```

What it should prove:

- `/mvp` shell renders
- backend readiness state is visible
- preview and asset generation complete
- scene save, review metadata, comments, and review page all work through the public proxy

## Step 4: Hostile Public Audit

Run the canonical public audit:

```bash
node scripts/hostile_public_audit.mjs
```

Optional overrides:

```bash
GAUSET_MVP_BASE_URL=https://<deployment-host> node scripts/hostile_public_audit.mjs
GAUSET_MVP_BASE_URL=https://<deployment-host> GAUSET_MVP_STORAGE_BASE_URL=https://<storage-host> node scripts/hostile_public_audit.mjs
```

Output:

- `test-results/public-live/hostile-audit-report.json`

Pass criteria:

- `summary.failed_hostile_checks` is `0`
- no duplicate splat hashes
- every wave completes upload, generation, metadata fetch, splat fetch, scene save, review update, comment creation, and review shell validation through the public proxy
- no wave reports placeholder mode, mock-like model naming, missing truth fields, missing release gates, missing PLY header, undersized PLY payload, or undersized vertex count

## Step 5: Spot-Check Returned Artifacts

From the smoke or audit output, sample at least one generated storage asset:

- scene `metadata.json`
- scene `cameras.json`
- scene `splats.ply`
- asset `preview.png`

Pass criteria:

- each URL returns `200`
- JSON is readable
- the PLY payload is not empty

## Stop Conditions

- `/api/mvp/setup/status` does not match the expected public capability profile
- public proxy errors are present
- hostile public audit reports failures
- preview or asset generation succeeds only in mock/degraded form
