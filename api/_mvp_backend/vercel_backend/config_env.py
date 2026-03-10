from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


def _resolve_project_root() -> Path:
    current_file = Path(__file__).resolve()
    for ancestor in current_file.parents:
        if (ancestor / "package.json").exists():
            return ancestor
    return current_file.parents[1]


PROJECT_ROOT = _resolve_project_root()
DEFAULT_ENV_FILES = (
    PROJECT_ROOT / ".env.backend.local",
    PROJECT_ROOT / ".env.providers.local",
    PROJECT_ROOT / ".env.local",
    PROJECT_ROOT / ".env.backend",
    PROJECT_ROOT / ".env.providers",
    PROJECT_ROOT / ".env",
)

_ENV_FILES_LOADED = False


def _strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_local_env_files(files: Iterable[Path] | None = None) -> None:
    global _ENV_FILES_LOADED
    if _ENV_FILES_LOADED:
        return

    for path in files or DEFAULT_ENV_FILES:
        if not path.exists() or not path.is_file():
            continue

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue

            key, raw_value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue

            value = _strip_wrapping_quotes(raw_value.strip())
            os.environ[key] = value

    _ENV_FILES_LOADED = True
