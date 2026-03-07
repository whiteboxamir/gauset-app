import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SHARP_REPO = PROJECT_ROOT / "backend" / "ml-sharp"


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


def _write_mock_environment(output_dir: Path) -> None:
    time.sleep(1.5)
    (output_dir / "splats.ply").write_text("mock ply data for gaussian splats")
    (output_dir / "cameras.json").write_text(json.dumps([]))
    (output_dir / "metadata.json").write_text(
        json.dumps({"model": "ml-sharp-mock", "note": "mock fallback"}, indent=2)
    )


def _run_ml_sharp_predict(image_path: Path, staging_dir: Path) -> Path:
    command_template = os.getenv("GAUSET_ML_SHARP_COMMAND", "").strip()
    raw_dir = staging_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    if command_template:
        command_text = command_template.format(
            image=str(image_path),
            output=str(raw_dir),
            repo=str(ML_SHARP_REPO),
        )
        _run_command(shlex.split(command_text), cwd=PROJECT_ROOT)
        return raw_dir

    if not ML_SHARP_REPO.exists():
        raise FileNotFoundError(
            "ML-Sharp repo not found at backend/ml-sharp. Run ./setup.sh or set GAUSET_ML_SHARP_COMMAND."
        )

    input_dir = staging_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    staged_image = input_dir / image_path.name
    shutil.copyfile(image_path, staged_image)

    commands = [
        ["sharp", "predict", "-i", str(input_dir), "-o", str(raw_dir)],
        [sys.executable, "-m", "sharp", "predict", "-i", str(input_dir), "-o", str(raw_dir)],
    ]

    errors: List[str] = []
    for command in commands:
        try:
            _run_command(command, cwd=ML_SHARP_REPO)
            return raw_dir
        except Exception as exc:
            errors.append(f"{' '.join(command)} -> {exc}")

    raise RuntimeError(
        "Unable to run ML-Sharp inference. Tried:\n- " + "\n- ".join(errors)
    )


def _normalize_environment_outputs(raw_root: Path, output_dir: Path) -> None:
    ply_candidates = sorted([p for p in raw_root.rglob("*.ply") if p.is_file()])
    if not ply_candidates:
        raise RuntimeError("ML-Sharp ran but no .ply output was found.")

    source_splats = ply_candidates[0]
    target_splats = output_dir / "splats.ply"
    if source_splats.resolve() != target_splats.resolve():
        shutil.copyfile(source_splats, target_splats)

    camera_candidates = sorted(
        [p for p in raw_root.rglob("*.json") if p.is_file() and "camera" in p.name.lower()]
    )
    metadata_candidates = sorted(
        [p for p in raw_root.rglob("*.json") if p.is_file() and "metadata" in p.name.lower()]
    )

    if camera_candidates:
        source_camera = camera_candidates[0]
        target_camera = output_dir / "cameras.json"
        if source_camera.resolve() != target_camera.resolve():
            shutil.copyfile(source_camera, target_camera)
    else:
        (output_dir / "cameras.json").write_text(json.dumps([], indent=2))

    if metadata_candidates:
        source_metadata = metadata_candidates[0]
        target_metadata = output_dir / "metadata.json"
        if source_metadata.resolve() != target_metadata.resolve():
            shutil.copyfile(source_metadata, target_metadata)
    else:
        (output_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "model": "ml-sharp",
                    "source": str(source_splats),
                    "normalized": True,
                },
                indent=2,
            )
        )


def generate_environment(image_path: str, output_dir: str) -> str:
    """
    Run ML-Sharp inference and normalize outputs to:
      - splats.ply
      - cameras.json
      - metadata.json

    Set GAUSET_ML_SHARP_COMMAND to override execution command.
    Set GAUSET_ALLOW_MOCK_MODE=1 to allow mock fallback when inference fails.
    """
    input_image = Path(image_path).resolve()
    if not input_image.exists() or not input_image.is_file():
        raise FileNotFoundError(f"Input image not found: {input_image}")

    final_output_dir = Path(output_dir).resolve()
    final_output_dir.mkdir(parents=True, exist_ok=True)

    allow_mock = _env_flag("GAUSET_ALLOW_MOCK_MODE", "0")
    staging_dir = final_output_dir / "_ml_sharp_tmp"

    try:
        staging_dir.mkdir(parents=True, exist_ok=True)
        raw_output_dir = _run_ml_sharp_predict(input_image, staging_dir)
        _normalize_environment_outputs(raw_output_dir, final_output_dir)

        metadata_path = final_output_dir / "metadata.json"
        if metadata_path.exists():
            try:
                payload = json.loads(metadata_path.read_text())
            except Exception:
                payload = {}
            payload["input_image"] = str(input_image)
            payload["generated_at"] = time.time()
            payload["execution_mode"] = "real"
            metadata_path.write_text(json.dumps(payload, indent=2))

        print(f"[ML-Sharp] Output saved to {final_output_dir}")
    except Exception as exc:
        if not allow_mock:
            raise RuntimeError(
                "ML-Sharp inference failed. Set GAUSET_ALLOW_MOCK_MODE=1 to permit mock fallback. "
                f"Error: {exc}"
            ) from exc

        print(f"[ML-Sharp] Falling back to mock output: {exc}")
        _write_mock_environment(final_output_dir)

    return str(final_output_dir)
