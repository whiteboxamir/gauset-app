# Post-Merge Truth Freeze Baseline

Date: March 18, 2026

Status: Active verified baseline for post-wave refocus work. The review/save/public-truth hardening wave is accepted on `codex/editor-scene-document-finalize-20260318`, and `codex/truth-freeze-baseline-20260318` is the fresh restart point for new implementation lanes.

## Baseline Decision

- Shared source for this reset is the verified finalize wave at `477e544` (`Finalize review truth and canonical save hardening`).
- New implementation should not continue from the old dirty `codex/editor-scene-document` worktree.
- New implementation lanes start from `codex/truth-freeze-baseline-20260318` in fresh worktrees.

## What This Baseline Proves

- `SceneDocumentV2` is the canonical save payload, and compatibility `scene_graph` is derived from it.
- Review/share truth is preserved on saved-version review flows instead of being recomputed ad hoc for recipients.
- Public preview, asset, and capture lanes stay explicit about blocked downstream readiness.
- Release/readiness checks now include the new review-share readiness surface and stronger truth/save coverage.

## Verified Commands On The Accepted Wave

- `npm run closeout:static`
- `backend_venv/bin/python -m unittest tests.test_vercel_single_image_preview_fallback tests.test_vercel_public_storage_guardrails tests.test_vercel_public_truth_contracts tests.test_vercel_public_save_contracts tests.test_ml_sharp_preview_enhancement tests.test_mvp_persistence_contracts`

Live and authenticated platform checks remain environment-blocked unless DNS reachability and platform fixture env vars are present.

## Stop-Sign Surfaces

These files remain single-owner or redesign-coupled and should not be edited casually from new lanes:

- `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/useThreeOverlayViewerRuntimeController.ts`
- `src/components/Editor/useThreeOverlaySurfaceController.ts` when shell semantics are touched
- `src/components/Editor/useViewerPanelController.ts` when toolbar semantics are touched
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`

If a lane needs one of these files, isolate the owner in a fresh worktree and treat the edit as deliberate coordination work rather than normal overlap.

## Allowed Next Lanes

- `codex/world-workflow-refocus-entrypoints`
  - owns authenticated `/app` entry, shell framing, navigation hierarchy, and world-library-first product centering
  - must avoid the stop-sign surfaces above
- Existing contracts/backend/projects/parity lanes remain valid only when they start from this new baseline or a descendant of it

## Immediate Next Move

1. Cut a fresh worktree from `codex/truth-freeze-baseline-20260318`.
2. Start `codex/world-workflow-refocus-entrypoints`.
3. Keep Wave 1 scoped to authenticated `/app` product-centering surfaces.
4. Do not reopen the just-finished review/save/public-truth files in that wave.

## Phase 3 Prep Gate

Renderer-prep expansion is still gated on all of the following staying true on a coordinated baseline:

- scene-document-first persistence remains enforced
- ingest and handoff truth stay explicit at project/world/share boundaries
- review/share remains separate from downstream delivery
- release/readiness checks stay aligned with real runtime truth
