# gauset-app

Standalone application repository for the Gauset product app (editor + local backend), split from the `gauset.com` landing site.

## Deployment boundary

- This repo is only for the `gauset-app` Vercel project.
- This repo must never be used to deploy `gauset.com`, `www.gauset.com`, `gnosika.com`, or `www.gnosika.com`.
- The production `.com` site lives in `/Users/amirboz/gauset` and GitHub repo `whiteboxamir/gauset-com`.
- Run `npm run verify:boundary` before any release work if there is any doubt about the active repo or Vercel link.

## What this repo contains

- Next.js app (App Router) with product routes, including:
  - `/mvp` 3-panel editor
  - `/pro` viewfinder workflow
- Local FastAPI backend in `backend/`
- Local setup script: `setup.sh`

## Local run

### Full local stack

```bash
npm install --legacy-peer-deps
npm run dev
```

`npm run dev` starts the local backend plus the MVP frontend and prints the exact workspace URL, which defaults to `http://127.0.0.1:3015/mvp`.

### Frontend only

```bash
npm run dev:web
```

Use `npm run dev:web` only when you intentionally want the standalone Next.js frontend on port `3001`.

### Backend only

```bash
./setup.sh
source backend_venv/bin/activate
python3 backend/server.py
```

Backend docs: `http://127.0.0.1:8000/docs`

## Notes

- This repo is app-focused and intentionally separate from the marketing/landing site.
- Current model wrappers are scaffolded and can be replaced with full ML-Sharp / TripoSR inference.

## Platform activation

- Readiness diagnostics: `npm run diagnose:platform-readiness`
- Staging activation runbook: `docs/platform-staging-activation-runbook.md`
