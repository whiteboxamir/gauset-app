# Post-Merge Truth Freeze Baseline

Date: March 17, 2026

Status: Freeze-first phase activated for Phase 2 closeout and Phase 3 renderer prep. The gate remains blocked until a new truth-freeze commit lands and all implementation lanes start from that exact baseline.

## Baseline Decision

- Shared integration base remains `origin/main` at `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa` (`Restore gauset-app deploy guard`).
- Local `main` is not the source branch for continued work.
- The next phase requires a clean freeze commit created on top of that base (for example `codex/truth-freeze-baseline`).

## What Was Inspected

| Ref | Commit | Role | Result |
| --- | --- | --- | --- |
| `origin/main` | `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa` | freeze source | build-verified baseline |
| `main` | `24be596dd5fdf9ab6bbe6f41afd5c03cb42124ef` | stale local base | outdated, not permitted for lane starts |
| `codex/editor-scene-document` | `2a1e90f135f363b14d3ea7a7f1704bed21885caa` + dirty tree | mixed-scope branch | must be split and replayed only on allowed editor/doc paths |

## Verified Shared Commands on Base

- `npm run build` passed on `origin/main` tree.
- Scene-graph gate commands are still owned as planned checks but should be recorded again after this freeze commit lands if needed for the final gate:
  - `npm run test:scene-graph`
  - `npm run test:scene-bridge`
  - `npm run test:scene-fanout`
  - `npm run test:scene-panels`
  - `npm run test:platform-contracts`
  - `npm run test:platform-scenarios`
  - `npm run test:platform-routes`

## Pre-Freeze Safe Work Only

Until the truth-freeze commit exists, parallel work must stay in one of these buckets:

- Docs/maps ownership updates limited to the freeze document set.
- Read-only overlap scans against stop-sign surfaces and active lane paths.
- Read-only contract/runtime gap reports.
- Read-only backend parity maps across `backend/**`, `api/_mvp_backend/**`, and `vercel-backend/**`.
- Isolated baseline captures, runbooks, and verification notes created outside redesign-owned shell files.

No implementation lane should begin in the shared dirty tree before the freeze commit is cut.

## Freeze Stop-Sign (Phase 2/3 Entry)

The next editor-lane work MUST treat the following as redesign-owned and out-of-bounds for this phase:

- `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/api/mvp/[...path]/route.ts`
- Related shell surfaces that directly own or recompose the HUD shell (same redesign lane)

The following root/shared files were also previously coupled to the redesign and remain stop-sign until explicitly re-negotiated:

- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`

## Thread Split

- `codex/editor-scene-document` must be replayed onto the new freeze commit and limited to:
  - `src/app/mvp/_hooks/**` (excluding redesign-owned shells)
  - `src/lib/mvp-review.ts`
  - `src/lib/scene-graph/**`
  - `src/state/**`
- `codex/contracts-validation-handoff` is the contracts + validation lane for contract families, schema/runtime drift checks, and scenario gates.
- `codex/backend-ingest-truth` is the backend ingest truth lane for `backend/**` and `api/_mvp_backend/**` provenance/runtime alignment.
- `codex/projects-review-links` is the projects + handoff lane for project/world-link and review-share runtime truth.
- `codex/vercel-backend-parity` is the vercel parity lane for deployed backend parity.

## Restart Protocol

1. Create `codex/truth-freeze-baseline` from `origin/main` at `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.
2. Commit this baseline document set as the first committed source of truth.
3. Re-run baseline checks on that exact tree and record results in this file.
4. Publish clean worker refs and begin implementation only from this commit.
5. Keep redesign stop-sign surfaces untouched by phase 2 closeout lanes until the viewer-first redesign thread hands off explicitly.
6. If the shared working tree already contains stop-sign edits, do not continue implementation there; create fresh worktrees from the freeze commit instead.

## Gate Condition to Enter Phase 3 Renderer Prep

- `SceneDocumentV2` is treated as the canonical in-app persistence/review/export payload with compatibility-derived `scene_graph`.
- Ingest provenance and handoff truth are persisted and visible at project/world/share boundaries.
- Save/version/review paths preserve shared contract shape and continue to pass documented scenarios.
- Only after the above checks pass on the new freeze commit can renderer implementation begin.
