# PHASE 2 Roadmap

Date: March 12, 2026

## Status Snapshot

Phase 1 is now green for the public MVP lanes that actually exist today.

- `gauset.com` preview and asset generation are restored and backed by durable Vercel Blob storage.
- The public MVP backend is truthful again: preview and asset are online, reconstruction is still intentionally unavailable until a separate GPU worker is connected.
- Local Phase 1 closeout remains green in `/Users/amirboz/gauset-app`.
- The next phase is not "ship more features fast." It is "add a real scene graph and multi-node editor without reintroducing production fragility."

## What We Build Next

Phase 2 is the transition from a preview-first MVP into a multi-node Virtual Production Studio.

The product goal is:

1. A durable scene document that can represent cameras, lights, meshes, splats, groups, and shot direction.
2. A state model that supports 60fps transforms without broad React rerender storms.
3. A renderer bridge that can ingest the scene document incrementally and fail gracefully.
4. An editor shell that lets users create, select, reparent, inspect, and animate scene nodes.

## Non-Negotiable Rules

These rules are now part of the plan because the production recovery made the cost of missing guardrails clear.

1. No production-facing MVP deploy is considered complete unless storage preflight and a write-path canary both pass.
2. No high-frequency transform path goes through top-level React `useState` for the whole scene graph.
3. No viewer failure is allowed to black-screen the workspace. It must degrade to an explicit fallback state.
4. No schema change ships without migration coverage for the prior persisted document format.
5. No Phase 2 feature wave is called done unless its diagnostics, screenshots, and self-tests pass.

## Repo Topology

There are now two distinct workstreams and they must stay separate:

- `/Users/amirboz/gauset`
  This is the `gauset.com` production repo and release path.
- `/Users/amirboz/gauset-app`
  This is the Phase 2 architecture workspace, local certification surface, and public certification toolchain for `gauset-app`.

The mistake to avoid repeating is treating these as one deployment surface.

## Architecture Decision

Phase 2 should use a normalized scene document plus Zustand-backed editor state.

Recommended shape:

- Persisted scene document:
  - versioned
  - normalized
  - flat node records keyed by `nodeId`
  - explicit parent/child relationships
  - explicit payload records per node kind
- Transient editor/runtime state:
  - selection
  - hover
  - gizmo mode
  - draft transforms during drag
  - render capabilities
  - viewer focus requests
  - bounds/cache/runtime registries

This is a better fit than the current top-level React `sceneGraph` state because the current editor still fans broad changes through `MVPRouteClient`, `ViewerPanel`, `RightPanel`, and `ThreeOverlay`.

### Proposed Core Types

```ts
type NodeId = string;
type NodeKind = "group" | "camera" | "light" | "mesh" | "splat";

interface SceneDocumentV2 {
  version: 2;
  rootIds: NodeId[];
  nodes: Record<NodeId, SceneNode>;
  cameras: Record<NodeId, CameraNodeData>;
  lights: Record<NodeId, LightNodeData>;
  meshes: Record<NodeId, MeshNodeData>;
  splats: Record<NodeId, SplatNodeData>;
  review: SceneReviewState;
  viewer: ViewerDocumentState;
}

interface SceneNode {
  id: NodeId;
  kind: NodeKind;
  parentId: NodeId | null;
  childIds: NodeId[];
  name: string;
  visible: boolean;
  locked: boolean;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
}
```

### Store Split

Persisted slice:

- `document`
- migrations
- autosave state
- undoable committed changes

Transient slice:

- `selectedNodeIds`
- `hoveredNodeId`
- `activeTool`
- `draftTransforms`
- `dragSession`
- `renderCapabilities`
- `viewerFallback`
- `runtimeBounds`

Critical rule:

- During drag, update `draftTransforms` only.
- On drag end, commit one patch into the persisted document and one undo entry.

That is how we preserve interactivity and avoid rerender churn.

## Track 0: Release Hardening

This starts first. It is not optional cleanup. It is the protection layer that allows the rest of Phase 2 to move without breaking `gauset.com`.

### Goals

- Make the production MVP storage/deploy topology explicit.
- Add hard release gates for required env vars and write-path health.
- Remove backend duplication that already caused one incorrect production patch.

### Deliverables

In `/Users/amirboz/gauset`:

1. Add a production MVP release preflight script.
   - file target: `scripts/mvp_release_preflight.mjs`
   - checks:
     - required env vars exist
     - `BLOB_READ_WRITE_TOKEN` exists for production
     - `/api/mvp/setup/status` returns the expected truth profile
     - required public lanes match expectations

2. Add a post-deploy canary script.
   - file target: `scripts/mvp_public_canary.mjs`
   - flow:
     - upload
     - generate environment preview
     - verify `splats.ply` and `metadata.json`
     - save scene
     - list versions
   - fail if any write path regresses

3. Add a production release runbook specific to `gauset.com`.
   - file target: `runbooks/mvp-production-release.md`
   - must not reuse the `gauset-app` runbook as if it were the production path

4. Remove the duplicate MVP backend runtime copy or make one file the single source of truth.
   - current risk:
     - `api/_mvp_backend/vercel_backend/app.py`
     - `api/_mvp_backend/vercel-backend/app.py`

5. Add a hard stop in release tooling if public MVP storage is not durable.

### Self-Tests

- `setup/status` must report `storage_mode: "blob"` in production.
- Upload must return an image id and durable storage URL.
- Environment generation must complete and expose `splats`, `metadata`, and `viewer` URLs.
- Scene save and version listing must pass on the generated scene.

### Exit Criteria

- One command can answer "is production safe to release?" with a binary result.
- The production repo has one obvious MVP backend runtime path.
- No future deploy can silently fall back to filesystem storage without failing release gates.

## Track 0.5: Preview Quality Recovery

The production incident is fixed, but the local viewer quality regression is still real.

This is a separate track from release hardening and should be handled as a measured retune, not a blind revert.

### Goals

- Recover some of the visual density and sharpness lost to conservative fallback tuning.
- Keep the crash-prevention behavior that prevented large-scene instability.

### Deliverables

In `/Users/amirboz/gauset-app`:

1. Benchmark current preview quality and stability.
2. Retune:
   - `MAX_GPU_SORT_WORKING_SET_BYTES`
   - preview point budgets
   - CPU-ordering threshold logic
3. Capture before/after screenshots and benchmark data for:
   - single-image preview
   - large dense splat
   - weak-capability fallback

### Exit Criteria

- Local quality is visibly improved.
- No benchmark regression on the 5M local certification path.
- No return of black-canvas or context-loss failures.

## Track 1: Scene Document V2

This is the real start of Phase 2 feature architecture.

### Goals

- Replace the loose `WorkspaceSceneGraph` shape with a versioned document model.
- Keep backward compatibility with `PersistedSceneGraphV1`.

### Deliverables

1. Add the new document schema.
   - file targets:
     - `src/lib/scene-graph/types.ts`
     - `src/lib/scene-graph/document.ts`
     - `src/lib/scene-graph/migrate.ts`

2. Add adapters to and from the current workspace graph.
   - preserve:
     - environment
     - assets
     - camera views
     - pins
     - director path
     - director brief
     - viewer state

3. Define node payload types for:
   - group
   - camera
   - light
   - mesh
   - splat

4. Define persistence contract updates for save/version flows.

### Self-Tests

- V1 -> V2 migration roundtrip
- scene save/load roundtrip
- version restore roundtrip
- empty scene migration
- mixed asset/environment scene migration

### Exit Criteria

- Scene state is represented as a versioned document, not just a UI graph.
- Existing saved scenes still load.
- The persisted model is ready for multi-node authoring.

## Track 2: Zustand Store Foundation

### Goals

- Move authoritative editor state out of broad top-level React state.
- Keep the renderer and inspector subscribed to narrow slices.

### Deliverables

1. Add the editor store.
   - file targets:
     - `src/state/mvpSceneStore.ts`
     - `src/state/mvpSceneSelectors.ts`
     - `src/state/mvpSceneHistory.ts`

2. Store slices:
   - document
   - selection
   - draft transforms
   - viewer runtime
   - save/autosave
   - undo/redo

3. Actions:
   - add node
   - remove node
   - duplicate node
   - reparent node
   - update committed transform
   - update draft transform
   - commit draft transforms
   - set active selection

4. Integrate store reads into `MVPRouteClient` without changing the entire editor at once.

### Self-Tests

- selector stability
- patch history behavior
- one undo entry per drag session
- multi-node selection updates
- autosave dirty-state behavior

### Exit Criteria

- The new store can hold the Phase 2 document and runtime state.
- Editor interactions no longer require broad `sceneGraph` object rewrites.

## Track 3: Render Bridge

### Goals

- Feed the scene document into Three.js imperatively and incrementally.
- Decouple hot runtime updates from React rerender frequency.

### Deliverables

1. Add a node registry / render bridge.
   - file targets:
     - `src/lib/render/sceneNodeRegistry.ts`
     - `src/lib/render/sceneRuntime.ts`
     - `src/lib/render/runtimeTransforms.ts`

2. Convert `ThreeOverlay` to consume the normalized store/document shape.

3. Add runtime registries for:
   - cameras
   - lights
   - meshes
   - splats

4. Keep current viewer fallback behavior and capability resolution intact.

### Self-Tests

- add/remove node disposes Three objects correctly
- renderer survives missing splat asset by falling back
- mesh payload mismatch regression still passes
- scene update does not leak objects across repeated loads

### Exit Criteria

- The renderer can map document nodes to stable runtime objects.
- Transform and visibility updates can happen without whole-tree React rerenders.

## Track 4: Scene Tree And Inspector

### Goals

- Expose the multi-node scene graph to the user.
- Replace asset-only editing with general node inspection.

### Deliverables

1. Scene tree UI.
   - create group
   - create camera
   - create light
   - rename node
   - reorder/reparent node
   - lock/hide node

2. Inspector UI.
   - transform
   - camera lens/FOV
   - light intensity/color/type
   - mesh/splat metadata

3. Selection model.
   - single select
   - multi-select
   - tree-to-viewport synchronization

### Self-Tests

- create/delete/reparent behavior
- selection sync across tree, viewport, and inspector
- locked node cannot be transformed
- hidden node is omitted from render visibility

### Exit Criteria

- The user can author and navigate a real multi-node scene graph.

## Track 5: Transform Tools And 60fps Interaction

### Goals

- Make transforms fast, predictable, and undoable.

### Deliverables

1. Replace direct asset transform writes with draft transform sessions.
2. Add transform gizmo modes:
   - translate
   - rotate
   - scale
3. Add world/local space toggles and snap controls.
4. Commit one undoable patch per completed drag.

### Self-Tests

- 60fps drag on representative scenes
- undo/redo after drag
- multi-node transform behavior
- no broad rerender spikes during continuous drag

### Exit Criteria

- Transform interaction is editor-grade instead of MVP-grade.

## Track 6: Persistence, Review, And Export Alignment

### Goals

- Make the Phase 2 document the source of truth across save, review, and export.

### Deliverables

1. Update save/version contracts for `SceneDocumentV2`.
2. Update review package generation to derive from the new document.
3. Add migration-safe export/import.
4. Add durable version comparison support.

### Self-Tests

- save/load V2
- version restore V2
- review package render from V2
- backward load of V1 scenes

### Exit Criteria

- Review and persistence are aligned with the Phase 2 editor model.

## Track 7: Reconstruction Lane Integration

This is a parallel track and not a prerequisite for starting the scene graph/editor work.

### Goals

- Connect the missing public reconstruction lane once the separate GPU worker is available.

### Deliverables

1. Worker status contract
2. capture-session to reconstruction-job contract
3. UI truth states for:
   - unavailable
   - collecting
   - queued
   - processing
   - completed
   - failed

### Exit Criteria

- The public product truth can move from "2 of 3 production modes connected" to the real connected state without lying.

## Diagnostics Matrix

Every wave must run the diagnostics appropriate to its risk surface.

Static gates:

- `npm run typecheck`
- `npm run lint:mvp`
- targeted unit tests

Local editor gates:

- `npx playwright test tests/mvp.local.spec.js`
- hostile local audit
- relevant screenshot review

Public gates for production-affecting changes in `/Users/amirboz/gauset`:

- release preflight
- post-deploy canary
- `setup/status` verification
- at least one screenshot reviewed after deploy

Performance gates:

- 5M benchmark for viewer changes
- transform interaction benchmark for editor-state changes

## First Execution Sequence

This is the order to start now.

### Wave A: Production Hardening

In `/Users/amirboz/gauset`:

1. Add `mvp_release_preflight.mjs`
2. Add `mvp_public_canary.mjs`
3. Add `mvp-production-release.md`
4. Remove or collapse the duplicate backend runtime path

### Wave B: Document And Store Foundation

In `/Users/amirboz/gauset-app`:

1. Add `SceneDocumentV2` types and migration helpers
2. Add Zustand store skeleton
3. Add document/store tests

### Wave C: Renderer Integration

In `/Users/amirboz/gauset-app`:

1. Add scene runtime registry
2. Move `ThreeOverlay` toward store-backed narrow subscriptions
3. Keep current fallback and capability logic intact

### Wave D: Tree, Inspector, And Transform Session

In `/Users/amirboz/gauset-app`:

1. Scene tree UI
2. inspector UI
3. draft transform session model
4. undo/redo integration

## Recommended Immediate Start

Start with Wave A, then Wave B.

Reason:

- Wave A prevents another production regression while Phase 2 is under construction.
- Wave B establishes the document/store architecture that every later Phase 2 feature depends on.

That is the correct sequence after the production incident. We harden release first, then build the scene graph core, then layer the editor UI and transform system on top.
