# World Ingest Contract

Snapshot date: 2026-03-16.

## Status

This is the named shared contract for multi-source world ingest.

It does not claim that the current runtime already exposes one unified ingest endpoint. Today's upload, generate, linked reopen, demo-world, and capture flows still exist as separate paths. Future editor, backend, and platform lanes should normalize those paths to this contract instead of inventing new ad hoc payloads.

## Contract name

- `world-ingest/v1`

## Scope

Every world source that becomes durable editor state must normalize into one canonical ingest record before save, review, share, or downstream handoff.

Canonical ingest output requirements:

1. `SceneDocumentV2` is the durable editor-side source of truth.
2. Any compatibility `scene_graph` envelope is derived from that scene document.
3. Provenance stays explicit.
4. Review, version, and share readiness stay explicit.
5. Preview vs reconstruction vs downstream-ready truth stays explicit.

## Supported source kinds

The contract covers both current and future world sources.

| `source.kind` | Meaning | Current repo reality |
| --- | --- | --- |
| `upload` | Single uploaded still entering preview or asset flow | Implemented today |
| `provider_generated_still` | Provider-generated still handed into preview flow | Implemented behind provider-image generation support |
| `capture_session` | Multi-image capture set intended for reconstruction | Implemented locally; public reconstruction still intentionally unavailable |
| `demo_world` | Safe demo or canned starter world | Implemented today |
| `linked_scene_version` | Reopen from an existing durable scene/version | Implemented today |
| `external_world_package` | External package already carrying a world bundle | Contracted here; not yet one runtime path |
| `third_party_world_model_output` | Third-party world-model output that must be normalized on ingest | Contracted here; not yet one runtime path |

## Request envelope

Required top-level fields:

- `contract`
- `request_id`
- `source`
- `package`
- `binding`

Required `source` fields:

- `kind`
- `label`
- `vendor`
- `captured_at`
- `source_uri`

Required `package` fields:

- `media_type`
- `checksum_sha256`
- `entrypoints`
- `files`

Required `binding` fields:

- `project_id`
- `scene_id`

Binding truth:

- `project_id` remains platform-owned.
- `scene_id` remains MVP-owned.
- Ingest may begin with `scene_id: null`, but the accepted ingest record must resolve to the durable scene identity used for reopen, review, and handoff.

## Accepted ingest record

Required top-level fields:

- `contract`
- `ingest_id`
- `status`
- `source`
- `scene_document`
- `compatibility_scene_graph`
- `workspace_binding`
- `versioning`
- `workflow`
- `truth`

Required accepted-record guarantees:

1. `scene_document.version` is `2`.
2. `compatibility_scene_graph.__scene_document_v2` is present and derived from the canonical scene document.
3. `workflow.workspace_path` and `workflow.review_path` exist.
4. `workflow.save_ready`, `workflow.review_ready`, and `workflow.share_ready` are explicit booleans.
5. `truth` names:
   - `lane`
   - `truth_label`
   - `lane_truth`
   - `production_readiness`
   - `blockers`

## Ingest invariants

1. No source bypasses provenance.
   The ingest record must preserve vendor, format, and artifact origin details.

2. No durable world bypasses `SceneDocumentV2`.
   External packages and third-party outputs may arrive in arbitrary formats, but the durable result must be a scene document first.

3. No ingest path bypasses review/version/share.
   The accepted record must say how the world reopens, versions, and enters review/share flows.

4. No ingest path blurs lane truth.
   Imported preview output remains preview. Imported reconstruction remains imported reconstruction. Neither implies downstream readiness on its own.

5. No ingest path redefines ownership.
   `project_id` and `scene_id` semantics remain unchanged.

## Example fixtures

- External package request: `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.external-world-package.request.json`
- Third-party model output request: `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.third-party-world-model-output.request.json`
- Accepted ingest record: `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.record.response.json`
