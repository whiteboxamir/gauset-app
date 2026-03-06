# gauset-app

Standalone application repository for the Gauset product app (editor + local backend), split from the `gauset.com` landing site.

## What this repo contains

- Next.js app (App Router) with product routes, including:
  - `/mvp` 3-panel editor
  - `/pro` viewfinder workflow
- Local FastAPI backend in `backend/`
- Local setup script: `setup.sh`

## Local run

### Frontend

```bash
npm install --legacy-peer-deps
npm run dev -- --hostname 127.0.0.1 --port 3000
```

### Backend

```bash
./setup.sh
source backend_venv/bin/activate
python3 backend/server.py
```

Backend docs: `http://127.0.0.1:8000/docs`

## Notes

- This repo is app-focused and intentionally separate from the marketing/landing site.
- Current model wrappers are scaffolded and can be replaced with full ML-Sharp / TripoSR inference.
