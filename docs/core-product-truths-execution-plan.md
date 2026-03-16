# Core Product Truths Execution Plan

Date: March 16, 2026

Status: Active from the repaired truth-freeze baseline created directly on top of `origin/main` `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`.

## Product Truths

Every restarted thread must preserve these truths:

1. worlds must come from explicit ingest paths with clear provenance
2. the scene document must remain the durable source of scene truth
3. review, versioning, and sharing must stay first-class
4. downstream handoff must be explicit, not implied by a generic export
5. preview, reconstruction, and production-readiness truth must stay honest

## Freeze Contract For This Plan

- required gate on the freeze commit: `npm run build`
- informative-only command on the freeze commit: `npm run lint` currently fails and is not a release gate
- service-dependent diagnostics exist, but they are not part of the freeze contract until a later control-plane change makes them restart-safe
- no thread may edit the stop-sign surfaces listed in `docs/post-merge-truth-freeze-baseline.md` without a new freeze pass

## Shared Contract Outputs From This Lane

The contracts/validation/handoff lane now owns the following restart-baseline specs:

- `contracts/world-ingest.md`
- `contracts/downstream-handoff.md`
- `docs/core-product-truth-validation-gates.md`

Those files define the shared semantics runtime lanes should implement for:

- canonical normalization of every world source, including external world packages and third-party world-model outputs
- scene-document-first inline review/export payloads
- named downstream handoff manifests with explicit Unreal `ready` vs `blocked` posture

## Restart Lanes

| Thread | Owns on restart | Mission | Hard avoids |
| --- | --- | --- | --- |
| `codex/editor-scene-document` | `src/app/mvp`, non-frozen `src/components/Editor`, `src/lib/mvp-workspace.ts`, future `src/lib/scene-graph/**`, future `src/state/**` | replay the allowed editor/scene-document subset and continue scene-document-first work | stop-sign surfaces, deployment-boundary files, unrelated experience/marketing files |
| `codex/contracts-validation-handoff` | `docs/**`, `maps/**`, `contracts/**`, `scripts/check_*`, `scripts/test_*`, `tests/**` | define the shared world-ingest, scene-document-first review/export, and named downstream handoff contracts without falsifying runtime truth | runtime/product code except narrow test fixes approved by the owning lane |
| `codex/backend-ingest-truth` | `backend/**` | harden local ingest and truth metadata | `vercel-backend/**`, stop-sign surfaces |
| `codex/projects-review-links` | future `src/app/api/projects/**`, future `src/app/api/review-shares/**`, future `src/components/worlds/**`, future `src/server/projects/**`, future `src/server/review-shares/**` | restart project/world ownership and review-share work from a clean base | editor/runtime stop-sign surfaces and ad hoc reuse of rejected branch work |
| `codex/vercel-backend-parity` | `vercel-backend/**`, `api/_mvp_backend/**` | restart deployed parity work from the new baseline | local backend internals unless explicitly synchronizing a stable contract |

## Execution Order

1. recreate the freeze-safe commit and branch refs first
2. restart `codex/editor-scene-document` by replaying only the allowed file set from `2a1e90f135f363b14d3ea7a7f1704bed21885caa`
3. restart `codex/contracts-validation-handoff` in parallel to define the missing ingest and handoff contracts honestly
4. restart `codex/backend-ingest-truth` and `codex/vercel-backend-parity` from the same freeze commit once their scopes are clean
5. restart `codex/projects-review-links` from the same freeze commit; do not bootstrap it from the rejected editor branch

## Hard Stops

Stop and open a new freeze repair if any thread needs to edit:

- `guard-deploy-target.mjs`
- `package.json`
- `next.config.mjs`
- `tsconfig.json`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/api/mvp/[...path]/route.ts`
- `src/components/Editor/ViewerPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
