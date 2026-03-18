# Parallel Thread Start Pack

Date: March 17, 2026

Status: Freeze gate is still blocked. Do not start implementation lanes until the clean truth-freeze commit exists.

## Current Shared Base

- Base commit: `origin/main` at `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`
- Entry commit must be `codex/truth-freeze-baseline` (or equivalent freeze-safe commit).
- `codex/editor-scene-document` is mixed-scope and cannot be resumed as-is.

## Safe Pre-Freeze Work

These tasks may run now without violating the gate:

- Freeze/docs updates in `docs/**` and `maps/**`.
- Read-only stop-sign overlap scans.
- Read-only contract/runtime gap reports.
- Read-only backend parity maps.
- Isolated `/tmp` baseline captures and verification notes.

No implementation edits should land outside the freeze/docs surface until the truth-freeze commit exists.

## Start Gate

1. Cut freeze doc branch from `origin/main`.
2. Commit repaired freeze docs (`docs/post-merge-truth-freeze-baseline.md`, `maps/file-ownership.md`) and any required ownership updates.
3. Re-run verified checks on exact freeze tree.
4. Publish the baseline branch and only then start the split lanes.
5. No edits into:
   - `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
   - `src/components/Editor/ViewerPanel.tsx`
   - `src/components/Editor/LeftPanel.tsx`
   - `src/components/Editor/RightPanel.tsx`
   - `src/components/Editor/ThreeOverlay.tsx`
   - `src/app/api/mvp/[...path]/route.ts`
   - related shell composition files owned by the viewer-first HUD redesign

## Clean Lane Split

| Lane | Branch | Scope |
| --- | --- | --- |
| Freeze/docs | `codex/truth-freeze-baseline` | `docs/**`, `maps/**`, contract gate docs. Owns freeze protocol, stop-sign list, and lane naming. |
| Editor/document | `codex/editor-scene-document` | `src/app/mvp/_hooks/**`, `src/lib/mvp-review.ts`, `src/lib/scene-graph/**`, `src/state/**` excluding redesign shell files. |
| Contracts + validation | `codex/contracts-validation-handoff` | `contracts/**`, `src/server/contracts/**`, platform scenario/schema validation updates. |
| Backend ingest truth | `codex/backend-ingest-truth` | `backend/**`, `api/_mvp_backend/**` except redesign-owned front-end surfaces. |
| Projects + handoff | `codex/projects-review-links` | `src/server/projects/**`, `src/server/review-shares/**`, `src/components/worlds/**`, project/review route contracts. |
| Vercel parity | `codex/vercel-backend-parity` | `vercel-backend/**` and parity normalization at public/proxy boundary. |

## Shared Resume Rule

- Each lane starts from `codex/truth-freeze-baseline` and must preserve the scene-document-first contract while remaining backward-compatible to `scene_graph`.
- Any lane touching shared MVP transport or HUD shell surfaces must halt and coordinate with the redesign stop-sign owner.
- Contracts, backend, and projects lanes should align on provenance/handoff truth without redefining shell ownership.
- If the shared working tree contains stop-sign edits, implementation lanes must use fresh worktrees from the freeze commit rather than continuing in-place.

## Freeze Restart Status

- `codex/editor-scene-document` currently needs a replay-split and should be constrained to allowed paths.
- `codex/contracts-validation-handoff` starts fresh from the new freeze commit.
- `codex/backend-ingest-truth` starts fresh from the new freeze commit.
- `codex/projects-review-links` starts fresh from the new freeze commit.
- `codex/vercel-backend-parity` starts fresh from the new freeze commit.
