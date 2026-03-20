# Platform Staging Activation Runbook

Updated: 2026-03-13

## Purpose

Use this runbook to activate and verify the platform stack in staging before connecting billing and auth to the Phase 2 MVP gate.

## Required Environment

Auth:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL`

Billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_API_VERSION` (optional but recommended)

Diagnostics:

- `GAUSET_EXPOSE_PLATFORM_READINESS=1` only if you want the readiness route exposed on a deployed staging surface

## Local Diagnostics

Configuration-only check:

```bash
npm run diagnose:platform-readiness
```

Configuration plus external connectivity probes:

```bash
npm run diagnose:platform-readiness -- --connectivity --require-ready
```

The script exits non-zero on `blocked`, and with `--require-ready` it also fails on `partial`.

## Certification Interpretation

`npm run certify:platform-rollout` now separates:

- deployed proof that actually ran in the current packet
- current-machine blocks caused by missing local env, secrets, or storage state
- historical-only artifacts from older passing runs

Treat missing local inputs as operator setup blockers, not product regressions, unless a lane actually executes and fails.

Current live-cert inputs by lane:

- authenticated browser and authenticated API:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL`
  - `GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD` or `GAUSET_PLATFORM_E2E_STORAGE_STATE`
- live Stripe webhook delivery:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
- live schema audit:
  - `SUPABASE_MANAGEMENT_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF` or `NEXT_PUBLIC_SUPABASE_URL`

Current billing-completion cert inputs:

- `npm run certify:platform-billing-completion`
  - local deterministic lanes:
    - no extra live env beyond the repo test lane
  - live webhook + live billing completion:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `STRIPE_SECRET_KEY`
    - deployed `GAUSET_PLATFORM_BASE_URL` or `GAUSET_PLATFORM_E2E_BASE_URL` must be an HTTPS staging host, not localhost
  - live schema audit:
    - `SUPABASE_MANAGEMENT_ACCESS_TOKEN`
    - `SUPABASE_PROJECT_REF` or `NEXT_PUBLIC_SUPABASE_URL`

Important truth rule:

- `readyToCallBillingComplete` is only truthful when local deterministic billing lanes pass and all three live proofs pass:
  - Stripe webhook delivery
  - billing completion flow
  - schema audit
- Missing live env or a localhost-only target must leave the cert `blocked`, never green.

Failure categories used by the live-cert packet:

- `code_regression`
  - local deterministic billing/contracts failed, or the live schema audit found missing tables, columns, indexes, triggers, or seeded plan rows
- `missing_credential_env`
  - the current shell is missing Supabase, Stripe, or fixture inputs required to run a live lane
- `external_service_runtime_issue`
  - the lane executed against staging but the deployed app, Stripe, or Supabase did not complete the proof successfully
- `local_host_limitation`
  - the lane was pointed at localhost, which is not valid proof for staging webhook or rollout certification

## Staging Route

The app now exposes:

- `/api/platform/readiness`

Behavior:

- available automatically in non-production environments
- available in production-like staging only when `GAUSET_EXPOSE_PLATFORM_READINESS=1`
- returns `503` when blocked and `200` otherwise
- accepts `?includeConnectivity=1` to probe Supabase REST table access and Stripe API reachability

Example:

```bash
curl -sS https://staging.example.com/api/platform/readiness?includeConnectivity=1
```

## Activation Sequence

1. Apply all SQL files in `supabase/migrations` to the staging Supabase project.
2. Set the auth and billing env vars in the staging app.
3. Run `npm run diagnose:platform-readiness -- --connectivity --require-ready` locally against the same env file or check the staging readiness route.
4. Confirm `/api/auth/login`, `/api/auth/session`, and `/api/billing/summary` all succeed with real staging credentials.
5. Add and run browser E2Es for login, invite acceptance, active studio switching, billing summary, checkout, billing portal, and session revocation.
6. Only after those pass, enable `GAUSET_ENABLE_PLATFORM_MVP_GATE=1` in staging.

## Important Constraint

Raw `DATABASE_URL` / `PLATFORM_DATABASE_URL` values are not enough in this repo today. The current platform services use Supabase REST, so staging is not operational until the Supabase URL, anon key, and service role key are all present.
