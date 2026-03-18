# File Ownership Matrix

Date: March 17, 2026

Status: Freeze gate active for Phase 2 closeout -> Phase 3 renderer prep. Implementation lanes remain blocked until the truth-freeze commit exists.

This matrix reflects the clean split for this cycle and reserves viewer-first HUD redesign files as hard stop-signs.

Base reference:

- `/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md`

## Freeze Stop-Sign Surfaces

- `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/useThreeOverlayViewerRuntimeController.ts`
- `src/components/Editor/useThreeOverlaySurfaceController.ts` (when shell semantics are touched)
- `src/components/Editor/useViewerPanelController.ts` (when toolbar action semantics are touched)
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`

If any of these files change, the clean freeze must be recreated before continuation.

## Pre-Freeze Green Zone

Until the truth-freeze commit lands, only these parallel tasks are green-lit:

- Docs/maps ownership fixes in the freeze document set.
- Read-only overlap scans against the stop-sign set.
- Read-only contract/runtime gap reports.
- Read-only backend parity maps.
- Isolated baseline captures, artifact packets, and runbook notes created outside reserved shell files.

If the shared tree already carries stop-sign edits, new implementation lanes must start from fresh worktrees cut from the freeze commit.

## Ownership Matrix

| Zone | Purpose | Runtime Critical | Conflict Risk | Isolation Guidance |
| --- | --- | --- | --- | --- |
| Viewer-first HUD redesign stop-sign set | `MVPWorkspaceRuntime` composition, viewer HUD shell, transport entrypoint | Very High | Stop-sign | Single owner only. No phase 2 closeout edits through these files. |
| Contracts + validation | Product contracts, scenario tests, schema validation | High | High | Keep contracts aligned with runtime behavior; no shell ownership changes. |
| `backend`, `backend/api` | local backend truth and ingest pipelines | High | High | Coordinate payloads via contracts and scenario tests. |
| `vercel-backend` | public backend parity and deployment runtime | High | High | Own parity independently from local backend internals. |
| `src/server/projects`, `src/server/review-shares` | project/world links and review-share runtime | High | High | Keep scene-document provenance truth and delivery fields. |
| `src/app/api/projects`, `src/app/api/review-shares`, `src/components/worlds` | project/review API and UI glue | Medium | Medium-High | Avoid touching shell stop-sign files. |
| `src/app/mvp/_hooks`, `src/lib/scene-graph`, `src/state` | scene-document-first editor behavior, save/version/review plumbing | High | High | Work only on persistence/review/export document shape; do not edit design shell files. |
| `docs`, `maps`, `tests/platform`, `scripts/test_*` | protocol and verification surface | Low | Medium | Safe to update for new gates, branch split, and runbooks. |
| Shared generated/runtime folders | `uploads`, `assets`, `scenes`, `captures`, `reconstruction_cache` | State impact only | Medium | Treat outputs as non-authoritative and avoid editing as truth sources. |

## Lane Ownership Map

- Freeze/docs lane owns `docs/post-merge-truth-freeze-baseline.md`, `docs/parallel-thread-start-pack.md`, and `maps/file-ownership.md`.
- Contracts + validation lane owns `contracts/**`, `src/server/contracts/**`, and platform validation scripts.
- Editor/document lane owns `src/app/mvp/_hooks/**`, `src/lib/mvp-review.ts`, `src/lib/scene-graph/**`, and `src/state/**` while avoiding redesign stop-sign shell files.
- Backend ingest truth lane owns `backend/**` and `api/_mvp_backend/**` compatibility boundaries.
- Vercel parity lane owns `vercel-backend/**` and public parity normalization surfaces.
- Projects + handoff lane owns `src/server/projects/**`, `src/server/review-shares/**`, `src/components/worlds/**`, and related APIs.
- Verification lane owns `docs/core-product-truth-validation-gates.md`, tests, and readiness check coordination.

## Clean Branch Split

- `codex/truth-freeze-baseline`: freeze/docs and lane-contract authoring.
- `codex/editor-scene-document`: scene-document persistence and editor review/export document-first changes.
- `codex/contracts-validation-handoff`: contract families, platform scenarios, and acceptance gates.
- `codex/backend-ingest-truth`: local backend ingest and provenance parity updates.
- `codex/projects-review-links`: project/world-link and review-share truth expansion.
- `codex/vercel-backend-parity`: public backend parity and provenance alignment.

## Exit Condition

- Phase 2 closeout can proceed when each active lane is running from the same freeze commit and no edits are made to stop-sign surfaces outside redesign ownership.
