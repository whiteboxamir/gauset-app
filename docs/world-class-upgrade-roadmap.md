# Gauset World-Class Gaussian Masterplan

This repo already has the right product split: `Preview`, `Reconstruction`, and `Asset`. The next step is to stop treating “3D Gaussian” as one feature and build the full system required for world-class capture, reconstruction, rendering, review, and measurement.

## North Star

Ship an experience where a user can capture a real place, reconstruct it with faithful geometry and stable color, review it collaboratively in-browser, and move through it at interactive framerates without hiding quality failures.

World-class means all of the following at the same time:

- geometry fidelity: holdout views do not collapse into cards or fog
- color fidelity: exposure, white balance, and SH color decode stay stable across the scene
- runtime quality: desktop hero mode stays smooth, mobile review mode stays usable
- production truth: preview is labeled preview, reconstruction is labeled reconstruction
- operator confidence: every scene carries explicit quality gates, blockers, and next actions

## Current Repo Truth

- `src/components/Editor/LeftPanel.tsx`
  - already separates preview, reconstruction, and asset lanes
  - already scores individual frames and capture sets
- `backend/models/sharp_fusion_reconstructor.py`
  - already fuses per-view SHARP outputs with basic pose estimation
  - already emits alignment and appearance quality signals
- `src/components/Editor/ThreeOverlay.tsx`
  - still renders splats as colored points, not a true high-end splat renderer
- `src/components/Editor/RightPanel.tsx`
  - already shows quality, truth labels, and review/export surfaces
- `backend/api/routes.py`
  - already exposes setup truth, capture sessions, reconstruction kickoff, and job polling

This means the bottleneck is no longer “product concept.” The bottleneck is fidelity architecture.

## Phase 1: Capture Intelligence

Goal: stop bad data before it reaches the GPU path.

Implement in this repo:

- strengthen upload QC in `backend/api/routes.py`
  - per-frame blur, exposure, saturation, duplicate, and framing checks
  - capture-set readiness states: `building`, `minimum_met`, `production_ready`, `world_class_candidate`
- upgrade `src/components/Editor/LeftPanel.tsx`
  - show readiness, coverage, blockers, and the next actions required to reach hero-grade capture
- add a canonical capture scorecard to scene metadata
  - coverage score
  - sharp-frame ratio
  - duplicate count
  - operator guidance

Exit criteria:

- bad capture sets are visibly blocked before reconstruction spend
- users know exactly how many more angles and what quality fixes are required

## Phase 2: Real Reconstruction Stack

Goal: replace the current hybrid local fusion path with a production reconstruction worker.

Implement outside or beside the Next.js app, but keep the contract compatible with this repo:

- frame curation and keyframe selection
- feature extraction and matching with `hloc`
- camera solve with `COLMAP`
- pose refinement with `PixSfM`
- Gaussian training/export with `gsplat` or Nerfstudio `Splatfacto`
- artifact outputs:
  - streamed splat payload
  - calibrated camera bundle
  - reconstruction report
  - holdout render metrics

Repo work in parallel:

- keep `backend/api/routes.py` as the orchestration contract
- version richer metadata in `src/lib/mvp-product.ts`
- preserve truthful lane labeling in all review/export flows

Exit criteria:

- 12-24 frame captures reconstruct consistently
- holdout views are judged against measured metrics, not taste alone
- the scene metadata contains enough quality data to gate release

## Phase 3: World-Class Browser Renderer

Goal: make the result look expensive on screen.

Implement in `src/components/Editor/ThreeOverlay.tsx` and related renderer surfaces:

- replace point-cloud fallback rendering with a real Gaussian splat renderer
- add level-of-detail and chunk streaming for large scenes
- add desktop/mobile viewer profiles with explicit budgets
- support color-managed output, exposure compensation, and tone response
- surface camera paths and saved viewpoints against the real splat volume

Exit criteria:

- desktop hero mode feels cinematic instead of diagnostic
- mobile review mode is stable instead of overloaded
- large reconstructions remain interactive

## Phase 4: Cinematic World Tools

Goal: make the reconstructed world directable.

Implement in editor and review layers:

- 3D-anchored review issues with real spatial persistence
- path authoring that can drive dolly, orbit, and blocking previs
- environment-level notes for lighting, hazards, access, and egress
- quality-aware review exports that preserve truth labels and blocker state

Exit criteria:

- a producer, director, or VFX lead can review the world without losing scene context
- review packages remain honest about confidence and reconstruction limits

## Phase 5: Quality Harness And Hostile Audits

Goal: move from demos to a machine that gets better every week.

Implement across `scripts/`, `tests/`, and `runbooks/`:

- a benchmark suite covering:
  - indoor
  - outdoor
  - night
  - foliage
  - reflective surfaces
  - cluttered production spaces
- nightly hostile audits with saved reports
- release gates for:
  - camera solve success
  - reconstruction success
  - holdout quality
  - point budget
  - latency
  - cost

Exit criteria:

- regressions are caught before release
- quality trends are visible by scene category

## Phase 6: Delivery Infrastructure

Goal: ship production scenes, not just local proofs.

Build next:

- dedicated GPU workers for reconstruction and retraining
- object storage for splat artifacts, cameras, metadata, and review packages
- background job retries, queueing, and scene lifecycle tracking
- asset compression and progressive delivery

Exit criteria:

- reconstruction is not tied to a single local machine
- scene delivery is reliable enough for real productions

## Hard Gates

Do not call a scene “world-class” unless all of these are true:

- capture set reaches the `world_class_candidate` gate
- reconstruction metadata clears geometry, color, coverage, and density thresholds
- holdout views pass benchmark review
- browser rendering stays interactive in the intended delivery mode
- review exports preserve confidence, blockers, and lane truth

## Immediate Execution Order

1. Tighten capture readiness and fidelity metadata in the current local stack.
2. Upgrade the editor UI so quality gates are visible to operators.
3. Replace the browser point renderer with a real splat renderer and LOD path.
4. Stand up the dedicated reconstruction worker and keep the current API contract.
5. Add hostile audits and release gates before claiming production readiness.
