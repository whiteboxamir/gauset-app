# Release Sanity

This runbook is for `/Users/amirboz/gauset-app` and the `gauset-app` Vercel project only. It verifies the gated design-partner surface for this repo. It is not the production release path for `gauset.com`; that site must ship from `/Users/amirboz/gauset`.

## Surface Truth

- `gauset.com` is the canonical public production release path.
- `gauset-app.vercel.app` is the gated design-partner verification surface for this repo until parity is complete.
- `npm run test:platform-release-gates` is the first local gate for touched platform and gated-entry changes in this repo.
- `npm run certify:public` is the gated-entry verification runner for `gauset-app`. It is not a `gauset.com` production release certification command.

## Scope

This runbook checks the deployed gated entry on `gauset-app`: the authenticated `/mvp` shell, the frontend proxy under `/api/mvp/*`, and the deployment fingerprint and health endpoints for that verification surface.

This runbook does not certify platform billing, live Stripe webhook delivery, or Supabase schema freshness. Those proofs must come from the platform rollout and billing-completion certification lanes in `/Users/amirboz/gauset-app`.

## Assumptions

- Default public base URL is `https://gauset-app.vercel.app`.
- Run `npm run verify:boundary` before release work if there is any doubt about the current repo/project link.
- The frontend deployment proxies to a separate backend deployment through `GAUSET_BACKEND_URL` or `NEXT_PUBLIC_GAUSET_API_BASE_URL`.
- `/mvp` and `/mvp/preview` are expected to require authentication and preserve the `next` redirect.
- `/api/mvp/setup/status` is expected to reject anonymous access with `AUTH_REQUIRED`.
- If storage is served from a different origin, set `GAUSET_MVP_STORAGE_BASE_URL` before running the hostile public audit.

## Required Guardrails

Verification from this runbook is allowed only against the `gauset-app` deployment surface, never `gauset.com`.

Before any mutating `gauset-app` verification run, set:

```bash
export GAUSET_MVP_BASE_URL=https://<deployment-host>
export GAUSET_PUBLIC_CERT_RUN_LABEL=<release-slug>
export GAUSET_PUBLIC_WRITE_ACK=I_UNDERSTAND_PUBLIC_WRITES
```

If the deployment host is not the default `gauset-app.vercel.app`, also set:

```bash
export GAUSET_PUBLIC_CERT_ALLOWED_HOSTS=<deployment-host>
```

Rules:

- `GAUSET_MVP_BASE_URL` must not be `gauset.com`, `www.gauset.com`, `gnosika.com`, or a local host.
- `GAUSET_MVP_BASE_URL` must resolve to `gauset-app.vercel.app` unless `GAUSET_PUBLIC_CERT_ALLOWED_HOSTS` explicitly allowlists another public certification host.
- `GAUSET_PUBLIC_CERT_RUN_LABEL` is required and is used to namespace artifacts and review metadata.
- The gated-entry verification entrypoint in this repo is `npm run certify:public`.

## Step 0: Boundary And Target Lock

Run the repo/project boundary check before any `gauset-app` verification work:

```bash
npm run verify:boundary
```

Pass criteria:

- current workspace resolves to `gauset-app`
- linked Vercel project matches `gauset-app`
- chosen public base URL is explicitly locked through the env vars above

Before any rollout or gated-entry verification claim, run the local release-gate bundle:

```bash
npm run test:platform-release-gates
```

That command is the first line of defense for the touched lanes. It exercises the contract checks, scenario checks, route smoke, readiness snapshot, live route smoke, and authenticated API proof when the local env is present.

## Step 1: Gated Entry And Proxy Health

```bash
curl -sSI https://gauset-app.vercel.app/mvp
curl -sSI https://gauset-app.vercel.app/mvp/preview
curl -sS https://gauset-app.vercel.app/api/mvp/deployment
curl -sS https://gauset-app.vercel.app/api/mvp/health
curl -sS https://gauset-app.vercel.app/api/mvp/setup/status
```

Pass criteria:

- `/mvp` returns `200`
- `/mvp` HTML preserves the redirect to `/auth/login?next=%2Fmvp`
- `/mvp/preview` returns `200`
- `/mvp/preview` HTML preserves the redirect to `/auth/login?next=%2Fmvp%2Fpreview`
- `/api/mvp/deployment` returns `200`
- `/api/mvp/health` returns `{"status":"ok"}`
- `/api/mvp/setup/status` returns `401` with `{"code":"AUTH_REQUIRED","redirectTo":"/auth/login?next=%2Fmvp"}`

## Step 2: Validate Gated Capability Expectations

From `/api/mvp/setup/status`, confirm:

- anonymous access is denied with `AUTH_REQUIRED`
- the `redirectTo` target preserves `/mvp`
- the deployed entry is acting like a gated design-partner shell, not a public demo surface

Fail the release if:

- anonymous access is unexpectedly allowed into `/api/mvp/setup/status`
- the login redirect target is missing or wrong
- the proxy returns `BACKEND_UNAVAILABLE` or `BACKEND_PROXY_ERROR` on the public health/deployment endpoints

## Step 3: Read-Only Public Preflight

Run the deterministic preflight first:

```bash
npm run certify:public:preflight
```

Output:

- `artifacts/public-live/<run-label>/preflight.json`

Pass criteria:

- `/mvp` returns `200`, renders the gated workspace shell, and preserves the login redirect to `/auth/login?next=%2Fmvp`
- `/mvp/preview` returns `200`, renders the gated workspace shell, and preserves the login redirect to `/auth/login?next=%2Fmvp%2Fpreview`
- `/api/mvp/deployment` returns a fingerprint with a non-empty `build_label` and real commit sha
- `/api/mvp/health` returns `{"status":"ok"}`
- `/api/mvp/setup/status` returns the expected anonymous-auth failure contract

## Step 4: Public MVP Mutation Lanes

Do not run the old public Playwright or hostile audit suites against `gauset-app` once the platform gate is active.

Those mutation lanes belong to `gauset.com`, which must be certified from `/Users/amirboz/gauset` with:

```bash
node scripts/mvp_release_preflight.mjs
node scripts/mvp_public_canary.mjs
```

## Stop Conditions

- `/mvp` or `/mvp/preview` do not preserve the gated login redirect
- `/api/mvp/setup/status` is anonymously accessible or does not return `AUTH_REQUIRED`
- public proxy errors are present on `/api/mvp/health` or `/api/mvp/deployment`

## Verification Command

Use the gated-entry verification runner:

```bash
npm run certify:public
```

For the platform rollout thread, use:

```bash
npm run certify:platform-rollout
```

Artifacts are written under:

- `artifacts/public-live/<run-label>/`
- `artifacts/public-live/<run-label>/preflight.json`
- `artifacts/public-live/<run-label>/certification-summary.json`
