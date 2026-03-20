# Downstream Handoff Contract

Snapshot date: 2026-03-16.

## Status

This is the named shared contract for explicit downstream handoff.

It does not claim that the current runtime already exports a first-class Unreal package. Today's generic review/export JSON is still a review/share artifact. Future editor and backend lanes should implement named delivery targets against this contract rather than extending generic export JSON informally.

## Contract name

- `downstream-handoff/v1`

## Scope

Every downstream package must name its target system and must derive from the canonical scene document.

Required handoff outcomes:

1. The target system is explicit.
2. The package is version-anchored.
3. Review truth is preserved.
4. Lane truth is preserved.
5. Delivery readiness is explicit.

## Target profiles

| `target.system` | `target.profile` | Meaning |
| --- | --- | --- |
| `unreal_engine` | `unreal_scene_package/v1` | Named Unreal handoff package for level/blockout import and review |
| `generic_downstream` | `generic_scene_package/v1` | Explicit but non-engine-specific handoff package |

## Manifest requirements

Required top-level fields:

- `contract`
- `manifest_id`
- `target`
- `source`
- `scene_document`
- `compatibility_scene_graph`
- `review`
- `truth`
- `payload`
- `delivery`

Required `target` fields:

- `system`
- `profile`
- `label`

Required `source` fields:

- `ingest_contract`
- `ingest_record_id`
- `project_id`
- `scene_id`
- `version_id`

Required `review` fields:

- `approval_state`
- `version_locked`
- `share_ready`
- `share_mode`

Required `truth` fields:

- `source_kind`
- `lane`
- `truth_label`
- `lane_truth`
- `production_readiness`
- `blockers`

Required `delivery` fields:

- `status`
- `checked_at`
- `checked_by`
- `requirements`

## Unreal profile requirements

`target.system = "unreal_engine"` additionally requires:

- `engine_version`
- `coordinate_system`
- `unit_scale`

Current shared values:

- `coordinate_system = "left_handed_z_up"`
- `unit_scale = "centimeter"`

## Handoff invariants

1. No unnamed export counts as downstream handoff.
   Generic JSON export is not enough.

2. No handoff bypasses `SceneDocumentV2`.
   The manifest must carry the canonical scene document and any compatibility graph must be derived from it.

3. No handoff bypasses review and version lock.
   The manifest must state review approval and whether the scene is version-locked.

4. No handoff hides blockers.
   If the source is preview-only, not approved, or not version-locked, the manifest must stay blocked.

5. No handoff blurs production readiness.
   `production_readiness` and `delivery.status` must stay explicit even when the package is structurally complete.

## Example fixtures

- Ready Unreal manifest: `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
- Preview-blocked Unreal manifest: `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json`
- Scene-document-first review package feeding review/share flows: `/Users/amirboz/gauset-app/contracts/schemas/review-package.inline.scene-document-first.json`
