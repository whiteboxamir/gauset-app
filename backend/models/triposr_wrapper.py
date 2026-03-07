import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

try:
    from PIL import Image
except ImportError:  # pragma: no cover - optional until backend setup completes
    Image = None

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TRIPOSR_REPO = PROJECT_ROOT / "backend" / "TripoSR"


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _run_command(command: List[str], cwd: Optional[Path] = None) -> None:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        message = stderr or stdout or f"Command failed: {' '.join(command)}"
        raise RuntimeError(message)


def _write_mock_asset(output_dir: Path) -> None:
    time.sleep(1.5)
    (output_dir / "mesh.glb").write_text("mock glb data")
    (output_dir / "texture.png").write_text("mock png data")
    (output_dir / "preview.png").write_text("mock preview png data")


def _run_triposr(image_path: Path, staging_dir: Path) -> Path:
    command_template = os.getenv("GAUSET_TRIPOSR_COMMAND", "").strip()
    raw_dir = staging_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    if command_template:
        command_text = command_template.format(
            image=str(image_path),
            output=str(raw_dir),
            repo=str(TRIPOSR_REPO),
        )
        _run_command(shlex.split(command_text), cwd=PROJECT_ROOT)
        return raw_dir

    run_py = TRIPOSR_REPO / "run.py"
    if not run_py.exists():
        raise FileNotFoundError(
            "TripoSR repo not found at backend/TripoSR. Run ./setup.sh or set GAUSET_TRIPOSR_COMMAND."
        )

    preferred_device = os.getenv("GAUSET_TRIPOSR_DEVICE", "mps").strip().lower() or "mps"
    devices = [preferred_device]
    if preferred_device != "cpu":
        devices.append("cpu")

    errors: List[str] = []
    for device in devices:
        command = [
            sys.executable,
            str(run_py),
            str(image_path),
            "--output-dir",
            str(raw_dir),
            "--model-save-format",
            "glb",
            "--bake-texture",
            "--device",
            device,
        ]
        try:
            _run_command(command, cwd=TRIPOSR_REPO)
            return raw_dir
        except Exception as exc:
            errors.append(f"device={device}: {exc}")

    raise RuntimeError("Unable to run TripoSR inference. Tried: " + " | ".join(errors))


def _find_first(raw_root: Path, patterns: List[str]) -> Optional[Path]:
    for pattern in patterns:
        matches = sorted([p for p in raw_root.rglob(pattern) if p.is_file()])
        if matches:
            return matches[0]
    return None


def _ensure_texture_and_preview(image_path: Path, output_dir: Path) -> None:
    if Image is None:
        raise RuntimeError(
            "Pillow is required to produce texture/preview outputs. Install backend dependencies via ./setup.sh."
        )

    texture_path = output_dir / "texture.png"
    preview_path = output_dir / "preview.png"

    source_for_preview = texture_path if texture_path.exists() else image_path
    with Image.open(source_for_preview) as image:
        rgb = image.convert("RGB")
        if not texture_path.exists():
            rgb.save(texture_path)

        preview = rgb.copy()
        preview.thumbnail((768, 768))
        preview.save(preview_path)


def _normalize_asset_outputs(raw_root: Path, output_dir: Path, image_path: Path) -> None:
    mesh_source = _find_first(raw_root, ["mesh.glb", "*.glb"])
    if not mesh_source:
        raise RuntimeError("TripoSR ran but no mesh.glb output was found.")

    mesh_target = output_dir / "mesh.glb"
    if mesh_source.resolve() != mesh_target.resolve():
        shutil.copyfile(mesh_source, mesh_target)

    texture_source = _find_first(raw_root, ["texture.png", "*texture*.png"])
    if texture_source:
        texture_target = output_dir / "texture.png"
        if texture_source.resolve() != texture_target.resolve():
            shutil.copyfile(texture_source, texture_target)

    _ensure_texture_and_preview(image_path, output_dir)


def generate_asset(image_path: str, output_dir: str) -> str:
    """
    Run TripoSR inference and normalize outputs to:
      - mesh.glb
      - texture.png
      - preview.png

    Set GAUSET_TRIPOSR_COMMAND to override execution command.
    Set GAUSET_ALLOW_MOCK_MODE=1 to allow mock fallback when inference fails.
    """
    input_image = Path(image_path).resolve()
    if not input_image.exists() or not input_image.is_file():
        raise FileNotFoundError(f"Input image not found: {input_image}")

    final_output_dir = Path(output_dir).resolve()
    final_output_dir.mkdir(parents=True, exist_ok=True)

    allow_mock = _env_flag("GAUSET_ALLOW_MOCK_MODE", "0")
    staging_dir = final_output_dir / "_triposr_tmp"

    try:
        staging_dir.mkdir(parents=True, exist_ok=True)
        raw_output_dir = _run_triposr(input_image, staging_dir)
        _normalize_asset_outputs(raw_output_dir, final_output_dir, input_image)
        print(f"[TripoSR] Output saved to {final_output_dir}")
    except Exception as exc:
        if not allow_mock:
            raise RuntimeError(
                "TripoSR inference failed. Set GAUSET_ALLOW_MOCK_MODE=1 to permit mock fallback. "
                f"Error: {exc}"
            ) from exc

        print(f"[TripoSR] Falling back to mock output: {exc}")
        _write_mock_asset(final_output_dir)

    return str(final_output_dir)
