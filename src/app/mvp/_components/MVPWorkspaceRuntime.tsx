"use client";

import React from "react";

import LeftPanel from "@/components/Editor/LeftPanel";
import ViewerPanel from "@/components/Editor/ViewerPanel";
import RightPanel from "@/components/Editor/RightPanel";
import DeploymentFingerprintBadge from "@/components/Editor/DeploymentFingerprintBadge";
import type { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { useRenderableSceneDocumentFromContext } from "@/state/mvpSceneStoreContext.tsx";

import { describeWorkspaceContinuity } from "../_lib/clarity";
import { useMvpWorkspaceSession } from "../_state/mvpWorkspaceSessionContext";
import MVPClarityLaunchpad from "./MVPClarityLaunchpad";

type MvpRouteVariant = "workspace" | "preview";

const leftRailClassName = (collapsed: boolean) =>
    collapsed ? "h-11 w-full xl:h-full xl:w-14" : "h-auto min-h-[18rem] w-full xl:h-full xl:w-[16rem] 2xl:w-[17rem]";

const rightRailClassName = (collapsed: boolean) =>
    collapsed ? "h-11 w-full xl:h-full xl:w-14" : "h-auto min-h-[18rem] w-full xl:h-full xl:w-[17rem] 2xl:w-[18rem]";

const saveStateBadgeClassName = (state: ReturnType<typeof useMvpWorkspaceSession>["saveState"]) => {
    if (state === "saved") return "border-emerald-400/20 bg-emerald-500/12 text-emerald-100";
    if (state === "saving") return "border-sky-400/20 bg-sky-500/12 text-sky-100";
    if (state === "recovered") return "border-amber-400/20 bg-amber-500/12 text-amber-100";
    if (state === "error") return "border-rose-400/20 bg-rose-500/12 text-rose-100";
    return "border-white/10 bg-white/[0.04] text-neutral-200";
};

const saveStateLabel = (state: ReturnType<typeof useMvpWorkspaceSession>["saveState"]) => {
    if (state === "saved") return "Saved";
    if (state === "saving") return "Saving";
    if (state === "recovered") return "Recovered";
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
                title: "Blank workspace",
                detail,
            };
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
    );
    const showFallbackMessage =
        !continuity.hasWorld &&
        (!workspaceSession.saveMessage ||
            workspaceSession.saveMessage === "Scene is empty." ||
            workspaceSession.saveMessage === "Open the demo world or upload a still to begin.");
    const message =
        workspaceSession.linkedLaunchStatus === "opening"
            ? workspaceSession.linkedLaunchMessage || "Opening the project-linked world."
            : showFallbackMessage
              ? "Start with a still or the demo world to establish persistent state, then direct scene-specific changes on top of it."
              : workspaceSession.saveMessage || "World workspace ready for direction and versioning.";
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

    return (
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))] px-4 py-2.5 lg:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">
                            {clarityMode ? "Persistent world workspace" : "World workspace"}
                        </p>
                        {routeVariant === "preview" ? (
                            <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100">
                                Preview-safe route
                            </span>
                        ) : null}
                        {workspaceSession.workspaceOrigin !== "blank" ? (
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                                {originSummary.title}
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-medium tracking-tight text-white">
                            {continuity.hasWorld ? continuity.worldTitle : "Awaiting first world"}
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
                            {saveStateLabel(workspaceSession.saveState)}
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
        </div>
    );
});

const MVPWorkspaceClarityHeader = React.memo(function MVPWorkspaceClarityHeader({
    onOpenDemoWorld,
    onReturnToLaunchpad,
}: {
    onOpenDemoWorld: () => void;
    onReturnToLaunchpad: () => void;
}) {
    return (
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(12,16,22,0.94),rgba(8,11,16,0.96))] px-4 py-3 lg:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/70">Clarity mode</p>
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                            World-first flow
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-medium tracking-tight text-white">
                        Create the world once, then direct scene-by-scene changes with a calmer handoff shell.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">
                        Build world in the left rail, direct the shot in the viewer, and finish review on the right.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onOpenDemoWorld}
                        className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200"
                    >
                        Open demo world
                    </button>
                    <button
                        type="button"
                        onClick={onReturnToLaunchpad}
                        className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:border-neutral-500"
                        data-testid="mvp-preview-back-to-start"
                    >
                        Back to preview intro
                    </button>
                </div>
            </div>
        </div>
    );
});

const MVPWorkspaceLeftRail = React.memo(function MVPWorkspaceLeftRail({
    clarityMode,
    collapsed,
    onToggle,
}: {
    clarityMode: boolean;
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
                        <LeftPanel clarityMode={clarityMode} />
                    </div>
                </>
            )}
        </div>
    );
});

const MVPWorkspaceRightRail = React.memo(function MVPWorkspaceRightRail({
    clarityMode,
    collapsed,
    onToggle,
}: {
    clarityMode: boolean;
    collapsed: boolean;
    onToggle: () => void;
}) {
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
                    <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500 xl:hidden">Review</span>
                    <span className="hidden text-[10px] uppercase tracking-[0.24em] text-neutral-500 [writing-mode:vertical-rl] xl:inline">
                        Review
                    </span>
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                        Expand
                    </span>
                </button>
            ) : (
                <>
                    <div className="flex items-center justify-between border-b border-white/8 px-3 py-3 xl:hidden">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Review</p>
                            <p className="mt-1 text-sm text-white">Handoff and export</p>
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
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const workspaceSession = useMvpWorkspaceSession();

    return (
        <div className="flex min-h-screen w-screen flex-col bg-[#07090c] font-sans text-white xl:h-screen xl:overflow-hidden">
            {clarityMode ? (
                <MVPWorkspaceClarityHeader
                    onOpenDemoWorld={workspaceSession.openDemoWorld}
                    onReturnToLaunchpad={workspaceSession.returnToLaunchpad}
                />
            ) : null}

            <MVPWorkspaceStatusRibbon clarityMode={clarityMode} routeVariant={routeVariant} />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#05070a] xl:overflow-hidden xl:flex-row">
                <MVPWorkspaceLeftRail
                    clarityMode={clarityMode}
                    collapsed={workspaceSession.hudState.leftRailCollapsed}
                    onToggle={workspaceSession.toggleLeftRail}
                />

                <div className="relative z-0 min-h-[24rem] min-w-0 flex-1 xl:min-h-0">
                    <ViewerPanel clarityMode={clarityMode} routeVariant={routeVariant} />
                </div>

                <MVPWorkspaceRightRail
                    clarityMode={clarityMode}
                    collapsed={workspaceSession.hudState.rightRailCollapsed}
                    onToggle={workspaceSession.toggleRightRail}
                />
            </div>
            <DeploymentFingerprintBadge fingerprint={deploymentFingerprint} />
        </div>
    );
});

export default function MVPWorkspaceRuntime({
    clarityMode = false,
    routeVariant = "workspace",
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
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
                    launchSceneId={workspaceSession.launchSceneId}
                    linkedLaunchMessage={workspaceSession.linkedLaunchMessage}
                    linkedLaunchStatus={workspaceSession.linkedLaunchStatus}
                    onOpenDemoWorld={workspaceSession.openDemoWorld}
                    onResumeDraft={workspaceSession.resumeStoredDraft}
                    onStartBlank={workspaceSession.startBlankWorkspace}
                />
                <DeploymentFingerprintBadge fingerprint={deploymentFingerprint} />
            </>
        );
    }

    return (
        <MVPWorkspaceFrame
            clarityMode={clarityMode}
            routeVariant={routeVariant}
            deploymentFingerprint={deploymentFingerprint}
        />
    );
}
