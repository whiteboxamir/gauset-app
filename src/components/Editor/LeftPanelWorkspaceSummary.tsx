"use client";

import { AlertTriangle, ArrowLeft, Cpu, Loader2, ShieldCheck } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";

import type { LeftPanelPreviewWorkspaceNavigation } from "./leftPanelShared";

type LeftPanelWorkspaceSummaryProps = Pick<
    MvpWorkspaceIntakeController,
    | "assetCapability"
    | "backendMessage"
    | "backendMode"
    | "benchmarkStatusLabel"
    | "captureSession"
    | "minimumCaptureImages"
    | "previewCapability"
    | "recommendedCaptureImages"
    | "reconstructionBackendName"
    | "reconstructionCapability"
    | "releaseGateFailureCount"
    | "selectedUpload"
    | "setupTruth"
> & {
    clarityMode?: boolean;
    previewWorkspaceNavigation?: LeftPanelPreviewWorkspaceNavigation | null;
};

export function LeftPanelWorkspaceSummary({
    assetCapability,
    backendMessage,
    backendMode,
    benchmarkStatusLabel,
    captureSession,
    clarityMode = false,
    minimumCaptureImages,
    previewCapability,
    previewWorkspaceNavigation = null,
    recommendedCaptureImages,
    reconstructionBackendName,
    reconstructionCapability,
    releaseGateFailureCount,
    selectedUpload,
    setupTruth,
}: LeftPanelWorkspaceSummaryProps) {
    const laneCards = [
        {
            key: "preview",
            title: previewCapability?.label ?? "Instant Preview",
            summary: previewCapability?.summary ?? "Generate a quick single-photo splat preview.",
            truth: previewCapability?.truth ?? "Single-photo preview output.",
            available: Boolean(previewCapability?.available),
        },
        {
            key: "reconstruction",
            title: reconstructionCapability?.label ?? "Production Reconstruction",
            summary: reconstructionCapability?.summary ?? "Collect a multi-view capture set for faithful 3D.",
            truth: reconstructionCapability?.truth ?? "Needs a dedicated GPU reconstruction worker.",
            available: Boolean(reconstructionCapability?.available),
        },
        {
            key: "asset",
            title: assetCapability?.label ?? "Single-Image Asset",
            summary: assetCapability?.summary ?? "Generate an object asset from one photo.",
            truth: assetCapability?.truth ?? "Object-focused generation lane.",
            available: Boolean(assetCapability?.available),
        },
    ] as const;
    const connectedLaneCount = laneCards.filter((lane) => lane.available).length;
    const hasWorldLoaded = Boolean(selectedUpload || (captureSession?.frame_count ?? 0) > 0);
    const workspaceStatusLabel =
        backendMode === "ready"
            ? connectedLaneCount === laneCards.length
                ? "All lanes online"
                : "Limited lane coverage"
            : backendMode === "degraded"
              ? "Lane needs attention"
              : backendMode === "offline"
                ? "Services offline"
                : "Checking services";
    const workspaceStatusSummary =
        backendMode === "ready"
            ? connectedLaneCount === laneCards.length
                ? "Preview, reconstruction, and asset are connected for this session."
                : `${connectedLaneCount} of ${laneCards.length} production modes are connected. You can keep scouting while the missing lane recovers.`
            : backendMode === "degraded"
              ? "GAUSET is responding, but one production lane still needs attention."
              : backendMode === "offline"
                ? "The app cannot see local services yet. Reconnect them to intake stills and build the world."
                : "Confirming the current backend, storage, and lane capabilities.";
    const backendStatusDetail =
        backendMessage && backendMessage !== setupTruth && backendMessage !== workspaceStatusSummary ? backendMessage : "";
    const nextStep = selectedUpload
        ? {
              title: "Send the selected still into the right mode",
              body: reconstructionCapability?.available
                  ? "Use Preview for a fast scout pass, Asset for extraction, or keep stacking overlap for a faithful reconstruction."
                  : "You can still judge frame quality and build the capture set while the missing worker is restored.",
          }
        : captureSession?.ready_for_reconstruction
          ? {
                title: reconstructionCapability?.available ? "Kick off reconstruction" : "Capture set is ready",
                body: reconstructionCapability?.available
                    ? "You have enough overlap to move from scout stills into a faithful world build."
                    : "Your capture set is ready, but the reconstruction worker still needs to come online.",
            }
          : {
                title: "Start with the location",
                body:
                    backendMode === "offline"
                        ? "Reconnect local services, then import one hero still or a small orbit set to start building the scene."
                        : "Import a hero still for preview or asset work, or begin a multi-view capture set for reconstruction.",
            };
    const workspaceBadgeLabel =
        backendMode === "ready"
            ? connectedLaneCount === laneCards.length
                ? "Ready"
                : "Limited"
            : backendMode === "degraded"
              ? "Attention"
              : backendMode === "offline"
                ? "Offline"
                : "Checking";
    const backendCardClassName =
        clarityMode
            ? backendMode === "ready"
                ? "border-emerald-400/20 bg-[linear-gradient(180deg,rgba(8,22,19,0.96),rgba(6,10,12,0.96))]"
                : backendMode === "degraded"
                  ? "border-amber-400/20 bg-[linear-gradient(180deg,rgba(25,18,9,0.96),rgba(10,8,6,0.96))]"
                  : backendMode === "offline"
                    ? "border-rose-400/20 bg-[linear-gradient(180deg,rgba(26,12,14,0.96),rgba(11,6,8,0.96))]"
                    : "border-white/10 bg-[linear-gradient(180deg,rgba(12,17,25,0.96),rgba(7,10,15,0.96))]"
            : backendMode === "ready"
              ? "border-emerald-900/40 bg-emerald-950/20"
              : backendMode === "degraded"
                ? "border-amber-900/40 bg-amber-950/20"
                : backendMode === "offline"
                  ? "border-rose-900/40 bg-rose-950/20"
                  : "border-neutral-800 bg-neutral-900/60";
    const backendBadgeClassName =
        backendMode === "ready"
            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
            : backendMode === "degraded"
              ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
              : backendMode === "offline"
                ? "border-rose-300/25 bg-rose-400/10 text-rose-100"
              : "border-cyan-300/25 bg-cyan-400/12 text-cyan-50";
    const activeSourceLabel = selectedUpload
        ? `${selectedUpload.source_type === "generated" ? "Generated still" : "Imported still"} · ${selectedUpload.sourceName}`
        : (captureSession?.frame_count ?? 0) > 0
          ? `${captureSession?.frame_count ?? 0} view${(captureSession?.frame_count ?? 0) === 1 ? "" : "s"} in capture set`
          : "No world source loaded yet";
    const laneAvailabilityLabel =
        connectedLaneCount === laneCards.length
            ? "All intake lanes available"
            : `${connectedLaneCount}/${laneCards.length} lanes available`;
    const availableLaneTitles =
        laneCards
            .filter((lane) => lane.available)
            .map((lane) => lane.title)
            .join(" · ") || "Waiting for backend handshake";
    const nextStepLabel = hasWorldLoaded
        ? nextStep.title
        : backendMode === "offline"
          ? "Reconnect services, then bring in a hero still"
          : "Bring in a hero still or a small orbit set";
    const topSummaryLine = hasWorldLoaded
        ? workspaceStatusSummary
        : backendMode === "offline"
          ? "Reconnect intake services, then start with one clear source input."
          : "Keep the opening move simple: bring in a hero still or a small capture orbit.";
    const attentionDetail =
        backendMode === "offline"
            ? "Local services are offline, so intake actions stay in standby until the backend reconnects."
            : backendMode === "degraded"
              ? "One production lane still needs attention, but you can keep moving in the available paths."
              : releaseGateFailureCount > 0
                ? `${releaseGateFailureCount} tracked release gate${releaseGateFailureCount === 1 ? "" : "s"} currently need attention.`
                : "";
    const reconstructionWorkerLabel = reconstructionBackendName
        ? reconstructionBackendName.replaceAll("_", " ")
        : "Waiting on worker";
    const showPreviewWorkspaceNavigation = clarityMode && Boolean(previewWorkspaceNavigation);
    const intakeReadinessLabel =
        (captureSession?.frame_count ?? 0) > 0
            ? `${captureSession?.frame_count ?? 0} / ${recommendedCaptureImages} views`
            : `${minimumCaptureImages} minimum / ${recommendedCaptureImages} target`;
    const intakeReadinessDetail = captureSession?.ready_for_reconstruction
        ? "Enough overlap is in place to start reconstruction."
        : "Keep collecting overlap until the capture set is ready.";
    const systemWatchDetail =
        backendMode === "ready" ? `${benchmarkStatusLabel} · ${reconstructionWorkerLabel}` : backendStatusDetail || setupTruth || workspaceStatusSummary;
    const shouldUseLightBrief = !hasWorldLoaded || backendMode === "offline";

    return (
        <>
            {showPreviewWorkspaceNavigation ? (
                <div
                    className="sticky top-0 z-20 mb-4 rounded-[24px] border border-white/12 bg-[linear-gradient(180deg,rgba(10,16,24,0.96),rgba(7,11,17,0.98))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                    data-testid="mvp-preview-workspace-nav"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-100/90">MVP preview</p>
                            <p className="mt-2 text-base font-semibold tracking-tight text-white">
                                {previewWorkspaceNavigation?.title ?? "Current workspace"}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-neutral-400">
                                {previewWorkspaceNavigation?.note ?? "Back to start keeps this workspace in memory."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={previewWorkspaceNavigation?.onBackToStart}
                            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                            data-testid="mvp-preview-back-to-start"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back to start
                        </button>
                    </div>
                </div>
            ) : (
                <section
                    className={`mb-4 rounded-[22px] border px-4 py-4 shadow-[0_14px_32px_rgba(0,0,0,0.18)] ${backendCardClassName}`}
                    data-testid="mvp-session-status"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">World intake</p>
                                {hasWorldLoaded ? (
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-neutral-300">
                                        Active
                                    </span>
                                ) : null}
                            </div>
                            <h2 className="mt-2 text-[17px] font-medium tracking-[-0.03em] text-white" data-testid="mvp-shell-title">
                                {activeSourceLabel}
                            </h2>
                            <p className="mt-1 text-[12px] leading-5 text-neutral-400">{topSummaryLine}</p>
                        </div>
                        <span
                            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${backendBadgeClassName}`}
                        >
                            {workspaceBadgeLabel}
                        </span>
                    </div>

                    {shouldUseLightBrief ? (
                        <div className="mt-4 text-[12px] leading-6 text-neutral-300">
                            <p className="text-base font-medium tracking-[-0.02em] text-white">{nextStepLabel}</p>
                            <p className="mt-2">{nextStep.body}</p>
                        </div>
                    ) : (
                        <div className="mt-4 border-t border-white/8 pt-4">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Primary next move</p>
                            <p className="mt-2 text-base font-medium tracking-[-0.02em] text-white">{nextStepLabel}</p>
                            <p className="mt-2 text-[12px] leading-6 text-neutral-300">{nextStep.body}</p>
                        </div>
                    )}

                    {shouldUseLightBrief ? (
                        <div className="mt-3 text-[11px] leading-5 text-neutral-400">
                            <p>{backendMode === "offline" ? systemWatchDetail : availableLaneTitles}</p>
                        </div>
                    ) : (
                        <div className="mt-4 overflow-hidden rounded-[18px] border border-white/8 bg-black/10">
                            <div className="px-3.5 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Lane availability</p>
                                <p className="mt-1 text-sm text-white">{laneAvailabilityLabel}</p>
                                <p className="mt-1 text-[11px] leading-5 text-neutral-500">{availableLaneTitles}</p>
                            </div>
                            <div className="border-t border-white/8 px-3.5 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Capture readiness</p>
                                <p className="mt-1 text-sm text-white">{intakeReadinessLabel}</p>
                                <p className="mt-1 text-[11px] leading-5 text-neutral-500">{intakeReadinessDetail}</p>
                            </div>
                            <div className="border-t border-white/8 px-3.5 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">System watch</p>
                                <p className="mt-1 text-sm text-white">{workspaceStatusLabel}</p>
                                <p className="mt-1 text-[11px] leading-5 text-neutral-500">{systemWatchDetail}</p>
                            </div>
                        </div>
                    )}

                    {attentionDetail && !shouldUseLightBrief ? (
                        <div className="mt-3 flex items-start gap-2 rounded-[16px] border border-white/8 bg-black/10 px-3.5 py-3 text-[11px] leading-5 text-neutral-300">
                            {backendMode === "degraded" ? (
                                <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />
                            ) : backendMode === "ready" ? (
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            ) : (
                                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-neutral-400" />
                            )}
                            <p>{attentionDetail}</p>
                        </div>
                    ) : null}
                </section>
            )}
        </>
    );
}
