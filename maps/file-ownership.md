# File Ownership Matrix

Date: March 16, 2026

Status: Active for the truth-freeze repair commit created directly on top of `origin/main` `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.

This matrix is the control-plane baseline for restarting parallel work. It freezes only files that exist on this commit and leaves all feature work to the restart lanes.

## Active Frozen Stop-Sign Surfaces

No parallel thread may edit these files without opening a new truth-freeze repair first:

- `guard-deploy-target.mjs`
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`

These are the root config, shell, proxy, and shared viewer-runtime boundaries that caused the previous freeze contract to drift.

## Ownership Matrix

| Zone | Thread / Owner | Purpose | Runtime-Critical | Isolation Guidance |
| --- | --- | --- | --- | --- |
| Frozen stop-sign surfaces listed above | all threads | root config, shell, proxy, shared viewer runtime | Very High | Stop-sign. Re-freeze before editing. |
| `src/app/mvp`, `src/components/Editor` except frozen files, `src/lib/mvp-workspace.ts`, future `src/lib/scene-graph/**`, future `src/state/**` | `codex/editor-scene-document` | editor shell, scene-document-first runtime, review shell plumbing | High | Replay only the allowed subset from the rejected editor branch. Do not carry over deployment, root, or experience work. |
| `backend/**` | `codex/backend-ingest-truth` | local backend ingest, reconstruction truth, payload normalization | High | Keep local backend changes isolated from deployed parity work. |
| `vercel-backend/**`, `api/_mvp_backend/**` | `codex/vercel-backend-parity` | deployed/public backend parity and packaged backend entrypoints | High | Do not mix with local backend internals unless the task is explicit parity sync. |
| `docs/**`, `maps/**`, `contracts/**`, `scripts/check_*`, `scripts/test_*`, `tests/**` | `codex/contracts-validation-handoff` | docs, validation, handoff contracts, truth checks | Medium contract risk | May add missing contracts and diagnostics, but must not redefine runtime truth by itself. |
| future `src/app/api/projects/**`, future `src/app/api/review-shares/**`, future `src/components/worlds/**`, future `src/server/projects/**`, future `src/server/review-shares/**` | `codex/projects-review-links` | project/world ownership and review-share restart lane | Medium | These paths are not on the freeze commit yet. Create them fresh from this baseline instead of replaying rejected branch work. |
| `src/app/pro`, `src/components/Viewfinder/**`, `src/components/experience/**`, `src/components/layout/**`, login/dashboard/waitlist shell | not in the restart pack | separate product work outside this repair | Medium | Do not piggyback unrelated prototype, marketing, or shell edits onto the restarted truth lanes. |

## Highest-Risk Shared Files

- `guard-deploy-target.mjs`
- `package.json`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`

## codex/editor-scene-document Salvage Classification

Compare only against committed branch head `2a1e90f135f363b14d3ea7a7f1704bed21885caa`. Do not treat the current dirty working tree as replayable input.

Allowed replay set for the restarted editor lane:

- `src/app/mvp/MVPRouteClient.tsx`
- `src/app/mvp/_hooks/useMvpWorkspaceShellController.ts`
- `src/app/mvp/page.tsx`
- `src/app/mvp/preview/page.tsx`
- `src/app/mvp/review/page.tsx`
- `src/components/Editor/ReviewExperience.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/useViewerPanelController.ts`
- `src/lib/mvp-viewer.ts`
- `src/lib/mvp-workspace.ts`
- `src/lib/scene-graph/**`
- `src/state/**`

Do not replay from the rejected editor branch:

- frozen stop-sign edits: `guard-deploy-target.mjs`, `package.json`, `src/app/globals.css`, `src/components/Editor/ViewerPanel.tsx`, `src/components/Editor/ThreeOverlay.tsx`
- control-plane and deployment-boundary edits: `scripts/check-deploy-boundary.mjs`, `scripts/deploy-boundary-lib.mjs`, `scripts/guard-deploy-target.mjs`, `src/app/api/mvp/deployment/route.ts`, `src/components/Editor/DeploymentFingerprintBadge.tsx`, `src/lib/mvp-deployment.ts`
- unrelated lane edits: `README.md`, `runbooks/local-dev.md`, `runbooks/release-sanity.md`, `src/components/experience/HeroPage.tsx`, `src/components/experience/content/HeroContent.tsx`, `src/components/layout/Navbar.tsx`

## Restart Rule

Every restarted branch begins from the new freeze commit created on top of `origin/main` `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.

- `codex/editor-scene-document`: split and replay only the allowed file set above.
- `codex/contracts-validation-handoff`: restart fresh from the freeze commit.
- `codex/backend-ingest-truth`: restart fresh from the freeze commit.
- `codex/projects-review-links`: restart fresh from the freeze commit.
- `codex/vercel-backend-parity`: restart fresh from the freeze commit.

## Shared Contract Files Introduced By This Lane

Runtime lanes may implement against these files, but they should not silently redefine them in product code:

- `contracts/world-ingest.md`
- `contracts/downstream-handoff.md`
- `contracts/schemas/world-ingest.external-world-package.request.json`
- `contracts/schemas/world-ingest.third-party-world-model-output.request.json`
- `contracts/schemas/world-ingest.record.response.json`
- `contracts/schemas/review-package.inline.scene-document-first.json`
- `contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
- `contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json`
- `docs/core-product-truth-validation-gates.md`
