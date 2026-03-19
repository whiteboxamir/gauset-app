"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";

import EnvironmentSplat from "./EnvironmentSplat";
import {
    InteractiveSingleImageFallbackSurface,
    SingleImagePreviewSurface,
    ThreeOverlayFallback,
} from "./ThreeOverlayFallbackSurfaces";
import { CameraRig } from "./ThreeOverlayCameraRig";
import { LoadingLabel } from "./ThreeOverlayLoadingLabel";
import { PinLayer } from "./ThreeOverlayPinLayer";
import { SceneAssetNode, SceneUtilityNode } from "./ThreeOverlaySceneAssets";
import { ThreeOverlayTransformControls } from "./ThreeOverlayTransformControls";
import {
    SceneBackgroundLock,
    TemporalAntialiasingComposer,
    ViewerContactShadows,
    ViewerGrid,
} from "./ThreeOverlayViewportPrimitives";
import { DEFAULT_EDITOR_VIEWER_BACKGROUND, EDITOR_CAMERA_FAR, EDITOR_CAMERA_NEAR, type AssetTransformPatch, type SceneAsset } from "./threeOverlayShared";
import { useThreeOverlaySurfaceController } from "./useThreeOverlaySurfaceController";
import type { ViewerRuntimeDiagnostics } from "./useThreeOverlayViewerRuntimeController";
import type { ViewerQualityPolicy } from "./viewerQualityPolicy";
import { useMvpWorkspaceThreeOverlayController } from "@/app/mvp/_hooks/useMvpWorkspaceThreeOverlayController";
import type { SceneTransformSessionState, SceneTransformSnapSettings, SceneTransformSpace } from "@/lib/render/transformSessions.ts";
import type { SceneDocumentV2, SceneNodeId, SceneToolMode } from "@/lib/scene-graph/types.ts";
import {
    type CameraPathFrame,
    type CameraPose,
    type SpatialPin,
    type SpatialPinType,
    type ViewerState,
    type WorkspaceSceneGraph,
} from "@/lib/mvp-workspace";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import type { MvpSceneSelectionMode } from "@/state/mvpSceneStore.ts";

export interface ThreeOverlayProps {
    environment: WorkspaceSceneGraph["environment"];
    assets: SceneAsset[];
    sceneDocument?: SceneDocumentV2;
    pins: SpatialPin[];
    viewer: ViewerState;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    onCapturePose: (pose: CameraPose) => void;
    onPathRecorded: (path: CameraPathFrame[]) => void;
    onViewerReadyChange: (ready: boolean) => void;
    readOnly?: boolean;
    backgroundColor?: string;
    selectedNodeIds?: SceneNodeId[];
    selectedPinId?: string | null;
    selectedAssetInstanceIds?: string[];
    transformSpace?: SceneTransformSpace;
    transformSnap?: SceneTransformSnapSettings;
    transformSession?: SceneTransformSessionState | null;
    onSelectNode?: (nodeId: SceneNodeId, options?: { mode?: MvpSceneSelectionMode }) => void;
    activeTool?: SceneToolMode;
    onSelectPin?: (pinId: string | null) => void;
    onClearSelection?: () => void;
    onSelectAsset?: (instanceId: string, options?: { mode?: MvpSceneSelectionMode }) => void;
    onBeginTransformSession?: (session: {
        nodeIds: SceneNodeId[];
        mode: Exclude<SceneToolMode, "select">;
        space: SceneTransformSpace;
        anchorWorldMatrix: number[];
        nodes: SceneTransformSessionState["nodes"];
    }) => void;
    onUpdateTransformSessionDrafts?: (drafts: Record<SceneNodeId, AssetTransformPatch>) => void;
    onCancelTransformSession?: () => void;
    onCommitTransformSession?: () => void;
    onUpdateNodeTransformDraft?: (nodeId: SceneNodeId, patch: AssetTransformPatch) => void;
    onUpdateAssetTransformDraft?: (instanceId: string, patch: AssetTransformPatch) => void;
    onCommitSceneTransforms?: () => void;
    onAppendPin?: (pin: SpatialPin) => void;
}

interface ThreeOverlayConnectedProps {
    readOnly?: boolean;
    backgroundColor?: string;
    onCapturePose: (pose: CameraPose) => void;
    onPathRecorded: (path: CameraPathFrame[]) => void;
}

class CanvasErrorBoundary extends React.Component<
    {
        onError: (error: Error) => void;
        children: React.ReactNode;
    },
    { hasError: boolean }
> {
    constructor(props: { onError: (error: Error) => void; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        this.props.onError(error);
    }

    render() {
        if (this.state.hasError) {
            return null;
        }
        return this.props.children;
    }
}

type AdaptiveViewerQualityTier = "full" | "balanced" | "safe";
type PosterCurtainStage = "hidden" | "locked" | "releasing";

type ViewerRuntimeTelemetrySnapshot = {
    frameCount: number;
    frameAvgMs: number | null;
    frameP95Ms: number | null;
    frameWorstMs: number | null;
    frameOver33MsRatio: number | null;
    frameOver50MsRatio: number | null;
    adaptiveTransitionCount: number;
    adaptiveFullMs: number;
    adaptiveBalancedMs: number;
    adaptiveSafeMs: number;
    adaptiveSafeEntries: number;
    firstFrameAtMs: number | null;
    firstStableFrameAtMs: number | null;
};

const ADAPTIVE_QUALITY_SAMPLE_WINDOW = 45;
const ADAPTIVE_QUALITY_WARMUP_FRAMES = 24;
const ADAPTIVE_QUALITY_SLOW_FRAME_SECONDS = 1 / 28;
const ADAPTIVE_QUALITY_VERY_SLOW_FRAME_SECONDS = 1 / 18;
const ADAPTIVE_QUALITY_RECOVERY_FRAME_SECONDS = 1 / 48;
const FRAME_BUCKET_UPPER_BOUNDS_MS = [8, 16, 24, 33, 50, 66, 100, Number.POSITIVE_INFINITY] as const;
const VIEWER_RUNTIME_TELEMETRY_PUBLISH_WINDOW_MS = 1000;
const VIEWER_RUNTIME_STABLE_FRAME_STREAK = 18;
const VIEWER_POSTER_CURTAIN_RELEASE_MS = 780;

const DEFAULT_VIEWER_RUNTIME_TELEMETRY: ViewerRuntimeTelemetrySnapshot = {
    frameCount: 0,
    frameAvgMs: null,
    frameP95Ms: null,
    frameWorstMs: null,
    frameOver33MsRatio: null,
    frameOver50MsRatio: null,
    adaptiveTransitionCount: 0,
    adaptiveFullMs: 0,
    adaptiveBalancedMs: 0,
    adaptiveSafeMs: 0,
    adaptiveSafeEntries: 0,
    firstFrameAtMs: null,
    firstStableFrameAtMs: null,
};

function compareAdaptiveQualityTierSeverity(left: AdaptiveViewerQualityTier, right: AdaptiveViewerQualityTier) {
    const severity = {
        full: 0,
        balanced: 1,
        safe: 2,
    } satisfies Record<AdaptiveViewerQualityTier, number>;

    return severity[left] - severity[right];
}

function estimateFrameP95Ms(bucketCounts: number[], frameCount: number) {
    if (frameCount <= 0) {
        return null;
    }

    const target = Math.max(1, Math.ceil(frameCount * 0.95));
    let runningCount = 0;
    for (let bucketIndex = 0; bucketIndex < bucketCounts.length; bucketIndex += 1) {
        runningCount += bucketCounts[bucketIndex] ?? 0;
        if (runningCount >= target) {
            const upperBound = FRAME_BUCKET_UPPER_BOUNDS_MS[bucketIndex] ?? null;
            return Number.isFinite(upperBound) ? upperBound : 100;
        }
    }

    return FRAME_BUCKET_UPPER_BOUNDS_MS[FRAME_BUCKET_UPPER_BOUNDS_MS.length - 1] ?? null;
}

function createEmptyFrameHistogram() {
    return Array.from({ length: FRAME_BUCKET_UPPER_BOUNDS_MS.length }, () => 0);
}

function formatNumericRuntimeDiagnostic(value: number | null) {
    return Number.isFinite(value) ? String(Math.round((value ?? 0) * 1000) / 1000) : "";
}

const ViewerRuntimeTelemetryController = React.memo(function ViewerRuntimeTelemetryController({
    enabled,
    sessionKey,
    adaptiveQualityTier,
    onMetricsChange,
}: {
    enabled: boolean;
    sessionKey: string;
    adaptiveQualityTier: AdaptiveViewerQualityTier;
    onMetricsChange: (nextValue: ViewerRuntimeTelemetrySnapshot) => void;
}) {
    const sessionStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
    const publishAtRef = useRef(0);
    const frameCountRef = useRef(0);
    const frameTotalMsRef = useRef(0);
    const frameWorstMsRef = useRef(0);
    const slow33FrameCountRef = useRef(0);
    const slow50FrameCountRef = useRef(0);
    const frameHistogramRef = useRef<number[]>(createEmptyFrameHistogram());
    const stableFrameStreakRef = useRef(0);
    const firstFrameAtMsRef = useRef<number | null>(null);
    const firstStableFrameAtMsRef = useRef<number | null>(null);
    const tierClockRef = useRef({
        tier: adaptiveQualityTier,
        lastStampMs: typeof performance !== "undefined" ? performance.now() : 0,
    });
    const adaptiveDurationsRef = useRef<Record<AdaptiveViewerQualityTier, number>>({
        full: 0,
        balanced: 0,
        safe: 0,
    });
    const adaptiveTransitionCountRef = useRef(0);
    const adaptiveSafeEntriesRef = useRef(adaptiveQualityTier === "safe" ? 1 : 0);

    const publishMetrics = (nowMs: number) => {
        const nextDurations = {
            ...adaptiveDurationsRef.current,
            [tierClockRef.current.tier]:
                adaptiveDurationsRef.current[tierClockRef.current.tier] + Math.max(0, nowMs - tierClockRef.current.lastStampMs),
        };

        onMetricsChange({
            frameCount: frameCountRef.current,
            frameAvgMs: frameCountRef.current > 0 ? frameTotalMsRef.current / frameCountRef.current : null,
            frameP95Ms: estimateFrameP95Ms(frameHistogramRef.current, frameCountRef.current),
            frameWorstMs: frameCountRef.current > 0 ? frameWorstMsRef.current : null,
            frameOver33MsRatio: frameCountRef.current > 0 ? slow33FrameCountRef.current / frameCountRef.current : null,
            frameOver50MsRatio: frameCountRef.current > 0 ? slow50FrameCountRef.current / frameCountRef.current : null,
            adaptiveTransitionCount: adaptiveTransitionCountRef.current,
            adaptiveFullMs: nextDurations.full,
            adaptiveBalancedMs: nextDurations.balanced,
            adaptiveSafeMs: nextDurations.safe,
            adaptiveSafeEntries: adaptiveSafeEntriesRef.current,
            firstFrameAtMs: firstFrameAtMsRef.current,
            firstStableFrameAtMs: firstStableFrameAtMsRef.current,
        });
    };

    useEffect(() => {
        const nowMs = typeof performance !== "undefined" ? performance.now() : 0;
        sessionStartRef.current = nowMs;
        publishAtRef.current = 0;
        frameCountRef.current = 0;
        frameTotalMsRef.current = 0;
        frameWorstMsRef.current = 0;
        slow33FrameCountRef.current = 0;
        slow50FrameCountRef.current = 0;
        frameHistogramRef.current = createEmptyFrameHistogram();
        stableFrameStreakRef.current = 0;
        firstFrameAtMsRef.current = null;
        firstStableFrameAtMsRef.current = null;
        tierClockRef.current = {
            tier: adaptiveQualityTier,
            lastStampMs: nowMs,
        };
        adaptiveDurationsRef.current = {
            full: 0,
            balanced: 0,
            safe: 0,
        };
        adaptiveTransitionCountRef.current = 0;
        adaptiveSafeEntriesRef.current = adaptiveQualityTier === "safe" ? 1 : 0;
        onMetricsChange(DEFAULT_VIEWER_RUNTIME_TELEMETRY);
    }, [onMetricsChange, sessionKey]);

    useEffect(() => {
        const nowMs = typeof performance !== "undefined" ? performance.now() : 0;
        const tierClock = tierClockRef.current;
        adaptiveDurationsRef.current[tierClock.tier] += Math.max(0, nowMs - tierClock.lastStampMs);
        if (adaptiveQualityTier !== tierClock.tier) {
            adaptiveTransitionCountRef.current += 1;
            if (adaptiveQualityTier === "safe") {
                adaptiveSafeEntriesRef.current += 1;
            }
        }
        tierClockRef.current = {
            tier: adaptiveQualityTier,
            lastStampMs: nowMs,
        };
        publishMetrics(nowMs);
    }, [adaptiveQualityTier]);

    useFrame((_, delta) => {
        if (!enabled) {
            return;
        }

        const nowMs = typeof performance !== "undefined" ? performance.now() : 0;
        const frameMs = Math.min(Math.max(delta * 1000, 0), 250);
        const elapsedMs = Math.max(0, nowMs - sessionStartRef.current);

        frameCountRef.current += 1;
        frameTotalMsRef.current += frameMs;
        frameWorstMsRef.current = Math.max(frameWorstMsRef.current, frameMs);
        if (frameMs > 33) {
            slow33FrameCountRef.current += 1;
        }
        if (frameMs > 50) {
            slow50FrameCountRef.current += 1;
        }
        const bucketIndex = FRAME_BUCKET_UPPER_BOUNDS_MS.findIndex((upperBound) => frameMs <= upperBound);
        frameHistogramRef.current[bucketIndex === -1 ? frameHistogramRef.current.length - 1 : bucketIndex] += 1;

        if (firstFrameAtMsRef.current === null) {
            firstFrameAtMsRef.current = elapsedMs;
        }

        stableFrameStreakRef.current = frameMs <= 33 ? stableFrameStreakRef.current + 1 : 0;
        if (firstStableFrameAtMsRef.current === null && stableFrameStreakRef.current >= VIEWER_RUNTIME_STABLE_FRAME_STREAK) {
            firstStableFrameAtMsRef.current = elapsedMs;
        }

        if (publishAtRef.current === 0 || nowMs - publishAtRef.current >= VIEWER_RUNTIME_TELEMETRY_PUBLISH_WINDOW_MS) {
            publishAtRef.current = nowMs;
            publishMetrics(nowMs);
        }
    });

    return null;
});

const ViewerAdaptiveQualityController = React.memo(function ViewerAdaptiveQualityController({
    enabled,
    initialTier,
    onTierChange,
}: {
    enabled: boolean;
    initialTier: AdaptiveViewerQualityTier;
    onTierChange: (tier: AdaptiveViewerQualityTier) => void;
}) {
    const tierRef = useRef<AdaptiveViewerQualityTier>(initialTier);
    const sampleRef = useRef({
        warmupFramesRemaining: ADAPTIVE_QUALITY_WARMUP_FRAMES,
        count: 0,
        totalDelta: 0,
        slowFrameCount: 0,
        verySlowFrameCount: 0,
        stableWindowCount: 0,
    });

    useEffect(() => {
        tierRef.current = initialTier;
        sampleRef.current = {
            warmupFramesRemaining: ADAPTIVE_QUALITY_WARMUP_FRAMES,
            count: 0,
            totalDelta: 0,
            slowFrameCount: 0,
            verySlowFrameCount: 0,
            stableWindowCount: 0,
        };
        onTierChange(initialTier);
    }, [initialTier, onTierChange]);

    useFrame((_, delta) => {
        if (!enabled) {
            return;
        }

        const sample = sampleRef.current;
        if (sample.warmupFramesRemaining > 0) {
            sample.warmupFramesRemaining -= 1;
            return;
        }

        const clampedDelta = Math.min(Math.max(delta, 0), 0.25);
        sample.count += 1;
        sample.totalDelta += clampedDelta;
        if (clampedDelta >= ADAPTIVE_QUALITY_SLOW_FRAME_SECONDS) {
            sample.slowFrameCount += 1;
        }
        if (clampedDelta >= ADAPTIVE_QUALITY_VERY_SLOW_FRAME_SECONDS) {
            sample.verySlowFrameCount += 1;
        }

        if (sample.count < ADAPTIVE_QUALITY_SAMPLE_WINDOW) {
            return;
        }

        const averageDelta = sample.totalDelta / sample.count;
        let nextTier = tierRef.current;

        if (averageDelta >= ADAPTIVE_QUALITY_VERY_SLOW_FRAME_SECONDS || sample.verySlowFrameCount >= 4) {
            nextTier = "safe";
        } else if (tierRef.current === "full" && (averageDelta >= 1 / 24 || sample.slowFrameCount >= 18)) {
            nextTier = "balanced";
        } else if (tierRef.current === "balanced" && (averageDelta >= 1 / 22 || sample.slowFrameCount >= 24)) {
            nextTier = "safe";
        } else {
            const stableWindow =
                averageDelta <= ADAPTIVE_QUALITY_RECOVERY_FRAME_SECONDS &&
                sample.slowFrameCount === 0 &&
                sample.verySlowFrameCount === 0;
            sample.stableWindowCount = stableWindow ? sample.stableWindowCount + 1 : 0;

            if (tierRef.current === "safe" && sample.stableWindowCount >= 4) {
                nextTier = "balanced";
            } else if (tierRef.current === "balanced" && initialTier === "full" && sample.stableWindowCount >= 5) {
                nextTier = "full";
            }
        }

        sample.count = 0;
        sample.totalDelta = 0;
        sample.slowFrameCount = 0;
        sample.verySlowFrameCount = 0;

        if (nextTier !== tierRef.current) {
            tierRef.current = nextTier;
            sample.stableWindowCount = 0;
            onTierChange(nextTier);
        }
    });

    return null;
});

const ViewerRuntimeBadge = React.memo(function ViewerRuntimeBadge({
    diagnostics,
    qualityPolicy,
    adaptiveQualityTier,
    runtimeTelemetry,
    deliveryStatus,
}: {
    diagnostics: ViewerRuntimeDiagnostics;
    qualityPolicy: ViewerQualityPolicy;
    adaptiveQualityTier: AdaptiveViewerQualityTier;
    runtimeTelemetry: ViewerRuntimeTelemetrySnapshot;
    deliveryStatus: {
        stagedObserved: boolean;
        upgradePending: boolean;
        activeVariantLabel: string | null;
        upgradeVariantLabel: string | null;
    };
}) {
    const qualityToneClass =
        adaptiveQualityTier === "safe"
            ? "border-cyan-400/28 bg-cyan-500/12 text-cyan-50"
            : adaptiveQualityTier === "balanced"
              ? "border-emerald-400/28 bg-emerald-500/12 text-emerald-50"
              : qualityPolicy.tier === "premium"
            ? "border-amber-300/24 bg-amber-500/12 text-amber-50"
            : qualityPolicy.tier === "standard"
              ? "border-emerald-400/28 bg-emerald-500/12 text-emerald-50"
              : qualityPolicy.tier === "guarded"
                ? "border-cyan-400/28 bg-cyan-500/12 text-cyan-50"
                : qualityPolicy.tier === "reference"
                  ? "border-sky-400/28 bg-sky-500/12 text-sky-50"
                  : "border-rose-400/30 bg-rose-500/12 text-rose-50";
    const qualityLabel =
        diagnostics.operationalMode === "webgl_live" && adaptiveQualityTier === "safe"
            ? "Adaptive safe live"
            : diagnostics.operationalMode === "webgl_live" && adaptiveQualityTier === "balanced" && qualityPolicy.tier === "premium"
              ? "Adaptive balanced live"
              : qualityPolicy.label;
    const qualityDetail =
        diagnostics.operationalMode === "webgl_live" && adaptiveQualityTier === "safe"
            ? "Runtime safeguard reduced fidelity to protect stability."
            : diagnostics.operationalMode === "webgl_live" && adaptiveQualityTier === "balanced" && qualityPolicy.tier === "premium"
              ? "Adaptive balancing is keeping the live renderer responsive."
              : qualityPolicy.mode === "fallback"
                ? "Stable fallback path"
                : qualityPolicy.summary;
    const qualityBadge =
        {
            label: qualityLabel,
            detail: qualityDetail,
            toneClass: qualityToneClass,
        };
    const motionBadge =
        diagnostics.operationalMode === "webgl_live" && runtimeTelemetry.frameP95Ms !== null
            ? runtimeTelemetry.frameP95Ms > 66 || (runtimeTelemetry.frameOver50MsRatio ?? 0) > 0.05
                ? "Motion settling"
                : runtimeTelemetry.frameP95Ms <= 33 && adaptiveQualityTier !== "safe"
                  ? "Motion clean"
                  : "Motion guarded"
            : null;
    const deliveryBadge = deliveryStatus.upgradePending
        ? `Refining from ${deliveryStatus.activeVariantLabel ?? "starter"} to ${deliveryStatus.upgradeVariantLabel ?? "full"}`
        : deliveryStatus.stagedObserved
          ? `${deliveryStatus.activeVariantLabel ?? "Live scene"} ready`
          : null;
    const toneClass =
        diagnostics.operationalMode === "webgl_live"
            ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-100"
            : diagnostics.operationalMode === "interactive_projection" || diagnostics.operationalMode === "interactive_fallback"
              ? "border-sky-400/30 bg-sky-500/12 text-sky-100"
              : diagnostics.operationalMode === "projection_only"
                ? "border-cyan-400/30 bg-cyan-500/12 text-cyan-100"
                : diagnostics.operationalMode === "booting"
                  ? "border-amber-400/30 bg-amber-500/12 text-amber-100"
                  : "border-rose-400/30 bg-rose-500/12 text-rose-100";

    return (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-w-[22rem] flex-col items-end gap-2">
            <div
                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] shadow-[0_14px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl ${toneClass}`}
                data-testid="mvp-viewer-runtime-badge"
            >
                {diagnostics.label}
            </div>
            <div
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] shadow-[0_14px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl ${qualityBadge.toneClass}`}
            >
                Quality · {qualityBadge.label}
            </div>
            <div className="rounded-full border border-black/30 bg-black/42 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-200 shadow-[0_14px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                {qualityBadge.detail}
            </div>
            {motionBadge ? (
                <div className="rounded-full border border-black/30 bg-black/38 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-200 shadow-[0_14px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    {motionBadge}
                </div>
            ) : null}
            {deliveryBadge ? (
                <div className="rounded-full border border-black/30 bg-black/38 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-200 shadow-[0_14px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    {deliveryBadge}
                </div>
            ) : null}
            {diagnostics.detail && diagnostics.operationalMode !== "webgl_live" ? (
                <div className="rounded-2xl border border-black/30 bg-black/45 px-3 py-2 text-right text-[11px] leading-5 text-neutral-100 shadow-[0_20px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    {diagnostics.detail}
                </div>
            ) : null}
        </div>
    );
});

const ViewerRevealBanner = React.memo(function ViewerRevealBanner({
    diagnostics,
    qualityPolicy,
    isSingleImagePreview,
    adaptiveQualityTier,
}: {
    diagnostics: ViewerRuntimeDiagnostics;
    qualityPolicy: ViewerQualityPolicy;
    isSingleImagePreview: boolean;
    adaptiveQualityTier: AdaptiveViewerQualityTier;
}) {
    if (diagnostics.renderMode === "fallback" || diagnostics.operationalMode === "hard_fallback" || diagnostics.operationalMode === "webgl_live") {
        return null;
    }

    const banner =
        diagnostics.operationalMode === "projection_only"
            ? {
                  eyebrow: "Poster first",
                  title: "Reference frame locked",
                  detail: "We keep the still image visible until a live renderer is safe to reveal.",
                  chipPrimary: "Reference quality",
                  chipSecondary: diagnostics.previewProjectionAvailable ? "Preview ready" : "Preview unavailable",
                  toneClass: "border-sky-300/22 bg-sky-500/10 text-sky-50",
                  dotClass: "bg-sky-300",
              }
            : diagnostics.operationalMode === "interactive_projection" || diagnostics.operationalMode === "interactive_fallback"
              ? {
                    eyebrow: "Guided preview",
                    title: "Keeping the scene usable",
                    detail: qualityPolicy.summary,
                    chipPrimary: "Interactive preview",
                    chipSecondary: adaptiveQualityTier === "safe" ? "Adaptive safeguard" : qualityPolicy.label,
                    toneClass: "border-emerald-300/22 bg-emerald-500/10 text-emerald-50",
                    dotClass: "bg-emerald-300",
                }
              : isSingleImagePreview
                ? {
                      eyebrow: "Poster first",
                      title: "Live view will fade in",
                      detail: qualityPolicy.summary,
                      chipPrimary: "Poster locked",
                      chipSecondary: adaptiveQualityTier === "safe" ? "Adaptive safeguard" : qualityPolicy.label,
                      toneClass: "border-amber-300/22 bg-amber-500/10 text-amber-50",
                      dotClass: "bg-amber-300",
                  }
                : {
                      eyebrow: "Live scene",
                      title: "Renderer warming up",
                      detail: qualityPolicy.summary,
                      chipPrimary: adaptiveQualityTier === "safe" ? "Adaptive safeguard" : qualityPolicy.label,
                      chipSecondary: diagnostics.previewProjectionAvailable ? "Poster ready" : "No poster",
                      toneClass: "border-cyan-300/22 bg-cyan-500/10 text-cyan-50",
                      dotClass: "bg-cyan-300",
                  };

    return (
        <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-[26rem]">
            <div className={`rounded-[1.6rem] border px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl ${banner.toneClass}`}>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-white/78">
                    <span className={`h-2 w-2 rounded-full ${banner.dotClass}`} />
                    {banner.eyebrow}
                </div>
                <div className="mt-2 text-[1rem] font-medium leading-6 text-white">{banner.title}</div>
                <div className="mt-1 max-w-[23rem] text-[12px] leading-5 text-white/72">{banner.detail}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <div className="rounded-full border border-white/12 bg-black/24 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/82">
                        {banner.chipPrimary}
                    </div>
                    <div className="rounded-full border border-white/12 bg-black/24 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/82">
                        {banner.chipSecondary}
                    </div>
                </div>
            </div>
        </div>
    );
});

const ViewerPosterCurtain = React.memo(function ViewerPosterCurtain({
    imageUrl,
    stage,
    qualityPolicy,
    runtimeLabel,
}: {
    imageUrl: string;
    stage: PosterCurtainStage;
    qualityPolicy: ViewerQualityPolicy;
    runtimeLabel: string;
}) {
    if (stage === "hidden") {
        return null;
    }

    const eyebrow = stage === "releasing" ? "Live reveal" : "Poster first";
    const title = stage === "releasing" ? "Crossfading into the live scene" : "Holding the reference frame while live rendering settles";
    const detail =
        stage === "releasing"
            ? "The live renderer is now stable enough to reveal without a harsh pop."
            : qualityPolicy.summary;

    return (
        <div
            className={`pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[32px] transition-opacity duration-700 ${
                stage === "releasing" ? "opacity-0" : "opacity-100"
            }`}
            data-testid="mvp-viewer-poster-curtain"
        >
            <div className="absolute inset-0 scale-[1.02] bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_22%),linear-gradient(180deg,rgba(5,7,10,0.16),rgba(4,6,9,0.78))]" />
            <div className="absolute inset-x-5 bottom-5">
                <div className="max-w-[28rem] rounded-[1.8rem] border border-white/12 bg-black/46 px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/78">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                            <span className={`h-2 w-2 rounded-full ${stage === "releasing" ? "bg-emerald-300" : "bg-amber-300"}`} />
                            {eyebrow}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1">{runtimeLabel}</span>
                    </div>
                    <div className="mt-2 text-[1rem] font-medium leading-6 text-white">{title}</div>
                    <div className="mt-1 text-[12px] leading-5 text-white/72">{detail}</div>
                </div>
            </div>
        </div>
    );
});

const ViewerLiveWarmupMatte = React.memo(function ViewerLiveWarmupMatte({
    qualityPolicy,
    deliveryStatus,
}: {
    qualityPolicy: ViewerQualityPolicy;
    deliveryStatus: {
        upgradePending: boolean;
        activeVariantLabel: string | null;
        upgradeVariantLabel: string | null;
    };
}) {
    const detail = deliveryStatus.upgradePending
        ? `Starting with ${deliveryStatus.activeVariantLabel ?? "a safe first-light variant"} while ${deliveryStatus.upgradeVariantLabel ?? "the fuller live scene"} prepares.`
        : qualityPolicy.summary;

    return (
        <div
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.07),transparent_18%),radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.05),transparent_26%),linear-gradient(180deg,rgba(3,4,6,0.2),rgba(3,4,6,0.7))]"
            data-testid="mvp-viewer-live-warmup-matte"
        >
            <div className="absolute inset-x-5 bottom-5">
                <div className="max-w-[26rem] rounded-[1.7rem] border border-white/12 bg-black/44 px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/78">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                            <span className="h-2 w-2 rounded-full bg-cyan-300" />
                            Live warmup
                        </span>
                        {deliveryStatus.activeVariantLabel ? (
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1">
                                {deliveryStatus.activeVariantLabel}
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-2 text-[1rem] font-medium leading-6 text-white">Preparing a stable first light</div>
                    <div className="mt-1 text-[12px] leading-5 text-white/72">{detail}</div>
                </div>
            </div>
        </div>
    );
});

const ThreeOverlay = React.memo(function ThreeOverlay({
    environment,
    assets,
    sceneDocument,
    pins,
    viewer,
    focusRequest,
    captureRequestKey,
    isPinPlacementEnabled,
    pinType,
    isRecordingPath,
    onCapturePose,
    onPathRecorded,
    onViewerReadyChange,
    readOnly = false,
    backgroundColor = DEFAULT_EDITOR_VIEWER_BACKGROUND,
    selectedNodeIds = [],
    selectedPinId = null,
    selectedAssetInstanceIds = [],
    transformSpace = "world",
    transformSnap,
    transformSession = null,
    onSelectNode,
    activeTool = "select",
    onSelectPin,
    onClearSelection,
    onSelectAsset,
    onBeginTransformSession,
    onUpdateTransformSessionDrafts,
    onCancelTransformSession,
    onCommitTransformSession,
    onUpdateNodeTransformDraft,
    onUpdateAssetTransformDraft,
    onCommitSceneTransforms,
    onAppendPin,
}: ThreeOverlayProps) {
    const overlaySurface = useThreeOverlaySurfaceController({
        environment,
        viewer,
        sceneDocument,
        focusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        readOnly,
        backgroundColor,
        selectedNodeIds,
        selectedAssetInstanceIds,
        onViewerReadyChange,
        onSelectPin,
        onClearSelection,
        onSelectNode,
        onSelectAsset,
        onUpdateNodeTransformDraft,
        onUpdateAssetTransformDraft,
        onCommitSceneTransforms,
        onAppendPin,
    });
    const usesRuntimeRegistry = Boolean(sceneDocument);
    const initialAdaptiveQualityTier: AdaptiveViewerQualityTier =
        overlaySurface.isSingleImagePreview || overlaySurface.qualityPolicy.tier === "reference"
            ? "full"
            : overlaySurface.prefersPerformanceMode || overlaySurface.qualityPolicy.tier === "guarded"
              ? "balanced"
              : "full";
    const [adaptiveQualityTier, setAdaptiveQualityTier] = useState<AdaptiveViewerQualityTier>(initialAdaptiveQualityTier);
    const [lowestAdaptiveQualityTier, setLowestAdaptiveQualityTier] = useState<AdaptiveViewerQualityTier>(initialAdaptiveQualityTier);
    const [runtimeTelemetry, setRuntimeTelemetry] = useState<ViewerRuntimeTelemetrySnapshot>(DEFAULT_VIEWER_RUNTIME_TELEMETRY);
    const [posterCurtainStage, setPosterCurtainStage] = useState<PosterCurtainStage>("hidden");
    const posterCurtainTimerRef = useRef<number | null>(null);
    const posterCurtainLockedRef = useRef(false);
    useEffect(() => {
        setAdaptiveQualityTier(initialAdaptiveQualityTier);
        setLowestAdaptiveQualityTier(initialAdaptiveQualityTier);
        setRuntimeTelemetry(DEFAULT_VIEWER_RUNTIME_TELEMETRY);
    }, [initialAdaptiveQualityTier, overlaySurface.environmentSplatUrl, overlaySurface.environmentViewerUrl, overlaySurface.renderMode]);
    useEffect(() => {
        setLowestAdaptiveQualityTier((current) =>
            compareAdaptiveQualityTierSeverity(adaptiveQualityTier, current) > 0 ? adaptiveQualityTier : current,
        );
    }, [adaptiveQualityTier]);
    const posterRevealImageUrl =
        overlaySurface.previewProjectionImage ?? overlaySurface.referenceImage ?? overlaySurface.interactiveFallbackImage ?? null;
    const viewerTelemetrySessionKey = `${overlaySurface.environmentSplatUrl ?? overlaySurface.environmentViewerUrl ?? "viewer"}:${overlaySurface.canvasRecoveryNonce}`;
    const posterCurtainReadyToRelease = runtimeTelemetry.firstStableFrameAtMs !== null || runtimeTelemetry.frameCount >= 24;
    useEffect(() => {
        if (posterCurtainTimerRef.current !== null) {
            window.clearTimeout(posterCurtainTimerRef.current);
            posterCurtainTimerRef.current = null;
        }

        const posterCurtainEligible = Boolean(
            posterRevealImageUrl &&
                overlaySurface.runtimeDiagnostics.renderMode === "webgl" &&
                !overlaySurface.shouldUsePreviewProjectionFallback &&
                !overlaySurface.usesInteractiveFallback &&
                !overlaySurface.isSingleImagePreview &&
                overlaySurface.runtimeDiagnostics.hasRenderableEnvironment,
        );

        if (!posterCurtainEligible) {
            posterCurtainLockedRef.current = false;
            setPosterCurtainStage("hidden");
            return;
        }

        if (overlaySurface.runtimeDiagnostics.operationalMode !== "webgl_live") {
            posterCurtainLockedRef.current = true;
            setPosterCurtainStage("locked");
            return;
        }

        if (!posterCurtainLockedRef.current) {
            setPosterCurtainStage("hidden");
            return;
        }

        if (!posterCurtainReadyToRelease) {
            setPosterCurtainStage("locked");
            return;
        }

        setPosterCurtainStage("releasing");
        posterCurtainTimerRef.current = window.setTimeout(() => {
            posterCurtainTimerRef.current = null;
            posterCurtainLockedRef.current = false;
            setPosterCurtainStage("hidden");
        }, VIEWER_POSTER_CURTAIN_RELEASE_MS);

        return () => {
            if (posterCurtainTimerRef.current !== null) {
                window.clearTimeout(posterCurtainTimerRef.current);
                posterCurtainTimerRef.current = null;
            }
        };
    }, [
        overlaySurface.isSingleImagePreview,
        overlaySurface.runtimeDiagnostics.hasRenderableEnvironment,
        overlaySurface.runtimeDiagnostics.operationalMode,
        overlaySurface.runtimeDiagnostics.renderMode,
        overlaySurface.shouldUsePreviewProjectionFallback,
        overlaySurface.usesInteractiveFallback,
        posterCurtainReadyToRelease,
        posterRevealImageUrl,
    ]);
    const canvasDpr: [number, number] = overlaySurface.isSingleImagePreview
        ? [1, 2]
        : adaptiveQualityTier === "safe"
          ? [1, 1.25]
          : overlaySurface.qualityPolicy.presentationProfile === "cinematic_safe"
            ? [1, 1.85]
            : overlaySurface.prefersPerformanceMode || adaptiveQualityTier === "balanced"
              ? [1, 1.5]
              : [1, 3];
    const enablePremiumCompositor =
        !overlaySurface.isSingleImagePreview &&
        adaptiveQualityTier !== "safe" &&
        overlaySurface.qualityPolicy.premiumEffectsEnabled;
    const enableSecondaryLighting =
        !overlaySurface.isSingleImagePreview &&
        (adaptiveQualityTier !== "safe" || overlaySurface.qualityPolicy.presentationProfile === "cinematic_safe");
    const enableSceneShadows =
        !overlaySurface.isSingleImagePreview &&
        overlaySurface.qualityPolicy.presentationProfile === "cinematic" &&
        adaptiveQualityTier === "full";
    const showViewerGrid =
        !overlaySurface.isSingleImagePreview &&
        !(
            overlaySurface.runtimeDiagnostics.operationalMode === "webgl_live" &&
            overlaySurface.qualityPolicy.hideEditorGridWhenLive
        );
    const showPremiumRevealBanner =
        overlaySurface.runtimeDiagnostics.renderMode !== "fallback" &&
        overlaySurface.runtimeDiagnostics.operationalMode !== "hard_fallback" &&
        overlaySurface.runtimeDiagnostics.operationalMode !== "webgl_live";
    const posterCurtainVisible = posterCurtainStage !== "hidden" && Boolean(posterRevealImageUrl);
    const showWarmupMatte =
        !posterCurtainVisible &&
        !posterRevealImageUrl &&
        overlaySurface.runtimeDiagnostics.renderMode === "webgl" &&
        overlaySurface.runtimeDiagnostics.operationalMode !== "webgl_live" &&
        overlaySurface.runtimeDiagnostics.operationalMode !== "hard_fallback" &&
        !overlaySurface.isSingleImagePreview;
    const renderMegapixels =
        runtimeTelemetry.frameCount > 0 && overlaySurface.canvasElementRef.current
            ? (overlaySurface.canvasElementRef.current.width * overlaySurface.canvasElementRef.current.height) / 1_000_000
            : null;

    let surfaceContent: React.ReactNode;

    if (overlaySurface.shouldUsePreviewProjectionFallback && overlaySurface.previewProjectionImage) {
        surfaceContent = <SingleImagePreviewSurface imageUrl={overlaySurface.previewProjectionImage} />;
    } else if (overlaySurface.usesInteractiveFallback && overlaySurface.interactiveFallbackImage) {
        surfaceContent = (
            <InteractiveSingleImageFallbackSurface
                imageUrl={overlaySurface.interactiveFallbackImage}
                viewer={viewer}
                pins={pins}
                selectedPinId={selectedPinId}
                isPinPlacementEnabled={isPinPlacementEnabled}
                pinType={pinType}
                isRecordingPath={isRecordingPath}
                focusRequest={overlaySurface.effectiveFocusRequest}
                captureRequestKey={captureRequestKey}
                readOnly={readOnly}
                onAddPin={overlaySurface.addPin}
                onSelectPin={overlaySurface.selectPin}
                onCapturePose={onCapturePose}
                onPathRecorded={onPathRecorded}
                onClearSelection={overlaySurface.clearSceneSelection}
            />
        );
    } else if (overlaySurface.renderMode === "fallback") {
        surfaceContent = <ThreeOverlayFallback message={overlaySurface.renderError} referenceImage={overlaySurface.referenceImage} />;
    } else {
        surfaceContent = (
            <CanvasErrorBoundary onError={overlaySurface.handleCanvasError}>
                <Canvas
                    key={`${overlaySurface.environmentSplatUrl ?? overlaySurface.environmentViewerUrl ?? "viewer"}:${overlaySurface.canvasRecoveryNonce}`}
                    camera={{ position: [5, 4, 6], fov: viewer.fov, near: EDITOR_CAMERA_NEAR, far: EDITOR_CAMERA_FAR }}
                    dpr={canvasDpr}
                    style={{ background: backgroundColor, touchAction: "none" }}
                    gl={{
                        powerPreference: "high-performance",
                        antialias: true,
                        alpha: true,
                        depth: true,
                        stencil: false,
                    }}
                    shadows={enableSceneShadows}
                    onCreated={({ gl }) => {
                        overlaySurface.handleCanvasCreated(gl);
                    }}
                    onPointerMissed={overlaySurface.clearSceneSelection}
                >
                    <ViewerAdaptiveQualityController
                        enabled={overlaySurface.runtimeDiagnostics.operationalMode === "webgl_live" && !overlaySurface.isSingleImagePreview}
                        initialTier={initialAdaptiveQualityTier}
                        onTierChange={setAdaptiveQualityTier}
                    />
                    <ViewerRuntimeTelemetryController
                        enabled={overlaySurface.runtimeDiagnostics.renderMode === "webgl"}
                        sessionKey={viewerTelemetrySessionKey}
                        adaptiveQualityTier={adaptiveQualityTier}
                        onMetricsChange={setRuntimeTelemetry}
                    />
                    <SceneBackgroundLock backgroundColor={backgroundColor} />
                    {enablePremiumCompositor ? <TemporalAntialiasingComposer /> : null}
                    <ambientLight
                        intensity={
                            overlaySurface.isSingleImagePreview
                                ? 0.35
                                : adaptiveQualityTier === "safe"
                                  ? 0.42
                                  : overlaySurface.prefersPerformanceMode
                                    ? 0.5
                                    : 0.65
                        }
                    />
                    {!overlaySurface.isSingleImagePreview ? (
                        <directionalLight
                            position={[8, 12, 6]}
                            intensity={adaptiveQualityTier === "safe" ? 0.72 : overlaySurface.prefersPerformanceMode ? 0.9 : 1.2}
                            castShadow={enableSceneShadows}
                        />
                    ) : null}

                    <OrbitControls ref={overlaySurface.controlsRef} makeDefault enableDamping dampingFactor={0.08} />
                    {enableSecondaryLighting ? <Environment preset="city" background={false} /> : null}
                    <CameraRig
                        viewerFov={viewer.fov}
                        controlsRef={overlaySurface.controlsRef}
                        focusRequest={overlaySurface.effectiveFocusRequest}
                        captureRequestKey={captureRequestKey}
                        onCapturePose={onCapturePose}
                        isRecordingPath={isRecordingPath}
                        onPathRecorded={onPathRecorded}
                    />

                    {!overlaySurface.isSingleImagePreview ? (
                        <>
                            {showViewerGrid ? <ViewerGrid /> : null}
                            {enableSceneShadows ? <ViewerContactShadows /> : null}
                        </>
                    ) : null}

                    {overlaySurface.environmentSplatUrl || overlaySurface.environmentViewerUrl ? (
                        <Suspense
                            fallback={
                                <LoadingLabel
                                    text="Loading live renderer..."
                                    accent={overlaySurface.isSingleImagePreview ? "Poster first" : "Preparing live view"}
                                    tone={overlaySurface.isSingleImagePreview ? "reference" : overlaySurface.prefersPerformanceMode ? "balanced" : "premium"}
                                    subtext={
                                        overlaySurface.isSingleImagePreview
                                            ? "The reference frame stays visible until the browser is ready to reveal the live scene."
                                            : overlaySurface.prefersPerformanceMode
                                              ? "Keeping motion responsive while the larger scene settles."
                                              : "Building the cinematic live path behind the poster."
                                    }
                                />
                            }
                        >
                            <EnvironmentSplat
                                plyUrl={overlaySurface.environmentSplatUrl}
                                viewerUrl={overlaySurface.environmentViewerUrl}
                                metadata={overlaySurface.environmentMetadata}
                                onPreviewBounds={overlaySurface.handlePreviewBounds}
                                onFatalError={overlaySurface.handleEnvironmentFatalError}
                                onSharpLiveStateChange={overlaySurface.handleSharpLiveStateChange}
                            />
                        </Suspense>
                    ) : null}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeMeshNodes.map((node) => (
                              <SceneAssetNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  asset={{
                                      ...(node.metadata ?? {}),
                                      instanceId: node.instanceId,
                                      nodeId: node.nodeId,
                                      name: node.name,
                                      mesh: node.meshUrl ?? undefined,
                                      position: node.worldTransform.position,
                                      rotation: [
                                          node.worldTransform.rotation[0],
                                          node.worldTransform.rotation[1],
                                          node.worldTransform.rotation[2],
                                      ],
                                      scale: node.worldTransform.scale,
                                      visible: node.effectiveVisible,
                                      locked: node.effectiveLocked,
                                      parentWorldMatrix: node.parentWorldMatrix,
                                  }}
                                  lifecycleKey={node.lifecycleKey}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateAssetTransform={overlaySurface.updateAssetTransform}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : assets.map((asset, index) => (
                              <SceneAssetNode
                                  key={asset.instanceId || `${asset.name}-${index}`}
                                  asset={asset}
                                  updateAssetTransform={overlaySurface.updateAssetTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedAssetInstanceIdSet.has(asset.instanceId)}
                                  activeTool={activeTool}
                                  onSelect={(event) => overlaySurface.selectSceneAsset(asset.instanceId, event)}
                              />
                          ))}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeCameraNodes.map((node) => (
                              <SceneUtilityNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  node={node}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : null}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeLightNodes.map((node) => (
                              <SceneUtilityNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  node={node}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : null}

                    {usesRuntimeRegistry ? (
                        <ThreeOverlayTransformControls
                            sceneNodeRegistry={overlaySurface.sceneNodeRegistry}
                            selectedNodeIds={selectedNodeIds}
                            activeTool={activeTool}
                            readOnly={readOnly}
                            transformSpace={transformSpace}
                            transformSnap={
                                transformSnap ?? {
                                    enabled: false,
                                    translate: 0.5,
                                    rotate: Math.PI / 12,
                                    scale: 0.1,
                                }
                            }
                            transformSession={transformSession}
                            onBeginTransformSession={onBeginTransformSession}
                            onUpdateTransformSessionDrafts={onUpdateTransformSessionDrafts}
                            onCancelTransformSession={onCancelTransformSession}
                            onCommitTransformSession={onCommitTransformSession}
                        />
                    ) : null}

                    <PinLayer
                        pins={pins}
                        selectedPinId={selectedPinId}
                        isPlacingPin={isPinPlacementEnabled}
                        pinType={pinType}
                        readOnly={readOnly}
                        onAddPin={overlaySurface.addPin}
                        onSelectPin={overlaySurface.selectPin}
                    />
                </Canvas>
            </CanvasErrorBoundary>
        );
    }

    return (
        <div className="absolute inset-0 pointer-events-auto z-20">
            <div
                data-testid="mvp-viewer-runtime-diagnostics"
                data-host-capability-lane={overlaySurface.runtimeDiagnostics.hostCapabilityLane}
                data-operational-mode={overlaySurface.runtimeDiagnostics.operationalMode}
                data-operational-lane={overlaySurface.runtimeDiagnostics.operationalLane}
                data-coverage={overlaySurface.runtimeDiagnostics.coverage}
                data-render-source-mode={overlaySurface.runtimeDiagnostics.renderSourceMode}
                data-render-mode={overlaySurface.runtimeDiagnostics.renderMode}
                data-fallback-reason={overlaySurface.runtimeDiagnostics.fallbackReason ?? "none"}
                data-fallback-message={overlaySurface.runtimeDiagnostics.fallbackMessage || ""}
                data-has-renderable-environment={overlaySurface.runtimeDiagnostics.hasRenderableEnvironment ? "true" : "false"}
                data-is-single-image-preview={overlaySurface.runtimeDiagnostics.isSingleImagePreview ? "true" : "false"}
                data-preview-projection-available={overlaySurface.runtimeDiagnostics.previewProjectionAvailable ? "true" : "false"}
                data-reference-image-available={overlaySurface.runtimeDiagnostics.referenceImageAvailable ? "true" : "false"}
                data-viewer-ready={overlaySurface.runtimeDiagnostics.isViewerReady ? "true" : "false"}
                data-max-texture-size={
                    overlaySurface.runtimeDiagnostics.maxTextureSize === null
                        ? "unknown"
                        : String(overlaySurface.runtimeDiagnostics.maxTextureSize)
                }
                data-label={overlaySurface.runtimeDiagnostics.label}
                data-detail={overlaySurface.runtimeDiagnostics.detail}
                data-quality-mode={overlaySurface.qualityPolicy.mode}
                data-quality-tier={overlaySurface.qualityPolicy.tier}
                data-quality-label={overlaySurface.qualityPolicy.label}
                data-quality-summary={overlaySurface.qualityPolicy.summary}
                data-quality-premium-effects-enabled={overlaySurface.qualityPolicy.premiumEffectsEnabled ? "true" : "false"}
                data-quality-cautious-mode={overlaySurface.qualityPolicy.cautiousMode ? "true" : "false"}
                data-effective-point-budget={
                    overlaySurface.effectiveSharpPointBudget === null ? "unknown" : String(overlaySurface.effectiveSharpPointBudget)
                }
                data-prefers-performance-mode={overlaySurface.prefersPerformanceMode ? "true" : "false"}
                data-adaptive-quality-tier={adaptiveQualityTier}
                data-lowest-adaptive-quality-tier={lowestAdaptiveQualityTier}
                data-context-loss-count={String(overlaySurface.contextLossCount)}
                data-delivery-manifest-url={overlaySurface.deliveryManifestUrl ?? ""}
                data-delivery-manifest-first={overlaySurface.deliveryManifestFirst ? "true" : "false"}
                data-delivery-has-progressive-variants={overlaySurface.deliveryHasProgressiveVariants ? "true" : "false"}
                data-delivery-has-compressed-variants={overlaySurface.deliveryHasCompressedVariants ? "true" : "false"}
                data-delivery-staged-observed={overlaySurface.deliveryStagedObserved ? "true" : "false"}
                data-delivery-upgrade-pending={overlaySurface.deliveryUpgradePending ? "true" : "false"}
                data-delivery-active-variant-label={overlaySurface.deliveryActiveVariantLabel ?? ""}
                data-delivery-upgrade-variant-label={overlaySurface.deliveryUpgradeVariantLabel ?? ""}
                data-canvas-created-at-ms={formatNumericRuntimeDiagnostic(overlaySurface.runtimeDiagnostics.canvasCreatedAtMs)}
                data-viewer-ready-at-ms={formatNumericRuntimeDiagnostic(overlaySurface.runtimeDiagnostics.viewerReadyAtMs)}
                data-first-context-loss-at-ms={formatNumericRuntimeDiagnostic(overlaySurface.runtimeDiagnostics.firstContextLossAtMs)}
                data-frame-count={String(runtimeTelemetry.frameCount)}
                data-frame-avg-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.frameAvgMs)}
                data-frame-p95-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.frameP95Ms)}
                data-frame-worst-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.frameWorstMs)}
                data-frame-over-33ms-ratio={formatNumericRuntimeDiagnostic(runtimeTelemetry.frameOver33MsRatio)}
                data-frame-over-50ms-ratio={formatNumericRuntimeDiagnostic(runtimeTelemetry.frameOver50MsRatio)}
                data-adaptive-transition-count={String(runtimeTelemetry.adaptiveTransitionCount)}
                data-adaptive-full-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.adaptiveFullMs)}
                data-adaptive-balanced-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.adaptiveBalancedMs)}
                data-adaptive-safe-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.adaptiveSafeMs)}
                data-adaptive-safe-entries={String(runtimeTelemetry.adaptiveSafeEntries)}
                data-first-frame-at-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.firstFrameAtMs)}
                data-first-stable-frame-at-ms={formatNumericRuntimeDiagnostic(runtimeTelemetry.firstStableFrameAtMs)}
                data-poster-curtain-stage={posterCurtainStage}
                data-poster-curtain-visible={posterCurtainVisible ? "true" : "false"}
                data-render-megapixels={formatNumericRuntimeDiagnostic(renderMegapixels)}
                hidden
            />
            {posterCurtainVisible && posterRevealImageUrl ? (
                <ViewerPosterCurtain
                    imageUrl={posterRevealImageUrl}
                    stage={posterCurtainStage}
                    qualityPolicy={overlaySurface.qualityPolicy}
                    runtimeLabel={overlaySurface.runtimeDiagnostics.label}
                />
            ) : null}
            {showWarmupMatte ? (
                <ViewerLiveWarmupMatte
                    qualityPolicy={overlaySurface.qualityPolicy}
                    deliveryStatus={{
                        upgradePending: overlaySurface.deliveryUpgradePending,
                        activeVariantLabel: overlaySurface.deliveryActiveVariantLabel,
                        upgradeVariantLabel: overlaySurface.deliveryUpgradeVariantLabel,
                    }}
                />
            ) : null}
            {showPremiumRevealBanner ? (
                <ViewerRevealBanner
                    diagnostics={overlaySurface.runtimeDiagnostics}
                    qualityPolicy={overlaySurface.qualityPolicy}
                    isSingleImagePreview={overlaySurface.isSingleImagePreview}
                    adaptiveQualityTier={adaptiveQualityTier}
                />
            ) : null}
            <ViewerRuntimeBadge
                diagnostics={overlaySurface.runtimeDiagnostics}
                qualityPolicy={overlaySurface.qualityPolicy}
                adaptiveQualityTier={adaptiveQualityTier}
                runtimeTelemetry={runtimeTelemetry}
                deliveryStatus={{
                    stagedObserved: overlaySurface.deliveryStagedObserved,
                    upgradePending: overlaySurface.deliveryUpgradePending,
                    activeVariantLabel: overlaySurface.deliveryActiveVariantLabel,
                    upgradeVariantLabel: overlaySurface.deliveryUpgradeVariantLabel,
                }}
            />
            {surfaceContent}
        </div>
    );
});

export const ThreeOverlayConnected = React.memo(function ThreeOverlayConnected({
    readOnly = false,
    backgroundColor,
    onCapturePose,
    onPathRecorded,
}: ThreeOverlayConnectedProps) {
    const workspaceThreeOverlay = useMvpWorkspaceThreeOverlayController();

    return (
        <ThreeOverlay
            {...workspaceThreeOverlay}
            onCapturePose={onCapturePose}
            onPathRecorded={onPathRecorded}
            readOnly={readOnly}
            backgroundColor={backgroundColor}
        />
    );
});

export default ThreeOverlay;
