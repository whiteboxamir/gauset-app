# Core Product Truth Validation Gates

Date: March 16, 2026

This document turns the five product truths into contract-level pass/fail gates for restarted runtime lanes. The freeze baseline does not claim these gates are already implemented in runtime code; this lane defines the target contract surface they must satisfy.

## Gate 1: Multi-Source Ingest

Pass when:

- every new world source emits one normalized `WorldIngestRecord`
- `source_kind`, `provenance`, `truth`, and `artifacts[]` are explicit
- external packages and third-party outputs preserve producer metadata instead of flattening it away

Fail when:

- a source opens directly in UI state without a durable ingest record
- provider, capture, external-package, or third-party provenance is lost

Reference:

- `contracts/world-ingest.md`

## Gate 2: Scene Document Canonical

Pass when:

- ingest, review/share, and downstream handoff payloads all name the canonical `scene_document`
- any compatibility `legacy_scene_graph` is clearly labeled as derived compatibility data

Fail when:

- review or handoff payloads only carry ad hoc scene state
- runtime lanes reopen shared semantics by inventing a second durable source

Reference:

- `contracts/world-ingest.md`
- `contracts/schemas/review-package.inline.scene-document-first.json`

## Gate 3: Review, Version, And Share Stay First-Class

Pass when:

- every normalized ingest includes `review_seed`
- the world can reopen through one normal workspace path and one review path
- review exports preserve truth labels and blocker state

Fail when:

- a world can be created/imported but not enter normal review/share flows
- exported packages drop lane truth or approval status

Reference:

- `contracts/world-ingest.md`
- `contracts/schemas/review-package.inline.scene-document-first.json`

## Gate 4: Named Downstream Handoff

Pass when:

- every downstream package emits a named `DownstreamHandoffManifest`
- `target.system`, `target.profile`, and `target.profile_version` are explicit
- required artifacts are inventoried instead of assumed

Fail when:

- "exported JSON" is treated as a sufficient downstream contract
- Unreal or any later target is implied but unnamed

Reference:

- `contracts/downstream-handoff.md`

## Gate 5: Product Honesty

Pass when:

- preview, reconstruction, and production-readiness truth are all explicit
- preview lanes remain blocked from downstream-ready language
- blockers remain visible until resolved

Fail when:

- preview packages claim handoff-ready posture
- imported third-party output is presented as Gauset-validated without evidence
- delivery blockers are hidden behind optimistic wording

Reference:

- `contracts/world-ingest.md`
- `contracts/downstream-handoff.md`

## Runtime Implication

The next runtime lanes do not need to rediscover shared semantics. They should implement:

1. `WorldIngestRecord` normalization
2. `review_package.inline.scene_document_first.v1`
3. `DownstreamHandoffManifest` with the Unreal profile defined here
