# Parallel Thread Start Pack

Date: March 16, 2026

Status: Active for the repaired freeze baseline created directly on top of `origin/main` `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.

## Start Gate

Before any thread resumes:

1. start from the new freeze commit created by this repair
2. run `npm run build`
3. accept the reduced command contract described in `docs/post-merge-truth-freeze-baseline.md`
4. do not touch the frozen stop-sign surfaces

## Thread Restart Table

| Thread | Branch | Start state | First-step instruction | Explicitly forbidden |
| --- | --- | --- | --- | --- |
| Editor + scene document | `codex/editor-scene-document` | rejected branch must be split | create a new branch from the freeze commit and replay only the allowed editor files from `2a1e90f135f363b14d3ea7a7f1704bed21885caa` | merging the old branch, rebasing the whole branch, or copying the dirty working tree wholesale |
| Contracts + validation + handoff | `codex/contracts-validation-handoff` | missing | create and publish a fresh branch from the freeze commit | claiming missing diagnostics exist before they are added and verified |
| Local backend ingest + truth | `codex/backend-ingest-truth` | missing | create and publish a fresh branch from the freeze commit | editing `vercel-backend/**` or stop-sign surfaces from this lane |
| Projects + review shares + world links | `codex/projects-review-links` | missing | create and publish a fresh branch from the freeze commit | inventing its starting point from rejected branch work |
| Vercel backend parity | `codex/vercel-backend-parity` | missing | create and publish a fresh branch from the freeze commit | mixing local backend internals into the parity restart |

## Reduced Command Contract

Use only this command contract for the freeze commit:

- required: `npm run build`
- informative only: `npm run lint`
- not part of the freeze contract: service-dependent diagnostics and any previously documented npm scripts that do not exist on this commit

## Restart Notes For codex/editor-scene-document

Allowed replay set:

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

Do not replay:

- `guard-deploy-target.mjs`
- `package.json`
- `src/app/globals.css`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `scripts/check-deploy-boundary.mjs`
- `scripts/deploy-boundary-lib.mjs`
- `scripts/guard-deploy-target.mjs`
- `src/app/api/mvp/deployment/route.ts`
- `src/components/Editor/DeploymentFingerprintBadge.tsx`
- `src/lib/mvp-deployment.ts`
- `README.md`
- `runbooks/local-dev.md`
- `runbooks/release-sanity.md`
- `src/components/experience/HeroPage.tsx`
- `src/components/experience/content/HeroContent.tsx`
- `src/components/layout/Navbar.tsx`

## Resume Condition

Parallel work can resume immediately from the new freeze commit once the restart branches above are created from it.
