import json
import math
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SHARP_REPO = PROJECT_ROOT / "backend" / "ml-sharp"
ML_SHARP_SRC = ML_SHARP_REPO / "src"
SH_C0 = 0.28209479177387814

DEFAULT_PREVIEW_DENSITY_MULTIPLIER = max(1, int(os.getenv("GAUSET_ML_SHARP_DENSITY_MULTIPLIER", "5")))
DEFAULT_PREVIEW_JITTER_RADIUS = float(os.getenv("GAUSET_ML_SHARP_DENSITY_JITTER", "0.38"))
DEFAULT_PREVIEW_SCALE_SHRINK = float(os.getenv("GAUSET_ML_SHARP_SCALE_SHRINK", "0.9"))
DEFAULT_PREVIEW_SATURATION_BOOST = float(os.getenv("GAUSET_ML_SHARP_SATURATION_BOOST", "1.06"))
DEFAULT_PREVIEW_TARGET_P75 = float(os.getenv("GAUSET_ML_SHARP_TARGET_P75", "0.72"))
DEFAULT_PREVIEW_MAX_GAIN = float(os.getenv("GAUSET_ML_SHARP_MAX_GAIN", "1.75"))
DEFAULT_PREVIEW_TARGET_MEAN = float(os.getenv("GAUSET_ML_SHARP_TARGET_MEAN", "0.42"))
DEFAULT_PREVIEW_MIN_GAMMA = float(os.getenv("GAUSET_ML_SHARP_MIN_GAMMA", "0.84"))
DEFAULT_PREVIEW_MAX_GAMMA = float(os.getenv("GAUSET_ML_SHARP_MAX_GAMMA", "1.0"))
DEFAULT_PREVIEW_PROJECTION_POINT_LIMIT = max(200_000, int(os.getenv("GAUSET_ML_SHARP_PROJECTION_POINT_LIMIT", "1200000")))
DEFAULT_PREVIEW_PROJECTION_INPUT_BLEND = float(os.getenv("GAUSET_ML_SHARP_PROJECTION_INPUT_BLEND", "0.78"))
DEFAULT_PREVIEW_PROJECTION_POINT_BLEND = float(os.getenv("GAUSET_ML_SHARP_PROJECTION_POINT_BLEND", "0.55"))


def _ensure_ml_sharp_imports():
    if str(ML_SHARP_SRC) not in sys.path:
        sys.path.insert(0, str(ML_SHARP_SRC))

    from sharp.utils import linalg  # pylint: disable=import-error
    from sharp.utils.gaussians import Gaussians3D, load_ply, save_ply  # pylint: disable=import-error

    return Gaussians3D, load_ply, save_ply, linalg


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _run_command(command: List[str], cwd: Optional[Path] = None, env: Optional[Dict[str, str]] = None) -> None:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        message = stderr or stdout or f"Command failed: {' '.join(command)}"
        raise RuntimeError(message)


def _compute_preview_color_stats(colors: torch.Tensor) -> Dict[str, Any]:
    luma = (colors[:, 0] * 0.299) + (colors[:, 1] * 0.587) + (colors[:, 2] * 0.114)
    return {
        "mean_rgb": [round(float(value), 4) for value in colors.mean(dim=0)],
        "mean_luma": round(float(luma.mean()), 4),
        "p75_luma": round(float(torch.quantile(luma, 0.75)), 4),
        "p90_luma": round(float(torch.quantile(luma, 0.90)), 4),
        "mean_opacity": None,
    }


def _render_preview_projection_image(
    *,
    gaussians,
    metadata,
    input_image: Path,
    output_path: Path,
) -> Dict[str, Any]:
    width, height = metadata.resolution_px
    focal_length_px = float(metadata.focal_length_px)
    positions = gaussians.mean_vectors[0].detach().cpu().numpy()
    colors = gaussians.colors[0].detach().cpu().numpy()
    opacities = gaussians.opacities[0].detach().cpu().numpy()

    if positions.shape[0] > DEFAULT_PREVIEW_PROJECTION_POINT_LIMIT:
        step = max(1, positions.shape[0] // DEFAULT_PREVIEW_PROJECTION_POINT_LIMIT)
        positions = positions[::step]
        colors = colors[::step]
        opacities = opacities[::step]

    positive_depth = positions[:, 2] > 1e-3
    positions = positions[positive_depth]
    colors = colors[positive_depth]
    opacities = opacities[positive_depth]

    rgb = np.clip((colors * SH_C0) + 0.5, 0.0, 1.0).astype(np.float32)
    alpha = np.clip(opacities.astype(np.float32), 0.0, 1.0) * 0.72
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    z = positions[:, 2]

    input_rgb = np.asarray(
        Image.open(input_image).convert("RGB").resize((width, height), Image.Resampling.LANCZOS),
        dtype=np.float32,
    ) / 255.0

    best_score = float("inf")
    best_render = None
    best_orientation = {"x_sign": 1, "y_sign": -1}

    for x_sign in (1.0, -1.0):
        for y_sign in (-1.0, 1.0):
            projected_x = np.round(cx + (x_sign * focal_length_px * (positions[:, 0] / z))).astype(np.int32)
            projected_y = np.round(cy + (y_sign * focal_length_px * (positions[:, 1] / z))).astype(np.int32)
            inside = (
                (projected_x >= 0)
                & (projected_x < width)
                & (projected_y >= 0)
                & (projected_y < height)
            )
            if not np.any(inside):
                continue

            projected_x = projected_x[inside]
            projected_y = projected_y[inside]
            projected_rgb = rgb[inside]
            projected_alpha = alpha[inside]

            accum_rgb = np.zeros((height, width, 3), dtype=np.float32)
            accum_weight = np.zeros((height, width), dtype=np.float32)

            np.add.at(accum_weight, (projected_y, projected_x), projected_alpha)
            for channel_index in range(3):
                np.add.at(accum_rgb[..., channel_index], (projected_y, projected_x), projected_rgb[:, channel_index] * projected_alpha)

            normalized = accum_rgb / np.maximum(accum_weight[..., None], 1e-4)
            density = np.clip(
                accum_weight / max(float(np.quantile(accum_weight[accum_weight > 0], 0.9)) if np.any(accum_weight > 0) else 1.0, 1e-4),
                0.0,
                1.0,
            )
            density_image = Image.fromarray((density * 255.0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=1.1))
            density_blur = np.asarray(density_image, dtype=np.float32) / 255.0
            render = np.clip(
                (input_rgb * density_blur[..., None] * DEFAULT_PREVIEW_PROJECTION_INPUT_BLEND)
                + (normalized * DEFAULT_PREVIEW_PROJECTION_POINT_BLEND)
                + (input_rgb * 0.18),
                0.0,
                1.0,
            )

            score = float(np.mean((render - input_rgb) ** 2) - (0.035 * density_blur.mean()))
            if score < best_score:
                best_score = score
                best_render = render
                best_orientation = {"x_sign": int(x_sign), "y_sign": int(y_sign)}

    if best_render is None:
        best_render = input_rgb

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((best_render * 255.0).astype(np.uint8)).save(output_path)
    return {
        "filename": output_path.name,
        "orientation": best_orientation,
        "score": round(best_score if math.isfinite(best_score) else 0.0, 6),
        "input_blend": round(DEFAULT_PREVIEW_PROJECTION_INPUT_BLEND, 4),
        "point_blend": round(DEFAULT_PREVIEW_PROJECTION_POINT_BLEND, 4),
    }


def _apply_preview_exposure_correction(colors: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, Any]]:
    luma = (colors[:, 0] * 0.299) + (colors[:, 1] * 0.587) + (colors[:, 2] * 0.114)
    mean_luma = float(luma.mean())
    p75_luma = float(torch.quantile(luma, 0.75))

    gain = max(1.0, min(DEFAULT_PREVIEW_MAX_GAIN, DEFAULT_PREVIEW_TARGET_P75 / max(p75_luma, 1e-3)))
    lifted = (colors * gain).clamp(0.0, 1.0)

    post_gain_luma = (lifted[:, 0] * 0.299) + (lifted[:, 1] * 0.587) + (lifted[:, 2] * 0.114)
    post_gain_mean = float(post_gain_luma.mean())
    gamma = 1.0
    if post_gain_mean < DEFAULT_PREVIEW_TARGET_MEAN:
        gamma = float(
            max(
                DEFAULT_PREVIEW_MIN_GAMMA,
                min(
                    DEFAULT_PREVIEW_MAX_GAMMA,
                    math.log(DEFAULT_PREVIEW_TARGET_MEAN) / math.log(max(post_gain_mean, 1e-3)),
                ),
            )
        )

    gamma_corrected = lifted.clamp(0.0, 1.0).pow(gamma)
    corrected_luma = (gamma_corrected[:, 0] * 0.299) + (gamma_corrected[:, 1] * 0.587) + (gamma_corrected[:, 2] * 0.114)
    neutral = corrected_luma.unsqueeze(-1)
    corrected = (neutral + (gamma_corrected - neutral) * DEFAULT_PREVIEW_SATURATION_BOOST).clamp(0.0, 1.0)

    final_luma = (corrected[:, 0] * 0.299) + (corrected[:, 1] * 0.587) + (corrected[:, 2] * 0.114)
    return corrected, {
        "gain": round(gain, 4),
        "gamma": round(gamma, 4),
        "saturation_boost": round(DEFAULT_PREVIEW_SATURATION_BOOST, 4),
        "mean_luma_before": round(mean_luma, 4),
        "mean_luma_after": round(float(final_luma.mean()), 4),
        "p75_luma_before": round(p75_luma, 4),
        "p75_luma_after": round(float(torch.quantile(final_luma, 0.75)), 4),
    }


def _build_density_offsets(rotations: torch.Tensor, singular_values: torch.Tensor, num_copies: int) -> torch.Tensor:
    if num_copies <= 1:
        batch, count = singular_values.shape[:2]
        return torch.zeros((batch, count, 1, 3), dtype=singular_values.dtype, device=singular_values.device)

    tangent_a = rotations[..., 0] * singular_values[..., 0:1]
    tangent_b = rotations[..., 1] * singular_values[..., 1:2]
    patterns = torch.tensor(
        [
            [0.0, 0.0],
            [1.0, 0.0],
            [-1.0, 0.0],
            [0.0, 1.0],
            [0.0, -1.0],
            [0.70710678, 0.70710678],
            [-0.70710678, 0.70710678],
            [0.70710678, -0.70710678],
            [-0.70710678, -0.70710678],
        ],
        dtype=singular_values.dtype,
        device=singular_values.device,
    )
    if num_copies > patterns.shape[0]:
        repeats = math.ceil(num_copies / patterns.shape[0])
        patterns = patterns.repeat((repeats, 1))
    patterns = patterns[:num_copies]
    offsets = DEFAULT_PREVIEW_JITTER_RADIUS * (
        tangent_a[:, :, None, :] * patterns[:, 0].view(1, 1, num_copies, 1)
        + tangent_b[:, :, None, :] * patterns[:, 1].view(1, 1, num_copies, 1)
    )
    offsets[:, :, 0, :] = 0.0
    return offsets


def _densify_preview_gaussians(gaussians) -> Tuple[Any, Dict[str, Any]]:
    batch, source_count, _ = gaussians.mean_vectors.shape
    density_multiplier = max(1, DEFAULT_PREVIEW_DENSITY_MULTIPLIER)

    if density_multiplier == 1:
        return gaussians, {
            "multiplier": 1,
            "source_count": source_count,
            "output_count": source_count,
            "scale_shrink": 1.0,
            "jitter_radius": DEFAULT_PREVIEW_JITTER_RADIUS,
        }

    _, _, _, linalg = _ensure_ml_sharp_imports()
    rotations = linalg.rotation_matrices_from_quaternions(gaussians.quaternions)
    offsets = _build_density_offsets(rotations, gaussians.singular_values, density_multiplier)

    means = gaussians.mean_vectors[:, :, None, :] + offsets
    means = means.reshape(batch, source_count * density_multiplier, 3)

    scales = (gaussians.singular_values[:, :, None, :].expand(-1, -1, density_multiplier, -1) * DEFAULT_PREVIEW_SCALE_SHRINK).reshape(
        batch, source_count * density_multiplier, 3
    )
    quaternions = gaussians.quaternions[:, :, None, :].expand(-1, -1, density_multiplier, -1).reshape(
        batch, source_count * density_multiplier, 4
    )
    colors = gaussians.colors[:, :, None, :].expand(-1, -1, density_multiplier, -1).reshape(
        batch, source_count * density_multiplier, 3
    )

    per_copy_opacity = 1.0 - torch.pow(1.0 - gaussians.opacities.clamp(0.0, 0.995), 1.0 / density_multiplier)
    per_copy_opacity = per_copy_opacity.clamp(0.08, 0.995)
    opacities = per_copy_opacity[:, :, None].expand(-1, -1, density_multiplier).reshape(
        batch, source_count * density_multiplier
    )

    Gaussians3D, _, _, _ = _ensure_ml_sharp_imports()
    densified = Gaussians3D(
        mean_vectors=means,
        singular_values=scales,
        quaternions=quaternions,
        colors=colors,
        opacities=opacities,
    )
    return densified, {
        "multiplier": density_multiplier,
        "source_count": source_count,
        "output_count": source_count * density_multiplier,
        "scale_shrink": round(DEFAULT_PREVIEW_SCALE_SHRINK, 4),
        "jitter_radius": round(DEFAULT_PREVIEW_JITTER_RADIUS, 4),
        "mean_opacity_before": round(float(gaussians.opacities.mean()), 4),
        "mean_opacity_after": round(float(opacities.mean()), 4),
    }


def _enhance_preview_outputs(output_dir: Path, input_image: Path) -> Dict[str, Any]:
    _, load_ply, save_ply, _ = _ensure_ml_sharp_imports()

    splat_path = output_dir / "splats.ply"
    gaussians, metadata = load_ply(splat_path)
    colors = gaussians.colors.flatten(0, 1)
    before_stats = _compute_preview_color_stats(colors)
    before_stats["mean_opacity"] = round(float(gaussians.opacities.mean()), 4)

    corrected_colors, exposure = _apply_preview_exposure_correction(colors)
    corrected_gaussians = gaussians._replace(colors=corrected_colors.view_as(gaussians.colors))
    densified_gaussians, density = _densify_preview_gaussians(corrected_gaussians)

    save_ply(
        densified_gaussians,
        metadata.focal_length_px,
        (metadata.resolution_px[1], metadata.resolution_px[0]),
        splat_path,
    )

    after_colors = densified_gaussians.colors.flatten(0, 1)
    after_stats = _compute_preview_color_stats(after_colors)
    after_stats["mean_opacity"] = round(float(densified_gaussians.opacities.mean()), 4)
    projection = _render_preview_projection_image(
        gaussians=densified_gaussians,
        metadata=metadata,
        input_image=input_image,
        output_path=output_dir / "preview-projection.png",
    )
    source_resolution = [int(metadata.resolution_px[0]), int(metadata.resolution_px[1])]
    source_focal_length_px = float(metadata.focal_length_px)
    source_vertical_fov = (
        2 * math.degrees(math.atan(source_resolution[1] / (2 * max(source_focal_length_px, 1e-3))))
    )
    return {
        "source_renderer": "ml_sharp_single_image",
        "point_count_before": density["source_count"],
        "point_count_after": density["output_count"],
        "density": density,
        "exposure": exposure,
        "color_stats_before": before_stats,
        "color_stats_after": after_stats,
        "projection": projection,
        "source_camera": {
            "position": [0.0, 0.0, 0.0],
            "target": [0.0, 0.0, 1.0],
            "up": [0.0, -1.0, 0.0],
            "focal_length_px": round(source_focal_length_px, 4),
            "resolution_px": source_resolution,
            "fov_degrees": round(source_vertical_fov, 4),
        },
    }


def _merge_preview_metadata(metadata_path: Path, enhancement: Dict[str, Any], input_image: Path) -> None:
    if metadata_path.exists():
        try:
            payload = json.loads(metadata_path.read_text())
        except Exception:
            payload = {}
    else:
        payload = {}

    delivery = payload.get("delivery") if isinstance(payload.get("delivery"), dict) else {}
    axes = delivery.get("axes") if isinstance(delivery.get("axes"), dict) else {}
    density_axis = axes.get("density") if isinstance(axes.get("density"), dict) else {}
    rendering = payload.get("rendering") if isinstance(payload.get("rendering"), dict) else {}

    point_count_after = int(enhancement["point_count_after"])
    density_score = round(min(96.0, 55.0 + (math.log(max(point_count_after, 1)) - math.log(1179648.0)) * 18.0), 1)
    delivery["axes"] = {
        **axes,
        "density": {
            **density_axis,
            "score": density_score,
            "status": "strong" if density_score >= 85.0 else "watch" if density_score >= 70.0 else "critical",
            "note": "Preview density was expanded with backend-side Gaussian supersampling before export.",
        },
    }
    render_targets = delivery.get("render_targets") if isinstance(delivery.get("render_targets"), dict) else {}
    delivery["render_targets"] = {
        **render_targets,
        "preferred_point_budget": point_count_after,
    }

    rendering.update(
        {
            "color_encoding": "sh_dc_rgb",
            "viewer_decode": rendering.get("viewer_decode")
            or "srgb = clamp(f_dc * 0.28209479177388 + 0.5, 0, 1)",
            "has_explicit_vertex_colors": False,
            "viewer_renderer": "sharp_gaussian_direct",
            "source_format": "sharp_ply_dense_preview",
            "preview_density_multiplier": enhancement["density"]["multiplier"],
        }
    )

    payload.update(
        {
            "input_image": str(input_image),
            "generated_at": time.time(),
            "execution_mode": "real",
            "generator": "gauset-local-backend",
            "lane": payload.get("lane") or "preview",
            "truth_label": payload.get("truth_label") or "Instant Preview",
            "quality_tier": "single_image_preview_ultra_dense",
            "faithfulness": payload.get("faithfulness") or "approximate",
            "preview_enhancement": enhancement,
            "source_camera": enhancement.get("source_camera"),
            "preview_projection": enhancement.get("projection", {}).get("filename"),
            "rendering": rendering,
            "delivery": delivery,
            "point_count": point_count_after,
        }
    )
    metadata_path.write_text(json.dumps(payload, indent=2))


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

    command_env = os.environ.copy()
    python_path = command_env.get("PYTHONPATH", "").strip()
    command_env["PYTHONPATH"] = (
        f"{ML_SHARP_SRC}{os.pathsep}{python_path}" if python_path else str(ML_SHARP_SRC)
    )

    commands = [
        ["sharp", "predict", "-i", str(input_dir), "-o", str(raw_dir)],
        [
            sys.executable,
            "-c",
            "from sharp.cli.predict import predict_cli; predict_cli()",
            "-i",
            str(input_dir),
            "-o",
            str(raw_dir),
        ],
    ]

    errors: List[str] = []
    for command in commands:
        try:
            _run_command(command, cwd=ML_SHARP_REPO, env=command_env)
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
        enhancement = _enhance_preview_outputs(final_output_dir, image_path)
        _merge_preview_metadata(metadata_path, enhancement, input_image)

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
