# Downstream Handoff Contract

Snapshot date: 2026-03-16.

This contract defines the explicit manifest required for Unreal and later downstream targets. The current baseline can export a generic JSON scene package for review, but that package is not a sufficient downstream handoff contract by itself.

## Non-Negotiable Invariants

- Every handoff names a target system and profile. "Export JSON" is not a product contract.
- Every handoff is derived from the canonical scene document, not ad hoc UI state.
- Every handoff carries review state, lane truth, readiness, and blockers.
- Every handoff inventories the artifacts it expects the downstream consumer to use.
- Preview-only worlds may produce a blocked manifest for review visibility, but they may not claim ready downstream handoff.

## Manifest Families

The shared envelope is `DownstreamHandoffManifest`.

Supported states:

- `ready`: target-specific handoff package is complete enough for downstream validation or import
- `blocked`: package is exportable for review or audit, but it must not present as downstream-ready

Required top-level fields:

| Field | Purpose |
| --- | --- |
| `contract_version` | versioned contract id |
| `handoff_id` | durable handoff package id |
| `status` | `ready` or `blocked` |
| `created_at` | manifest creation time |
| `target` | target system, profile, and adapter assumptions |
| `source_scene` | source `scene_id`, `version_id`, and ingest linkage |
| `truth` | lane truth, readiness, blockers, and promotion posture |
| `delivery_profile` | human-readable readiness summary and delivery notes |
| `review` | approval state plus open-issue count |
| `artifacts[]` | explicit artifact inventory for the downstream consumer |
| `adapter_hints` | optional import hints for the target adapter |

## `target`

`target` must include:

- `system`
- `profile`
- `profile_version`

Optional target-specific fields may include engine version, coordinate assumptions, or import mode defaults.

No downstream lane may mint a new target profile in runtime code without first updating this contract.

## `truth`

Every handoff manifest must carry:

- `lane`
- `truth_label`
- `lane_truth`
- `production_readiness`
- `handoff_status`
- `blockers[]`

Rules:

- `status = ready` requires `handoff_status = ready`.
- `production_readiness = handoff_ready` requires an empty `blockers[]`.
- `lane = preview` must stay `blocked`, even if review assets are useful downstream.

## `artifacts[]`

Each artifact record must declare:

- `artifact_id`
- `kind`
- `path`
- `required`
- `consumed_by[]`

Optional but recommended:

- `source_artifact_id`
- `notes`
- `transform` when target-specific conversion assumptions matter

Ready manifests must include every artifact the target profile marks as required. Blocked manifests may still inventory optional or reference-only artifacts, but they must keep the missing required items explicit.

## Unreal Profile

This lane defines the first explicit downstream target profile:

- `system`: `unreal_engine`
- `profile`: `unreal_scene_handoff`
- `profile_version`: `v1`

Default adapter assumptions for this profile:

- `unit_scale`: `centimeters`
- `up_axis`: `Z`
- `handedness`: `left`

### Required for `ready`

A ready Unreal handoff manifest must include:

- a canonical `scene_document`
- one Unreal-consumable environment artifact such as `environment_mesh`
- `camera_views`
- `director_path`
- `review_report`

Optional but valuable:

- original `environment_splats`
- `environment_metadata`
- `holdout_report`
- `capture_scorecard`

If the package only has preview splats or reference imagery and no Unreal-consumable environment payload, it must remain `blocked`.

## Relationship To Review Package

Inline review/export payloads and downstream handoff manifests are related but not interchangeable:

- `review_package.inline.scene_document_first.v1` is the portable review/share envelope
- `DownstreamHandoffManifest` is the named-target delivery envelope

A downstream handoff may embed or reference the review package, but it must still carry its own explicit target and readiness state.

## Shared Honesty Rules

- Review approval alone does not make a package downstream-ready.
- Reconstruction-like language is not enough; the manifest must name the target profile it is ready for.
- A preview package may be useful for blocking review, but not for "ready for Unreal" language.
- Missing coordinate, scale, or camera assumptions belong in `blockers[]`.

## Example Payloads

- `contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
- `contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json`
- `contracts/schemas/review-package.inline.scene-document-first.json`
