# Gauset Operator Runbooks

These runbooks document the repo as it exists today. They do not change product code, tests, scripts, or config.

## Use This Set

- `local-dev.md`: start the local frontend and backend, then verify the proxy and health endpoints.
- `smoke-testing.md`: run quick health checks, scripted smoke checks, Playwright smoke, and hostile audits.
- `backend-triage.md`: diagnose backend startup, proxy, generation, reconstruction, and storage failures.
- `release-sanity.md`: check the deployed `/mvp` shell, proxy wiring, public smoke, and public storage artifacts.

## Recommended Local Ports

- Frontend: `http://127.0.0.1:3015`
- Backend: `http://127.0.0.1:8000`

`3015` is the canonical local frontend origin for this repo. The local smoke scripts, Playwright suite, and runbooks all assume that origin unless you override them explicitly.

## Assumptions And Gaps

- `./setup.sh` is the canonical local backend bootstrap. It creates `backend_venv`, installs core Python packages, and clones `backend/ml-sharp` and `backend/TripoSR`.
- Local smoke assets are assumed to exist at `backend/ml-sharp/data/teaser.jpg` and `backend/TripoSR/examples/chair.png` after setup.
- The local backend imports `cv2`, but `./setup.sh` does not install OpenCV. If backend startup fails with `ModuleNotFoundError: cv2`, install an OpenCV package into `backend_venv` before retrying.
- The frontend proxy uses `GAUSET_BACKEND_URL`, then `NEXT_PUBLIC_GAUSET_API_BASE_URL`, and in local development falls back to `http://127.0.0.1:8000`.
- The deployed Vercel-style backend reports `preview=true`, `asset=true`, and `reconstruction=false`. Public release checks should not expect real reconstruction unless the deployment architecture changes.
- These runbooks were written from repo inspection only. Runtime commands that would write outside `runbooks/` were not executed while creating this documentation.

## Fastest Path

1. Follow `local-dev.md`.
2. Run the quick smoke in `smoke-testing.md`.
3. If anything fails, use `backend-triage.md`.
4. Before shipping, run `release-sanity.md`.
