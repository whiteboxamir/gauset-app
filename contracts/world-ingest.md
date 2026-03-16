# World Ingest Contract

Snapshot date: 2026-03-16.

This contract defines the shared normalization point for every world entering Gauset. It is the agreed target for restarted runtime lanes to implement from the truth-freeze baseline; it does not claim the current baseline runtime already persists every field below.

## Why This Exists

- The baseline already has native intake paths for demo worlds, uploads, provider-generated stills, capture sessions, and saved scene reopen.
- The missing shared contract before this lane was explicit intake for `external_world_package` and `third_party_world_model_output`.
- The product truths require one canonical ingest path, explicit provenance, scene-document-first durability, and honest lane labeling.

## Source Kinds

Every intake path must resolve to one of these `source_kind` values before durable state is created:

| `source_kind` | What it means | Baseline example today | Required normalized outcome |
| --- | --- | --- | --- |
| `demo_world` | Reference/demo state opened for onboarding or exploration | demo preset loaded in `/mvp` | durable ingest record still names the source and preserves demo/reference truth |
| `upload_still` | User-uploaded still that starts preview or asset generation | `POST /api/mvp/upload` | ingest record preserves upload provenance and lane truth |
| `provider_generated_still` | Provider-generated still normalized into the upload tray | provider-backed still generation | ingest record preserves provider, model, prompt, and generation job provenance |
| `capture_session` | Multi-view capture intake for reconstruction | capture session plus reconstruction path | ingest record preserves capture contract, frame evidence, and reconstruction truth |
| `saved_scene_reopen` | Existing durable scene reopened through the workspace path | `/scene/*` persistence and version reopen | ingest record preserves prior provenance and current scene identity |
| `external_world_package` | Imported package from Gauset round-trip or another system | not yet implemented on the baseline | package manifest, file inventory, and declared truth must be normalized before open |
| `third_party_world_model_output` | Imported raw output from a third-party world-model tool | not yet implemented on the baseline | producer metadata, artifact inventory, and conversion requirements must be normalized before open |

No new source may bypass this source taxonomy.

## Canonical Normalized Result

Every successful intake resolves into one `WorldIngestRecord`.

Required top-level fields:

| Field | Purpose |
| --- | --- |
| `contract_version` | versioned shared contract identifier |
| `ingest_id` | durable ingest operation id |
| `status` | `accepted`, `normalized`, or `blocked` |
| `scene_id` | MVP-owned durable scene identity opened by the ingest |
| `source_kind` | one of the source kinds above |
| `source_label` | human-readable label for the source in UI and audit trails |
| `provenance` | who submitted the world, who produced it, and which external ids/hashes back it |
| `artifacts[]` | explicit inventory of files or URLs normalized from the source |
| `truth` | lane truth, truth label, production-readiness posture, and blockers |
| `scene_document` | canonical scene-document reference or seed, plus compatibility status |
| `review_seed` | metadata, approval seed, and initial issues for review/share flows |
| `workspace_resume` | how the workspace reopens the ingested world through the normal scene path |
| `downstream_targets[]` | named target profiles and whether handoff is ready or blocked |

### `status`

- `accepted`: source parsed and intake started, but normalization is incomplete
- `normalized`: source is durable and may reopen through the normal workspace path
- `blocked`: the source is durable enough to audit, but it must not present as ready to open or hand off without resolving blockers

### `truth`

`truth` is mandatory and must contain:

- `lane`: `preview`, `reconstruction`, or `asset`
- `truth_label`: short product-facing label
- `lane_truth`: plain-language honesty string explaining what the output is
- `production_readiness`: `preview_only`, `review_required`, `handoff_ready`, or `blocked`
- `handoff_status`: `blocked` or `ready`
- `blockers[]`: reasons the world cannot yet claim stronger readiness
- `promotion_requirements[]`: explicit next gates, not implied hope

Rules:

- `lane = preview` may never set `production_readiness = handoff_ready`.
- Imported third-party output must remain explicitly imported until Gauset recomputes or confirms any metrics it wants to claim.
- Missing cameras, transforms, or review state must appear in `blockers[]`, not disappear into defaults.

### `scene_document`

The scene document is the canonical durable scene source for ingest, review, export, and handoff.

Required fields:

- `schema`
- `status`: `missing`, `seeded`, or `ready`
- `path` or `document_id`
- `canonical_source`: must remain `scene_document`
- `legacy_scene_graph_path` only when a compatibility bridge still exists

During migration, runtime lanes may still emit a compatibility `scene_graph`, but they must treat it as derived compatibility data rather than peer truth.

### `artifacts[]`

Each artifact record must declare:

- `artifact_id`
- `artifact_kind`
- `path` and/or `url`
- `media_type`
- `source_path` when imported from an external package
- `status`
- `required_for_workspace`
- `required_for_handoff`

Shared `artifact_kind` values introduced by this contract:

- `scene_document`
- `scene_document_snapshot`
- `package_manifest`
- `environment_splats`
- `environment_mesh`
- `camera_poses`
- `camera_views`
- `environment_metadata`
- `preview_projection`
- `holdout_report`
- `capture_scorecard`
- `review_report`
- `director_path`

## External Source Requirements

### `external_world_package`

An external world package request must include:

- a stable package id
- package format and entry manifest
- producer system, kind, and version
- declared file inventory with hashes or equivalent integrity evidence
- declared lane truth from the producer
- explicit note on whether a scene-document snapshot is included

If the package includes a scene-document snapshot, runtime lanes should seed the canonical Gauset scene document from it instead of inventing a parallel import shape.

### `third_party_world_model_output`

A third-party world-model output request must include:

- producer system, model, and version
- external run or export id when available
- artifact inventory with explicit `artifact_kind`
- coordinate, unit-scale, and color-encoding assumptions when they matter
- capture evidence when available
- clear declaration of whether the output is preview-like, reconstruction-like, or object-only

If the import lacks enough information for a faithful open or handoff, the record must be `blocked` or `review_required` with explicit blockers.

## Review And Reopen Requirements

Every normalized ingest must be able to enter the normal scene lifecycle:

1. reopen through one normal workspace path
2. seed review metadata and approval state
3. attach later save/version/share state to the same `scene_id`
4. derive inline review/export payloads from the canonical scene document
5. expose downstream handoff readiness without reinterpreting lane truth

## Shared Honesty Rules

- Demo/reference worlds remain explicitly demo/reference even after save or review.
- Provider-generated stills stay provider-attributed after they become preview input.
- Imported third-party reconstructions stay tagged as imported until Gauset validates them.
- No import may silently promote itself from reviewable to handoff-ready.
- No handoff target may be considered without a named target profile in `downstream_targets[]`.

## Example Payloads

- `contracts/schemas/world-ingest.external-world-package.request.json`
- `contracts/schemas/world-ingest.third-party-world-model-output.request.json`
- `contracts/schemas/world-ingest.record.response.json`
- `contracts/schemas/review-package.inline.scene-document-first.json`
