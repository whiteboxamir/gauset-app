# Local Development

## Goal

Bring up the local Next.js frontend and the local FastAPI backend without changing product code.

## Assumptions

- Work from `/Users/amirboz/gauset-app`.
- `npm run dev` is pinned to frontend port `3001` in this repo.
- Use backend port `8000`; the frontend proxy falls back to that port in development.
- `./setup.sh` needs network access because it installs Python packages and clones model repos.

## Start The Backend

1. Bootstrap the Python environment:

```bash
./setup.sh
```

2. Activate the virtualenv:

```bash
source backend_venv/bin/activate
```

3. Start FastAPI:

```bash
python backend/server.py
```

4. Verify direct backend health:

```bash
curl -sS http://127.0.0.1:8000/health
curl -sS http://127.0.0.1:8000/setup/status
```

Expected:

- `/health` returns `{"status":"ok"}`.
- `/setup/status` returns `status: ok` and reports which lanes are available.
- Docs load at `http://127.0.0.1:8000/docs`.

## Start The Frontend

1. Install Node dependencies:

```bash
npm install --legacy-peer-deps
```

2. Start Next.js:

```bash
npm run dev
```

3. Verify the frontend shell:

```bash
curl -I http://127.0.0.1:3001/mvp
```

4. Verify the frontend proxy to the backend:

```bash
curl -sS http://127.0.0.1:3001/api/mvp/health
curl -sS http://127.0.0.1:3001/api/mvp/setup/status
```

Expected:

- `/mvp` returns `200`.
- `/api/mvp/health` returns the backend health payload.
- `/api/mvp/setup/status` matches the direct backend view of available lanes.

## Operator Notes

- In development, Next writes its build output to `.next-local/`.
- The backend writes runtime artifacts under `uploads/`, `assets/`, `scenes/`, `captures/`, and `reconstruction_cache/`.
- If port `3001` is busy, stop the stale Next process first instead of starting a second copy of this repo on another port.

## Stop

1. Stop the Next.js process.
2. Stop the FastAPI process.
3. Deactivate the virtualenv if you no longer need it:

```bash
deactivate
```
