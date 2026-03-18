# Parallel Thread Start Pack

Date: March 18, 2026

Status: Freeze reset complete. Start new implementation lanes from `codex/truth-freeze-baseline-20260318`, not from historical dirty worktrees.

## Current Shared Base

- Accepted wave: `codex/editor-scene-document-finalize-20260318` at `477e544`
- Active restart branch: `codex/truth-freeze-baseline-20260318`
- New lanes should use fresh worktrees cut from this branch

## Start Rule

1. Create a fresh worktree from `codex/truth-freeze-baseline-20260318`.
2. Start the lane branch from that worktree.
3. Keep stop-sign files isolated to deliberate owners.
4. Re-run the relevant deterministic checks before merging back into a shared baseline.

## Stop-Sign Reminder

Do not casually edit:

- `src/app/mvp/_components/MVPWorkspaceRuntime.tsx`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/api/mvp/[...path]/route.ts`
- root/shared shell files called out in [post-merge-truth-freeze-baseline.md](/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md)

## Clean Lane Split

| Lane | Branch | Scope |
| --- | --- | --- |
| Freeze/docs baseline | `codex/truth-freeze-baseline-20260318` | baseline docs, stop-sign coordination, lane naming |
| World-workflow entrypoints | `codex/world-workflow-refocus-entrypoints` | authenticated `/app` entry, shell copy, nav hierarchy, world-library-first framing |
| World-workflow contracts | `codex/world-workflow-refocus-contracts` | canonical ingest/handoff runtime interfaces after Wave 1 lands |
| Existing specialist lanes | existing branch families | backend/contracts/projects/parity follow-ups only when rebased or restarted from this baseline |

## Wave 1 Priority

`codex/world-workflow-refocus-entrypoints` is the first intended lane from this baseline.

Wave 1 owns:

- `src/app/(app)/app/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/app/worlds/page.tsx`
- `src/components/platform/Sidebar.tsx`
- adjacent world-library framing surfaces that do not import the freshly changed review-share internals

Wave 1 avoids:

- `/mvp` runtime
- `/pro`
- backend truth/handoff files
- just-finished review-share truth files

## Verification Expectations

- Baseline acceptance already ran through `npm run closeout:static` plus the explicit Python truth/save bundle.
- Wave 1 should at minimum pass:
  - `npm run typecheck`
  - `npm run test:platform-routes`
  - `npm run build`
