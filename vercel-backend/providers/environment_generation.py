from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

_SHARED_PATH = Path(__file__).resolve().parents[2] / "backend" / "providers" / "environment_generation.py"
_SPEC = spec_from_file_location("gauset_shared_environment_generation", _SHARED_PATH)
if _SPEC is None or _SPEC.loader is None:  # pragma: no cover - defensive
    raise ImportError(f"Could not load shared environment generation module from {_SHARED_PATH}")

_MODULE = module_from_spec(_SPEC)
sys.modules[_SPEC.name] = _MODULE
_SPEC.loader.exec_module(_MODULE)

EnvironmentArtifact = _MODULE.EnvironmentArtifact
EnvironmentBridgeStatus = _MODULE.EnvironmentBridgeStatus
EnvironmentGenerationRequest = _MODULE.EnvironmentGenerationRequest
EnvironmentJob = _MODULE.EnvironmentJob
ProviderError = _MODULE.ProviderError
get_environment_bridge_registry = _MODULE.get_environment_bridge_registry
materialize_environment_artifact = _MODULE.materialize_environment_artifact

__all__ = [
    "EnvironmentArtifact",
    "EnvironmentBridgeStatus",
    "EnvironmentGenerationRequest",
    "EnvironmentJob",
    "ProviderError",
    "get_environment_bridge_registry",
    "materialize_environment_artifact",
]
