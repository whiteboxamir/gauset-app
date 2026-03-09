# Smoke Testing

## Preconditions

- Local backend is healthy on `127.0.0.1:8000`.
- Local frontend is healthy on `127.0.0.1:3015`.
- `backend/ml-sharp/data/teaser.jpg` and `backend/TripoSR/examples/chair.png` exist, or you have replacement images.

## Quick Health Smoke

Run these first:

```bash
curl -sS http://127.0.0.1:3015/api/mvp/health
curl -sS http://127.0.0.1:3015/api/mvp/setup/status
curl -I http://127.0.0.1:3015/mvp
```

Pass criteria:

- Backend health is `ok`.
- Setup status returns at least one available lane.
- The `/mvp` shell returns `200`.

## Python Proxy Smoke

`scripts/mvp_smoke.py` drives the app through the Next.js proxy and checks upload, generation, jobs, save, review, and comments.

Run the full local smoke:

```bash
backend_venv/bin/python scripts/mvp_smoke.py --mode full --web-base-url http://127.0.0.1:3015
```

Run individual lanes:

```bash
backend_venv/bin/python scripts/mvp_smoke.py --mode asset --web-base-url http://127.0.0.1:3015
backend_venv/bin/python scripts/mvp_smoke.py --mode environment --web-base-url http://127.0.0.1:3015
backend_venv/bin/python scripts/mvp_smoke.py --mode reconstruction --web-base-url http://127.0.0.1:3015 --capture-frames 8
```

Pass criteria:

- Each job ends with `status=completed`.
- Asset smoke returns a `preview_status` of `200`.
- Environment and reconstruction smoke return `splat_status=200`.
- Review update, comment creation, and review shell checks succeed.

## Local Playwright Smoke

The repo also has a browser-level local suite at `tests/mvp.local.spec.js`.

Run it:

```bash
npx playwright test tests/mvp.local.spec.js
```

What it covers:

- `/mvp` shell loads
- asset generation
- scene save and restore
- review and comments
- capture set progress
- mobile layout
- reconstruction flow

Notes:

- The suite assumes `http://127.0.0.1:3015`.
- It writes screenshots to `/tmp/qa-wave*.png`.

## Local Hostile Reconstruction Audit

Use this when reconstruction is supposed to be real, not mocked:

```bash
node scripts/hostile_local_reconstruction_audit.mjs
```

Optional overrides:

```bash
GAUSET_MVP_BASE_URL=http://127.0.0.1:3015 node scripts/hostile_local_reconstruction_audit.mjs
GAUSET_CAPTURE_FRAMES=12 node scripts/hostile_local_reconstruction_audit.mjs
```

Output:

- `test-results/local-reconstruction/hostile-audit-report.json`

Pass criteria:

- `summary.failed_hostile_checks` is `0`
- no duplicate splat hashes
- each wave reports `lane=reconstruction`, `mode=hybrid_multiview`, and `execution_mode=real`

## Public Smoke

For deployed smoke, use the release runbook. The public tools are:

```bash
npx playwright test tests/mvp.public.spec.js
node scripts/hostile_public_audit.mjs
```

Use `GAUSET_MVP_BASE_URL` and, if storage is on a different origin, `GAUSET_MVP_STORAGE_BASE_URL`.
