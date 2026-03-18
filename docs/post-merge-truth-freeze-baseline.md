# Post-Merge Truth Freeze Baseline

Date: March 17, 2026

Status: Historical freeze record plus current coordination guidance. `codex/editor-scene-document` is now resumed at clean HEAD `c63f7b6`. This document records the freeze decision and the stop-sign set that still needs explicit ownership; it does not block implementation on allowed paths.

## Historical Baseline Decision

- Shared integration base remains `origin/main` at `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa` (`Restore gauset-app deploy guard`).
- Local `main` is not the source branch for continued work.
- The freeze docs landed as a coordination reset, not as a permanent instruction to keep implementation blocked.

## Current Operating Truth

- Active branch: `codex/editor-scene-document`
- Current clean baseline for resumed work: `c63f7b6` (`Update app icon asset`)
- Implementation is active again on allowed lane paths.
- The stop-sign files below still require explicit single-owner coordination because they remain coupled to viewer-first shell work.
- If a lane needs one of the stop-sign files, cut or coordinate an isolated owner before editing. Do not treat that rule as a blanket branch blocker.

## What Was Inspected

| Ref | Commit | Role | Result |
| --- | --- | --- | --- |
| `origin/main` | `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa` | freeze source | build-verified baseline |
| `main` | `24be596dd5fdf9ab6bbe6f41afd5c03cb42124ef` | stale local base | outdated, not permitted for lane starts |
| `codex/editor-scene-document` | `c63f7b6` | resumed implementation branch | clean current lane baseline |

## Verified Shared Commands on Base

- `npm run build` passed on `origin/main` tree.
- Scene-graph gate commands remain relevant closeout checks for the resumed branch:
  - `npm run test:scene-graph`
  - `npm run test:scene-bridge`
  - `npm run test:scene-fanout`
  - `npm run test:scene-panels`
  - `npm run test:platform-contracts`
  - `npm run test:platform-scenarios`
  - `npm run test:platform-routes`

## Current Coordination Guidance

There is no blanket freeze gate on the branch now. Current rules are:

- Keep the stop-sign surfaces below under explicit ownership.
- Continue implementation on allowed lane paths without replaying from a new freeze commit.
- Use fresh worktrees only when a lane needs hard isolation around stop-sign shell surfaces or conflicting runtime files.
- Keep provenance, review/share truth, and validation changes aligned with the scene-document-first contract.

## Current Stop-Sign Surfaces

These files remain redesign-owned or shell-critical and should not be edited casually from parallel lanes:

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

## Current Lane Split

- `codex/editor-scene-document` currently owns and may continue work in:
  - `src/app/mvp/_hooks/**` (excluding redesign-owned shells)
  - `src/lib/mvp-review.ts`
  - `src/lib/scene-graph/**`
  - `src/state/**`
- `codex/contracts-validation-handoff` is the contracts + validation lane for contract families, schema/runtime drift checks, and scenario gates.
- `codex/backend-ingest-truth` is the backend ingest truth lane for `backend/**` and `api/_mvp_backend/**` provenance/runtime alignment.
- `codex/projects-review-links` is the projects + handoff lane for project/world-link and review-share runtime truth.
- `codex/vercel-backend-parity` is the vercel parity lane for deployed backend parity.

## Resume Protocol

1. Treat this document as the recorded freeze baseline, not as a standing instruction to halt work.
2. Continue implementation from `codex/editor-scene-document` at the current clean baseline unless a lane explicitly needs a separate worktree.
3. Keep redesign stop-sign surfaces under explicit single-owner control until the viewer-first shell handoff is complete.
4. Re-run the relevant contract, scenario, and runtime checks on the current branch state when closing a wave.
5. If the shared working tree picks up conflicting stop-sign edits, cut fresh worktrees from the current clean branch point rather than rewriting history in place.

## Gate Condition to Enter Phase 3 Renderer Prep

- `SceneDocumentV2` is treated as the canonical in-app persistence/review/export payload with compatibility-derived `scene_graph`.
- Ingest provenance and handoff truth are persisted and visible at project/world/share boundaries.
- Save/version/review paths preserve shared contract shape and continue to pass documented scenarios.
- Only after the above checks pass on the current coordinated baseline should renderer implementation broaden into the next phase.
