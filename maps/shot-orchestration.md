# Minimal Shot Orchestration Map

This document captures the smallest useful version of structured shot orchestration for Gauset.

It is intentionally not a new prompt language, not a cinematic DSL, and not a claim of determinism.
The goal is simpler: compile the world state Gauset already owns into a reusable shot contract that can guide provider-specific generation with less drift.

## Why This Exists

Gauset already has the right product center:

- persistent world state
- camera and lens data
- director path recording
- scene save + version history
- review and handoff surfaces

What is still missing is a thin orchestration layer between:

- `SceneDocumentV2`
- the user's shot intent
- provider-specific generation payloads

That layer should help us preserve continuity and swap providers without rewriting creative intent every time.

## The Smallest Valuable Addition

Add one new internal contract:

- `ShotSpecV1`

Do not add a full sequence language yet.
Do not add a new proprietary syntax.
Do not rebuild the editor around prompt sliders.

`ShotSpecV1` is the smallest object that can describe one intended output clip in a provider-agnostic way.

## Proposed Contract

```ts
type ShotLockMode = "locked" | "guided" | "open";

type ShotSpecV1 = {
  version: 1;
  shot_id: string;
  scene_id: string | null;
  source_version_id: string | null;

  // Human intent stays short and editable.
  brief: string;

  output: {
    aspect_ratio: string;
    fps: number;
    duration_seconds: number;
  };

  camera: {
    source: "active_view" | "saved_camera_view" | "director_path";
    camera_node_id: string | null;
    lens_mm: number | null;
    fov: number | null;
    path: CameraPathFrame[];
  };

  continuity: {
    world_lock: ShotLockMode;
    camera_lock: ShotLockMode;
    lens_lock: ShotLockMode;
    lighting_lock: ShotLockMode;
    subject_lock: ShotLockMode;
  };

  references: {
    environment_image_url: string | null;
    selected_upload_ids: string[];
  };

  allowed_variance: string[];

  provider_overrides?: Record<string, unknown>;
};
```

## What Feeds `ShotSpecV1`

`ShotSpecV1` should compile from existing Gauset state, not a parallel authoring system:

- `SceneDocumentV2`
- active camera node or selected camera view
- recorded `directorPath` when present
- current lens/FOV
- short director brief
- selected reference uploads
- requested aspect ratio / output duration

This keeps Gauset world-first.
The shot spec is derived from the world, not authored as a separate universe.

## First Implementation Pass

When implementation starts, the minimal pass should be:

1. Create `src/lib/shot-spec.ts` with `ShotSpecV1` types and a `buildShotSpec()` helper.
2. Compile from existing scene state in the MVP workspace generation flow.
3. Log or persist the built shot spec next to generation requests for inspection.
4. Add a compact UI summary before generation:
   - camera source
   - lens
   - duration
   - aspect ratio
   - active locks
5. Route provider-specific translation through a dedicated compiler step instead of raw prompt assembly.

That is enough to add real value without changing the product philosophy.

## Provider Compiler Shape

The first compiler layer should stay narrow:

- input: `ShotSpecV1`
- output: provider request payload + trace metadata

Initial compiler targets:

- current still/image providers in the MVP flow
- future video providers behind `src/app/api/generate/route.ts`

This compiler is where provider quirks belong.
They should not leak back into the scene document or core editor model.

## What We Are Explicitly Not Building Yet

Not in scope for the first pass:

- a branded Gauset syntax language
- giant emotion-control panels
- sequence-wide timeline authoring
- full character identity systems
- performance-transfer controls
- deterministic guarantees
- a new backend orchestration service

If a future feature does not reduce continuity drift or provider-switching cost, it should not be added under this effort.

## Why `ShotSpecV1` Fits Gauset

This approach reinforces the current product line instead of distorting it:

- Gauset still starts from the world, not from a prompt box.
- Existing save/version/review flows stay relevant.
- Generation becomes inspectable and more reproducible.
- The app can support multiple providers without making users rewrite intent in vendor-specific language.

## Likely Future Touch Points

When the feature is implemented later, the likely edit surface is:

- `src/lib/shot-spec.ts` (new)
- `src/app/mvp/_hooks/useMvpWorkspaceGenerationController.ts`
- `src/components/Editor/LeftPanelGenerateSection.tsx`
- `src/lib/mvp-product.ts`
- `src/app/api/generate/route.ts`
- provider integration code in backend or proxy-adjacent surfaces

Avoid changing `SceneDocumentV2` until the first compiler pass proves we truly need persistent shot-spec storage.

## Decision Rule

Use this filter for future additions:

- keep it if it preserves continuity, reduces rerender drift, or makes provider switching easier
- cut it if it mainly makes prompting look more elaborate
