# Core Product Truth Validation Gates

Date: March 17, 2026

Status: Shared contract gate for the Phase 2 closeout -> Phase 3 renderer prep handoff.

These gates define the contract artifacts and validation checks that must hold before Phase 3 renderer implementation starts, while implementation completes in parallel lanes.

## Gate A: Multi-source world ingest

- Source kinds must be named, not implied.
- Provenance must survive ingest.
- External world packages and third-party world-model outputs must normalize into the same accepted ingest record shape.
- Validation:
  - `/Users/amirboz/gauset-app/contracts/world-ingest.md`
  - `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.external-world-package.request.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.third-party-world-model-output.request.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.record.response.json`
  - `npm run test:platform-contracts`

## Gate B: Scene-document-first behavior

- `SceneDocumentV2` must be the canonical durable payload.
- Compatibility `scene_graph` payloads must be derived from the scene document.
- Review/share and downstream-handoff artifacts must carry the scene document first.
- Validation:
  - `/Users/amirboz/gauset-app/contracts/world-ingest.md`
  - `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.record.response.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/review-package.inline.scene-document-first.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
  - `npm run test:platform-contracts`

## Gate C: Review, version, and share truth preservation

- Durable world flows must remain version-aware.
- Review payloads must preserve scene identity and approval truth.
- Share/export payloads must preserve the same scene-document-first snapshot.
- Validation:
  - `/Users/amirboz/gauset-app/contracts/schemas/review-package.inline.scene-document-first.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/scene-version.response.confirmed.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/scene-review.response.confirmed.json`
  - `npm run test:platform-contracts`
  - `npm run test:platform-scenarios`

## Gate D: Explicit downstream handoff completeness

- Every downstream package must name its target.
- Unreal handoff must use an explicit manifest profile.
- Delivery status, required files, and completeness checks must be explicit.
- Validation:
  - `/Users/amirboz/gauset-app/contracts/downstream-handoff.md`
  - `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
  - `npm run test:platform-contracts`
  - `npm run test:platform-scenarios`

## Gate E: Preview vs reconstruction vs production-readiness truth

- Preview must not imply faithful reconstruction.
- Reconstruction must not imply production-ready delivery by itself.
- Blockers must remain visible in ingest, review/share, and handoff artifacts.
- Validation:
  - `/Users/amirboz/gauset-app/contracts/schemas/world-ingest.record.response.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json`
  - `/Users/amirboz/gauset-app/contracts/schemas/downstream-handoff.unreal.ready.manifest.json`
  - `npm run test:platform-contracts`
  - `npm run test:platform-scenarios`

## Route smoke coverage

`npm run test:platform-routes` remains part of the lane because project and review-share route surfaces must stay present while the new shared contracts land. It is a route regression check, not the primary shape validator for ingest or downstream manifests.
