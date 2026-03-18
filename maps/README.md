# Gauset App System Map

This folder is a working map of the current app so future changes can be split into low-conflict threads.

## Scope

The live product center is the `/mvp` editor and its review flow. The app also contains a separate `/pro` prototype surface, small auth/waitlist flows, and a set of dormant experience components that are not wired into active routes.

Two backend implementations serve the same MVP contract:

- `backend/` is the local FastAPI backend used in development and local reconstruction.
- `vercel-backend/` is the deployed Python backend used behind the production Next app.

Both are reached from the frontend through the same Next catch-all proxy: `src/app/api/mvp/[...path]/route.ts`.

## Documents

- [request-flow.md](./request-flow.md): end-to-end request paths from UI to proxy to backend to storage outputs.
- [file-ownership.md](./file-ownership.md): directory ownership matrix, hot paths, and safe isolation zones.
- [component-map.md](./component-map.md): route-level and component-level map of the current app shell.
- [shot-orchestration.md](./shot-orchestration.md): minimal spec for compiling world state into provider-agnostic shot generation inputs.

## Shared Hot Paths

These are the files or contracts most likely to create thread collisions:

- `src/app/api/mvp/[...path]/route.ts`: the only frontend-to-backend bridge for MVP.
- `src/lib/mvp-api.ts`, `src/lib/mvp-product.ts`, `src/lib/mvp-review.ts`: shared contract and URL helpers used across MVP editor and review.
- `src/app/mvp/page.tsx`, `src/components/Editor/*`: the active MVP UI shell.
- `backend/api/routes.py` and `vercel-backend/app.py`: duplicated backend contract surfaces that must stay aligned.
- `/storage/...`, `/scene/...`, `/jobs/...`, `/capture/...` path shapes: stable URL contract used by the UI, tests, and smoke scripts.

## Lowest-Conflict Thread Split

If work must be split now, the cleanest thread boundaries are:

- MVP frontend behavior: `src/app/mvp`, `src/components/Editor`, `src/lib/mvp-*`
- Local backend and reconstruction: `backend/server.py`, `backend/api`, `backend/models`
- Vercel backend and deployed storage: `vercel-backend`
- Pro workspace prototype: `src/app/pro`, `src/components/Viewfinder`, `src/app/api/generate`, `src/app/api/agent`, `src/app/api/interrogate`
- Auth/waitlist: `src/app/login`, `src/app/dashboard`, `src/app/api/waitlist`, `src/app/api/auth/logout`, `src/app/actions.ts`, `src/lib/db.ts`, `src/lib/supabase.ts`
- Tests, scripts, docs: `tests`, `scripts`, `docs`, `maps`

## Do Not Split Casually

Avoid parallel edits across these pairs unless one side is only updating tests or docs:

- `src/components/Editor/*` and either backend implementation
- `backend/api/routes.py` and `vercel-backend/app.py`
- `src/lib/mvp-product.ts` and any code consuming setup/review/capture payloads
- repo-wide config files such as `package.json`, `next.config.mjs`, and `setup.sh`

## Current Reality Check

Important for planning:

- `/` redirects to `/mvp`, so MVP is the default entrypoint.
- `/mvp` is the only route that uses the Python backend.
- `/pro` is a separate prototype flow and does not use `/api/mvp`.
- `src/components/experience/*` and `src/components/layout/*` are currently unwired from active routes based on repo imports.
- Local and deployed backends intentionally diverge in capability: local supports reconstruction; deployed Vercel currently supports preview and asset generation only.
