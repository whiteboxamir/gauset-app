# Phase 1 Closeout Report

Date: March 11, 2026

Addendum: March 12, 2026

- Public MVP certification and recovery are complete for the currently supported public lanes.
- `gauset.com` now reports `storage_mode: "blob"` and durable public storage is restored.
- The public preview and asset lanes were smoke-tested through upload, environment generation, scene save, and version listing.
- The public reconstruction lane is still intentionally unavailable until a separate GPU worker is connected. That is now a truthful product limit, not a hidden outage.

## BLOCKERS

- No Phase 1 blockers remain for the currently supported public MVP lanes.

## Decision

Phase 1 closeout is green for local and for the currently supported public MVP lanes.

The Phase 1 viewer and persistence gates requested for this closeout now pass locally:

- Full-scene persistence survives save, draft recovery, and restore-version.
- Unsupported sharp-viewer capability falls back before the canvas crashes.
- The fixed 5M benchmark fixture loads and survives a 60-second Chrome stress run on the local production-like target.
- The local hostile audit now reports truthful capture blocking instead of failing on an unavailable reconstruction lane.

## Resolved Issues

- Fixed local production-mode MVP proxy routing so `next start` no longer points `/api/mvp/*` at the Vercel-only internal backend path.
- Added a large-scene sharp-splat safeguard that switches to CPU ordering before the GPU sorter allocates an unsafe working set.
- Hardened the 5M benchmark harness so it records useful failure diagnostics and artifact screenshots.
- Removed the accidental `https://gauset.com/mvp` dependency from the local Playwright suite.
- Updated the local hostile reconstruction audit to validate truthful unavailable-lane behavior instead of treating missing reconstruction as an automatic failure.

## Test Matrix

- Static type gate: `npm run typecheck` -> pass
- Scoped MVP/editor lint gate: `npm run lint:mvp` -> pass
- Targeted Python/unit gate: `backend_venv/bin/python -m unittest tests.test_vercel_single_image_preview_fallback tests.test_ml_sharp_preview_enhancement tests.test_mvp_persistence_contracts` -> pass
- Production build gate: `npm run build` -> pass
- Local hostile audit: `node scripts/hostile_local_reconstruction_audit.mjs` -> pass
- Local Playwright suite: `npx playwright test tests/mvp.local.spec.js --headed` -> pass (`19 passed`)

Artifacts:

- Hostile audit report: [hostile-audit-report.json](/Users/amirboz/gauset-app/test-results/local-reconstruction/hostile-audit-report.json)
- 5M benchmark report: [report.json](/Users/amirboz/gauset-app/test-results/benchmark-5m/report.json)

## 5M Benchmark

Target:

- Browser: Chrome channel via Playwright
- URL: `http://127.0.0.1:3000/mvp`
- Backend: local FastAPI backend on `127.0.0.1:8000`
- Fixture: `scene_benchmark_5m`

Results:

| Check | Result |
| --- | --- |
| Cold load | 1499 ms |
| Warm load | 1141 ms |
| Stress duration | 60000 ms |
| Splat fetch | 200 OK |
| Setup/status | 200 OK |
| Versions/review/comments | 200 OK |
| Canvas after stress | Present |
| Fallback after stress | Not visible |
| Page errors | None |
| Request failures | None |
| Pass | Yes |

Memory snapshots from the browser heap stayed within a bounded range during stress:

- 12.3s: 351 MB used JS heap
- 29.6s: 417 MB used JS heap
- 44.7s: 373 MB used JS heap
- 60.1s: 425 MB used JS heap

## Screenshot Review

### Local workspace loaded

Artifact: [qa-wave1-local-shell.png](/tmp/qa-wave1-local-shell.png)

- Left and right HUD rails are present and readable.
- The viewer surface is not blank; it shows the empty standby state with the `No world loaded yet` message.
- The backend readiness card is visible and truthfully shows `Limited lane coverage`.

### Local preview launchpad

Artifact: [qa-wave7-preview-shell.png](/tmp/qa-wave7-preview-shell.png)

- The preview route renders the launchpad headline `Bring one image. Get a world. Direct the shot.`
- The `See the demo world` and `Use my own image` controls are visible.
- The demo world card and fixed-vs-changing explanation panel are present.

### Local full-scene roundtrip

Artifact: [qa-wave18-full-scene-roundtrip.png](/tmp/qa-wave18-full-scene-roundtrip.png)

- The director HUD shows `Image-to-Splat Preview Loaded` rather than an empty or stale state.
- A saved camera view chip (`View 1`) is visible.
- A scene-note pin (`General Pin`) is visible.
- The recorded path panel shows persisted path data (`13 frames · 1.0s`), and the scene graph card shows persisted coverage (`1 views · 1 pins`).

### Local unsupported-viewer fallback

Artifact: [qa-wave19-unsupported-sharp-fallback.png](/tmp/qa-wave19-unsupported-sharp-fallback.png)

- The viewer does not crash to a blank page; it shows an explicit fallback card.
- The fallback reason is specific: `This device does not expose WebGL2`.
- The surrounding workspace state remains intact, including scene metadata and save state in the right rail.

### Local 5M benchmark load

Artifacts:

- [cold-load.png](/Users/amirboz/gauset-app/test-results/benchmark-5m/cold-load.png)
- [warm-load.png](/Users/amirboz/gauset-app/test-results/benchmark-5m/warm-load.png)
- [post-stress.png](/Users/amirboz/gauset-app/test-results/benchmark-5m/post-stress.png)

Observations:

- Cold and warm screenshots both show a live viewer canvas, not a fallback card.
- During load, the renderer reports progress (`Packing dense splat textures...`) instead of throwing a runtime error.
- The post-stress screenshot still shows the viewer canvas and benchmark scene rails with no `3D viewer unavailable` overlay.

## Remaining Non-Blocking Debt

- The local backend still truthfully reports reconstruction as unavailable. That is acceptable because the hostile audit verifies the lane is blocked honestly instead of pretending reconstruction is online.
- The public product still exposes only preview and asset generation. Production-grade reconstruction remains a separate future integration track, not a regression in the current closeout.

## Recommended Next Move

- Proceed to Phase 2 using [PHASE_2_ROADMAP.md](/Users/amirboz/gauset-app/PHASE_2_ROADMAP.md).
- Start with release hardening in `/Users/amirboz/gauset`, then move into the `SceneDocumentV2` and Zustand store foundation in `/Users/amirboz/gauset-app`.
