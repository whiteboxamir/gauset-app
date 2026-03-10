import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from config_env import load_local_env_files
from pathlib import Path

load_local_env_files()


def _env_flag(name: str, default: str = "1") -> bool:
    value = os.getenv(name, default).strip().lower()
    return value in {"1", "true", "yes", "on"}

app = FastAPI(title="Gauset Local Backend", version="1.0.0")

# Allow Next.js frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # local usage
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    host = os.getenv("GAUSET_BACKEND_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("GAUSET_BACKEND_PORT", "8000"))
    reload_enabled = _env_flag("GAUSET_BACKEND_RELOAD", "1")
    backend_root = Path(__file__).resolve().parent
    print("Starting FastAPI Local Server for Gauset...")
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=reload_enabled,
        reload_dirs=[str(backend_root)],
        reload_excludes=[
            ".next*",
            ".next-dev*",
            "test-results*",
            "playwright-report*",
            "node_modules",
            "uploads",
            "scenes",
            "assets",
        ],
    )
