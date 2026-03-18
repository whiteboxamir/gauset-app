# File Ownership Matrix

Date: March 18, 2026

Status: Active from `codex/truth-freeze-baseline-20260318`. New implementation lanes should start from this baseline in fresh worktrees.

Base reference:

- `/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md`

## Stop-Sign Surfaces

- `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/useThreeOverlayViewerRuntimeController.ts`
- `src/components/Editor/useThreeOverlaySurfaceController.ts` when shell semantics are touched
- `src/components/Editor/useViewerPanelController.ts` when toolbar action semantics are touched
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`

These files remain high-conflict and require deliberate single-owner coordination.

## Ownership Matrix

| Zone | Purpose | Runtime Critical | Conflict Risk | Guidance |
| --- | --- | --- | --- | --- |
| Viewer-first stop-sign set | `/mvp` shell composition and transport chokepoints | Very High | Stop-sign | Only edit in isolated owner lanes |
| World-workflow entrypoints | authenticated `/app` landing flow and world-library framing | Medium | Medium | Safe first refocus lane from the new baseline |
| Contracts + validation | product contracts, schema/runtime drift, scenario gates | High | High | Keep canonical interfaces aligned with runtime truth |
| `backend`, `backend/api` | local ingest/save/public truth plumbing | High | High | Coordinate via explicit contracts and tests |
| `vercel-backend` | public runtime parity | High | High | Keep public truth honest and separate from local assumptions |
| `src/server/projects`, `src/server/review-shares`, `src/components/worlds` | project/world/review-share truth and lifecycle | High | High | Avoid reopening Wave 0 truth work during Wave 1 |
| `docs`, `maps`, `scripts/test_*`, `tests/*` | verification and coordination surface | Low | Medium | Safe for baseline and gate updates |

## Branch Ownership

- `codex/truth-freeze-baseline-20260318`
  - owns baseline docs and stop-sign coordination
- `codex/world-workflow-refocus-entrypoints`
  - owns:
    - `src/app/(app)/app/page.tsx`
    - `src/app/(app)/layout.tsx`
    - `src/app/(app)/app/worlds/page.tsx`
    - `src/components/platform/Sidebar.tsx`
    - world-library framing surfaces that do not depend on freshly changed review-share internals
  - avoids:
    - `src/components/Editor/RightPanel.tsx`
    - `src/lib/mvp-review.ts`
    - `backend/api/routes.py`
    - `vercel-backend/app.py`
    - `src/components/worlds/ReviewSharePanel.tsx`
- `codex/world-workflow-refocus-contracts`
  - owns canonical `world-ingest/v1` and `downstream-handoff/v1` runtime interfaces after Wave 1

## Exit Condition

- New lanes start from `codex/truth-freeze-baseline-20260318`
- Stop-sign surfaces stay isolated
- Wave 1 keeps its scope to authenticated `/app` product-centering surfaces
- Later contract work builds on the verified truth/save/public-readiness hardening instead of reopening it
