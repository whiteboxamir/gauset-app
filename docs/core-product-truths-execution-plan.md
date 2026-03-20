# Core Product Truths Execution Plan

Date: March 16, 2026

Status: Guardrail content retained, but execution is blocked until a new truth-freeze commit exists.

## Objective

Hardwire five product truths into the repo so they stop being positioning copy and become build rules:

1. Gauset must ingest worlds from multiple sources.
2. The scene document must be the canonical source of truth.
3. Review, versioning, and sharing must be first-class.
4. Export and handoff to Unreal and related downstream tools must be explicit.
5. The product must stay honest about preview vs reconstruction vs production readiness.

These are now acceptance gates for design, implementation, and release planning.

## Freeze Precondition

Do not start any implementation thread from this plan until a new freeze-safe commit is recorded in `/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md`.

Current repair result:

- shared integration base for the repair: `origin/main` at `ddd4f216b4b5e4af1257d3b57ea7f8c693f6c3aa`
- freeze-safe baseline today: none
- required next step: create a new truth-freeze commit first

## Current Status

| Truth | Status | Evidence | Current Gap |
| --- | --- | --- | --- |
| Multi-source world ingest | Partial | Uploads, provider-generated stills, demo worlds, project-linked reopen, and capture-session intake already exist in the editor and backend. See `/Users/amirboz/gauset-app/src/components/Editor/LeftPanel.tsx`, `/Users/amirboz/gauset-app/docs/provider-image-generation.md`, `/Users/amirboz/gauset-app/src/server/projects/ownership.ts`. | There is no first-class external world import contract yet for third-party world outputs, splat packages, or downstream round-trips. Public reconstruction also remains intentionally unavailable until the worker exists. |
| Scene document is canonical | Partial | `SceneDocumentV2`, Zustand store wiring, migration, and review-package normalization are landed. See `/Users/amirboz/gauset-app/src/lib/scene-graph/types.ts`, `/Users/amirboz/gauset-app/src/state/mvpSceneStore.ts`, `/Users/amirboz/gauset-app/src/lib/mvp-review.ts`. | Compatibility `sceneGraph` envelopes still exist, and the repo is not yet fully ruthless about deriving save, review, export, and import flows from the scene document first. |
| Review/version/share are first-class | Strong but incomplete | Save/version/review/comment flows are implemented, and secure review shares plus project-linked world ownership are landed. See `/Users/amirboz/gauset-app/maps/request-flow.md`, `/Users/amirboz/gauset-app/src/app/mvp/_hooks/useMvpWorkspaceReviewShareController.ts`, `/Users/amirboz/gauset-app/src/components/worlds/WorldTruthPanel.tsx`. | Strong today, but not yet the mandatory center of every future ingest and handoff path. Some world-class review features remain roadmap items rather than enforced requirements. |
| Unreal/downstream handoff is explicit | Weak | Generic JSON scene export exists, and assets already emit `mesh.glb`. See `/Users/amirboz/gauset-app/src/app/mvp/_hooks/useMvpWorkspaceReviewShareController.ts`, `/Users/amirboz/gauset-app/maps/request-flow.md`. | There is no explicit Unreal or downstream handoff contract, no target profiles, no exported handoff manifest, and no certified downstream adapter path. |
| Lane truth and production honesty | Strong on lane honesty, partial on promotion readiness | Preview vs reconstruction vs asset truth is already surfaced in setup, capture, viewer, and review metadata. See `/Users/amirboz/gauset-app/src/lib/mvp-product.ts`, `/Users/amirboz/gauset-app/docs/post-merge-truth-freeze-baseline.md`, `/Users/amirboz/gauset-app/docs/world-class-upgrade-roadmap.md`. | The repo is honest about unavailable or approximate lanes, but “final enough for production” still needs a clearer promotion gate spanning editor, review, export, and handoff. |

## Non-Negotiable Product Invariants

Every future feature touching worlds, scenes, review, or delivery must preserve all of these:

1. No world source may bypass a canonical world-ingest path.
   Every source must resolve into a durable world record with explicit provenance.

2. No durable world state may live only in ad hoc UI state.
   Durable scene state must resolve into `SceneDocumentV2` or its direct successor.

3. No new world creation path is complete without review/version/share support.
   If a world can be opened and directed, it must also be saveable, reviewable, and shareable.

4. No export is complete until its downstream target is named.
   “Export JSON” is not sufficient product language for production handoff.

5. No lane may blur preview, reconstruction, and production-readiness truth.
   The product must say what kind of output it is, what generated it, what is still blocked, and whether it is promotable.

6. No platform layer may redefine scene ownership semantics.
   `project_id` remains platform-owned; `scene_id` remains MVP-owned; the mapping layer is the contract.

7. No parallel thread may change frozen stop-sign surfaces without a new truth-freeze pass.
   The current stop-sign list remains the source of truth for shared runtime boundaries.

## Required Acceptance Gates

No thread should call a deliverable done unless the relevant gate passes.

### Gate A: World Ingest

- The source type is explicit.
- Provenance is stored with the world.
- The ingested world can reopen through the normal workspace path.
- The ingested world can enter save/review/share flows.
- Lane truth remains visible after ingest.

### Gate B: Scene Document

- The feature reads from and writes to `SceneDocumentV2` first.
- Compatibility shims, if still required, are derived from the scene document rather than treated as peer truth.
- Save/load/restore/export behavior is covered by migration-safe tests.

### Gate C: Review, Version, Share

- The world can be versioned after change.
- Review metadata attaches to the durable scene or an explicitly labeled draft package.
- Shared payloads preserve truth labels, blockers, and scene identity.
- Project-linked access rules are not bypassed.

### Gate D: Handoff

- The target system is named explicitly.
- The exported package has a documented contract.
- The package declares source truth, lane truth, and delivery readiness.
- The package is derived from the canonical scene document.

### Gate E: Product Honesty

- The UI and payload name the lane truth correctly.
- Preview never implies faithful reconstruction.
- Reconstruction never implies production readiness without passing delivery gates.
- “Ready for production” or equivalent language is backed by explicit metadata and a measurable gate.

## Parallel Execution Plan

Use separate worktrees. Do not split one high-conflict lane into multiple concurrent owners just to increase apparent parallelism.

### Thread 1: Editor + Scene Document Lane

Owns:

- `/Users/amirboz/gauset-app/src/app/mvp`
- `/Users/amirboz/gauset-app/src/components/Editor` except frozen stop-sign files
- `/Users/amirboz/gauset-app/src/lib/scene-graph`
- `/Users/amirboz/gauset-app/src/state`

Mission:

- Make the scene document the obvious primary source for all world operations.
- Add explicit source provenance to the scene document path.
- Ensure every editor-visible world source flows through one canonical ingest model.
- Make export originate from the scene document first, not legacy graph shapes.

Deliverables:

- Source provenance model for demo, upload, provider-generated still, linked world, capture set, and future external world imports
- Removal of remaining scene-graph-first assumptions in editor persistence and export paths
- Acceptance tests for save/load/reopen/export from scene-document-first flows

Stop-signs:

- Do not touch `/Users/amirboz/gauset-app/src/components/Editor/ViewerPanel.tsx`
- Do not touch `/Users/amirboz/gauset-app/src/components/Editor/ThreeOverlay.tsx`
- Do not touch `/Users/amirboz/gauset-app/src/components/Editor/useThreeOverlayViewerRuntimeController.ts`

### Thread 2: Local Backend Ingest + Truth Lane

Owns:

- `/Users/amirboz/gauset-app/backend`

Mission:

- Define and expose explicit source-aware world-ingest contracts locally.
- Ensure local payloads carry source provenance, lane truth, and production-readiness metadata consistently.
- Keep reconstruction truth honest while the worker remains disconnected.

Deliverables:

- Canonical ingest contract for upload, generated still, capture set, and future external world package inputs
- Source and lane metadata normalized into responses and stored metadata
- Tests that block misleading local truth when a worker or source is unavailable

Stop-signs:

- Do not edit frozen proxy or access truth files
- Do not edit `vercel-backend` in this lane

### Thread 3: Vercel Backend Parity Lane

Owns:

- `/Users/amirboz/gauset-app/vercel-backend`

Mission:

- Match the deployed backend contract to the local source/truth model where it is safe.
- Keep public truth explicit when a lane or source is not actually connected.

Deliverables:

- Parity for ingest/source metadata where public deployment supports it
- Explicit public truth for unsupported inputs or unavailable reconstruction
- Tests or fixtures proving public contract honesty stays intact

Stop-signs:

- Do not reopen local backend implementation details unless the task is explicit parity work

### Thread 4: Projects + Review Shares + World Links Lane

Owns:

- `/Users/amirboz/gauset-app/src/app/api/projects`
- `/Users/amirboz/gauset-app/src/app/api/review-shares`
- `/Users/amirboz/gauset-app/src/components/worlds`
- `/Users/amirboz/gauset-app/src/server/projects`
- `/Users/amirboz/gauset-app/src/server/review-shares`

Mission:

- Make durable ownership, review distribution, and world reopening feel native rather than auxiliary.
- Ensure every durable world has a clean project-linked lifecycle.
- Surface truth and handoff posture at the project layer.

Deliverables:

- Project/world-link surfaces that expose source truth and delivery status
- Review-share flows that remain version-aware and explicit about payload mode
- Handoff inventory at the project level once downstream export contracts exist

Stop-signs:

- Do not reinterpret `scene_id`
- Do not modify scene graph internals from this lane

### Thread 5: Export/Handoff Contracts + Validation Lane

Owns:

- `/Users/amirboz/gauset-app/docs`
- `/Users/amirboz/gauset-app/maps`
- `/Users/amirboz/gauset-app/contracts`
- `/Users/amirboz/gauset-app/tests/platform`
- `/Users/amirboz/gauset-app/scripts/check_*`
- `/Users/amirboz/gauset-app/scripts/test_*`

Mission:

- Specify the missing downstream handoff contracts before product/runtime lanes implement them ad hoc.
- Turn the five product truths into explicit certification gates.

Deliverables:

- A documented handoff contract for Unreal and other downstream targets
- A documented world-ingest contract for external world packages and third-party world-model outputs
- Validation checks that fail when review/share/truth/handoff rules regress

Stop-signs:

- This lane documents and validates runtime truth; it does not redefine runtime truth by itself

## Recommended Order

These threads can run together if ownership boundaries hold, but the primary next implementation thread should be the editor and scene-document lane:

1. Start Thread 1 first and keep Phase 2 moving in the editor, scene-document, and state layers without touching frozen viewer-runtime files.
2. Run Thread 5 in parallel to lock missing ingest and Unreal/downstream handoff contracts plus the validation gates for these product truths.
3. Start Thread 2 in parallel on local backend ingest and truth normalization.
4. Start Thread 4 in parallel on project, review-share, and world-link hardening.
5. Start Thread 3 after Thread 2 has stabilized the local contract shape enough for safe deployed parity work.

## Hard Stops

Stop and re-freeze if any thread needs to change:

- `/Users/amirboz/gauset-app/src/app/api/mvp/[...path]/route.ts`
- `/Users/amirboz/gauset-app/src/server/mvp/access-gate.ts`
- `/Users/amirboz/gauset-app/src/server/mvp/access.ts`
- `/Users/amirboz/gauset-app/src/server/platform/activation-readiness.ts`
- `/Users/amirboz/gauset-app/src/app/api/platform/readiness/route.ts`
- `/Users/amirboz/gauset-app/src/components/Editor/ViewerPanel.tsx`
- `/Users/amirboz/gauset-app/src/components/Editor/ThreeOverlay.tsx`
- `/Users/amirboz/gauset-app/src/components/Editor/useThreeOverlayViewerRuntimeController.ts`

Do not create parallel editor threads inside the same high-conflict lane.

## Immediate Next Moves

1. Keep the primary build thread on the editor and scene-document lane described in `PHASE_2_ROADMAP.md`, while avoiding frozen viewer-runtime files.
2. Treat multi-source ingest and explicit downstream handoff as the two biggest current product gaps around that editor foundation.
3. Make `SceneDocumentV2` the mandatory center of any new editor, review, or export work.
4. Require every new world path to prove review/version/share readiness before it is called complete.
5. Define what “production-ready” means in metadata and export contracts before marketing or UI language claims it.
6. Run future threads against this document and the existing ownership matrix together.
