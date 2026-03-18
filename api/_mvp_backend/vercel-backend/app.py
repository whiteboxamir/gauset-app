from __future__ import annotations

from pathlib import Path
import runpy
import sys

WORKSPACE_ROOT = Path(__file__).resolve()
THIS_PATH = WORKSPACE_ROOT
for _ in range(8):
    candidate = WORKSPACE_ROOT / "vercel-backend" / "app.py"
    if candidate.exists() and candidate.resolve() != THIS_PATH:
        CANONICAL_APP_PATH = candidate
        break
    if WORKSPACE_ROOT.parent == WORKSPACE_ROOT:
        raise RuntimeError("Could not resolve canonical public backend path")
    WORKSPACE_ROOT = WORKSPACE_ROOT.parent
else:
    raise RuntimeError("Could not resolve canonical public backend path")

CANONICAL_APP_DIR = CANONICAL_APP_PATH.parent

if not CANONICAL_APP_PATH.exists():
    raise RuntimeError(f"Expected canonical public backend at {CANONICAL_APP_PATH}")
if str(CANONICAL_APP_DIR) not in sys.path:
    sys.path.append(str(CANONICAL_APP_DIR))

_CANONICAL_SCOPE = runpy.run_path(
    str(CANONICAL_APP_PATH),
    init_globals={"__file__": str(CANONICAL_APP_PATH)},
    run_name=__name__,
)
globals().update(_CANONICAL_SCOPE)
