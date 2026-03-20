"use client";

import React, { useMemo } from "react";
import { ChevronDown, Download, Share2 } from "lucide-react";

import { describeWorkspaceContinuity } from "@/app/mvp/_lib/clarity";
import { describeEnvironment, type GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import type { SceneReviewRecord, WorkspaceSceneGraph } from "@/lib/mvp-workspace";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";

import {
    activityToneClass,
    formatApprovalState,
    formatMetric,
    formatQualityBand,
    formatTimestamp,
    statusClassName,
    type RightPanelActivityEntry,
    type RightPanelChangeSummary,
    type SaveState,
    type SceneVersion,
} from "./rightPanelShared";

function formatWorkspaceOriginLabel(origin: "blank" | "demo" | "draft" | "linked_version" | "linked_environment") {
    switch (origin) {
        case "demo":
            return "Demo world";
        case "draft":
            return "Local draft";
        case "linked_version":
            return "Project-linked saved version";
        case "linked_environment":
            return "Project-linked stored world";
        case "blank":
        default:
            return "Blank workspace";
    }
}

export const RightPanelWorkspaceOverviewSection = React.memo(function RightPanelWorkspaceOverviewSection({
    activityLog,
    activeScene,
    changeSummary,
    draftSceneId,
    canCopyReviewLink,
    lastOutputLabel,
    isCreatingReviewLink,
    lastSavedAt,
    onCopyReviewLink,
    onExportScenePackage,
    onRestoreVersion,
    saveError,
    saveMessage,
    saveState,
    sceneDocument,
    environment,
    directorBrief,
    launchSceneId,
    linkedLaunchMessage,
    linkedLaunchStatus,
    reviewData,
    selectedVersion,
    shareStatus,
    versions,
    viewCount,
    noteCount,
    workspaceOrigin,
    workspaceOriginDetail,
    journeyStage,
    isAdvancedDensityEnabled,
}: {
    activityLog: RightPanelActivityEntry[];
    activeScene: string | null;
    changeSummary?: RightPanelChangeSummary | null;
    draftSceneId: string | null;
    canCopyReviewLink: boolean;
    lastOutputLabel?: string;
    isCreatingReviewLink: boolean;
    lastSavedAt: string | null;
    onCopyReviewLink: () => void;
    onExportScenePackage: () => void;
    onRestoreVersion: (versionId: string) => Promise<any> | void;
    saveError: string;
    saveMessage: string;
    saveState: SaveState;
    sceneDocument: SceneDocumentV2;
    environment: WorkspaceSceneGraph["environment"];
    directorBrief: string;
    launchSceneId: string | null;
    linkedLaunchMessage: string;
    linkedLaunchStatus: "idle" | "opening" | "opened" | "unavailable";
    reviewData: SceneReviewRecord;
    selectedVersion: SceneVersion | null;
    shareStatus: string;
    versions: SceneVersion[];
    viewCount: number;
    noteCount: number;
    workspaceOrigin: "blank" | "demo" | "draft" | "linked_version" | "linked_environment";
    workspaceOriginDetail: string;
    journeyStage: "start" | "unsaved" | "saved";
    isAdvancedDensityEnabled: boolean;
}) {
    const hasSavedVersion = versions.length > 0 || Boolean(lastSavedAt);
    const isAnchored = hasSavedVersion;
    const continuity = useMemo(() => describeWorkspaceContinuity(sceneDocument), [sceneDocument]);
    const environmentState = useMemo(() => describeEnvironment(environment), [environment]);
    const environmentMetadata = useMemo(() => (environment?.metadata ?? null) as GeneratedEnvironmentMetadata | null, [environment]);
    const environmentQuality = environmentMetadata?.quality;
    const environmentDelivery = environmentMetadata?.delivery;
    const environmentCapture = environmentMetadata?.capture;
    const environmentTraining = environmentMetadata?.training;
    const environmentHoldout = environmentMetadata?.holdout;
    const environmentComparison = environmentMetadata?.comparison;
    const environmentReleaseGates = environmentMetadata?.release_gates;
    const environmentWarnings = Array.isArray(environmentQuality?.warnings) ? environmentQuality.warnings : [];
    const environmentBlockingIssues = Array.isArray(environmentDelivery?.blocking_issues) ? environmentDelivery.blocking_issues : [];
    const environmentNextActions = Array.isArray(environmentDelivery?.next_actions) ? environmentDelivery.next_actions : [];
    const environmentGateFailures = Array.isArray(environmentReleaseGates?.failed) ? environmentReleaseGates.failed : [];
    const reviewContextLabel =
        reviewData.metadata.scene_title || reviewData.metadata.project_name || (activeScene ? "Workspace review" : "Draft workspace");
    const reviewSummary = isAnchored
        ? [
              `${versions.length} saved version${versions.length === 1 ? "" : "s"}`,
              `${reviewData.issues.length} review item${reviewData.issues.length === 1 ? "" : "s"}`,
              selectedVersion ? `anchor ${formatTimestamp(selectedVersion.saved_at) || selectedVersion.version_id}` : null,
          ]
              .filter(Boolean)
              .join(" · ")
        : "Save once to anchor review links, continuity memory, restore points, and delivery.";
    const reviewDeliverySummary = isAnchored
        ? selectedVersion
            ? "Copy review link and export both stay pinned to the selected saved version."
            : versions.length > 0
              ? "Select a saved version before creating a secure review link or version-locked handoff."
              : "Save again before expecting a version-locked review handoff."
        : "Review share and downstream handoff stay locked until the first saved version exists.";
    const primaryReviewItems = isAnchored
        ? [
              {
                  label: "Review",
                  value: formatApprovalState(reviewData.approval.state),
                  detail: reviewContextLabel,
              },
              {
                  label: "Versions",
                  value: `${versions.length} saved`,
                  detail: selectedVersion
                      ? `Anchored to ${formatTimestamp(selectedVersion.saved_at) || selectedVersion.version_id}`
                      : versions.length > 0
                        ? "Choose the saved version that should drive review and export actions."
                        : "Waiting for the first saved version.",
              },
              {
                  label: "Export",
                  value: lastOutputLabel ?? "Draft package",
                  detail: "Ready for package export or review handoff.",
              },
          ]
        : [
              {
                  label: "State",
                  value: "Awaiting first save",
                  detail: draftSceneId ? `Draft in memory · ${draftSceneId}` : "This scene is still living as a draft.",
              },
              {
                  label: "Review",
                  value: "Not anchored yet",
                  detail: "Approvals, review links, and restore points unlock after the first save.",
              },
              {
                  label: "Export",
                  value: lastOutputLabel ?? "Draft package",
                  detail: "You can still export a draft package while the scene remains unsaved.",
              },
          ];
    const hasDiagnostics =
        Boolean(saveError) ||
        activityLog.length > 0 ||
        Boolean(changeSummary) ||
        Boolean(environmentMetadata?.rendering) ||
        Boolean(environmentQuality) ||
        Boolean(environmentDelivery) ||
        Boolean(environmentCapture) ||
        Boolean(environmentTraining) ||
        Boolean(environmentHoldout) ||
        Boolean(environmentComparison) ||
        Boolean(environmentReleaseGates) ||
        Boolean(workspaceOriginDetail) ||
        linkedLaunchStatus !== "idle";
    const showDiagnostics = isAnchored ? hasDiagnostics : Boolean(saveError) || linkedLaunchStatus !== "idle";

    return (
        <div className="shrink-0 space-y-3 border-b border-neutral-800/80 p-4">
            <div
                className={`rounded-[1.05rem] border px-4 py-4 ${
                    isAnchored
                        ? "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))]"
                        : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),rgba(255,255,255,0.006))]"
                }`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">{isAnchored ? "Review anchor" : "Draft state"}</p>
                        <p className="mt-2 text-base font-medium tracking-[-0.02em] text-white">{reviewContextLabel}</p>
                        <p className="mt-2 text-[12px] leading-5 text-neutral-400">{reviewSummary}</p>
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${statusClassName(saveState)}`}>
                        {saveState === "error" ? "Unsynced" : isAnchored ? "Anchored" : "Draft"}
                    </div>
                </div>

                {isAnchored ? (
                    <>
                        <div className="mt-4 overflow-hidden rounded-[0.95rem] bg-black/15">
                            {primaryReviewItems.map((item) => (
                                <div
                                    key={item.label}
                                    className="border-b border-white/8 px-3 py-3 last:border-b-0"
                                >
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{item.label}</p>
                                    <div className="mt-2">
                                        <p className="text-sm text-white">{item.value}</p>
                                        <p className="mt-1 text-[11px] leading-5 text-neutral-500">{item.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-2">
                            <button
                                onClick={onCopyReviewLink}
                                disabled={!canCopyReviewLink || isCreatingReviewLink}
                                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                                    !canCopyReviewLink || isCreatingReviewLink
                                        ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-neutral-500"
                                        : "border-white/10 bg-white/5 text-white hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-sky-100"
                                }`}
                            >
                                <Share2 className="h-3.5 w-3.5" />
                                {isCreatingReviewLink ? "Creating review link..." : "Copy review link"}
                            </button>
                            <button
                                onClick={onExportScenePackage}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition-colors hover:border-amber-300/30 hover:bg-amber-200/10 hover:text-amber-50"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Export scene package
                            </button>
                        </div>

                        <div className="mt-3 space-y-2 text-[11px] leading-5 text-neutral-500">
                            <p>{reviewDeliverySummary}</p>
                            {shareStatus ? <p className="text-sky-200">{shareStatus}</p> : null}
                            {saveState === "error" && saveMessage ? <p className="text-rose-200">{saveMessage}</p> : null}
                        </div>
                    </>
                ) : (
                    <div className="mt-4 border-t border-white/8 pt-4">
                        <div className="rounded-[0.95rem] border border-amber-400/15 bg-amber-500/8 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-100/75">Next action</p>
                            <p className="mt-2 text-sm text-white">Save the first version of this world.</p>
                            <p className="mt-2 text-[11px] leading-5 text-neutral-300">
                                Review share, durable reopen, continuity memory, and downstream handoff stay locked until the world is anchored to a saved version.
                            </p>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <div className="inline-flex items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-xs font-medium text-neutral-500">
                                Review share locked until save
                            </div>
                            <div className="inline-flex items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-xs font-medium text-neutral-500">
                                Handoff locked until save
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-[0.85rem] border border-white/8 bg-black/15 px-3 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Saved framings</p>
                                <p className="mt-2 text-sm text-white">{viewCount}</p>
                            </div>
                            <div className="rounded-[0.85rem] border border-white/8 bg-black/15 px-3 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Notes</p>
                                <p className="mt-2 text-sm text-white">{noteCount}</p>
                            </div>
                            <div className="rounded-[0.85rem] border border-white/8 bg-black/15 px-3 py-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">First save</p>
                                <p className="mt-2 text-sm text-white">{saveState === "saving" ? "Saving world record..." : "Pending"}</p>
                                {saveState === "saving" ? (
                                    <div className="mt-3 overflow-hidden rounded-full bg-white/[0.06]">
                                        <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-300/70" />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        {saveState === "error" && saveMessage ? <p className="mt-3 text-[11px] leading-5 text-rose-200">{saveMessage}</p> : null}
                    </div>
                )}
            </div>

            {changeSummary && isAnchored ? (
                <div className="rounded-[0.95rem] border border-white/8 bg-black/10 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Current output delta</p>
                            <p className="mt-1 text-sm text-white">{lastOutputLabel ?? "No output loaded yet"}</p>
                        </div>
                    </div>
                    <div className="mt-3 space-y-3">
                        {changeSummary.persistent.length > 0 ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Persistent world</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {changeSummary.persistent.map((item) => (
                                        <span key={item} className="rounded-full border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-1 text-[11px] text-emerald-100">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {changeSummary.sceneDirection.length > 0 ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Scene direction</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {changeSummary.sceneDirection.map((item) => (
                                        <span key={item} className="rounded-full border border-sky-500/20 bg-sky-950/20 px-2.5 py-1 text-[11px] text-sky-100">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {showDiagnostics ? (
                <details className="group rounded-[1rem] border border-white/8 bg-black/10">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-white marker:content-none">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Diagnostics</p>
                            <p className="mt-1 text-[12px] leading-5 text-neutral-400">
                                {isAdvancedDensityEnabled
                                    ? "Continuity, readiness, and quality gates are available here when you need the deeper trail."
                                    : "Diagnostic depth stays collapsed until the world is saved and you choose the richer studio view."}
                            </p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-neutral-500 transition-transform group-open:rotate-180" />
                    </summary>

                    <div className="space-y-3 border-t border-white/8 px-4 py-4">
                        <div className="grid gap-3">
                            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-neutral-300">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Workspace continuity</p>
                                <p className="mt-2 text-sm text-white">
                                    {formatWorkspaceOriginLabel(workspaceOrigin)}
                                    {activeScene ?? draftSceneId ? ` · ${activeScene ?? draftSceneId}` : ""}
                                </p>
                                <p className="mt-2 text-[11px] leading-5 text-neutral-500">
                                    {linkedLaunchStatus === "unavailable" && launchSceneId
                                        ? linkedLaunchMessage || `Could not reopen ${launchSceneId} from the project layer.`
                                        : workspaceOriginDetail}
                                </p>
                                {linkedLaunchStatus === "opening" && launchSceneId ? (
                                    <p className="mt-2 text-[11px] text-sky-200">Opening {launchSceneId} from the project layer now.</p>
                                ) : null}
                            </div>

                            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-neutral-300">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Workspace readiness</p>
                                <p className="mt-2 text-sm text-white">{environmentState.label}</p>
                                <p className="mt-2 text-[11px] leading-5 text-neutral-500">{environmentState.note}</p>
                                {environmentState.detail ? <p className="mt-1 text-[11px] leading-5 text-neutral-400">{environmentState.detail}</p> : null}
                                {environment?.metadata?.truth_label ? (
                                    <p className="mt-2 text-[11px] leading-5 text-neutral-400">{environment.metadata.truth_label}</p>
                                ) : null}
                                {environmentMetadata?.lane_truth ? (
                                    <p className="mt-1 text-[11px] text-neutral-500">Truth: {environmentMetadata.lane_truth.replaceAll("_", " ")}</p>
                                ) : null}
                                {environmentMetadata?.reconstruction_status ? (
                                    <p className="mt-1 text-[11px] text-neutral-500">
                                        Status: {environmentMetadata.reconstruction_status.replaceAll("_", " ")}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Continuity summary</p>
                                <div className="mt-3 space-y-3 text-[11px] leading-5">
                                    <div>
                                        <p className="text-white">{continuity.worldStateLabel}</p>
                                        <p className="text-neutral-500">{continuity.worldSummary}</p>
                                        <p className="mt-1 text-neutral-400">{continuity.worldTruth}</p>
                                    </div>
                                    <div>
                                        <p className="text-white">{continuity.directionStatusLabel}</p>
                                        <p className="text-neutral-500">{continuity.directionSummary}</p>
                                        <p className="mt-1 text-neutral-400">
                                            {directorBrief.trim()
                                                ? "Director brief stays attached alongside the saved world record."
                                                : "Views, notes, and the continuity record stay scoped to this world."}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Recent activity</p>
                                        <p className="mt-1 text-[11px] leading-5 text-neutral-400">Version and review trail inside the workspace</p>
                                    </div>
                                    <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                        {versions.length} versions
                                    </span>
                                </div>

                                {activityLog.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {activityLog.slice(0, 4).map((entry) => (
                                            <div key={entry.id} className={`rounded-lg border px-3 py-2 ${activityToneClass(entry.tone)}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs text-white">{entry.label}</p>
                                                    <p className="text-[11px] text-neutral-500">{formatTimestamp(entry.at)}</p>
                                                </div>
                                                <p className="mt-1 text-[11px] leading-5 text-neutral-400">{entry.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                                        Open the demo, build a world, save a version, or export a package to start the activity trail.
                                    </p>
                                )}

                                {versions.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {versions.slice(0, 3).map((version) => (
                                            <div key={version.version_id} className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs text-white">{formatTimestamp(version.saved_at) || version.version_id}</p>
                                                    <button
                                                        onClick={() => void onRestoreVersion(version.version_id)}
                                                        className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300 transition-colors hover:border-sky-400/30 hover:text-sky-100"
                                                    >
                                                        Restore
                                                    </button>
                                                </div>
                                                <p className="mt-1 text-[11px] text-neutral-500">
                                                    {version.source ?? "manual"} · {version.summary?.asset_count ?? 0} assets
                                                    {version.summary?.has_environment ? " · world loaded" : ""}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {saveError ? (
                            <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 px-3 py-3 text-[11px] leading-5 text-rose-100">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-rose-200/70">Save diagnostics</p>
                                <p className="mt-2">{saveMessage || "Scene save needs attention."}</p>
                                <p className="mt-1 whitespace-pre-wrap text-rose-100/80">{saveError}</p>
                                {lastSavedAt ? <p className="mt-2 text-rose-100/70">Last saved {formatTimestamp(lastSavedAt)}</p> : null}
                            </div>
                        ) : null}

                        {environmentMetadata?.rendering || environmentQuality || environmentDelivery ? (
                            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 space-y-3 text-xs text-neutral-300">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                            {environmentQuality ? "Reconstruction quality" : "Splat rendering"}
                                        </p>
                                        <p className="mt-1 text-sm text-white">
                                            {environmentQuality?.band ? formatQualityBand(environmentQuality.band) : "Colorized splat output"}
                                        </p>
                                    </div>
                                    {typeof environmentQuality?.score === "number" ? (
                                        <div className="rounded-lg border border-white/8 bg-neutral-950/80 px-2.5 py-2 text-right">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Score</p>
                                            <p className="text-sm text-white">{environmentQuality.score.toFixed(1)}</p>
                                        </div>
                                    ) : null}
                                </div>

                                {environmentQuality ? (
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-2">
                                            Alignment {formatMetric(environmentQuality.alignment?.score)}
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-2">
                                            Appearance {formatMetric(environmentQuality.appearance?.score)}
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-2">
                                            Pose pairs {environmentQuality.alignment?.pose_pairs ?? 0}/{environmentQuality.alignment?.pair_count ?? 0}
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-2">
                                            Exposure span {formatMetric(environmentQuality.appearance?.exposure_span, 3)}
                                        </div>
                                    </div>
                                ) : null}

                                {environmentWarnings.length > 0 ? (
                                    <div className="space-y-1">
                                        {environmentWarnings.slice(0, 3).map((warning) => (
                                            <p key={warning} className="text-[11px] text-amber-200">
                                                {warning}
                                            </p>
                                        ))}
                                    </div>
                                ) : null}

                                {environmentDelivery ? (
                                    <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-3 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Delivery gate</p>
                                                <p className="mt-1 text-white">
                                                    {environmentDelivery.label || formatQualityBand(environmentDelivery.readiness) || "Not scored"}
                                                </p>
                                                {environmentDelivery.summary ? (
                                                    <p className="mt-1 text-[11px] text-neutral-500">{environmentDelivery.summary}</p>
                                                ) : null}
                                            </div>
                                            {typeof environmentDelivery.score === "number" ? (
                                                <div className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2 text-right">
                                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Gate score</p>
                                                    <p className="text-sm text-white">{environmentDelivery.score.toFixed(1)}</p>
                                                </div>
                                            ) : null}
                                        </div>

                                        {environmentDelivery.axes ? (
                                            <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                                                <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                    Geometry {formatMetric(environmentDelivery.axes.geometry?.score)}
                                                </div>
                                                <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                    Color {formatMetric(environmentDelivery.axes.color?.score)}
                                                </div>
                                                <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                    Coverage {formatMetric(environmentDelivery.axes.coverage?.score)}
                                                </div>
                                                <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                    Density {formatMetric(environmentDelivery.axes.density?.score)}
                                                </div>
                                            </div>
                                        ) : null}

                                        {environmentDelivery.recommended_viewer_mode || environmentDelivery.render_targets ? (
                                            <p className="text-[11px] text-neutral-400">
                                                Viewer profile {formatQualityBand(environmentDelivery.recommended_viewer_mode) || "standard"}
                                                {environmentDelivery.render_targets?.desktop_fps ? ` · ${environmentDelivery.render_targets.desktop_fps}fps desktop` : ""}
                                                {environmentDelivery.render_targets?.mobile_fps ? ` · ${environmentDelivery.render_targets.mobile_fps}fps mobile` : ""}
                                            </p>
                                        ) : null}

                                        {environmentBlockingIssues.length > 0 ? (
                                            <div className="space-y-1">
                                                {environmentBlockingIssues.slice(0, 3).map((issue) => (
                                                    <p key={issue} className="text-[11px] text-amber-200">
                                                        {issue}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : null}

                                        {environmentNextActions.length > 0 ? (
                                            <div className="space-y-1">
                                                {environmentNextActions.slice(0, 3).map((action) => (
                                                    <p key={action} className="text-[11px] text-sky-200">
                                                        {action}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                {environmentCapture || environmentTraining || environmentHoldout || environmentComparison || environmentReleaseGates ? (
                                    <div className="rounded-lg border border-white/8 bg-neutral-950/70 px-3 py-3 space-y-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">World-class gates</p>
                                        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                Capture {environmentCapture?.frame_count ?? environmentMetadata?.frame_count ?? 0} frames
                                            </div>
                                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                Benchmark {formatQualityBand(environmentComparison?.benchmark_status) || "not benchmarked"}
                                            </div>
                                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                Training {formatQualityBand(environmentTraining?.backend) || "unknown"}
                                            </div>
                                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                                                Holdout {environmentHoldout?.available ? "available" : "missing"}
                                            </div>
                                        </div>
                                        {environmentReleaseGates ? (
                                            <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-3">
                                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Promotion gate</p>
                                                <p className="mt-1 text-sm text-white">
                                                    {environmentReleaseGates.summary || "Promotion gates not reported"}
                                                </p>
                                                {environmentGateFailures.length > 0 ? (
                                                    <div className="mt-2 space-y-1">
                                                        {environmentGateFailures.slice(0, 4).map((failure) => (
                                                            <p key={failure} className="text-[11px] text-rose-200">
                                                                {failure}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </details>
            ) : null}
        </div>
    );
});
