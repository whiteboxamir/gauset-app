from pathlib import Path
import sys


def resolve_backend_dir() -> Path:
    current_file = Path(__file__).resolve()
    direct_candidates = [
        current_file.parent / "vercel-backend",
        current_file.parents[1] / "vercel-backend",
        current_file.parents[2] / "vercel-backend",
    ]
    for candidate in direct_candidates:
        if (candidate / "app.py").exists():
            return candidate

    for ancestor in current_file.parents:
        match = next((path.parent for path in ancestor.glob("**/vercel-backend/app.py")), None)
        if match is not None:
            return match

    raise RuntimeError(f"Could not locate vercel-backend/app.py from {current_file}")


BACKEND_DIR = resolve_backend_dir()
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import app  # noqa: E402
