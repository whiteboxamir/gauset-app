"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Cpu, Loader2, ShieldCheck } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";
import type { WorkspaceLaunchSourceKind } from "@/app/mvp/_hooks/mvpWorkspaceSessionShared";

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
    journeyStage?: "start" | "unsaved" | "saved";
    launchProjectId?: string | null;
    launchSourceKind?: WorkspaceLaunchSourceKind | null;
    previewWorkspaceNavigation?: LeftPanelPreviewWorkspaceNavigation | null;
};

function describeLaunchSource(launchSourceKind?: WorkspaceLaunchSourceKind | null) {
    switch (launchSourceKind) {
        case "upload":
            return {
                title: "Scout stills selected",
                openingSummary: "Scout stills are already attached to this start.",
                nextStepLabel: "Import scout stills",
            };
        case "capture_session":
            return {
                title: "Capture path selected",
                openingSummary: "Capture is already attached to this start.",
                nextStepLabel: "Start capture",
            };
        case "external_world_package":
            return {
                title: "External world selected",
                openingSummary: "An external world package is already attached to this start.",
                nextStepLabel: "Import external world",
            };
        case "third_party_world_model_output":
            return {
                title: "Third-party world selected",
                openingSummary: "A third-party world output is already attached to this start.",
                nextStepLabel: "Import third-party world",
            };
        case "provider_generated_still":
            return {
                title: "Generated still selected",
                openingSummary: "A generated still is already attached to this start.",
                nextStepLabel: "Continue with generated still",
            };
        case "linked_scene_version":
            return {
                title: "Linked world selected",
                openingSummary: "This project is reopening a linked world.",
                nextStepLabel: "Reopen the linked world",
            };
        case "demo_world":
            return {
                title: "Demo world selected",
                openingSummary: "The demo path is ready.",
                nextStepLabel: "Open the demo world",
            };
        default:
            return null;
    }
}

export function LeftPanelWorkspaceSummary({
    assetCapability,
    backendMessage,
    backendMode,
    benchmarkStatusLabel,
    captureSession,
    clarityMode = false,
    journeyStage = "start",
    launchProjectId = null,
    launchSourceKind = null,
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
    const isFirstWorldStage = journeyStage === "start";
    const launchSource = describeLaunchSource(launchSourceKind);
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
                : "Limited lanes"
            : backendMode === "degraded"
              ? "Lane needs attention"
              : backendMode === "offline"
                ? "Services offline"
                : "Checking services";
    const workspaceStatusSummary =
        backendMode === "ready"
            ? connectedLaneCount === laneCards.length
                ? "Preview, reconstruction, and asset are connected."
                : `${connectedLaneCount} of ${laneCards.length} lanes are connected.`
            : backendMode === "degraded"
              ? "One production lane needs attention."
              : backendMode === "offline"
                ? "The app cannot see local services yet. Reconnect them to intake stills and build the world."
              : "Checking backend and lane availability.";
    const backendStatusDetail =
        backendMessage && backendMessage !== setupTruth && backendMessage !== workspaceStatusSummary ? backendMessage : "";
    const nextStep = selectedUpload
        ? {
              title: "Build from the selected still",
              body: reconstructionCapability?.available
                  ? "Use preview for a fast scout pass, or keep stacking overlap for a fuller reconstruction."
                  : "You can still judge the frame and keep building the capture set while the worker is restored.",
          }
        : captureSession?.ready_for_reconstruction
          ? {
                title: reconstructionCapability?.available ? "Start reconstruction" : "Capture set ready",
                body: reconstructionCapability?.available
                    ? "You have enough overlap to move into a faithful world build."
                    : "The capture set is ready, but the reconstruction worker is still offline.",
            }
          : {
                title: isFirstWorldStage ? "Choose one source path" : "Start with the location",
                body:
                    backendMode === "offline"
                        ? "Reconnect local services, then import one hero still or a small orbit set."
                        : launchProjectId && isFirstWorldStage
                          ? "This workspace is already attached to one project world record. Choose the first source, then save once to anchor the continuity record."
                        : isFirstWorldStage
                          ? "Pick one clear source, then build the first world before thinking about review or handoff."
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
          : launchSource
            ? launchSource.title
          : launchProjectId
            ? "Project-linked world start"
          : isFirstWorldStage
            ? "No source chosen yet"
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
          : launchProjectId && isFirstWorldStage
            ? "Choose the first source"
          : isFirstWorldStage && launchSource
            ? launchSource.nextStepLabel
          : isFirstWorldStage
            ? "Choose one source"
            : "Bring in a hero still or a small orbit set";
    const topSummaryLine = hasWorldLoaded
        ? workspaceStatusSummary
        : backendMode === "offline"
          ? "Reconnect intake services, then start with one clear source input."
          : launchProjectId && isFirstWorldStage
            ? "This project route is already attached to one durable world record."
          : isFirstWorldStage && launchSource
            ? launchSource.openingSummary
          : isFirstWorldStage
            ? "Choose one source path, then build the first world."
            : "Bring in a hero still or a small capture orbit.";
    const attentionDetail =
        backendMode === "offline"
            ? "Local services are offline, so intake actions stay in standby until the backend reconnects."
            : backendMode === "degraded"
              ? "One production lane still needs attention, but the available path is still usable."
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
    const shouldUseLightBrief = isFirstWorldStage || !hasWorldLoaded || backendMode === "offline";

    return (
        <>
            {showPreviewWorkspaceNavigation ? (
                <div
                    className="sticky top-0 z-20 mb-4 rounded-[24px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(22,28,34,0.96),rgba(16,20,24,0.98))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl"
                    data-testid="mvp-preview-workspace-nav"
                >
                    <div className="flex flex-col gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#bfd6de]/78">
                                {previewWorkspaceNavigation?.eyebrow ?? "Preview"}
                            </p>
                            <p className="mt-2 text-base font-semibold tracking-tight text-white">
                                {previewWorkspaceNavigation?.title ?? "Current workspace"}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-neutral-400">
                                {previewWorkspaceNavigation?.note ?? "Return to the prior step without breaking this workspace."}
                            </p>
                        </div>
                        {previewWorkspaceNavigation?.backToStartHref ? (
                            <Link
                                href={previewWorkspaceNavigation.backToStartHref}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                data-testid="mvp-preview-back-to-start"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                {previewWorkspaceNavigation?.backLabel ?? "Back to start"}
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={previewWorkspaceNavigation?.onBackToStart}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                data-testid="mvp-preview-back-to-start"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                {previewWorkspaceNavigation?.backLabel ?? "Back to start"}
                            </button>
                        )}
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
                            <p>{isFirstWorldStage ? "The focused path stays simple first. Deeper system status is available below if you need it." : backendMode === "offline" ? systemWatchDetail : availableLaneTitles}</p>
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

                    {isFirstWorldStage ? (
                        <details className="mt-3 rounded-[16px] border border-white/8 bg-black/10">
                            <summary className="cursor-pointer list-none px-3.5 py-3 text-[11px] font-medium text-neutral-300 marker:content-none">
                                Inspect system status
                            </summary>
                            <div className="space-y-3 border-t border-white/8 px-3.5 py-3 text-[11px] leading-5 text-neutral-400">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Lane availability</p>
                                    <p className="mt-1 text-white">{laneAvailabilityLabel}</p>
                                    <p className="mt-1">{availableLaneTitles}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Capture readiness</p>
                                    <p className="mt-1 text-white">{intakeReadinessLabel}</p>
                                    <p className="mt-1">{intakeReadinessDetail}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">System watch</p>
                                    <p className="mt-1 text-white">{workspaceStatusLabel}</p>
                                    <p className="mt-1">{systemWatchDetail}</p>
                                </div>
                            </div>
                        </details>
                    ) : null}
                </section>
            )}
        </>
    );
}
