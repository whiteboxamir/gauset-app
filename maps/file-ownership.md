# File Ownership Matrix

This matrix is tuned for parallel work. "Runtime-critical" means a change can break the current app without touching any other layer.

## Ownership Matrix

| Zone | Purpose | Runtime-Critical | Conflict Risk | Isolation Guidance |
| --- | --- | --- | --- | --- |
| `src/app/mvp`, `src/app/mvp/review` | Active MVP editor and read-only review routes | High | High | Keep one owner at a time unless work is split cleanly between editor shell and review shell |
| `src/components/Editor` | MVP upload, generation, viewer, save, review, comment UI | High | High | Shared hot path; any UI contract change here usually requires backend awareness |
| `src/lib/mvp-api.ts`, `src/lib/mvp-product.ts`, `src/lib/mvp-review.ts` | Shared MVP URL helpers and payload normalization | High | High | Treat as contract files, not as leaf utilities |
| `src/app/api/mvp/[...path]/route.ts` | Sole transport bridge from Next to Python backend | High | Very High | Single-owner zone; path or header changes affect all MVP flows |
| `backend/server.py`, `backend/api`, `backend/models` | Local backend, local storage mounts, model wrappers, local reconstruction | High | High | Separate owner from frontend if possible; coordinate on payload shape only |
| `vercel-backend` | Deployed Python backend, storage backend abstraction, `/storage` proxy | High | High | Separate owner from local backend only if a clear API contract freeze exists |
| `uploads`, `assets`, `scenes`, `captures`, `reconstruction_cache` | Runtime-generated state and artifacts | High state impact | Medium | Do not use for source edits; safe to inspect, unsafe as a merge surface |
| `src/app/pro`, `src/components/Viewfinder`, `src/app/api/generate`, `src/app/api/agent`, `src/app/api/interrogate` | Separate prototype workspace and mock APIs | Medium | Low | Good isolated thread; does not use `/api/mvp` |
| `src/app/login`, `src/app/dashboard`, `src/app/api/waitlist`, `src/app/api/auth/logout`, `src/app/actions.ts`, `src/lib/db.ts`, `src/lib/supabase.ts` | Auth, waitlist, lightweight app shell state | Medium | Low to Medium | Good isolated thread; overlap mostly limited to shared styling and env config |
| `src/components/ui/LoginForm.tsx`, `src/components/ui/BackgroundNoise.tsx` | UI used by active login/dashboard routes | Medium | Low | Safe as long as auth owners coordinate |
| `src/components/experience`, `src/components/layout` | Currently unwired experience/marketing components | Low | Low | Strong low-conflict zone; confirm future intent before major rewrites |
| `src/components/ui/WaitlistForm.tsx`, `SuccessOverlay.tsx`, `GlitchText.tsx`, `EngineSimulation.tsx`, `WordFadeIn.tsx`, `FadeIn.tsx` | Mostly tied to dormant experience components | Low | Low | Safe isolated work; low immediate app risk |
| `public` | Static media assets | Low | Low | Usually isolated unless an active page starts referencing them |
| `tests`, `scripts` | Validation, smoke coverage, audits | Low runtime risk | Medium contract risk | Safe parallel work if tests track existing contracts rather than redefine them |
| `docs`, `maps`, empty `contracts`, empty `runbooks` | Documentation and planning | None | Low | Best zone for analysis-only work |
| `package.json`, `next.config.mjs`, `setup.sh` | Repo-wide build/runtime/config | Very High | Very High | Never split casually; single-owner changes only |
| `backend/ml-sharp`, `backend/TripoSR` | Vendored model repos used by local backend | High local impact | Medium | Avoid concurrent edits unless doing model integration work only |

## Highest-Risk Shared Files

If two threads touch any of these, expect rebasing and behavior drift:

- `src/app/api/mvp/[...path]/route.ts`
- `src/lib/mvp-product.ts`
- `src/components/Editor/LeftPanel.tsx`
- `src/components/Editor/RightPanel.tsx`
- `src/components/Editor/ThreeOverlay.tsx`
- `src/app/mvp/page.tsx`
- `backend/api/routes.py`
- `vercel-backend/app.py`

## Best Non-Overlapping Thread Lanes

Use these lanes when splitting work:

1. MVP frontend lane
   - Owns: `src/app/mvp`, `src/components/Editor`, `src/lib/mvp-*`
   - Avoids: both Python backends unless a contract change is explicitly coordinated

2. Local backend lane
   - Owns: `backend/server.py`, `backend/api`, `backend/models`
   - Avoids: `vercel-backend`, frontend UI files

3. Vercel backend lane
   - Owns: `vercel-backend`
   - Avoids: local backend internals unless intentionally syncing contracts

4. Pro workspace lane
   - Owns: `src/app/pro`, `src/components/Viewfinder`, mock API routes under `src/app/api/{generate,agent,interrogate}`
   - Avoids: MVP proxy and Python backend

5. Auth/waitlist lane
   - Owns: login/dashboard/waitlist/actions/db/supabase
   - Avoids: MVP stack

6. Validation and docs lane
   - Owns: `tests`, `scripts`, `docs`, `maps`
   - Avoids: product code unless fixing broken tests

## Areas That Look Isolated But Are Not

- `src/lib/mvp-product.ts`: looks like a small helper file but defines the frontend interpretation of backend capabilities and metadata.
- `src/components/Editor/ViewerPanel.tsx`: looks visual-only but it drives the active scene state presented to save/review flows.
- `backend/api/routes.py` vs `vercel-backend/app.py`: similar API shape, different implementation details; changing only one creates environment-specific bugs.
- Runtime data directories: safe to inspect, but generated files can mislead developers if treated as source of truth instead of outputs.

## Areas That Are Actually Safe

- `src/components/Viewfinder/*`
- `src/app/pro/page.tsx`
- dormant experience/layout components
- docs, maps, and test-only automation scripts

Those zones have low direct coupling to the live MVP request spine.
