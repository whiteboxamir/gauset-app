"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { Camera, Focus, MapPin, Maximize2, Minimize2, Video } from "lucide-react";
import ThreeOverlay, { ThreeOverlayConnected } from "./ThreeOverlay";
import {
    FocusRequest,
    ViewerOverlaySceneSlices,
    ViewerPanelSceneSlices,
    pickViewerOverlaySceneSlices,
    selectViewerPanelSceneSlicesFromDocument,
    useViewerPanelInteractionController,
} from "./useViewerPanelController";
import { useMvpWorkspaceViewerController } from "@/app/mvp/_hooks/useMvpWorkspaceViewerController";
import { describeEnvironment, resolveEnvironmentRenderState } from "@/lib/mvp-product";
import {
    getTransformSnapValueForMode,
    isTransformToolMode,
    type SceneTransformSnapSettings,
    type SceneTransformSpace,
} from "@/lib/render/transformSessions.ts";
import type { SceneDocumentV2, SceneToolMode } from "@/lib/scene-graph/types.ts";
import {
    CameraPathFrame,
    CameraView,
    SpatialPin,
    SpatialPinType,
} from "@/lib/mvp-workspace";

const LENS_PRESETS = [18, 24, 35, 50, 85];
const SCENE_TOOL_MODES: SceneToolMode[] = ["select", "translate", "rotate", "scale"];
const SCENE_TOOL_LABELS: Record<SceneToolMode, string> = {
    select: "Select",
    translate: "Move",
    rotate: "Rotate",
    scale: "Scale",
};

function formatTransformSnapValue(activeTool: SceneToolMode, transformSnap: SceneTransformSnapSettings) {
    if (!isTransformToolMode(activeTool)) {
        return "Snap";
    }

    const value = getTransformSnapValueForMode(transformSnap, activeTool);
    if (activeTool === "rotate") {
        return `${((value * 180) / Math.PI).toFixed(0)}deg`;
    }
    if (activeTool === "scale") {
        return `${value.toFixed(2)}x`;
    }
    return `${value.toFixed(value < 1 ? 2 : 1)}u`;
}

function formatPathDuration(path: CameraPathFrame[]) {
    if (path.length < 2) return "0.0s";
    const duration = path[path.length - 1].time - path[0].time;
    return `${duration.toFixed(1)}s`;
}

function resolveNearestLensPreset(activeLensMm: number) {
    return LENS_PRESETS.reduce((closest, candidate) =>
        Math.abs(candidate - activeLensMm) < Math.abs(closest - activeLensMm) ? candidate : closest,
    );
}

function EmptyViewerState() {
    return (
        <div
            className="absolute inset-0 z-20 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.1),transparent_24%),linear-gradient(180deg,#06080c_0%,#040507_100%)]"
            data-testid="mvp-empty-viewer-state"
        >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(8,14,22,0.2),transparent_38%,rgba(34,197,94,0.08)_100%)]" />
            <div className="relative flex h-full items-center justify-center p-6">
                <div className="w-full max-w-3xl rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.9),rgba(7,9,13,0.86))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                    <div className="text-center">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/75">Viewer standby</p>
                        <p className="mt-3 text-2xl font-medium text-white">No world loaded yet</p>
                        <p className="mt-3 text-sm leading-6 text-neutral-300">
                            The workspace keeps the viewer dark until it has real world content to direct, review, or restore.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StaticReferenceViewer({
    referenceImage,
    title,
    description,
}: {
    referenceImage: string;
    title: string;
    description: string;
}) {
    return (
        <div
            className="absolute inset-0 z-20 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%),linear-gradient(180deg,#06080c_0%,#040507_100%)]"
            data-testid="mvp-static-reference-viewer"
        >
            <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: `url(${referenceImage})` }} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,11,0.2),rgba(4,7,11,0.42)_48%,rgba(4,7,11,0.88)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%)]" />
            <div className="relative flex h-full items-end p-6">
                <div className="w-full max-w-sm overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(180deg,rgba(8,11,16,0.92),rgba(7,10,14,0.96))] shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                    <div className="p-5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">Reference view</p>
                        <p className="mt-2 text-base font-medium text-white">{title}</p>
                        <p className="mt-2 text-xs leading-5 text-neutral-200">{description}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

type ViewerSurfaceMode = "empty" | "static_reference" | "interactive_requested";
type ViewerSurfaceCoverage = "shell_only" | "image_only" | "interactive_requested";

type ViewerSurfaceDiagnostics = {
    surfaceMode: ViewerSurfaceMode;
    coverage: ViewerSurfaceCoverage;
    hasEnvironmentSplat: boolean;
    hasReferenceImage: boolean;
    isReferenceOnlyDemo: boolean;
    isLegacyDemoWorld: boolean;
    shouldUseStaticReferenceViewer: boolean;
    shouldRenderInteractiveViewer: boolean;
    referenceImage: string | null;
    viewerReady: boolean;
};

function resolveViewerSurfaceDiagnostics(
    overlaySceneSlices: ViewerOverlaySceneSlices,
    viewerReady: boolean,
): ViewerSurfaceDiagnostics {
    const environmentRenderState = resolveEnvironmentRenderState(overlaySceneSlices.environment);
    const hasEnvironmentSplat = environmentRenderState.hasRenderableOutput;
    const isReferenceOnlyDemo = environmentRenderState.isReferenceOnlyDemo;
    const isLegacyDemoWorld = environmentRenderState.isLegacyDemoWorld;
    const referenceImage = environmentRenderState.referenceImage;
    const shouldUseStaticReferenceViewer = Boolean(referenceImage) && !hasEnvironmentSplat && (isReferenceOnlyDemo || isLegacyDemoWorld);
    const shouldRenderInteractiveViewer =
        !shouldUseStaticReferenceViewer &&
        (hasEnvironmentSplat || Boolean(referenceImage) || overlaySceneSlices.assets.length > 0 || overlaySceneSlices.pins.length > 0);

    return {
        surfaceMode: shouldUseStaticReferenceViewer ? "static_reference" : shouldRenderInteractiveViewer ? "interactive_requested" : "empty",
        coverage: shouldRenderInteractiveViewer ? "interactive_requested" : shouldUseStaticReferenceViewer ? "image_only" : "shell_only",
        hasEnvironmentSplat,
        hasReferenceImage: Boolean(referenceImage),
        isReferenceOnlyDemo,
        isLegacyDemoWorld,
        shouldUseStaticReferenceViewer,
        shouldRenderInteractiveViewer,
        referenceImage,
        viewerReady,
    };
}

const ViewerLensPresetControls = React.memo(function ViewerLensPresetControls({
    activeLensMm,
    onSetLens,
    compact = false,
}: {
    activeLensMm: number;
    onSetLens: (lensMm: number) => void;
    compact?: boolean;
}) {
    if (compact) {
        const selectedLensPreset = resolveNearestLensPreset(activeLensMm);

        return (
            <label className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-neutral-300">
                <Camera className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Optics</span>
                <select
                    value={String(selectedLensPreset)}
                    onChange={(event) => onSetLens(Number(event.target.value))}
                    className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] text-white outline-none transition-colors focus:border-white/20"
                    aria-label="Lens preset"
                >
                    {LENS_PRESETS.map((lensMm) => (
                        <option key={lensMm} value={lensMm}>
                            {lensMm}mm
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    return (
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-neutral-300">
                <Camera className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Lens</span>
            </div>
            {LENS_PRESETS.map((lensMm) => {
                const active = Math.round(activeLensMm) === lensMm;
                return (
                    <button
                        key={lensMm}
                        type="button"
                        onClick={() => onSetLens(lensMm)}
                        className={`shrink-0 rounded-full border px-3 py-2 text-[11px] transition-colors ${
                            active
                                ? "border-white/15 bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
                                : "border-white/10 bg-black/35 text-neutral-300 hover:border-white/20 hover:text-white"
                        }`}
                    >
                        {lensMm}mm
                    </button>
                );
            })}
        </div>
    );
});

const ViewerStandbyHud = React.memo(function ViewerStandbyHud({
    compact,
    environmentLabel,
    isPreviewRoute,
    leftHudCollapsed,
    onToggleLeftHud,
}: {
    compact: boolean;
    environmentLabel: string;
    isPreviewRoute: boolean;
    leftHudCollapsed: boolean;
    onToggleLeftHud?: () => void;
}) {
    const intakeActionLabel = "Open intake";

    if (compact) {
        return (
            <div className="pointer-events-auto relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,14,20,0.84),rgba(7,9,13,0.76))] px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-200/25 via-white/10 to-transparent" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-neutral-300">
                                <div className="h-2.5 w-2.5 rounded-full bg-neutral-600" />
                                <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Standby</span>
                            </div>
                            {isPreviewRoute ? (
                                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100/85">
                                    Preview safe
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">{environmentLabel}</p>
                        <p className="mt-1 text-[11px] leading-5 text-neutral-400">Directing tools stay dormant until a world is loaded.</p>
                    </div>
                    {leftHudCollapsed && onToggleLeftHud ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={onToggleLeftHud}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                            >
                                {intakeActionLabel}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,14,20,0.88),rgba(7,9,13,0.8))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-200/25 via-white/10 to-transparent" />
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-neutral-300">
                            <div className="h-2.5 w-2.5 rounded-full bg-neutral-600" />
                            <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Viewer standby</span>
                        </div>
                        {isPreviewRoute ? (
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100/85">
                                Preview safe
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-3 text-base font-medium text-white">{environmentLabel}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-300">The viewer is in standby until a world is loaded.</p>
                </div>
                {leftHudCollapsed && onToggleLeftHud ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onToggleLeftHud}
                            className="rounded-full bg-white px-4 py-2 text-[11px] font-medium text-black transition-colors hover:bg-neutral-200"
                        >
                            {intakeActionLabel}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
});

const ViewerTransformToolControls = React.memo(function ViewerTransformToolControls({
    activeTool,
    onSetActiveTool,
}: {
    activeTool: SceneToolMode;
    onSetActiveTool?: (tool: SceneToolMode) => void;
}) {
    if (!onSetActiveTool) {
        return null;
    }

    return (
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {SCENE_TOOL_MODES.map((tool) => {
                const active = tool === activeTool;
                return (
                    <button
                        key={tool}
                        type="button"
                        onClick={() => onSetActiveTool(tool)}
                        className={`rounded-full px-3 py-2 text-[11px] transition-colors ${
                            active
                                ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
                                : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                        }`}
                    >
                        {SCENE_TOOL_LABELS[tool]}
                    </button>
                );
            })}
        </div>
    );
});

const ViewerTransformSessionControls = React.memo(function ViewerTransformSessionControls({
    activeTool,
    transformSpace,
    transformSnap,
    onSetTransformSpace,
    onToggleTransformSnap,
    onCycleTransformSnap,
}: {
    activeTool: SceneToolMode;
    transformSpace?: SceneTransformSpace;
    transformSnap?: SceneTransformSnapSettings;
    onSetTransformSpace?: (space: SceneTransformSpace) => void;
    onToggleTransformSnap?: () => void;
    onCycleTransformSnap?: () => void;
}) {
    if (
        !isTransformToolMode(activeTool) ||
        !transformSpace ||
        !transformSnap ||
        !onSetTransformSpace ||
        !onToggleTransformSnap ||
        !onCycleTransformSnap
    ) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                {(["world", "local"] as const).map((space) => {
                    const active = space === transformSpace;
                    return (
                        <button
                            key={space}
                            type="button"
                            onClick={() => onSetTransformSpace(space)}
                            className={`rounded-full px-3 py-2 text-[11px] transition-colors ${
                                active
                                    ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
                                    : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                            }`}
                        >
                            {space === "world" ? "World" : "Local"}
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                onClick={onToggleTransformSnap}
                className={`rounded-full border px-3 py-2 text-[11px] transition-colors ${
                    transformSnap.enabled
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-black/35 text-neutral-300 hover:border-white/20 hover:text-white"
                }`}
            >
                {transformSnap.enabled ? "Snap on" : "Snap off"}
            </button>
            <button
                type="button"
                onClick={onCycleTransformSnap}
                disabled={!transformSnap.enabled}
                className="rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-white transition-colors hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {formatTransformSnapValue(activeTool, transformSnap)}
            </button>
        </div>
    );
});

const ViewerOverlaySurface = React.memo(function ViewerOverlaySurface({
    clarityMode,
    referenceImage,
    isReferenceOnlyDemo,
    isLegacyDemoWorld,
    shouldUseStaticReferenceViewer,
    shouldRenderInteractiveViewer,
    hasEnvironmentSplat,
    interactiveViewer,
    viewerReady,
}: {
    clarityMode: boolean;
    referenceImage: string | null;
    isReferenceOnlyDemo: boolean;
    isLegacyDemoWorld: boolean;
    shouldUseStaticReferenceViewer: boolean;
    shouldRenderInteractiveViewer: boolean;
    hasEnvironmentSplat: boolean;
    interactiveViewer: React.ReactNode;
    viewerReady: boolean;
}) {
    return (
        <>
            {shouldUseStaticReferenceViewer && referenceImage ? (
                <StaticReferenceViewer
                    referenceImage={referenceImage}
                    title={isReferenceOnlyDemo ? "Reference-only demo" : "Demo world"}
                    description={
                        isReferenceOnlyDemo
                            ? "This draft is reference-only. Build or import a real world before treating the viewer as a persistent environment."
                            : "Demo worlds are shown as stable reference surfaces here until you load a real renderable scene."
                    }
                />
            ) : shouldRenderInteractiveViewer ? (
                interactiveViewer
            ) : (
                <EmptyViewerState />
            )}

            {viewerReady && !shouldUseStaticReferenceViewer && !hasEnvironmentSplat && referenceImage ? (
                <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-20 md:right-auto">
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(180deg,rgba(8,11,16,0.92),rgba(7,10,14,0.96))] shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl"
                        data-testid="mvp-reference-card"
                    >
                        <div className="relative aspect-[16/10] w-full overflow-hidden">
                            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${referenceImage})` }} />
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.68))]" />
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">Reference view</p>
                                <p className="mt-2 text-base font-medium text-white">
                                    {isReferenceOnlyDemo ? "Reference-only demo" : isLegacyDemoWorld ? "Demo world" : "Reference image"}
                                </p>
                                <p className="mt-2 max-w-xs text-xs leading-5 text-neutral-200">
                                    {isReferenceOnlyDemo
                                        ? "This draft is reference-only. Build or import a real world before treating the viewer as a persistent environment."
                                        : isLegacyDemoWorld
                                          ? "Recovered an older demo world state. Open the preview intro or replace it with your own world when you are ready."
                                          : "Using the source still as a fallback while the viewer waits for a renderable environment."}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {shouldRenderInteractiveViewer ? (
                <div className="absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 h-[1px] w-8 -translate-x-1/2 -translate-y-1/2 bg-white" />
                    <div className="absolute top-1/2 left-1/2 h-8 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-white" />
                </div>
            ) : null}
        </>
    );
});

const ViewerSelectionTray = React.memo(function ViewerSelectionTray({
    selectedPin,
    selectedView,
    viewCount,
    pinCount,
    directorPath,
    directorBrief,
    readOnly,
    isPinPlacementEnabled,
    allowDirectorBriefEditing,
    onFocusSelectedPin,
    onClearDirectorPath,
    onUpdateDirectorBrief,
}: {
    selectedPin: SpatialPin | null;
    selectedView: CameraView | null;
    viewCount: number;
    pinCount: number;
    directorPath: CameraPathFrame[];
    directorBrief: string;
    readOnly: boolean;
    isPinPlacementEnabled: boolean;
    allowDirectorBriefEditing: boolean;
    onFocusSelectedPin: () => void;
    onClearDirectorPath: () => void;
    onUpdateDirectorBrief?: (directorBrief: string) => void;
}) {
    const hasContextualTray = selectedPin || selectedView || directorPath.length > 0 || Boolean(directorBrief.trim());

    if (!hasContextualTray) {
        return null;
    }

    return (
        <div
            className={`${isPinPlacementEnabled ? "pointer-events-none " : ""}absolute bottom-4 left-4 right-4 z-30 md:bottom-5 md:left-5 md:right-5`}
            data-testid="mvp-viewer-selection-tray"
        >
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,12,17,0.82),rgba(7,9,13,0.74))] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                        {selectedPin ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Selected pin</p>
                                <p className="text-sm text-white">{selectedPin.label}</p>
                                <p className="text-[11px] text-neutral-500">
                                    {selectedPin.type} · [{selectedPin.position.map((value) => value.toFixed(2)).join(", ")}]
                                </p>
                            </div>
                        ) : null}
                        {selectedView ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Selected view</p>
                                <p className="text-sm text-white">{selectedView.label}</p>
                                <p className="text-[11px] text-neutral-500">
                                    {selectedView.lens_mm.toFixed(0)}mm · FOV {selectedView.fov.toFixed(1)}
                                </p>
                            </div>
                        ) : null}
                        {!selectedPin && !selectedView ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Scene direction</p>
                                <p className="text-sm text-white">
                                    {viewCount} saved view{viewCount === 1 ? "" : "s"} · {pinCount} note{pinCount === 1 ? "" : "s"}
                                </p>
                                <p className="text-[11px] text-neutral-500">
                                    Keep the director brief and path notes attached to the current scene state.
                                </p>
                            </div>
                        ) : null}
                        {directorPath.length > 0 ? (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Recorded path</p>
                                <p className="text-sm text-white">
                                    {directorPath.length} frames · {formatPathDuration(directorPath)}
                                </p>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {selectedPin ? (
                            <button
                                type="button"
                                onClick={onFocusSelectedPin}
                                className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white transition-colors hover:border-sky-500/40 hover:text-sky-200"
                            >
                                <Focus className="mr-1 inline h-3.5 w-3.5" />
                                Focus Pin
                            </button>
                        ) : null}
                        {directorPath.length > 0 && !readOnly ? (
                            <button
                                type="button"
                                onClick={onClearDirectorPath}
                                className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white transition-colors hover:border-rose-500/40 hover:text-rose-200"
                            >
                                Clear Path
                            </button>
                        ) : null}
                    </div>
                </div>

                {!readOnly && allowDirectorBriefEditing ? (
                    <textarea
                        value={directorBrief}
                        onChange={(event) => onUpdateDirectorBrief?.(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
                        placeholder="Director brief: lens intent, blocking concerns, safety notes, or move direction."
                    />
                ) : directorBrief ? (
                    <p className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-300">
                        {directorBrief}
                    </p>
                ) : null}
            </div>
        </div>
    );
});

const ViewerOverlaySurfaceForSceneSlices = React.memo(function ViewerOverlaySurfaceForSceneSlices({
    overlaySceneSlices,
    clarityMode,
    interactiveViewer,
    onViewerReadyUnavailable,
    viewerReady,
}: {
    overlaySceneSlices: ViewerOverlaySceneSlices;
    clarityMode: boolean;
    interactiveViewer: React.ReactNode;
    onViewerReadyUnavailable?: () => void;
    viewerReady: boolean;
}) {
    const surfaceDiagnostics = useMemo(
        () => resolveViewerSurfaceDiagnostics(overlaySceneSlices, viewerReady),
        [overlaySceneSlices, viewerReady],
    );

    useEffect(() => {
        if (surfaceDiagnostics.shouldUseStaticReferenceViewer || !surfaceDiagnostics.shouldRenderInteractiveViewer) {
            onViewerReadyUnavailable?.();
        }
    }, [onViewerReadyUnavailable, surfaceDiagnostics.shouldRenderInteractiveViewer, surfaceDiagnostics.shouldUseStaticReferenceViewer]);

    return (
        <ViewerOverlaySurface
            clarityMode={clarityMode}
            referenceImage={surfaceDiagnostics.referenceImage}
            isReferenceOnlyDemo={surfaceDiagnostics.isReferenceOnlyDemo}
            isLegacyDemoWorld={surfaceDiagnostics.isLegacyDemoWorld}
            shouldUseStaticReferenceViewer={surfaceDiagnostics.shouldUseStaticReferenceViewer}
            shouldRenderInteractiveViewer={surfaceDiagnostics.shouldRenderInteractiveViewer}
            hasEnvironmentSplat={surfaceDiagnostics.hasEnvironmentSplat}
            interactiveViewer={interactiveViewer}
            viewerReady={viewerReady}
        />
    );
});

const ViewerDirectorHud = React.memo(function ViewerDirectorHud({
    sceneSlices,
    isPreviewRoute,
    readOnly,
    directorHudCompact,
    leftHudCollapsed,
    rightHudCollapsed,
    processingStatus,
    viewerReady,
    isPinPlacementEnabled,
    pinType,
    isRecordingPath,
    isFullscreen,
    activeTool,
    transformSpace,
    transformSnap,
    onSetActiveTool,
    onSetTransformSpace,
    onToggleTransformSnap,
    onCycleTransformSnap,
    onSetLens,
    onRequestViewCapture,
    onTogglePinPlacement,
    onChangePinType,
    onToggleRecordingPath,
    onToggleLeftHud,
    onToggleRightHud,
    onToggleDirectorHud,
    onToggleAdvancedDensity,
    onToggleFullscreen,
    canUseAdvancedDensity,
    isAdvancedDensityEnabled,
}: {
    sceneSlices: ViewerPanelSceneSlices;
    clarityMode: boolean;
    isPreviewRoute: boolean;
    readOnly: boolean;
    directorHudCompact: boolean;
    leftHudCollapsed: boolean;
    rightHudCollapsed: boolean;
    processingStatus?: {
        busy: boolean;
        label: string;
        detail?: string;
    } | null;
    viewerReady: boolean;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    isFullscreen: boolean;
    activeTool: SceneToolMode;
    transformSpace?: SceneTransformSpace;
    transformSnap?: SceneTransformSnapSettings;
    selectedPinId?: string | null;
    selectedViewId?: string | null;
    onSelectPin?: (pinId: string | null) => void;
    onSelectView?: (viewId: string | null) => void;
    onSetActiveTool?: (tool: SceneToolMode) => void;
    onSetTransformSpace?: (space: SceneTransformSpace) => void;
    onToggleTransformSnap?: () => void;
    onCycleTransformSnap?: () => void;
    onFocusView: (view: CameraView) => void;
    onSetLens: (lensMm: number) => void;
    onRequestViewCapture: () => void;
    onTogglePinPlacement: () => void;
    onChangePinType: (pinType: SpatialPinType) => void;
    onToggleRecordingPath: () => void;
    onToggleLeftHud?: () => void;
    onToggleRightHud?: () => void;
    onToggleDirectorHud?: () => void;
    onToggleAdvancedDensity?: () => void;
    onToggleFullscreen: () => void | Promise<void>;
    canUseAdvancedDensity?: boolean;
    isAdvancedDensityEnabled?: boolean;
}) {
    const hasEnvironment = Boolean(sceneSlices.environment);
    const environmentState = describeEnvironment(sceneSlices.environment);
    const environmentRenderState = resolveEnvironmentRenderState(sceneSlices.environment);
    const hasEnvironmentSplat = environmentRenderState.hasRenderableOutput;
    const isReferenceOnlyDemo = environmentRenderState.isReferenceOnlyDemo;
    const isLegacyDemoWorld = environmentRenderState.isLegacyDemoWorld;
    const referenceImage = environmentRenderState.referenceImage;
    const shouldUseStaticReferenceViewer = Boolean(referenceImage) && !hasEnvironmentSplat && (isReferenceOnlyDemo || isLegacyDemoWorld);
    const shouldRenderInteractiveViewer =
        !shouldUseStaticReferenceViewer &&
        (hasEnvironmentSplat || Boolean(referenceImage) || sceneSlices.assets.length > 0 || sceneSlices.pins.length > 0);
    const hasOperableViewer = viewerReady && shouldRenderInteractiveViewer && !shouldUseStaticReferenceViewer;
    const isStandbyHud = !hasOperableViewer;
    const viewerActionDisabled = readOnly || !viewerReady;
    const cameraViewActionDisabled =
        readOnly || !(viewerReady || shouldRenderInteractiveViewer || shouldUseStaticReferenceViewer || hasEnvironment);
    const canCaptureView = !cameraViewActionDisabled && hasOperableViewer;
    const canAnnotate = !viewerActionDisabled && hasOperableViewer;
    const canRecordPath = Boolean(isAdvancedDensityEnabled) && !viewerActionDisabled && hasOperableViewer;
    const canUseTransformTools = Boolean(isAdvancedDensityEnabled);
    const directorHudToggleLabel = directorHudCompact ? "Open full controls" : "Return to dock";
    const environmentIndicatorClassName =
        hasEnvironment && !isReferenceOnlyDemo && !isLegacyDemoWorld
            ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
            : "bg-neutral-600";
    const utilityButtonClassName =
        "rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-neutral-100 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white";
    const studioControlsButtonClassName = isAdvancedDensityEnabled
        ? "rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100 transition-colors hover:bg-sky-500/15"
        : utilityButtonClassName;

    if (isStandbyHud) {
        return (
            <ViewerStandbyHud
                compact
                environmentLabel={environmentState.label}
                isPreviewRoute={isPreviewRoute}
                leftHudCollapsed={leftHudCollapsed}
                onToggleLeftHud={onToggleLeftHud}
            />
        );
    }

    if (directorHudCompact) {
        return (
            <div className="pointer-events-auto relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,14,20,0.84),rgba(7,9,13,0.76))] px-3 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-200/25 via-white/10 to-transparent" />
                <div className="grid gap-2.5 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div className="flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${environmentIndicatorClassName}`} />
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Environment</p>
                            <p className="truncate text-xs font-medium text-neutral-100">{environmentState.label}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                        {canUseTransformTools ? <ViewerTransformToolControls activeTool={activeTool} onSetActiveTool={onSetActiveTool} /> : null}
                        <ViewerLensPresetControls activeLensMm={sceneSlices.viewer.lens_mm} onSetLens={onSetLens} compact />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                        {canCaptureView ? (
                            <button
                                type="button"
                                onClick={onRequestViewCapture}
                                className={`${utilityButtonClassName} shrink-0`}
                            >
                                Save framing
                            </button>
                        ) : null}
                        {canAnnotate ? (
                            <button
                                type="button"
                                onClick={onTogglePinPlacement}
                                className={`shrink-0 rounded-full border px-3 py-2 text-[11px] transition-colors ${
                                    isPinPlacementEnabled
                                        ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                                        : "border-white/10 bg-black/35 text-neutral-100 hover:border-sky-500/40 hover:text-sky-200"
                                }`}
                            >
                                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                                {isPinPlacementEnabled ? "Placing note" : "Add note"}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => void onToggleFullscreen()}
                            className={`${utilityButtonClassName} shrink-0`}
                        >
                            {isFullscreen ? <Minimize2 className="mr-1 inline h-3.5 w-3.5" /> : <Maximize2 className="mr-1 inline h-3.5 w-3.5" />}
                            {isFullscreen ? "Exit full screen" : "Full screen"}
                        </button>
                        <button
                            type="button"
                            onClick={onToggleDirectorHud}
                            className={`${utilityButtonClassName} shrink-0`}
                            aria-label={directorHudToggleLabel}
                        >
                            <Maximize2 className="mr-1 inline h-3.5 w-3.5" />
                            Controls
                        </button>
                        {canUseAdvancedDensity && onToggleAdvancedDensity ? (
                            <button
                                type="button"
                                onClick={onToggleAdvancedDensity}
                                className={`${studioControlsButtonClassName} shrink-0`}
                            >
                                {isAdvancedDensityEnabled ? "Studio on" : "Studio off"}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,14,20,0.84),rgba(7,9,13,0.76))] p-3.5 shadow-[0_20px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-200/25 via-white/10 to-transparent" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-[180px] items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${environmentIndicatorClassName}`} />
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Environment</p>
                        <span className="truncate text-sm font-medium text-neutral-100">{environmentState.label}</span>
                    </div>
                    {isPreviewRoute ? (
                        <span
                            className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100/85"
                            data-testid="mvp-preview-route-badge"
                        >
                            Preview safe
                        </span>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {processingStatus ? (
                        <div className="rounded-full border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-[11px] text-sky-100">
                            {processingStatus.busy ? "Rendering" : "Status"}: {processingStatus.label}
                        </div>
                    ) : null}
                    {canCaptureView ? (
                        <button
                            type="button"
                            onClick={onRequestViewCapture}
                            className={utilityButtonClassName}
                        >
                            Save framing
                        </button>
                    ) : null}
                    {canAnnotate ? (
                        <>
                            <button
                                type="button"
                                onClick={onTogglePinPlacement}
                                className={`rounded-full border px-3 py-2 text-[11px] transition-colors ${
                                    isPinPlacementEnabled
                                        ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                                        : "border-white/10 bg-black/35 text-neutral-100 hover:border-sky-500/40 hover:text-sky-200"
                                }`}
                            >
                                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                                {isPinPlacementEnabled ? "Placing note" : "Add note"}
                            </button>
                            {isAdvancedDensityEnabled ? (
                                <select
                                    value={pinType}
                                    onChange={(event) => onChangePinType(event.target.value as SpatialPinType)}
                                    className="rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-white outline-none transition-colors focus:border-sky-500/40"
                                    aria-label="Annotation type"
                                >
                                    <option value="general">General</option>
                                    <option value="egress">Egress</option>
                                    <option value="lighting">Lighting</option>
                                    <option value="hazard">Hazard</option>
                                </select>
                            ) : null}
                        </>
                    ) : null}
                    {canRecordPath ? (
                        <>
                            <button
                                type="button"
                                onClick={onToggleRecordingPath}
                                className={`rounded-full border px-3 py-2 text-[11px] transition-colors ${
                                    isRecordingPath
                                        ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                                        : "border-white/10 bg-black/35 text-neutral-100 hover:border-amber-500/40 hover:text-amber-200"
                                }`}
                            >
                                <Video className="mr-1 inline h-3.5 w-3.5" />
                                {isRecordingPath ? "Stop move" : "Record camera move"}
                            </button>
                        </>
                    ) : null}
                    <button type="button" onClick={() => void onToggleFullscreen()} className={utilityButtonClassName}>
                        {isFullscreen ? <Minimize2 className="mr-1 inline h-3.5 w-3.5" /> : <Maximize2 className="mr-1 inline h-3.5 w-3.5" />}
                        {isFullscreen ? "Exit full screen" : "Full screen"}
                    </button>
                    {onToggleDirectorHud ? (
                        <button type="button" onClick={onToggleDirectorHud} className={utilityButtonClassName} aria-label={directorHudToggleLabel}>
                            <Minimize2 className="mr-1 inline h-3.5 w-3.5" />
                            Compact HUD
                        </button>
                    ) : null}
                    {canUseAdvancedDensity && onToggleAdvancedDensity ? (
                        <button type="button" onClick={onToggleAdvancedDensity} className={studioControlsButtonClassName}>
                            {isAdvancedDensityEnabled ? "Studio view on" : "Studio view off"}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <ViewerLensPresetControls activeLensMm={sceneSlices.viewer.lens_mm} onSetLens={onSetLens} />
                </div>
                {canUseTransformTools ? (
                    <div className="shrink-0">
                        <ViewerTransformToolControls activeTool={activeTool} onSetActiveTool={onSetActiveTool} />
                    </div>
                ) : null}
                {canUseTransformTools && isTransformToolMode(activeTool) ? (
                    <div className="shrink-0">
                        <ViewerTransformSessionControls
                            activeTool={activeTool}
                            transformSpace={transformSpace}
                            transformSnap={transformSnap}
                            onSetTransformSpace={onSetTransformSpace}
                            onToggleTransformSnap={onToggleTransformSnap}
                            onCycleTransformSnap={onCycleTransformSnap}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
});

const ViewerSelectionTrayForSceneSlices = React.memo(function ViewerSelectionTrayForSceneSlices({
    sceneSlices,
    selectedPinId,
    selectedViewId,
    readOnly,
    isPinPlacementEnabled,
    allowDirectorBriefEditing,
    onFocusSelectedPin,
    onClearDirectorPath,
    onUpdateDirectorBrief,
}: {
    sceneSlices: ViewerPanelSceneSlices;
    selectedPinId?: string | null;
    selectedViewId?: string | null;
    readOnly: boolean;
    isPinPlacementEnabled: boolean;
    allowDirectorBriefEditing: boolean;
    onFocusSelectedPin: () => void;
    onClearDirectorPath: () => void;
    onUpdateDirectorBrief?: (directorBrief: string) => void;
}) {
    const selectedView = sceneSlices.camera_views.find((view) => view.id === selectedViewId) ?? null;
    const selectedPin = sceneSlices.pins.find((pin) => pin.id === selectedPinId) ?? null;

    return (
        <ViewerSelectionTray
            selectedPin={selectedPin}
            selectedView={selectedView}
            viewCount={sceneSlices.camera_views.length}
            pinCount={sceneSlices.pins.length}
            directorPath={sceneSlices.director_path}
            directorBrief={sceneSlices.director_brief}
            readOnly={readOnly}
            isPinPlacementEnabled={isPinPlacementEnabled}
            allowDirectorBriefEditing={allowDirectorBriefEditing}
            onFocusSelectedPin={onFocusSelectedPin}
            onClearDirectorPath={onClearDirectorPath}
            onUpdateDirectorBrief={onUpdateDirectorBrief}
        />
    );
});

type ViewerPanelProps = {
    clarityMode?: boolean;
    routeVariant?: "workspace" | "preview";
    leftHudCollapsed?: boolean;
    rightHudCollapsed?: boolean;
    directorHudCompact?: boolean;
    onToggleLeftHud?: () => void;
    onToggleRightHud?: () => void;
    onToggleDirectorHud?: () => void;
    processingStatus?: {
        busy: boolean;
        label: string;
        detail?: string;
    } | null;
    sceneDocument?: SceneDocumentV2;
    readOnly?: boolean;
    selectedPinId?: string | null;
    onSelectPin?: (pinId: string | null) => void;
    selectedViewId?: string | null;
    onSelectView?: (viewId: string | null) => void;
    focusRequest?: FocusRequest;
};

const ViewerPanelFrame = React.memo(function ViewerPanelFrame({
    directorHudCompact,
    isPinPlacementEnabled,
    containerRef,
    onDrop,
    onDragOver,
    directorHud,
    overlaySurface,
    selectionTray,
    surfaceDiagnostics,
}: {
    directorHudCompact: boolean;
    isPinPlacementEnabled: boolean;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onDrop: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    directorHud: React.ReactNode;
    overlaySurface: React.ReactNode;
    selectionTray: React.ReactNode;
    surfaceDiagnostics: ViewerSurfaceDiagnostics;
}) {
    return (
        <div
            className="relative flex h-full w-full flex-col bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%),linear-gradient(180deg,#050608_0%,#040507_100%)]"
            ref={containerRef}
        >
            <div
                className={
                    directorHudCompact
                        ? "pointer-events-none absolute inset-x-4 top-4 z-30 md:inset-x-5"
                        : `${isPinPlacementEnabled ? "pointer-events-none " : ""}absolute inset-x-0 top-0 z-30 shrink-0 p-4 md:p-5`
                }
            >
                {directorHud}
            </div>

            <div
                className="relative m-4 flex-1 overflow-hidden rounded-[28px] border border-neutral-800/50 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%),linear-gradient(180deg,#050608_0%,#040507_100%)] shadow-2xl md:m-5 xl:m-4 2xl:m-5"
                data-testid="mvp-viewer-surface"
                data-surface-mode={surfaceDiagnostics.surfaceMode}
                data-coverage={surfaceDiagnostics.coverage}
                data-viewer-ready={surfaceDiagnostics.viewerReady ? "true" : "false"}
                data-has-renderable-environment={surfaceDiagnostics.hasEnvironmentSplat ? "true" : "false"}
                data-has-reference-image={surfaceDiagnostics.hasReferenceImage ? "true" : "false"}
                onDrop={onDrop}
                onDragOver={onDragOver}
            >
                <div
                    data-testid="mvp-viewer-surface-diagnostics"
                    data-surface-mode={surfaceDiagnostics.surfaceMode}
                    data-coverage={surfaceDiagnostics.coverage}
                    data-viewer-ready={surfaceDiagnostics.viewerReady ? "true" : "false"}
                    data-has-renderable-environment={surfaceDiagnostics.hasEnvironmentSplat ? "true" : "false"}
                    data-has-reference-image={surfaceDiagnostics.hasReferenceImage ? "true" : "false"}
                    data-is-reference-only-demo={surfaceDiagnostics.isReferenceOnlyDemo ? "true" : "false"}
                    data-is-legacy-demo-world={surfaceDiagnostics.isLegacyDemoWorld ? "true" : "false"}
                    hidden
                />
                {overlaySurface}
            </div>

            {selectionTray}
        </div>
    );
});

const ViewerPanelWorkspaceMode = React.memo(function ViewerPanelWorkspaceMode({
    clarityMode = false,
    routeVariant = "workspace",
    readOnly = false,
}: ViewerPanelProps) {
    const workspaceViewer = useMvpWorkspaceViewerController({
        routeVariant,
        readOnly,
    });
    const viewerSurfaceDiagnostics = useMemo(
        () => resolveViewerSurfaceDiagnostics(workspaceViewer.overlaySceneSlices, workspaceViewer.viewerReady),
        [workspaceViewer.overlaySceneSlices, workspaceViewer.viewerReady],
    );

    return (
        <ViewerPanelFrame
            directorHudCompact={workspaceViewer.hudState.directorHudCompact}
            isPinPlacementEnabled={workspaceViewer.isPinPlacementEnabled}
            containerRef={workspaceViewer.containerRef}
            onDrop={workspaceViewer.handleDrop}
            onDragOver={workspaceViewer.handleDragOver}
            surfaceDiagnostics={viewerSurfaceDiagnostics}
            directorHud={
                <ViewerDirectorHud
                    sceneSlices={workspaceViewer.sceneSlices}
                    clarityMode={clarityMode}
                    isPreviewRoute={workspaceViewer.isPreviewRoute}
                    readOnly={readOnly}
                    directorHudCompact={workspaceViewer.hudState.directorHudCompact}
                    leftHudCollapsed={workspaceViewer.hudState.leftRailCollapsed}
                    rightHudCollapsed={workspaceViewer.hudState.rightRailCollapsed}
                    processingStatus={workspaceViewer.processingStatus}
                    viewerReady={workspaceViewer.viewerReady}
                    isPinPlacementEnabled={workspaceViewer.isPinPlacementEnabled}
                    pinType={workspaceViewer.pinType}
                    isRecordingPath={workspaceViewer.isRecordingPath}
                    isFullscreen={workspaceViewer.isFullscreen}
                    activeTool={workspaceViewer.activeTool}
                    transformSpace={workspaceViewer.transformSpace}
                    transformSnap={workspaceViewer.transformSnap}
                    selectedPinId={workspaceViewer.selectedPinId}
                    selectedViewId={workspaceViewer.selectedViewId}
                    onSelectPin={workspaceViewer.selectPin}
                    onSelectView={workspaceViewer.selectView}
                    onSetActiveTool={readOnly ? undefined : workspaceViewer.setActiveTool}
                    onSetTransformSpace={readOnly ? undefined : workspaceViewer.setTransformSpace}
                    onToggleTransformSnap={readOnly ? undefined : workspaceViewer.toggleTransformSnap}
                    onCycleTransformSnap={readOnly ? undefined : workspaceViewer.cycleActiveToolSnap}
                    onFocusView={workspaceViewer.focusView}
                    onSetLens={workspaceViewer.setLens}
                    onRequestViewCapture={workspaceViewer.requestViewCapture}
                    onTogglePinPlacement={workspaceViewer.togglePinPlacement}
                    onChangePinType={workspaceViewer.changePinType}
                    onToggleRecordingPath={workspaceViewer.toggleRecordingPath}
                    onToggleLeftHud={workspaceViewer.toggleLeftHud}
                    onToggleRightHud={workspaceViewer.toggleRightHud}
                    onToggleDirectorHud={workspaceViewer.toggleDirectorHud}
                    onToggleAdvancedDensity={workspaceViewer.toggleAdvancedDensity}
                    onToggleFullscreen={workspaceViewer.toggleFullscreen}
                    canUseAdvancedDensity={workspaceViewer.canUseAdvancedDensity}
                    isAdvancedDensityEnabled={workspaceViewer.isAdvancedDensityEnabled}
                />
            }
            overlaySurface={
                <ViewerOverlaySurfaceForSceneSlices
                    overlaySceneSlices={workspaceViewer.overlaySceneSlices}
                    clarityMode={clarityMode}
                    interactiveViewer={
                        <ThreeOverlayConnected
                            readOnly={readOnly}
                            backgroundColor={workspaceViewer.isPreviewRoute ? "#040507" : undefined}
                            onCapturePose={workspaceViewer.handleCapturePose}
                            onPathRecorded={workspaceViewer.handlePathRecorded}
                        />
                    }
                    onViewerReadyUnavailable={() => workspaceViewer.setViewerReady(false)}
                    viewerReady={workspaceViewer.viewerReady}
                />
            }
            selectionTray={
                <ViewerSelectionTrayForSceneSlices
                    sceneSlices={workspaceViewer.sceneSlices}
                    selectedPinId={workspaceViewer.selectedPinId}
                    selectedViewId={workspaceViewer.selectedViewId}
                    readOnly={readOnly}
                    isPinPlacementEnabled={workspaceViewer.isPinPlacementEnabled}
                    allowDirectorBriefEditing={workspaceViewer.isAdvancedDensityEnabled}
                    onFocusSelectedPin={workspaceViewer.focusPin}
                    onClearDirectorPath={workspaceViewer.clearDirectorPath}
                    onUpdateDirectorBrief={workspaceViewer.setDirectorBrief}
                />
            }
        />
    );
});

const ViewerPanelOverrideMode = React.memo(function ViewerPanelOverrideMode({
    clarityMode = false,
    routeVariant = "workspace",
    leftHudCollapsed = false,
    rightHudCollapsed = false,
    directorHudCompact = false,
    onToggleLeftHud,
    onToggleRightHud,
    onToggleDirectorHud,
    processingStatus,
    sceneDocument,
    readOnly = false,
    selectedPinId,
    onSelectPin,
    selectedViewId,
    onSelectView,
    focusRequest,
}: ViewerPanelProps & { sceneDocument: SceneDocumentV2 }) {
    const overrideSceneSlices = useMemo(() => selectViewerPanelSceneSlicesFromDocument(sceneDocument), [sceneDocument]);
    const overrideOverlaySceneSlices = useMemo(
        () => pickViewerOverlaySceneSlices(overrideSceneSlices),
        [overrideSceneSlices],
    );
    const getCurrentSceneSlices = useCallback(() => overrideSceneSlices, [overrideSceneSlices]);
    const {
        isPreviewRoute,
        combinedFocusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        isRecordingPath,
        isFullscreen,
        viewerReady,
        containerRef,
        setViewerReady,
        handleDrop,
        handleDragOver,
        focusView,
        focusPin,
        requestViewCapture,
        handleCapturePose,
        handlePathRecorded,
        clearDirectorPath,
        toggleFullscreen,
        setLens,
        togglePinPlacement,
        changePinType,
        toggleRecordingPath,
    } = useViewerPanelInteractionController({
        routeVariant,
        readOnly,
        pinCount: overrideSceneSlices.pins.length,
        getCurrentSceneSlices,
        selectedPinId,
        selectedViewId,
        focusRequest,
        onSelectPin,
        onSelectView,
    });
    const viewerSurfaceDiagnostics = useMemo(
        () => resolveViewerSurfaceDiagnostics(overrideOverlaySceneSlices, viewerReady),
        [overrideOverlaySceneSlices, viewerReady],
    );
    return (
        <ViewerPanelFrame
            directorHudCompact={directorHudCompact}
            isPinPlacementEnabled={isPinPlacementEnabled}
            containerRef={containerRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            surfaceDiagnostics={viewerSurfaceDiagnostics}
            directorHud={
                <ViewerDirectorHud
                    sceneSlices={overrideSceneSlices}
                    clarityMode={clarityMode}
                    isPreviewRoute={isPreviewRoute}
                    readOnly={readOnly}
                    directorHudCompact={directorHudCompact}
                    leftHudCollapsed={leftHudCollapsed}
                    rightHudCollapsed={rightHudCollapsed}
                    processingStatus={processingStatus}
                    viewerReady={viewerReady}
                    isPinPlacementEnabled={isPinPlacementEnabled}
                    pinType={pinType}
                    isRecordingPath={isRecordingPath}
                    isFullscreen={isFullscreen}
                    activeTool="select"
                    selectedPinId={selectedPinId}
                    selectedViewId={selectedViewId}
                    onSelectPin={onSelectPin}
                    onSelectView={onSelectView}
                    onFocusView={focusView}
                    onSetLens={setLens}
                    onRequestViewCapture={requestViewCapture}
                    onTogglePinPlacement={togglePinPlacement}
                    onChangePinType={changePinType}
                    onToggleRecordingPath={toggleRecordingPath}
                    onToggleLeftHud={onToggleLeftHud}
                    onToggleRightHud={onToggleRightHud}
                    onToggleDirectorHud={onToggleDirectorHud}
                    onToggleFullscreen={toggleFullscreen}
                    canUseAdvancedDensity={false}
                    isAdvancedDensityEnabled={false}
                />
            }
            overlaySurface={
                <ViewerOverlaySurfaceForSceneSlices
                    overlaySceneSlices={overrideOverlaySceneSlices}
                    clarityMode={clarityMode}
                    interactiveViewer={
                        <ThreeOverlay
                            environment={overrideOverlaySceneSlices.environment}
                            assets={overrideOverlaySceneSlices.assets}
                            sceneDocument={sceneDocument}
                            pins={overrideOverlaySceneSlices.pins}
                            viewer={overrideOverlaySceneSlices.viewer}
                            focusRequest={combinedFocusRequest}
                            captureRequestKey={captureRequestKey}
                            isPinPlacementEnabled={isPinPlacementEnabled}
                            pinType={pinType}
                            isRecordingPath={isRecordingPath}
                            onCapturePose={handleCapturePose}
                            onPathRecorded={handlePathRecorded}
                            onViewerReadyChange={setViewerReady}
                            readOnly={readOnly}
                            backgroundColor={isPreviewRoute ? "#040507" : undefined}
                            selectedPinId={selectedPinId}
                            onSelectPin={onSelectPin}
                        />
                    }
                    onViewerReadyUnavailable={() => setViewerReady(false)}
                    viewerReady={viewerReady}
                />
            }
            selectionTray={
                <ViewerSelectionTrayForSceneSlices
                    sceneSlices={overrideSceneSlices}
                    selectedPinId={selectedPinId}
                    selectedViewId={selectedViewId}
                    readOnly={readOnly}
                    isPinPlacementEnabled={isPinPlacementEnabled}
                    allowDirectorBriefEditing={false}
                    onFocusSelectedPin={focusPin}
                    onClearDirectorPath={clearDirectorPath}
                />
            }
        />
    );
});

export default function ViewerPanel(props: ViewerPanelProps) {
    if (props.sceneDocument) {
        return <ViewerPanelOverrideMode {...props} sceneDocument={props.sceneDocument} />;
    }
    return <ViewerPanelWorkspaceMode {...props} />;
}
