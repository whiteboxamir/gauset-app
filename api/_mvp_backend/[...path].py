from pathlib import Path
import sys
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from vercel_backend.app import app as backend_app

_PATH_PREFIX = "/api/_mvp_backend"


def _strip_prefix_from_scope(scope: dict[str, Any]) -> dict[str, Any]:
    if scope.get("type") != "http":
        return scope

    path = str(scope.get("path") or "")
    stripped_path = path[len(_PATH_PREFIX) :] if path.startswith(_PATH_PREFIX) else path
    if not stripped_path:
        stripped_path = "/"

    new_scope = dict(scope)
    new_scope["path"] = stripped_path
    new_scope["root_path"] = _PATH_PREFIX

    raw_path = scope.get("raw_path")
    if isinstance(raw_path, (bytes, bytearray)):
        prefix_bytes = _PATH_PREFIX.encode("utf-8")
        raw_bytes = bytes(raw_path)
        stripped_raw_path = raw_bytes[len(prefix_bytes) :] if raw_bytes.startswith(prefix_bytes) else raw_bytes
        new_scope["raw_path"] = stripped_raw_path or b"/"

    return new_scope


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    await backend_app(_strip_prefix_from_scope(scope), receive, send)
