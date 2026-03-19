"use client";

import { Box, ImageIcon, Loader2, Upload } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";
import { toProxyUrl } from "@/lib/mvp-api";

import { formatBandLabel, formatScore, truncateLabel } from "./leftPanelShared";

type LeftPanelCaptureWorkspaceProps = Pick<
    MvpWorkspaceIntakeController,
    | "addSelectedToCaptureSet"
    | "assetCapability"
    | "backendMode"
    | "backendWritesDisabled"
    | "captureBlockers"
    | "captureDuplicateRatioPercent"
    | "captureNextActions"
    | "captureQualitySummary"
    | "captureSession"
    | "captureSetBlocked"
    | "captureUniqueFrameCount"
    | "errorText"
    | "generateAsset"
    | "generatePreview"
    | "isGeneratingAsset"
    | "isGeneratingPreview"
    | "isStartingReconstruction"
    | "isUpdatingCapture"
    | "minimumCaptureImages"
    | "previewCapability"
    | "recommendedCaptureImages"
    | "reconstructionAvailable"
    | "reconstructionCapability"
    | "reconstructionButtonLabel"
    | "selectedUpload"
    | "selectedUploadAnalysis"
    | "selectedUploadId"
    | "setSelectedUploadId"
    | "startReconstruction"
    | "statusText"
    | "uploads"
> & {
    allowAssetActions?: boolean;
    previewButtonLabel?: string;
};

export function LeftPanelCaptureWorkspace({
    addSelectedToCaptureSet,
    allowAssetActions = false,
    assetCapability,
    backendMode,
    backendWritesDisabled,
    captureBlockers,
    captureDuplicateRatioPercent,
    captureNextActions,
    captureQualitySummary,
    captureSession,
    captureSetBlocked,
    captureUniqueFrameCount,
    errorText,
    generateAsset,
    generatePreview,
    isGeneratingAsset,
    isGeneratingPreview,
    isStartingReconstruction,
    isUpdatingCapture,
    minimumCaptureImages,
    previewCapability,
    recommendedCaptureImages,
    reconstructionAvailable,
    reconstructionCapability,
    reconstructionButtonLabel,
    selectedUpload,
    selectedUploadAnalysis,
    setSelectedUploadId,
    startReconstruction,
    statusText,
    uploads,
    previewButtonLabel = "Build world preview",
}: LeftPanelCaptureWorkspaceProps) {
    const reconstructionTruth =
        reconstructionCapability?.truth ??
        reconstructionCapability?.summary ??
        "Multi-view reconstruction is intentionally unavailable in this backend.";
    const reconstructionButtonClassName =
        captureSetBlocked || (reconstructionAvailable && !isStartingReconstruction)
            ? "mt-4 w-full rounded-2xl border border-amber-500/20 bg-amber-400/10 px-4 py-3 font-medium text-amber-100 transition-all disabled:opacity-50"
            : "mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-medium text-neutral-400 transition-all disabled:opacity-60";

    return (
        <>
            {statusText ? <p className="text-xs text-emerald-400 mb-4 whitespace-pre-wrap">{statusText}</p> : null}
            {errorText ? <p className="text-xs text-rose-400 mb-4 whitespace-pre-wrap">{errorText}</p> : null}

            {uploads.length > 0 ? (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-8">
                    <div
                        className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,38,0.76),rgba(10,14,19,0.9))] p-4"
                        data-testid="mvp-capture-tray"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Capture Tray</p>
                                <p className="mt-2 text-xs text-neutral-500">{uploads.length} uploaded photo{uploads.length === 1 ? "" : "s"}</p>
                            </div>
                            {selectedUpload ? (
                                <p className="text-[11px] text-neutral-400 truncate max-w-28 text-right">{selectedUpload.sourceName}</p>
                            ) : null}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            {uploads.map((upload) => {
                                const isSelected = upload.image_id === selectedUpload?.image_id;
                                return (
                                    <button
                                        key={upload.image_id}
                                        onClick={() => setSelectedUploadId(upload.image_id)}
                                        className={`relative aspect-square rounded-xl border bg-neutral-950 bg-cover bg-center text-left transition-all ${
                                            isSelected
                                                ? "border-blue-500/70 shadow-lg shadow-blue-950/30"
                                                : "border-neutral-800 hover:border-neutral-700"
                                        }`}
                                        style={{ backgroundImage: `url(${upload.previewUrl})` }}
                                        title={upload.sourceName}
                                    >
                                        {typeof upload.analysis?.technical_score === "number" ? (
                                            <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-1 text-[10px] text-white">
                                                {upload.analysis.technical_score.toFixed(0)}
                                            </span>
                                        ) : null}
                                        <span className="sr-only">{upload.sourceName}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedUpload && selectedUploadAnalysis ? (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Frame QC</p>
                                        <p className="mt-1 text-sm text-white">{selectedUploadAnalysis.cinematic_use ?? "Capture analysis"}</p>
                                    </div>
                                    {typeof selectedUploadAnalysis.technical_score === "number" ? (
                                        <div className="rounded-lg border border-neutral-800 bg-black/20 px-2.5 py-2 text-right">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Score</p>
                                            <p className="text-sm text-white">{selectedUploadAnalysis.technical_score.toFixed(1)}</p>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Sharpness {formatScore(selectedUploadAnalysis.sharpness_score)}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Exposure {formatScore(selectedUploadAnalysis.exposure_score)}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Contrast {formatScore(selectedUploadAnalysis.contrast_score)}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Grade {formatBandLabel(selectedUploadAnalysis.band)}
                                    </div>
                                </div>
                                {selectedUploadAnalysis.warnings?.length ? (
                                    <div className="mt-3 space-y-1">
                                        {selectedUploadAnalysis.warnings.map((warning) => (
                                            <p key={warning} className="text-[11px] text-amber-200">
                                                {warning}
                                            </p>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-3 text-[11px] text-emerald-300">
                                        This frame is strong enough for preview, asset work, or capture-set inclusion.
                                    </p>
                                )}
                            </div>
                        ) : selectedUpload?.source_type === "generated" ? (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Generated Source</p>
                                <p className="mt-2 text-sm text-white">
                                    {selectedUpload.provider ?? "Provider output"} · {selectedUpload.model ?? "default model"}
                                </p>
                                <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                                    {truncateLabel(selectedUpload.prompt, 120) || "Generated still ingested into the capture tray."}
                                </p>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={generatePreview}
                            disabled={!selectedUpload || isGeneratingPreview || isGeneratingAsset || backendMode === "offline" || backendWritesDisabled || !previewCapability?.available}
                            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-emerald-500 shadow-lg shadow-emerald-950/20"
                        >
                            {isGeneratingPreview ? <Loader2 className="animate-spin h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                            {isGeneratingPreview ? "Building world preview..." : previewButtonLabel}
                        </button>

                        <button
                            onClick={addSelectedToCaptureSet}
                            disabled={!selectedUpload || isUpdatingCapture || backendMode === "offline" || backendWritesDisabled}
                            className="w-full py-3.5 px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-medium flex items-center justify-center gap-2 transition-all border border-white/10 disabled:opacity-50 disabled:hover:bg-white/[0.04]"
                        >
                            {isUpdatingCapture ? <Loader2 className="animate-spin h-5 w-5" /> : <Upload className="h-5 w-5" />}
                            {isUpdatingCapture ? "Adding frame to capture set..." : "Add frame to capture set"}
                        </button>

                        {allowAssetActions ? (
                            <button
                                onClick={generateAsset}
                                disabled={!selectedUpload || isGeneratingPreview || isGeneratingAsset || backendMode === "offline" || backendWritesDisabled || !assetCapability?.available}
                                className="w-full py-3.5 px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-black font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-sky-500 shadow-lg shadow-sky-950/20"
                            >
                                {isGeneratingAsset ? <Loader2 className="animate-spin h-5 w-5" /> : <Box className="h-5 w-5" />}
                                {isGeneratingAsset ? "Extracting 3D asset..." : "Extract 3D asset"}
                            </button>
                        ) : (
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-[11px] leading-5 text-neutral-400">
                                Asset extraction stays out of the primary path until the first saved world unlocks studio controls.
                            </div>
                        )}
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,38,0.76),rgba(10,14,19,0.9))] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Capture Set</p>
                                <p className="mt-2 text-sm text-white">
                                    {captureSession ? `${captureSession.frame_count} / ${captureSession.recommended_images} views` : "Not started"}
                                </p>
                            </div>
                            <div className="text-right text-[11px] text-neutral-500">
                                <p>{minimumCaptureImages} minimum</p>
                                <p>{recommendedCaptureImages} recommended</p>
                            </div>
                        </div>

                        <div className="mt-4 h-2 rounded-full bg-neutral-950 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                                style={{ width: `${captureSession?.coverage_percent ?? 0}%` }}
                            />
                        </div>

                        <p className="mt-3 text-xs text-neutral-400">
                            {captureSession
                                ? captureSession.ready_for_reconstruction
                                    ? reconstructionAvailable
                                        ? "Capture minimum reached. Start reconstruction to build the fused scene."
                                        : "Capture minimum reached. Multi-view reconstruction stays on standby until the 8-32 photo lane is enabled."
                                    : captureSetBlocked
                                      ? captureBlockers[0] ??
                                        `Capture minimum reached, but only ${captureUniqueFrameCount} unique views are available.`
                                      : `Add ${Math.max(captureSession.minimum_images - captureSession.frame_count, 0)} more overlapping photos to reach the minimum capture set.`
                                : "Start collecting 8-32 overlapping photos or a short orbit video for faithful reconstruction."}
                        </p>

                        {captureQualitySummary ? (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Capture Quality</p>
                                        <p className="mt-1 text-sm text-white">
                                            {formatBandLabel(captureQualitySummary.readiness) ||
                                                formatBandLabel(captureQualitySummary.band) ||
                                                "pending"}
                                        </p>
                                        {captureQualitySummary.readiness ? (
                                            <p className="mt-1 text-[11px] text-neutral-500">
                                                {formatBandLabel(captureQualitySummary.band) || "pending"} operator grade
                                            </p>
                                        ) : null}
                                    </div>
                                    {typeof captureQualitySummary.score === "number" ? (
                                        <div className="rounded-lg border border-neutral-800 bg-black/20 px-2.5 py-2 text-right">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Score</p>
                                            <p className="text-sm text-white">{captureQualitySummary.score.toFixed(1)}</p>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Sharp frames {captureQualitySummary.sharp_frame_count ?? 0}/{captureQualitySummary.frame_count ?? 0}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Unique views {captureUniqueFrameCount}/{captureQualitySummary.frame_count ?? 0}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Coverage {formatScore(captureQualitySummary.coverage_score)}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Duplicates {captureQualitySummary.duplicate_frames ?? 0}
                                        {captureDuplicateRatioPercent !== null ? ` · ${captureDuplicateRatioPercent}%` : ""}
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2">
                                        Gate {formatBandLabel(captureQualitySummary.readiness) || "building"}
                                    </div>
                                </div>
                                {captureBlockers.length ? (
                                    <div className="mt-3 space-y-1">
                                        {captureBlockers.slice(0, 3).map((blocker) => (
                                            <p key={blocker} className="text-[11px] text-rose-200">
                                                {blocker}
                                            </p>
                                        ))}
                                    </div>
                                ) : null}
                                {captureQualitySummary.warnings?.length ? (
                                    <div className="mt-3 space-y-1">
                                        {captureQualitySummary.warnings.map((warning) => (
                                            <p key={warning} className="text-[11px] text-amber-200">
                                                {warning}
                                            </p>
                                        ))}
                                    </div>
                                ) : captureSession?.frame_count ? (
                                    <p className="mt-3 text-[11px] text-emerald-300">
                                        Capture set quality is trending in the right direction for a cleaner reconstruction pass.
                                    </p>
                                ) : null}
                                {captureNextActions.length ? (
                                    <div className="mt-3 space-y-1">
                                        {captureNextActions.slice(0, 3).map((action) => (
                                            <p key={action} className="text-[11px] text-sky-200">
                                                {action}
                                            </p>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {captureSession?.guidance?.length ? (
                            <div className="mt-3 space-y-1 text-[11px] text-neutral-500">
                                {captureSession.guidance.slice(0, 2).map((tip) => (
                                    <p key={tip}>{tip}</p>
                                ))}
                            </div>
                        ) : null}

                        {captureSession?.frames?.length ? (
                            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                                {captureSession.frames.map((frame) => (
                                    <div key={frame.image_id} className="shrink-0">
                                        <div
                                            className="h-16 w-16 rounded-lg border border-neutral-800 bg-neutral-950 bg-cover bg-center"
                                            style={{ backgroundImage: `url(${toProxyUrl(frame.url)})` }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {!reconstructionAvailable ? (
                            <div
                                className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[11px] leading-5 text-amber-100"
                                data-testid="mvp-reconstruction-truth"
                            >
                                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-50">Capture-only mode</p>
                                <p className="mt-2">{reconstructionTruth}</p>
                            </div>
                        ) : null}

                        <button
                            onClick={startReconstruction}
                            disabled={
                                !captureSession ||
                                !captureSession.ready_for_reconstruction ||
                                !reconstructionAvailable ||
                                isStartingReconstruction
                            }
                            className={reconstructionButtonClassName}
                        >
                            {reconstructionButtonLabel}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,38,0.7),rgba(10,14,19,0.86))] p-4 text-xs text-neutral-400">
                    Start with one clear still or a small overlapping capture orbit. Build the first world first, then unlock deeper studio actions after the first save.
                </div>
            )}
        </>
    );
}
