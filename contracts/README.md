# Gauset MVP API Contracts

Snapshot date: 2026-03-08.

This directory documents the current repo-implemented API contract for the MVP editor stack:

- Next.js proxy: `/Users/amirboz/gauset-app/src/app/api/mvp/[...path]/route.ts`
- Local FastAPI backend: `/Users/amirboz/gauset-app/backend/server.py` and `/Users/amirboz/gauset-app/backend/api/routes.py`
- Vercel FastAPI backend: `/Users/amirboz/gauset-app/vercel-backend/app.py` and `/Users/amirboz/gauset-app/vercel-backend/vercel.json`
- Frontend callers and shape expectations: `/Users/amirboz/gauset-app/src/app/mvp/page.tsx`, `/Users/amirboz/gauset-app/src/components/Editor/LeftPanel.tsx`, `/Users/amirboz/gauset-app/src/components/Editor/RightPanel.tsx`, `/Users/amirboz/gauset-app/src/lib/mvp-api.ts`, `/Users/amirboz/gauset-app/src/lib/mvp-product.ts`, `/Users/amirboz/gauset-app/src/lib/mvp-review.ts`

## Conventions

- Confirmed: directly implemented in route code, middleware, or storage mounts.
- Inferred: implied by frontend usage or by helper code rather than enforced request validation.
- Representative examples under `schemas/` use realistic values. Some IDs and timestamps are synthetic so the examples stay stable.

## High-Signal Contract Differences

- Local `/upload` returns `analysis` and an absolute filesystem `filepath`; Vercel `/upload` does not.
- Local jobs are stored in an in-memory `jobs` dictionary; Vercel jobs are written into storage and survive process-local job map loss.
- Local `/reconstruct/session/{session_id}` can queue real work when the reconstruction worker imports cleanly; Vercel returns `501 Not Implemented` once a capture set is ready.
- Local `/scene/save` preserves the entire submitted `scene_graph`; Vercel normalizes it down to `environment` and `assets`.
- Local review endpoints accept a generated scene directory before manual save; Vercel review endpoints require a saved scene record, version index, or review file.

## Files

- `mvp-api.md`: human-readable endpoint contract snapshot, proxy behavior, backend diffs, and error handling.
- `world-ingest.md`: first-class multi-source world-ingest contract, including external packages and third-party world-model outputs.
- `downstream-handoff.md`: explicit downstream handoff contract, including the first Unreal target profile.
- `schemas/`: machine-readable JSON examples for the main request and response families.

## Shared Restart Contracts Added On The Freeze Baseline

These files define the missing shared semantics runtime lanes should now implement against:

- `contracts/world-ingest.md`
- `contracts/downstream-handoff.md`
- `contracts/schemas/world-ingest.external-world-package.request.json`
- `contracts/schemas/world-ingest.third-party-world-model-output.request.json`
- `contracts/schemas/world-ingest.record.response.json`
- `contracts/schemas/review-package.inline.scene-document-first.json`
- `contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
- `contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json`
