# Phase 2 + Platform Execution Board

Updated: 2026-03-16

## Objective

Stabilize the current MVP/editor surface, activate the platform stack in staging, and connect billing/auth to Phase 2 only through explicit entitlement and ownership boundaries.

## Current State

- Done: the local MVP backend now exposes `/providers`, `/generate/image`, and `/reconstruct/session/:id`, matching the internal editor controllers instead of leaving those routes missing in local development.
- Done: provider-generated stills now materialize into the same upload store contract as imported stills in the local backend.
- Done: reconstruction kickoff in the local backend is now truthfully available as a route but still truthfully unavailable as a worker-backed lane, returning the same `501` contract used by the public backend.
- Done: wave 9 asset duplicate/delete certification is now scoped to the actual scene-graph controls instead of ambiguous `title="Delete"` selectors.
- Done: scene-graph asset rows now expose stable test hooks for duplicate/delete verification.
- Done: `scripts/dev-all.mjs` now reuses a healthy existing frontend and fails loudly when the requested frontend port is occupied by a stale or non-Gauset process.
- Done: local MVP live certification is now packaged as `npm run certify:mvp:local-stack`, and it captures stack health, deployment fingerprint, full smoke, viewer diagnostics, and the hostile local reconstruction audit in one run.
- Done: SSR-visible scene migration and workspace normalization now use deterministic fallback identities for viewer-camera, migrated assets, views, pins, and review issues instead of random ids.
- Done: `scripts/mvp_viewer_diag.mjs` now fails when React reports a hydration mismatch, making viewer-shell determinism part of the live certification gate.
- Done: `/pro` is now explicitly labeled as an experimental mock surface in both UI and API contract instead of implying a live video provider.
- Verified: targeted Playwright wave 9 passes against the fresh `3003` dev surface.
- Verified: `npm run typecheck` passes after the scene-graph and dev-stack changes.
- Verified: `npm run certify:mvp:local-stack` now passes with `hydrationMismatchDetected: false` in the viewer diagnostic packet.
- Verified: the platform Playwright suite exists in repo under `tests/platform` with a dedicated config in `playwright.platform.config.ts`.
- Verified: 2026-03-16 viewer-only reruns now have fresh truth packets in `/Users/amirboz/gauset-app/artifacts/local-viewer`, `/Users/amirboz/gauset-app/artifacts/viewer-benchmark-5m`, and `/Users/amirboz/gauset-app/artifacts/viewer-webgl2-probe`. Current matrix: default host preview certifies as interactive fallback, Chrome headless preview certifies as WebGL2 live, and the Chrome 5M lane still fails because the viewer loses WebGL context under load. See `/Users/amirboz/gauset-app/docs/viewer-certification-truth-2026-03-16.md`.
- Open: the combined `npm run certify:mvp:local-stack` packet is currently not green in this workspace. The 2026-03-16 rerun failed its smoke and loaded-scene viewer steps, so that combined packet must not be treated as current viewer proof. See `/Users/amirboz/gauset-app/artifacts/mvp-local-stack/viewer-cert-host-2026-03-16/certification-summary.json`.
- Open: platform auth and billing are still structurally present but not operational in this workspace because Supabase and Stripe env/config are missing.
- Open: platform browser E2E is present in code but cannot be honestly claimed as staging-certified until auth, billing, storage state, and staging env are activated.
- Open: public deployment parity between `gauset.com` and `gauset-app.vercel.app` is still unresolved.

## Delivery Rule

Keep the codepaths separate until both lanes are independently green.

- Platform owns auth, billing, studio membership, invitations, notifications, sessions, and project/world linkage.
- Phase 2 owns the editor shell, scene graph, persistence model, viewer, and reconstruction/preview/asset lane behavior.
- Allowed integration points: entitlement checks, active studio context, `project_world_links`, ownership validation, and MVP proxy access.

## Stream A: Runtime Stability

Target window: 2026-03-13 to 2026-03-14

- Land the scene-graph selector hardening and dev-stack frontend guard.
- Add one local-stack diagnostic command that checks backend health, proxy health, and `/mvp` truth together.
- Re-run the local MVP certification wave after the runtime changes on the clean local surface.
- Close any remaining stale-shell or misleading-local-health gaps before more feature work.

Current command:

- `npm run diagnose:mvp-local-stack`
- `npm run certify:mvp:local-stack`
- `node scripts/mvp_viewer_diag.mjs http://localhost:3021/mvp`

Exit gate:

- `GAUSET_MVP_BASE_URL=http://localhost:3003 npx playwright test tests/mvp.local.spec.js -g "wave9 asset duplicate and delete controls"`
- `npm run typecheck`
- `npm run certify:mvp:local-stack`
- viewer diagnostic packet records `hydrationMismatchDetected: false`
- `npm run dev:all` reuses a healthy frontend and rejects an unhealthy occupied frontend port with a clear error

## Stream B: Platform Activation

Target window: 2026-03-14 to 2026-03-17

- Provision staging Supabase and Stripe test environments.
- Apply the full migration chain under `supabase/migrations`.
- Seed one owner studio, one admin, one member, one finance user, one invitation, one billing customer, and one linked project/world pair.
- Populate staging env vars for Supabase auth, service role access, Stripe secret, Stripe webhook secret, and canonical site URL.
- Add one readiness check covering auth config, DB reachability, Stripe config, and session persistence.

Exit gate:

- `/api/auth/login` sends a real staging magic link
- `/api/auth/session` returns a real session
- `/api/billing/summary` returns staged billing data
- Stripe webhook delivery mutates local billing state in staging

## Stream C: Platform Certification

Target window: 2026-03-17 to 2026-03-19

- Add browser E2E coverage for login, invite acceptance, active studio switching, session revocation, billing summary, checkout, billing portal launch, and route protection.
- Add fixture reset scripts so staging E2Es are deterministic.
- Promote the existing platform contracts, scenarios, and route smoke checks into the same certification lane as the browser flows.

Exit gate:

- `npm run test:platform-contracts`
- `npm run test:platform-scenarios`
- `npm run test:platform-routes`
- new platform browser E2E suite green in staging

## Stream D: Controlled Platform-to-Phase-2 Connection

Target window: 2026-03-19 to 2026-03-21

- Enable `GAUSET_ENABLE_PLATFORM_MVP_GATE=1` in staging only.
- Verify entitlement enforcement in `src/server/mvp/access.ts`.
- Verify scene ownership and project/world linking in `src/server/projects/ownership.ts`.
- Certify authenticated save, reload, restore-version, and review-share flows with an entitled user.
- Certify the negative path where a signed-in but non-entitled user is redirected to billing instead of entering `/mvp`.

Exit gate:

- entitled signed-in user can use `/mvp`
- non-entitled signed-in user is blocked or redirected correctly
- scene save creates or binds the correct `project_world_links`
- review/version flows remain green under authenticated sessions

## Stream E: Phase 2 Continuation

Run in parallel with Streams B through D.

- Re-run the skipped WebGL2-dependent certification wave on a machine that exposes WebGL2 in headless Chromium.
- Continue reconstruction-track work separately from billing/auth changes.
- Preserve the current scene-document, workspace-store, and render-boundary split while continuing Track 7 work from `PHASE_2_ROADMAP.md`.

Exit gate:

- local viewer certification green on WebGL2-capable infrastructure
- reconstruction lane remains truthfully offline or truthfully available, never ambiguous
- no platform concerns leak into scene-graph or viewer state management

## Stream F: Public Deployment Parity

Target window: after staging certification is green

- Make `gauset.com` the canonical hardened surface until parity is complete.
- Bring `gauset-app.vercel.app` to parity or explicitly demote it to internal-use-only status.
- Align public truth surfaces for setup status, deployment fingerprinting, and lane availability reporting.

Exit gate:

- public MVP surfaces agree on deployment/status contracts
- release surface is truthful about storage mode and lane coverage
- no uncertified public surface is implicitly treated as production truth

## Merge Order

1. Runtime stability changes
2. Platform staging activation
3. Platform browser certification
4. Staging-only MVP gate enablement
5. Authenticated Phase 2 integration certification
6. Public deployment parity work

## Stop Conditions

- Do not wire platform entitlements into production MVP flows before staging auth and billing are green.
- Do not treat `gauset-app.vercel.app` as release truth until deployment/status parity is verified.
- Do not mix reconstruction-worker implementation work into auth/billing delivery branches.
