"use client";

import React from "react";
import Link from "next/link";

import LeftPanel from "@/components/Editor/LeftPanel";
import ViewerPanel from "@/components/Editor/ViewerPanel";
import RightPanel from "@/components/Editor/RightPanel";
import DeploymentFingerprintBadge from "@/components/Editor/DeploymentFingerprintBadge";
import type { LeftPanelPreviewWorkspaceNavigation } from "@/components/Editor/leftPanelShared";
import type { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { useRenderableSceneDocumentFromContext } from "@/state/mvpSceneStoreContext.tsx";

import { describeWorkspaceContinuity } from "../_lib/clarity";
import { useMvpWorkspaceSession } from "../_state/mvpWorkspaceSessionContext";
import MVPClarityLaunchpad from "./MVPClarityLaunchpad";

type MvpRouteVariant = "workspace" | "preview";

const leftRailClassName = (collapsed: boolean) =>
    collapsed ? "h-11 w-full xl:h-full xl:w-14" : "h-auto min-h-[18rem] w-full xl:h-full xl:w-[18rem] 2xl:w-[19rem]";

const rightRailClassName = (collapsed: boolean) =>
    collapsed ? "h-11 w-full xl:h-full xl:w-14" : "h-auto min-h-[18rem] w-full xl:h-full xl:w-[17rem] 2xl:w-[18rem]";

const saveStateBadgeClassName = (state: ReturnType<typeof useMvpWorkspaceSession>["saveState"]) => {
    if (state === "saved") return "border-emerald-400/20 bg-emerald-500/12 text-emerald-100";
    if (state === "saving") return "border-sky-400/20 bg-sky-500/12 text-sky-100";
    if (state === "recovered") return "border-amber-400/20 bg-amber-500/12 text-amber-100";
    if (state === "error") return "border-rose-400/20 bg-rose-500/12 text-rose-100";
    return "border-white/10 bg-white/[0.04] text-neutral-200";
};

const saveStateLabel = (
    state: ReturnType<typeof useMvpWorkspaceSession>["saveState"],
    workspaceOrigin: ReturnType<typeof useMvpWorkspaceSession>["workspaceOrigin"],
) => {
    if (state === "saved") return "Saved";
    if (state === "saving") return "Saving";
    if (state === "recovered") {
        if (workspaceOrigin === "draft") return "Draft recovered";
        if (workspaceOrigin === "linked_version" || workspaceOrigin === "linked_environment") return "Reopened";
        if (workspaceOrigin === "demo") return "Demo loaded";
        return "Recovered";
    }
    if (state === "error") return "Needs attention";
    return "Standby";
};

const formatSavedAt = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
};

const describeWorkspaceOrigin = (
    origin: ReturnType<typeof useMvpWorkspaceSession>["workspaceOrigin"],
    detail: string,
    sceneId?: string | null,
    projectId?: string | null,
) => {
    switch (origin) {
        case "demo":
            return {
                title: "Demo world",
                detail,
            };
        case "draft":
            return {
                title: sceneId ? `Local draft · ${sceneId}` : "Local draft",
                detail,
            };
        case "linked_version":
            return {
                title: sceneId ? `Project-linked world · ${sceneId}` : "Project-linked world",
                detail,
            };
        case "linked_environment":
            return {
                title: sceneId ? `Stored world artifacts · ${sceneId}` : "Stored world artifacts",
                detail,
            };
        case "blank":
        default:
            return {
                title: projectId ? "Project-linked world start" : "Blank workspace",
                detail: projectId ? "This workspace is already attached to a project world record." : detail,
            };
    }
};

const describeLaunchSourceLabel = (sourceKind?: string | null) => {
    switch (sourceKind) {
        case "capture_session":
            return "Capture set";
        case "external_world_package":
            return "External world";
        case "third_party_world_model_output":
            return "Third-party world";
        case "provider_generated_still":
            return "Generated still";
        case "linked_scene_version":
            return "Linked world";
        case "demo_world":
            return "Demo world";
        case "upload":
            return "Scout stills";
        default:
            return "World source";
    }
};

const MVPWorkspaceStatusRibbon = React.memo(function MVPWorkspaceStatusRibbon({
    clarityMode,
    routeVariant,
}: {
    clarityMode: boolean;
    routeVariant: MvpRouteVariant;
}) {
    const workspaceSession = useMvpWorkspaceSession();
    const sceneDocument = useRenderableSceneDocumentFromContext();
    const continuity = React.useMemo(() => describeWorkspaceContinuity(sceneDocument), [sceneDocument]);
    const originSummary = describeWorkspaceOrigin(
        workspaceSession.workspaceOrigin,
        workspaceSession.workspaceOriginDetail,
        workspaceSession.activeScene ?? workspaceSession.draftSceneId,
        workspaceSession.launchProjectId,
    );
    const sourceLabel = describeLaunchSourceLabel(workspaceSession.launchSourceKind);
    const showPreviewRouteBadge = routeVariant === "preview" && !workspaceSession.launchProjectId;
    const showFallbackMessage =
        !continuity.hasWorld &&
        (!workspaceSession.saveMessage ||
            workspaceSession.saveMessage === "Scene is empty." ||
            workspaceSession.saveMessage === "Open the demo world or upload a still to begin.");
    const defaultMessage =
        workspaceSession.linkedLaunchStatus === "opening"
            ? workspaceSession.linkedLaunchMessage || "Opening the project-linked world."
            : workspaceSession.launchProjectId && !continuity.hasWorld
              ? "This workspace is already attached to one project world record. Choose the first source, then save once to anchor continuity."
            : showFallbackMessage
              ? `Start with ${sourceLabel.toLowerCase()} to establish the saved world record.`
              : workspaceSession.saveMessage || "World workspace ready.";
    const stageMessage =
        workspaceSession.journeyStage === "start"
            ? workspaceSession.launchProjectId
                ? "Choose the first source, then save once to anchor the project world record."
                : `Build the first world from ${sourceLabel.toLowerCase()}.`
            : workspaceSession.journeyStage === "unsaved"
              ? "Save the first version to lock review, handoff, and continuity to one durable world."
              : workspaceSession.isAdvancedDensityEnabled
                ? "Saved world anchored. Studio view is available."
                : "Saved world anchored. Review, handoff, and continuity now point at a durable record.";
    const message = workspaceSession.linkedLaunchStatus === "opening" ? defaultMessage : stageMessage;
    const criticalAlert =
        workspaceSession.saveState === "error"
            ? workspaceSession.saveMessage || "Autosave failed."
            : workspaceSession.linkedLaunchStatus === "unavailable"
              ? workspaceSession.linkedLaunchMessage ||
                (workspaceSession.launchSceneId ? `Could not reopen ${workspaceSession.launchSceneId}.` : "Launch source unavailable.")
              : "";
    const modeLine =
        workspaceSession.linkedLaunchStatus === "opening"
            ? message
            : continuity.hasWorld
              ? continuity.directionSummary || message
              : "";
    const showSaveBadge = workspaceSession.saveState !== "idle" || Boolean(workspaceSession.lastSavedAt);
    const progressLabel =
        workspaceSession.linkedLaunchStatus === "opening"
            ? workspaceSession.linkedLaunchMessage || "Opening project-linked world record."
            : workspaceSession.saveState === "saving"
              ? workspaceSession.saveMessage || "Saving world record..."
              : "";

    return (
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))] px-4 py-2.5 lg:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">
                            {clarityMode ? "Persistent world workspace" : "World workspace"}
                        </p>
                        {showPreviewRouteBadge ? (
                            <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100">
                                Preview-safe route
                            </span>
                        ) : null}
                        {workspaceSession.launchSourceKind ? (
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                                {sourceLabel}
                            </span>
                        ) : null}
                        {workspaceSession.workspaceOrigin !== "blank" || workspaceSession.launchProjectId ? (
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                                {originSummary.title}
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-medium tracking-tight text-white">
                            {continuity.hasWorld ? continuity.worldTitle : workspaceSession.launchProjectId ? "Project-linked world start" : "Awaiting first world"}
                        </p>
                        {criticalAlert || modeLine ? <p className="max-w-2xl text-xs leading-5 text-neutral-400">{criticalAlert || modeLine}</p> : null}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {criticalAlert ? (
                        <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-rose-100">
                            Needs attention
                        </span>
                    ) : null}
                    {showSaveBadge ? (
                        <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${saveStateBadgeClassName(workspaceSession.saveState)}`}
                        >
                            {saveStateLabel(workspaceSession.saveState, workspaceSession.workspaceOrigin)}
                            {workspaceSession.lastSavedAt ? ` · ${formatSavedAt(workspaceSession.lastSavedAt)}` : ""}
                        </span>
                    ) : null}
                    {workspaceSession.activeScene ? (
                        <span className="hidden rounded-full border border-white/8 bg-black/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-300 lg:inline-flex">
                            {workspaceSession.activeScene}
                        </span>
                    ) : null}
                </div>
            </div>
            {progressLabel ? (
                <div className="mt-2 rounded-[0.95rem] border border-sky-400/14 bg-sky-500/[0.06] px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-sky-100/80">World record progress</p>
                        <p className="text-[11px] leading-5 text-sky-50">{progressLabel}</p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-300/70" />
                    </div>
                </div>
            ) : null}
        </div>
    );
});

const MVPWorkspaceClarityHeader = React.memo(function MVPWorkspaceClarityHeader({
    onReturnToLaunchpad,
    returnToLaunchpadHref,
}: {
    onReturnToLaunchpad: () => void;
    returnToLaunchpadHref?: string | null;
}) {
    const returnLabel = returnToLaunchpadHref?.includes("/app/worlds/") ? "Back to project record" : "Back to preview intro";
    return (
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(20,25,30,0.94),rgba(16,20,24,0.96))] px-4 py-3 lg:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#bfd6de]/72">World-first flow</p>
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                            Focused start
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-medium tracking-tight text-white">
                        Build one world. Save it once. Then direct it.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {returnToLaunchpadHref ? (
                        <Link
                            href={returnToLaunchpadHref}
                            className="rounded-full border border-[var(--border-soft)] bg-[rgba(244,239,232,0.04)] px-4 py-2 text-xs font-medium text-white transition-colors hover:border-white/25"
                            data-testid="mvp-preview-back-to-start"
                        >
                            {returnLabel}
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={onReturnToLaunchpad}
                            className="rounded-full border border-[var(--border-soft)] bg-[rgba(244,239,232,0.04)] px-4 py-2 text-xs font-medium text-white transition-colors hover:border-white/25"
                            data-testid="mvp-preview-back-to-start"
                        >
                            {returnLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

const MVPWorkspaceLeftRail = React.memo(function MVPWorkspaceLeftRail({
    clarityMode,
    previewWorkspaceNavigation,
    collapsed,
    onToggle,
}: {
    clarityMode: boolean;
    previewWorkspaceNavigation?: LeftPanelPreviewWorkspaceNavigation | null;
    collapsed: boolean;
    onToggle: () => void;
}) {
    return (
        <div
            className={`z-10 flex shrink-0 flex-col border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,10,14,0.94),rgba(5,7,10,0.98))] transition-[width,height] duration-200 xl:border-b-0 xl:border-r ${leftRailClassName(collapsed)}`}
        >
            {collapsed ? (
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex h-full w-full items-center justify-between gap-4 px-4 text-center text-white transition-colors hover:bg-white/[0.03] xl:flex-col xl:justify-center xl:px-2"
                    aria-label="Show left HUD"
                >
                    <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500 xl:hidden">Intake</span>
                    <span className="hidden text-[10px] uppercase tracking-[0.24em] text-neutral-500 [writing-mode:vertical-rl] rotate-180 xl:inline">
                        Intake
                    </span>
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                        Expand
                    </span>
                </button>
            ) : (
                <>
                    <div className="flex items-center justify-between border-b border-white/8 px-3 py-3 xl:hidden">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Intake</p>
                            <p className="mt-1 text-sm text-white">Build the world</p>
                        </div>
                        <button
                            type="button"
                            onClick={onToggle}
                            className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white transition-colors hover:border-white/16 hover:bg-white/[0.05]"
                        >
                            Hide
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <LeftPanel clarityMode={clarityMode} previewWorkspaceNavigation={previewWorkspaceNavigation} />
                    </div>
                </>
            )}
        </div>
    );
});

const MVPWorkspaceRightRail = React.memo(function MVPWorkspaceRightRail({
    clarityMode,
    collapsed,
    journeyStage,
    onToggle,
}: {
    clarityMode: boolean;
    collapsed: boolean;
    journeyStage: "start" | "unsaved" | "saved";
    onToggle: () => void;
}) {
    const railLabel = journeyStage === "saved" ? "Review" : "Save";
    const railTitle = journeyStage === "saved" ? "Handoff and export" : "Save first version";

    return (
        <div
            className={`z-10 flex shrink-0 flex-col border-t border-white/8 bg-[linear-gradient(180deg,rgba(9,10,13,0.94),rgba(5,7,10,0.98))] transition-[width,height] duration-200 xl:border-t-0 xl:border-l ${rightRailClassName(collapsed)}`}
        >
            {collapsed ? (
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex h-full w-full items-center justify-between gap-4 px-4 text-center text-white transition-colors hover:bg-white/[0.03] xl:flex-col xl:justify-center xl:px-2"
                    aria-label="Show right HUD"
                >
                    <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500 xl:hidden">{railLabel}</span>
                    <span className="hidden text-[10px] uppercase tracking-[0.24em] text-neutral-500 [writing-mode:vertical-rl] xl:inline">
                        {railLabel}
                    </span>
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                        Expand
                    </span>
                </button>
            ) : (
                <>
                    <div className="flex items-center justify-between border-b border-white/8 px-3 py-3 xl:hidden">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">{railLabel}</p>
                            <p className="mt-1 text-sm text-white">{railTitle}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onToggle}
                            className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white transition-colors hover:border-white/16 hover:bg-white/[0.05]"
                        >
                            Hide
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <RightPanel clarityMode={clarityMode} />
                    </div>
                </>
            )}
        </div>
    );
});

const MVPWorkspaceFrame = React.memo(function MVPWorkspaceFrame({
    clarityMode = false,
    routeVariant = "workspace",
    launchPreviewHref = null,
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
    launchPreviewHref?: string | null;
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const workspaceSession = useMvpWorkspaceSession();
    const showRightRail = workspaceSession.journeyStage !== "start";
    const leftRailCollapsed = workspaceSession.journeyStage === "start" ? false : workspaceSession.hudState.leftRailCollapsed;
    const rightRailCollapsed =
        workspaceSession.journeyStage === "start" ? true : workspaceSession.journeyStage === "unsaved" ? false : workspaceSession.hudState.rightRailCollapsed;
    const previewWorkspaceNavigation =
        clarityMode && routeVariant === "preview"
            ? {
                  eyebrow: workspaceSession.launchProjectId ? "Project" : "Preview",
                  title: workspaceSession.launchProjectId ? "Project launch" : "Focused world start",
                  note: workspaceSession.launchProjectId
                      ? "Return to the project launch surface."
                      : "Return to the preview intro without changing the current route.",
                  backLabel: workspaceSession.launchProjectId ? "Return to project" : "Back to start",
                  backToStartHref: launchPreviewHref,
                  onBackToStart: workspaceSession.returnToLaunchpad,
              }
            : null;

    return (
        <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[#11161b] font-sans text-white supports-[min-height:100dvh]:min-h-dvh xl:h-screen xl:overflow-hidden supports-[height:100dvh]:xl:h-dvh">
            {clarityMode && routeVariant === "preview" && !workspaceSession.launchProjectId && workspaceSession.journeyStage === "start" ? (
                <MVPWorkspaceClarityHeader
                    onReturnToLaunchpad={workspaceSession.returnToLaunchpad}
                    returnToLaunchpadHref={launchPreviewHref}
                />
            ) : null}

            <MVPWorkspaceStatusRibbon clarityMode={clarityMode} routeVariant={routeVariant} />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#101418] [-webkit-overflow-scrolling:touch] xl:flex-row xl:overflow-hidden">
                <MVPWorkspaceLeftRail
                    clarityMode={clarityMode}
                    previewWorkspaceNavigation={previewWorkspaceNavigation}
                    collapsed={leftRailCollapsed}
                    onToggle={workspaceSession.toggleLeftRail}
                />

                <div className="relative z-0 min-h-[24rem] min-w-0 flex-1 xl:min-h-0">
                    <ViewerPanel clarityMode={clarityMode} routeVariant={routeVariant} />
                </div>

                {showRightRail ? (
                    <MVPWorkspaceRightRail
                        clarityMode={clarityMode}
                        collapsed={rightRailCollapsed}
                        journeyStage={workspaceSession.journeyStage}
                        onToggle={workspaceSession.toggleRightRail}
                    />
                ) : null}
            </div>
            <DeploymentFingerprintBadge fingerprint={deploymentFingerprint} />
        </div>
    );
});

export default function MVPWorkspaceRuntime({
    clarityMode = false,
    routeVariant = "workspace",
    launchWorkspaceHref = null,
    launchPreviewHref = null,
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
    launchWorkspaceHref?: string | null;
    launchPreviewHref?: string | null;
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const workspaceSession = useMvpWorkspaceSession();

    if (workspaceSession.showLaunchpad) {
        return (
            <>
                <MVPClarityLaunchpad
                    draftUpdatedAt={workspaceSession.draftUpdatedAt}
                    draftSceneId={workspaceSession.draftSceneId}
                    hasDraft={workspaceSession.hasDraft}
                    launchProjectId={workspaceSession.launchProjectId}
                    launchSceneId={workspaceSession.launchSceneId}
                    launchSourceKind={workspaceSession.launchSourceKind}
                    startWorkspaceHref={launchWorkspaceHref}
                    linkedLaunchMessage={workspaceSession.linkedLaunchMessage}
                    linkedLaunchStatus={workspaceSession.linkedLaunchStatus}
                    onOpenDemoWorld={workspaceSession.openDemoWorld}
                    onStartWorkspace={workspaceSession.startBlankWorkspace}
                    onResumeDraft={workspaceSession.resumeStoredDraft}
                />
                <DeploymentFingerprintBadge fingerprint={deploymentFingerprint} />
            </>
        );
    }

    return (
        <MVPWorkspaceFrame
            clarityMode={clarityMode}
            routeVariant={routeVariant}
            launchPreviewHref={launchPreviewHref}
            deploymentFingerprint={deploymentFingerprint}
        />
    );
}
