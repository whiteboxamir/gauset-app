import json
import math
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import torch

from sharp.utils.gaussians import Gaussians3D, apply_transform, load_ply, save_ply

from .ml_sharp_wrapper import generate_environment

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RECON_CACHE_DIR = PROJECT_ROOT / "reconstruction_cache"
RECON_CACHE_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_MAX_TOTAL_GAUSSIANS = int(os.getenv("GAUSET_RECON_MAX_TOTAL_GAUSSIANS", "350000"))
DEFAULT_MAX_PER_VIEW_GAUSSIANS = int(os.getenv("GAUSET_RECON_MAX_PER_VIEW_GAUSSIANS", "90000"))
SH_C0 = 0.28209479177387814
LOCAL_TRAINING_BACKEND = "sharp_fusion_local"


def _load_grayscale(image_path: Path) -> np.ndarray:
    image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise FileNotFoundError(f"Could not load image: {image_path}")
    return image


def _load_rgb(image_path: Path) -> np.ndarray:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not load image: {image_path}")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def _estimate_relative_transform(
    previous_image: Path,
    current_image: Path,
    step_index: int,
    total_steps: int,
) -> Dict[str, Any]:
    image_a = _load_grayscale(previous_image)
    image_b = _load_grayscale(current_image)

    orb = cv2.ORB_create(5000)
    keypoints_a, descriptors_a = orb.detectAndCompute(image_a, None)
    keypoints_b, descriptors_b = orb.detectAndCompute(image_b, None)

    if descriptors_a is None or descriptors_b is None or len(keypoints_a) < 24 or len(keypoints_b) < 24:
        return _failed_transform(step_index, total_steps, reason="insufficient_features")

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw_matches = matcher.knnMatch(descriptors_a, descriptors_b, k=2)
    good_matches = []
    for pair in raw_matches:
        if len(pair) < 2:
            continue
        first, second = pair
        if second is not None and first.distance < 0.75 * second.distance:
            good_matches.append(first)

    if len(good_matches) < 24:
        return _failed_transform(step_index, total_steps, reason="insufficient_matches", matches=len(good_matches))

    points_a = np.float32([keypoints_a[match.queryIdx].pt for match in good_matches])
    points_b = np.float32([keypoints_b[match.trainIdx].pt for match in good_matches])
    height, width = image_a.shape[:2]
    focal = max(width, height) * 1.2
    principal_point = (width * 0.5, height * 0.5)

    essential, mask = cv2.findEssentialMat(
        points_a,
        points_b,
        focal=focal,
        pp=principal_point,
        method=cv2.RANSAC,
        prob=0.999,
        threshold=1.0,
    )

    if essential is None:
        return _failed_transform(step_index, total_steps, reason="essential_matrix_failed", matches=len(good_matches))

    recovered_inliers, rotation, translation, pose_mask = cv2.recoverPose(
        essential,
        points_a,
        points_b,
        focal=focal,
        pp=principal_point,
    )
    inlier_count = int(recovered_inliers) if recovered_inliers is not None else 0
    minimum_inliers = max(24, min(96, int(len(good_matches) * 0.12)))

    if inlier_count < minimum_inliers:
        return _failed_transform(
            step_index,
            total_steps,
            reason="weak_pose",
            matches=len(good_matches),
            inliers=inlier_count,
        )

    translation = translation.reshape(3)
    norm = float(np.linalg.norm(translation))
    if norm < 1e-6:
        return _failed_transform(
            step_index,
            total_steps,
            reason="degenerate_pose",
            matches=len(good_matches),
            inliers=inlier_count,
        )

    normalized_translation = translation / norm
    motion = np.linalg.norm((points_b - points_a) / np.array([[width, height]], dtype=np.float32), axis=1)
    baseline = float(np.clip(np.median(motion) * 4.0, 0.08, 0.55))
    scaled_translation = normalized_translation * baseline

    transform = np.eye(4, dtype=np.float32)
    transform[:3, :3] = rotation.astype(np.float32)
    transform[:3, 3] = scaled_translation.astype(np.float32)
    camera_to_world = _invert_rt(transform)

    return {
        "transform": camera_to_world,
        "diagnostic": {
            "mode": "essential_matrix",
            "matches": len(good_matches),
            "inliers": inlier_count if pose_mask is not None else inlier_count,
            "baseline": baseline,
        },
    }


def _failed_transform(
    step_index: int,
    total_steps: int,
    *,
    reason: str,
    matches: int = 0,
    inliers: int = 0,
) -> Dict[str, Any]:
    return {
        "transform": None,
        "diagnostic": {
            "mode": "failed_pose",
            "matches": matches,
            "inliers": inliers,
            "baseline": 0.0,
            "reason": reason,
        },
    }


def _invert_rt(transform: np.ndarray) -> np.ndarray:
    inverse = np.eye(4, dtype=np.float32)
    rotation = transform[:3, :3]
    translation = transform[:3, 3]
    inverse[:3, :3] = rotation.T
    inverse[:3, 3] = -(rotation.T @ translation)
    return inverse


def _round_float(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def _capture_appearance_signal(image_path: Path) -> Dict[str, Any]:
    rgb = _load_rgb(image_path)
    mean_rgb = rgb.reshape(-1, 3).mean(axis=0)
    luma = (rgb[..., 0] * 0.299) + (rgb[..., 1] * 0.587) + (rgb[..., 2] * 0.114)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    chroma_sum = max(float(mean_rgb.sum()), 1e-6)

    return {
        "image": image_path.name,
        "mean_rgb": [_round_float(channel, 4) for channel in mean_rgb],
        "normalized_mean_rgb": [_round_float(channel / chroma_sum, 4) for channel in mean_rgb],
        "brightness_mean": float(luma.mean()),
        "brightness_std": float(luma.std()),
        "saturation_mean": float(saturation.mean()),
    }


def _summarize_alignment(diagnostics: List[Dict[str, Any]], frame_count: int) -> Dict[str, Any]:
    pair_count = max(frame_count - 1, 0)
    pose_pairs = [entry for entry in diagnostics if entry.get("mode") == "essential_matrix"]
    failed_pose_pairs = [entry for entry in diagnostics if entry.get("mode") == "failed_pose"]
    verified_pose_pairs = [entry for entry in pose_pairs if float(entry.get("inliers", 0.0)) >= 24.0]
    pose_success_ratio = (len(verified_pose_pairs) / pair_count) if pair_count else 1.0
    matches = [float(entry.get("matches", 0)) for entry in diagnostics]
    inliers = [float(entry.get("inliers", 0)) for entry in pose_pairs]
    baselines = [float(entry.get("baseline", 0.0)) for entry in diagnostics if entry.get("baseline") is not None]
    zero_inlier_pairs = sum(1 for entry in diagnostics if float(entry.get("inliers", 0)) <= 0.0)

    average_matches = float(np.mean(matches)) if matches else 0.0
    average_inliers = float(np.mean(inliers)) if inliers else 0.0
    median_baseline = float(np.median(baselines)) if baselines else 0.0

    inlier_score = float(np.clip(average_inliers / 72.0, 0.0, 1.0))
    match_score = float(np.clip(average_matches / 180.0, 0.0, 1.0))
    baseline_score = (
        float(np.clip(1.0 - min(abs(median_baseline - 0.22) / 0.22, 1.0), 0.0, 1.0))
        if baselines
        else 0.4
    )
    score = 100.0 * ((0.55 * pose_success_ratio) + (0.20 * inlier_score) + (0.15 * match_score) + (0.10 * baseline_score))

    warnings: List[str] = []
    if failed_pose_pairs:
        warnings.append(f"{len(failed_pose_pairs)} of {pair_count} camera transitions failed pose recovery outright.")
    if zero_inlier_pairs:
        warnings.append(f"{zero_inlier_pairs} transition(s) recovered zero pose inliers.")
    if pose_pairs and average_inliers < 24.0:
        warnings.append("Recovered camera poses are weak; add more overlap and stronger parallax between frames.")
    if pose_success_ratio < 0.6:
        warnings.append("Pose recovery is unstable; motion blur or repeated texture is likely hurting alignment.")

    return {
        "score": _round_float(score, 1),
        "pair_count": pair_count,
        "pose_pairs": len(pose_pairs),
        "verified_pose_pairs": len(verified_pose_pairs),
        "failed_pose_pairs": len(failed_pose_pairs),
        "fallback_pairs": 0,
        "zero_inlier_pairs": zero_inlier_pairs,
        "pose_success_ratio": _round_float(pose_success_ratio, 3),
        "average_matches": _round_float(average_matches, 1),
        "average_inliers": _round_float(average_inliers, 1),
        "median_baseline": _round_float(median_baseline, 3),
        "warnings": warnings,
    }


def _summarize_appearance(image_paths: List[Path]) -> Dict[str, Any]:
    signals = [_capture_appearance_signal(path) for path in image_paths]
    brightness_values = [entry["brightness_mean"] for entry in signals]
    saturation_values = [entry["saturation_mean"] for entry in signals]
    contrast_values = [entry["brightness_std"] for entry in signals]
    normalized_rgbs = np.asarray([entry["normalized_mean_rgb"] for entry in signals], dtype=np.float32)
    centroid = normalized_rgbs.mean(axis=0) if len(normalized_rgbs) else np.zeros(3, dtype=np.float32)
    color_offsets = np.linalg.norm(normalized_rgbs - centroid, axis=1) if len(normalized_rgbs) else np.zeros(0, dtype=np.float32)

    exposure_span = (max(brightness_values) - min(brightness_values)) if brightness_values else 0.0
    saturation_span = (max(saturation_values) - min(saturation_values)) if saturation_values else 0.0
    white_balance_span = float(color_offsets.max()) if len(color_offsets) else 0.0
    mean_brightness = float(np.mean(brightness_values)) if brightness_values else 0.0
    mean_saturation = float(np.mean(saturation_values)) if saturation_values else 0.0
    mean_contrast = float(np.mean(contrast_values)) if contrast_values else 0.0

    score = 100.0 - ((exposure_span * 180.0) + (white_balance_span * 260.0) + (saturation_span * 90.0))
    score = float(np.clip(score, 0.0, 100.0))

    warnings: List[str] = []
    if exposure_span > 0.16:
        warnings.append("Capture brightness shifts noticeably between frames; lock exposure for cleaner color fusion.")
    if white_balance_span > 0.11:
        warnings.append("White balance drifts across the capture set; color consistency will suffer.")
    if saturation_span > 0.18:
        warnings.append("Some frames are much flatter or punchier than others; appearance fusion is uneven.")

    return {
        "score": _round_float(score, 1),
        "mean_brightness": _round_float(mean_brightness, 3),
        "mean_saturation": _round_float(mean_saturation, 3),
        "mean_contrast": _round_float(mean_contrast, 3),
        "exposure_span": _round_float(exposure_span, 3),
        "white_balance_span": _round_float(white_balance_span, 3),
        "saturation_span": _round_float(saturation_span, 3),
        "warnings": warnings,
    }


def _quality_band(score: float) -> str:
    if score >= 85.0:
        return "excellent"
    if score >= 70.0:
        return "strong"
    if score >= 55.0:
        return "usable"
    return "fragile"


def _axis_status(score: float) -> str:
    if score >= 85.0:
        return "strong"
    if score >= 70.0:
        return "watch"
    return "critical"


def _build_quality_report(image_paths: List[Path], diagnostics: List[Dict[str, Any]]) -> Dict[str, Any]:
    alignment = _summarize_alignment(diagnostics, len(image_paths))
    appearance = _summarize_appearance(image_paths)
    capture_score = float(np.clip(len(image_paths) / 16.0, 0.0, 1.0) * 100.0)
    score = (0.55 * alignment["score"]) + (0.30 * appearance["score"]) + (0.15 * capture_score)

    warnings: List[str] = []
    for warning in [*alignment["warnings"], *appearance["warnings"]]:
        if warning not in warnings:
            warnings.append(warning)

    if len(image_paths) < 12:
        warnings.append("This reconstruction meets the minimum capture count, but more views will usually improve fidelity.")

    return {
        "score": _round_float(score, 1),
        "band": _quality_band(score),
        "capture_score": _round_float(capture_score, 1),
        "alignment": alignment,
        "appearance": appearance,
        "warnings": warnings[:5],
    }


def _build_capture_scorecard(frame_count: int, quality: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "status": "real_space_capture",
        "capture_mode": "overlapping_multiview_capture",
        "frame_count": frame_count,
        "target_contract": {
            "minimum_images": 16,
            "recommended_images": 24,
            "maximum_images": 40,
            "detail_pass_required": True,
            "locked_exposure_required": True,
            "height_variation_required": True,
        },
        "coverage_score": _round_float(float(quality.get("capture_score", 0.0)), 1),
        "quality_band": str(quality.get("band") or "fragile"),
        "warnings": list(quality.get("warnings") or []),
    }


def _build_sfm_report(frame_count: int, quality: Dict[str, Any]) -> Dict[str, Any]:
    alignment = quality.get("alignment") if isinstance(quality.get("alignment"), dict) else {}
    verified_pose_pairs = int(alignment.get("verified_pose_pairs", 0) or 0)
    pair_count = int(alignment.get("pair_count", max(frame_count - 1, 0)) or 0)
    return {
        "backend": "opencv_orb_essential",
        "status": "verified_local_alignment" if verified_pose_pairs == pair_count and pair_count > 0 else "insufficient_for_hero_delivery",
        "pair_count": pair_count,
        "pose_pairs": int(alignment.get("pose_pairs", 0) or 0),
        "verified_pose_pairs": verified_pose_pairs,
        "failed_pose_pairs": int(alignment.get("failed_pose_pairs", 0) or 0),
        "pose_success_ratio": _round_float(float(alignment.get("pose_success_ratio", 0.0) or 0.0), 3),
        "average_inliers": _round_float(float(alignment.get("average_inliers", 0.0) or 0.0), 1),
        "zero_inlier_pairs": int(alignment.get("zero_inlier_pairs", 0) or 0),
        "synthetic_camera_priors_used": False,
        "native_sfm": False,
        "warnings": list(alignment.get("warnings") or []),
    }


def _build_training_report(point_count: int, max_total_gaussians: int, max_per_view_gaussians: int) -> Dict[str, Any]:
    return {
        "backend": LOCAL_TRAINING_BACKEND,
        "kind": "hybrid_per_view_single_image_fusion",
        "native_gaussian_training": False,
        "artifact_format": "sharp_ply",
        "viewer_renderer": "sharp_gaussian_direct",
        "point_count": point_count,
        "caps": {
            "global_budget": max_total_gaussians,
            "per_view_budget": max_per_view_gaussians,
        },
        "world_class_ready": False,
        "summary": "This output fuses per-view SHARP predictions. It is not a native multi-view Gaussian optimization pass.",
    }


def _build_holdout_report() -> Dict[str, Any]:
    return {
        "status": "missing",
        "available": False,
        "metrics_available": False,
        "passed": False,
        "summary": "No calibrated holdout renders were produced for this reconstruction.",
        "required_for_promotion": True,
    }


def _build_comparison_report() -> Dict[str, Any]:
    return {
        "benchmark_status": "not_benchmarked",
        "benchmarked": False,
        "market_baselines": ["Polycam Space Mode", "Niantic Spatial Capture / Scaniverse"],
        "summary": "This scene has not been compared against the locked real-space benchmark set yet.",
    }


def _build_release_gates(
    frame_count: int,
    quality: Dict[str, Any],
    sfm_report: Dict[str, Any],
    training_report: Dict[str, Any],
    holdout_report: Dict[str, Any],
    comparison_report: Dict[str, Any],
) -> Dict[str, Any]:
    alignment = quality.get("alignment") if isinstance(quality.get("alignment"), dict) else {}
    checks = {
        "truthful_lane_label": True,
        "hero_capture_contract": frame_count >= 16,
        "verified_sfm": bool(sfm_report.get("verified_pose_pairs", 0)) and float(sfm_report.get("average_inliers", 0.0)) >= 24.0,
        "native_gaussian_training": bool(training_report.get("native_gaussian_training")),
        "holdout_metrics": bool(holdout_report.get("passed")),
        "benchmarked_against_market": bool(comparison_report.get("benchmarked")),
        "viewer_budget_verified": False,
        "no_synthetic_camera_priors": not bool(sfm_report.get("synthetic_camera_priors_used")),
        "stable_alignment": float(alignment.get("pose_success_ratio", 0.0) or 0.0) >= 0.85,
    }
    failed = [label.replace("_", " ") for label, passed in checks.items() if not passed]
    return {
        "status": "blocked" if failed else "passed",
        "hero_ready": False,
        "world_class_ready": False,
        "summary": "Promotion is blocked until native multiview training, holdout metrics, and market benchmark verification exist.",
        "checks": checks,
        "failed": failed,
    }


def _build_delivery_profile(
    frame_count: int,
    point_count: int,
    quality: Dict[str, Any],
    *,
    training_report: Dict[str, Any],
    holdout_report: Dict[str, Any],
) -> Dict[str, Any]:
    alignment_score = float(quality.get("alignment", {}).get("score", 0.0))
    appearance_score = float(quality.get("appearance", {}).get("score", 0.0))
    coverage_score = float(quality.get("capture_score", 0.0))
    density_score = float(np.clip(point_count / 280000.0, 0.0, 1.0) * 100.0)
    pose_success_ratio = float(quality.get("alignment", {}).get("pose_success_ratio", 0.0))
    average_inliers = float(quality.get("alignment", {}).get("average_inliers", 0.0) or 0.0)
    failed_pose_pairs = int(quality.get("alignment", {}).get("failed_pose_pairs", 0) or 0)
    readiness_score = (0.42 * alignment_score) + (0.28 * appearance_score) + (0.20 * coverage_score) + (0.10 * density_score)
    native_training = bool(training_report.get("native_gaussian_training"))
    holdout_available = bool(holdout_report.get("available"))

    if (
        native_training
        and holdout_available
        and readiness_score >= 90.0
        and frame_count >= 16
        and point_count >= 240000
        and pose_success_ratio >= 0.85
        and average_inliers >= 48.0
    ):
        readiness = "world_class_candidate"
        label = "World-class candidate"
        summary = "This scene clears capture, alignment, training, and holdout gates for hero-grade review."
        recommended_viewer_mode = "hero"
    elif native_training and holdout_available and readiness_score >= 82.0 and frame_count >= 12 and average_inliers >= 24.0:
        readiness = "production_ready"
        label = "Production ready"
        summary = "This scene is strong enough for serious review, but it still needs benchmark validation before hero delivery."
        recommended_viewer_mode = "desktop_high"
    elif frame_count >= 12 and alignment_score >= 72.0 and appearance_score >= 80.0 and average_inliers >= 24.0 and failed_pose_pairs == 0:
        readiness = "editorial"
        label = "Editorial hybrid"
        summary = "This hybrid reconstruction is usable for blocking and editorial review, but it is not benchmarked or hero-promotable."
        recommended_viewer_mode = "editor"
    else:
        readiness = "diagnostic"
        label = "Diagnostic hybrid"
        summary = "This scene is still diagnostic. Treat it as a hybrid reconstruction preview, not a faithful world build."
        recommended_viewer_mode = "lightweight"

    blocking_issues: List[str] = []
    next_actions: List[str] = []

    if frame_count < 16:
        blocking_issues.append("Capture count is still below the 12-16 view zone needed for hero-grade geometry.")
        next_actions.append("Capture 4-8 more overlapping views with height variation before the next hero pass.")
    if alignment_score < 80.0:
        blocking_issues.append("Camera solving is still the main geometry bottleneck in this scene.")
        next_actions.append("Upgrade pose solving and reject weak frame transitions before retraining the reconstruction.")
    if appearance_score < 80.0:
        blocking_issues.append("Color and exposure consistency are not yet stable enough for top-tier look development.")
        next_actions.append("Lock exposure and white balance, then normalize photometric drift across the capture set.")
    if point_count < 180000:
        blocking_issues.append("Splat density is still thin for a premium walkthrough experience.")
        next_actions.append("Raise Gaussian density or stream larger budgets instead of capping detail too early.")
    if failed_pose_pairs > 0:
        blocking_issues.append("At least one camera transition failed pose recovery and should block hero promotion.")
        next_actions.append("Move this capture set to the stronger SfM worker instead of synthesizing camera priors.")
    if not native_training:
        blocking_issues.append("Native multiview Gaussian training is not connected in this lane.")
        next_actions.append("Run this scene through the dedicated GPU worker with COLMAP, PixSfM, and native 3DGS training.")
    if not holdout_available:
        blocking_issues.append("Holdout renders are missing, so fidelity is not measured yet.")
        next_actions.append("Render calibrated holdout views and fail promotion automatically if they miss threshold.")
    if not next_actions:
        next_actions.append("Run holdout renders and move this scene into the hostile audit benchmark set.")

    preferred_point_budget = 280000 if recommended_viewer_mode == "hero" else 180000 if recommended_viewer_mode == "desktop_high" else 120000

    return {
        "score": _round_float(readiness_score, 1),
        "readiness": readiness,
        "label": label,
        "summary": summary,
        "recommended_viewer_mode": recommended_viewer_mode,
        "blocking_issues": blocking_issues[:4],
        "next_actions": next_actions[:4],
        "axes": {
            "geometry": {
                "score": _round_float(alignment_score, 1),
                "status": _axis_status(alignment_score),
                "note": "Camera solve stability and recovered geometry faithfulness.",
            },
            "color": {
                "score": _round_float(appearance_score, 1),
                "status": _axis_status(appearance_score),
                "note": "Exposure, white balance, contrast, and saturation consistency.",
            },
            "coverage": {
                "score": _round_float(coverage_score, 1),
                "status": _axis_status(coverage_score),
                "note": "How close the capture set is to the target multi-view coverage zone.",
            },
            "density": {
                "score": _round_float(density_score, 1),
                "status": _axis_status(density_score),
                "note": "Whether the splat density budget is high enough for a premium walkthrough.",
            },
        },
        "render_targets": {
            "desktop_fps": 60 if recommended_viewer_mode in {"hero", "desktop_high"} else 45,
            "mobile_fps": 30,
            "preferred_point_budget": preferred_point_budget,
        },
    }


def _subset_gaussians(gaussians: Gaussians3D, indices: torch.Tensor) -> Gaussians3D:
    return Gaussians3D(
        mean_vectors=gaussians.mean_vectors.index_select(1, indices),
        singular_values=gaussians.singular_values.index_select(1, indices),
        quaternions=gaussians.quaternions.index_select(1, indices),
        colors=gaussians.colors.index_select(1, indices),
        opacities=gaussians.opacities.index_select(1, indices),
    )


def _downsample_gaussians(gaussians: Gaussians3D, max_points: int) -> Gaussians3D:
    total_points = gaussians.mean_vectors.shape[1]
    if total_points <= max_points:
        return gaussians

    scores = gaussians.opacities.reshape(-1)
    top_indices = torch.topk(scores, k=max_points).indices.sort().values
    return _subset_gaussians(gaussians, top_indices)


def _merge_gaussians(parts: List[Gaussians3D]) -> Gaussians3D:
    return Gaussians3D(
        mean_vectors=torch.cat([part.mean_vectors for part in parts], dim=1),
        singular_values=torch.cat([part.singular_values for part in parts], dim=1),
        quaternions=torch.cat([part.quaternions for part in parts], dim=1),
        colors=torch.cat([part.colors for part in parts], dim=1),
        opacities=torch.cat([part.opacities for part in parts], dim=1),
    )


def _cache_single_view_environment(image_path: Path) -> Path:
    image_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()[:16]
    cache_dir = RECON_CACHE_DIR / image_hash
    output_dir = cache_dir / "environment"
    if (output_dir / "splats.ply").exists():
        return output_dir
    generate_environment(str(image_path), str(output_dir))
    return output_dir


def _camera_payload(transform: np.ndarray, name: str) -> Dict[str, Any]:
    rotation = transform[:3, :3]
    position = transform[:3, 3]
    forward = rotation @ np.array([0.0, 0.0, 1.0], dtype=np.float32)
    target = position + (forward * 2.0)
    return {
        "name": name,
        "position": position.astype(float).tolist(),
        "target": target.astype(float).tolist(),
        "fov": 50,
    }


def reconstruct_capture(
    image_paths: List[Path],
    output_dir: Path,
    *,
    max_total_gaussians: int = DEFAULT_MAX_TOTAL_GAUSSIANS,
    max_per_view_gaussians: int = DEFAULT_MAX_PER_VIEW_GAUSSIANS,
) -> Dict[str, Any]:
    if len(image_paths) < 2:
        raise ValueError("Need at least two images to reconstruct a fused scene.")

    output_dir.mkdir(parents=True, exist_ok=True)
    transformed_parts: List[Gaussians3D] = []
    diagnostics: List[Dict[str, Any]] = []
    transforms: List[np.ndarray] = [np.eye(4, dtype=np.float32)]
    metadata_example: Optional[Any] = None

    for index, image_path in enumerate(image_paths):
        if index > 0:
            relative = _estimate_relative_transform(image_paths[index - 1], image_path, index, len(image_paths))
            diagnostics.append({"pair": [image_paths[index - 1].name, image_path.name], **relative["diagnostic"]})
            if relative.get("transform") is None:
                reason = str(relative["diagnostic"].get("reason") or "failed_pose")
                raise RuntimeError(
                    f"Pose recovery failed between {image_paths[index - 1].name} and {image_path.name} ({reason}). "
                    "Add stronger overlap and parallax or move this capture to the dedicated SfM worker."
                )
            transforms.append(transforms[-1] @ relative["transform"])

        environment_dir = _cache_single_view_environment(image_path)
        gaussians, metadata = load_ply(environment_dir / "splats.ply")
        metadata_example = metadata
        reduced = _downsample_gaussians(gaussians, max_per_view_gaussians)
        transform_tensor = torch.from_numpy(transforms[index][:3]).float()
        transformed_parts.append(apply_transform(reduced, transform_tensor))

    merged = _merge_gaussians(transformed_parts)
    merged = _downsample_gaussians(merged, max_total_gaussians)
    quality = _build_quality_report(image_paths, diagnostics)

    if metadata_example is None:
        raise RuntimeError("Could not load SHARP metadata for reconstruction.")

    resolution = metadata_example.resolution_px
    save_ply(
        merged,
        metadata_example.focal_length_px,
        (resolution[1], resolution[0]),
        output_dir / "splats.ply",
    )

    cameras = [_camera_payload(transform, f"capture_{index:02d}") for index, transform in enumerate(transforms)]
    point_count = int(merged.mean_vectors.shape[1])
    capture = _build_capture_scorecard(len(image_paths), quality)
    sfm = _build_sfm_report(len(image_paths), quality)
    training = _build_training_report(point_count, max_total_gaussians, max_per_view_gaussians)
    holdout = _build_holdout_report()
    comparison = _build_comparison_report()
    release_gates = _build_release_gates(len(image_paths), quality, sfm, training, holdout, comparison)
    delivery = _build_delivery_profile(
        len(image_paths),
        point_count,
        quality,
        training_report=training,
        holdout_report=holdout,
    )
    metadata = {
        "generator": "gauset-sharp-fusion",
        "lane": "reconstruction",
        "mode": "hybrid_multiview",
        "model": "gauset-sharp-fusion-v1",
        "execution_mode": "real",
        "lane_truth": "hybrid_local_reconstruction_not_hero_ready",
        "capture_mode": "overlapping_multiview_capture",
        "reconstruction_status": "hybrid_local_diagnostic",
        "reconstruction_backend": "opencv_orb_essential",
        "training_backend": LOCAL_TRAINING_BACKEND,
        "benchmark_status": comparison["benchmark_status"],
        "input_strategy": f"{len(image_paths)} capture frames",
        "frame_count": len(image_paths),
        "point_count": point_count,
        "per_view_budget": max_per_view_gaussians,
        "global_budget": max_total_gaussians,
        "alignment": "opencv_orb_essential",
        "rendering": {
            "color_encoding": "sh_dc_rgb",
            "viewer_decode": f"srgb = clamp(f_dc * {SH_C0:.14f} + 0.5, 0, 1)",
            "has_explicit_vertex_colors": False,
        },
        "capture": capture,
        "sfm": sfm,
        "training": training,
        "holdout": holdout,
        "comparison": comparison,
        "release_gates": release_gates,
        "quality": quality,
        "delivery": delivery,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "inputs": [path.name for path in image_paths],
        "diagnostics": diagnostics,
    }

    (output_dir / "cameras.json").write_text(json.dumps(cameras, indent=2))
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (output_dir / "capture-scorecard.json").write_text(json.dumps(capture, indent=2))
    (output_dir / "holdout-report.json").write_text(json.dumps(holdout, indent=2))
    (output_dir / "benchmark-report.json").write_text(json.dumps(comparison, indent=2))

    return {
        "point_count": point_count,
        "frame_count": len(image_paths),
        "diagnostics": diagnostics,
        "capture": capture,
        "sfm": sfm,
        "training": training,
        "holdout": holdout,
        "comparison": comparison,
        "release_gates": release_gates,
        "quality": quality,
        "delivery": delivery,
    }
