# Post-Merge Truth Freeze Baseline

Date: March 16, 2026

Status: Active. This document set is the repaired freeze-safe baseline created directly on top of `origin/main` `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.

## Baseline Decision

- chosen option: Option A, freeze the smaller real command surface that already exists
- reason: this is a control-plane repair, the previously documented diagnostics did not exist on the real base, and adding new diagnostics now would mutate frozen/shared surfaces during the repair itself
- result: no feature work is being merged or salvaged into the freeze commit; only baseline-control docs are updated

## Verified Command Matrix

Verification was run in a clean worktree from the exact repair tree, using the existing lockfile-resolved local dependency install. Only commands that are both real and restart-safe are part of the freeze contract.

| Command | Class | Result | Notes |
| --- | --- | --- | --- |
| `npm run build` | required freeze gate | PASS | `next build` completed successfully. Current repo config skips type validation and linting during build. |
| `npm run lint` | informative only | FAIL | Real command, but it fails on pre-existing ESLint violations in app, editor, experience, and viewfinder files. It is not a freeze gate on this commit. |
| `npm run dev`, `npm run dev:backend`, `npm run dev:all`, `npm run start` | operational only | present, not executed | Long-running commands. They are not part of the freeze gate. |
| `node scripts/mvp_viewer_diag.mjs` | service-dependent diagnostic | present, not executed | Requires a running web stack plus Playwright runtime. |
| `node scripts/hostile_public_audit.mjs` | service-dependent diagnostic | present, not executed | Requires a live public endpoint and writes under `test-results/`. |
| `node scripts/hostile_local_reconstruction_audit.mjs` | service-dependent diagnostic | present, not executed | Requires the local backend stack and reconstruction path. |
| `python3 scripts/mvp_smoke.py` | service-dependent diagnostic | present, not executed | Requires a running local stack. |

Commands that were previously documented but are not present on this freeze baseline and must not be claimed:

- `npm run typecheck`
- `npm run lint:mvp`
- `npm run test:scene-graph`
- `npm run test:scene-bridge`
- `npm run test:scene-fanout`
- `npm run test:scene-panels`
- `npm run test:platform-contracts`
- `npm run test:platform-scenarios`
- `npm run test:platform-routes`
- `npm run certify:mvp:local-stack`
- `npm run diagnose:platform-readiness`
- `npm run test:platform-readiness`
- `npm run certify:platform-rollout`

## Active Frozen Stop-Sign Surfaces

Only files that exist on this commit are frozen:

- `guard-deploy-target.mjs`
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`

If any thread needs to change one of those files, stop the batch and cut a new truth-freeze repair first.

## Thread Restart Table

| Thread | Branch | Status after this freeze | Restart rule |
| --- | --- | --- | --- |
| Editor + scene document | `codex/editor-scene-document` | split and replay only | Start from the new freeze commit. Replay only the allowed editor lane files from branch head `2a1e90f135f363b14d3ea7a7f1704bed21885caa`. Do not merge, rebase, or copy the dirty working tree wholesale. |
| Contracts + validation + handoff | `codex/contracts-validation-handoff` | restart fresh | Create a new branch from the freeze commit. |
| Local backend ingest + truth | `codex/backend-ingest-truth` | restart fresh | Create a new branch from the freeze commit. |
| Projects + review shares + world links | `codex/projects-review-links` | restart fresh | Create a new branch from the freeze commit. |
| Vercel backend parity | `codex/vercel-backend-parity` | restart fresh | Create a new branch from the freeze commit. |

## Restart Protocol

1. Check out the new freeze commit created by this repair, not stale `main` and not the rejected editor branch.
2. Re-run `npm run build`.
3. Treat `npm run lint` as informative only until a later control-plane change promotes it into a passing gate.
4. Create and publish every restart branch from the freeze commit before feature work resumes.
5. Keep the stop-sign list above closed. Re-freeze before touching any of those files.

## Resume Condition

Parallel work may resume immediately from this freeze commit once the restart branches are recreated from it and the stop-sign list is honored.
