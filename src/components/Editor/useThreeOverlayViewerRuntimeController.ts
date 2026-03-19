"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { toProxyUrl } from "@/lib/mvp-api";
import { resolveEnvironmentRenderState } from "@/lib/mvp-product";
import {
    classifyViewerFailure,
    isSingleImagePreviewMetadata,
    resolveViewerCapabilities,
    type EnvironmentRenderSourceMode,
    type ViewerCapabilities,
    type ViewerFallbackReason,
} from "@/lib/mvp-viewer";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { type CameraPose, type ViewerState, type WorkspaceSceneGraph, fovToLensMm, parseVector3Tuple } from "@/lib/mvp-workspace";
import { resolveSharpPointBudget } from "./sharpGaussianPayload";
import { HEAVY_SCENE_POINT_THRESHOLD, type SharpGaussianLoadState } from "./sharpGaussianShared";
import { resolveViewerQualityPolicy, type ViewerQualityPolicy } from "./viewerQualityPolicy";

const PREVIEW_CAMERA_ORIENTATION_QUATERNION = new THREE.Quaternion(1, 0, 0, 0);

type PreviewBounds = {
    center: [number, number, number];
    radius: number;
    forward?: [number, number, number];
};

export type ViewerHostCapabilityLane = "webgl2_capable" | "webgl_capable" | "no_webgl";
export type ViewerRuntimeMode =
    | "booting"
    | "webgl_live"
    | "interactive_projection"
    | "interactive_fallback"
    | "projection_only"
    | "hard_fallback";
export type ViewerDiagnosticCoverage = "interactive_ready" | "image_interactive" | "image_only" | "fallback_only";

export interface ViewerRuntimeDiagnostics {
    hostCapabilityLane: ViewerHostCapabilityLane;
    operationalMode: ViewerRuntimeMode;
    operationalLane: "webgl2_capable" | "webgl_capable" | "fallback_only";
    coverage: ViewerDiagnosticCoverage;
    renderSourceMode: EnvironmentRenderSourceMode;
    renderMode: "webgl" | "fallback";
    fallbackReason: ViewerFallbackReason | null;
    fallbackMessage: string;
    hasRenderableEnvironment: boolean;
    isSingleImagePreview: boolean;
    previewProjectionAvailable: boolean;
    referenceImageAvailable: boolean;
    isViewerReady: boolean;
    maxTextureSize: number | null;
    label: string;
    detail: string;
    canvasCreatedAtMs: number | null;
    viewerReadyAtMs: number | null;
    firstContextLossAtMs: number | null;
}

type ViewerDeliveryRuntimeState = {
    stagedDeliveryObserved: boolean;
    upgradePending: boolean;
    activeVariantLabel: string | null;
    upgradeVariantLabel: string | null;
};

const DEFAULT_VIEWER_DELIVERY_RUNTIME_STATE: ViewerDeliveryRuntimeState = {
    stagedDeliveryObserved: false,
    upgradePending: false,
    activeVariantLabel: null,
    upgradeVariantLabel: null,
};

function isSingleImagePreviewEnvironment(metadata: unknown) {
    return isSingleImagePreviewMetadata(metadata as Parameters<typeof isSingleImagePreviewMetadata>[0]);
}

function shouldApplyPreviewOrientation(metadata: any) {
    if (typeof metadata?.rendering?.apply_preview_orientation === "boolean") {
        return metadata.rendering.apply_preview_orientation;
    }

    return isSingleImagePreviewEnvironment(metadata);
}

function rotatePreviewCameraVector(tuple: [number, number, number]) {
    const rotated = new THREE.Vector3(...tuple).applyQuaternion(PREVIEW_CAMERA_ORIENTATION_QUATERNION);
    return [rotated.x, rotated.y, rotated.z] as [number, number, number];
}

function resolveHostCapabilityLane(capabilities: ViewerCapabilities): ViewerHostCapabilityLane {
    if (capabilities.webgl2Supported) {
        return "webgl2_capable";
    }
    if (capabilities.webglSupported) {
        return "webgl_capable";
    }
    return "no_webgl";
}

function resolveViewerRuntimeMode({
    renderMode,
    isViewerReady,
    usesInteractiveFallback,
    shouldUsePreviewProjectionFallback,
    hasRenderableEnvironment,
}: {
    renderMode: "webgl" | "fallback";
    isViewerReady: boolean;
    usesInteractiveFallback: boolean;
    shouldUsePreviewProjectionFallback: boolean;
    hasRenderableEnvironment: boolean;
}): ViewerRuntimeMode {
    if (usesInteractiveFallback) {
        return renderMode === "fallback" || hasRenderableEnvironment ? "interactive_fallback" : "interactive_projection";
    }
    if (shouldUsePreviewProjectionFallback) {
        return "projection_only";
    }
    if (renderMode === "fallback") {
        return "hard_fallback";
    }
    if (isViewerReady) {
        return "webgl_live";
    }
    return "booting";
}

function resolveViewerDiagnosticCoverage(mode: ViewerRuntimeMode): ViewerDiagnosticCoverage {
    if (mode === "webgl_live") {
        return "interactive_ready";
    }
    if (mode === "interactive_projection" || mode === "interactive_fallback") {
        return "image_interactive";
    }
    if (mode === "projection_only") {
        return "image_only";
    }
    return "fallback_only";
}

function resolveViewerOperationalLane(
    mode: ViewerRuntimeMode,
    hostCapabilityLane: ViewerHostCapabilityLane,
): "webgl2_capable" | "webgl_capable" | "fallback_only" {
    if (mode !== "webgl_live") {
        return "fallback_only";
    }
    return hostCapabilityLane === "no_webgl" ? "fallback_only" : hostCapabilityLane;
}

function resolveViewerRuntimeLabel(mode: ViewerRuntimeMode, renderSourceMode: EnvironmentRenderSourceMode) {
    if (mode === "webgl_live") {
        return renderSourceMode === "sharp" ? "WebGL2 live" : "Viewer live";
    }
    if (mode === "interactive_projection") {
        return "Interactive projection";
    }
    if (mode === "interactive_fallback") {
        return "Interactive fallback";
    }
    if (mode === "projection_only") {
        return "Projection only";
    }
    if (mode === "hard_fallback") {
        return "Viewer fallback";
    }
    return "Viewer booting";
}

function resolveViewerRuntimeDetail({
    mode,
    renderSourceMode,
    fallbackMessage,
    hasRenderableEnvironment,
}: {
    mode: ViewerRuntimeMode;
    renderSourceMode: EnvironmentRenderSourceMode;
    fallbackMessage: string;
    hasRenderableEnvironment: boolean;
}) {
    if ((mode === "interactive_fallback" || mode === "hard_fallback") && fallbackMessage) {
        return fallbackMessage;
    }
    if (mode === "interactive_fallback") {
        return "Using the preview image because the live renderer could not start on this host.";
    }
    if (mode === "interactive_projection") {
        return "Using the preview image as an interactive directing surface until a renderable splat is available.";
    }
    if (mode === "projection_only") {
        return "Showing the preview projection without a live 3D canvas.";
    }
    if (mode === "hard_fallback") {
        return "The live viewer renderer is unavailable on this host.";
    }
    if (mode === "webgl_live") {
        return renderSourceMode === "sharp" ? "Sharp gaussian rendering is active." : "Viewer render surface is active.";
    }
    if (!hasRenderableEnvironment) {
        return "Waiting for renderable scene content before the live viewer boots.";
    }
    return "Waiting for the live viewer surface to initialize.";
}

function resolveSingleImagePreviewCamera(metadata: any): (CameraPose & { up?: [number, number, number] }) | null {
    const sourceCamera = metadata?.source_camera;
    if (!sourceCamera || typeof sourceCamera !== "object") {
        return null;
    }

    const applyOrientation = shouldApplyPreviewOrientation(metadata);
    const position = parseVector3Tuple(sourceCamera.position, [0, 0, 0]);
    const target = parseVector3Tuple(sourceCamera.target, [0, 0, 1]);
    const up = parseVector3Tuple(sourceCamera.up, [0, 1, 0]);
    const orientedPosition = applyOrientation ? rotatePreviewCameraVector(position) : position;
    const orientedTarget = applyOrientation ? rotatePreviewCameraVector(target) : target;
    const orientedUp = applyOrientation ? rotatePreviewCameraVector(up) : up;
    const explicitFov = Number(sourceCamera.fov_degrees ?? NaN);
    const focalLengthPx = Number(sourceCamera.focal_length_px ?? NaN);
    const resolutionPx = Array.isArray(sourceCamera.resolution_px) ? sourceCamera.resolution_px.map((value: unknown) => Number(value)) : [];
    const imageHeightPx = Number.isFinite(resolutionPx[1]) ? Math.max(1, resolutionPx[1]) : NaN;
    const derivedFov =
        Number.isFinite(explicitFov) && explicitFov > 1
            ? explicitFov
            : Number.isFinite(focalLengthPx) && focalLengthPx > 1 && Number.isFinite(imageHeightPx)
              ? (2 * Math.atan(imageHeightPx / (2 * focalLengthPx)) * 180) / Math.PI
              : NaN;
    const fov = Number.isFinite(derivedFov) && derivedFov > 1 ? derivedFov : 45;

    return {
        position: orientedPosition,
        target: orientedTarget,
        up: orientedUp,
        fov,
        lens_mm: Math.round(fovToLensMm(fov) * 10) / 10,
    };
}

export interface UseThreeOverlayViewerRuntimeControllerOptions {
    environment: WorkspaceSceneGraph["environment"];
    viewer: ViewerState;
    focusRequest: FocusRequest;
    backgroundColor: string;
    onViewerReadyChange: (ready: boolean) => void;
}

export function useThreeOverlayViewerRuntimeController({
    environment,
    viewer,
    focusRequest,
    backgroundColor,
    onViewerReadyChange,
}: UseThreeOverlayViewerRuntimeControllerOptions) {
    const controlsRef = useRef<any>(null);
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const canvasEventCleanupRef = useRef<(() => void) | null>(null);
    const previewAutofocusKeyRef = useRef("");
    const [runtimeFallback, setRuntimeFallback] = useState<{ message: string; reason: ViewerFallbackReason } | null>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [contextLossCount, setContextLossCount] = useState(0);
    const contextLossCountRef = useRef(0);
    const recoveryTimerRef = useRef<number | null>(null);
    const [canvasRecoveryNonce, setCanvasRecoveryNonce] = useState(0);
    const [deliveryRuntimeState, setDeliveryRuntimeState] = useState(DEFAULT_VIEWER_DELIVERY_RUNTIME_STATE);
    const [previewAutofocusRequest, setPreviewAutofocusRequest] = useState<FocusRequest>(null);
    const sessionStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
    const [canvasCreatedAtMs, setCanvasCreatedAtMs] = useState<number | null>(null);
    const [viewerReadyAtMs, setViewerReadyAtMs] = useState<number | null>(null);
    const [firstContextLossAtMs, setFirstContextLossAtMs] = useState<number | null>(null);

    const resolveSessionElapsedMs = useCallback(() => {
        if (typeof performance === "undefined") {
            return 0;
        }

        return Math.max(0, performance.now() - sessionStartRef.current);
    }, []);

    const environmentRenderState = useMemo(() => resolveEnvironmentRenderState(environment), [environment]);
    const environmentViewerUrl = toProxyUrl(environmentRenderState.viewerUrl);
    const environmentSplatUrl = toProxyUrl(environmentRenderState.splatUrl);
    const previewProjectionImage = toProxyUrl(environmentRenderState.previewProjectionImage);
    const environmentMetadata = typeof environment === "object" ? environment?.metadata ?? null : null;
    const referenceImage = environmentRenderState.referenceImage;
    const isSingleImagePreview = isSingleImagePreviewEnvironment(environmentMetadata);
    const viewerDecision = useMemo(
        () =>
            resolveViewerCapabilities({
                plyUrl: environmentSplatUrl,
                viewerUrl: environmentViewerUrl,
                metadata: environmentMetadata,
            }),
        [environmentMetadata, environmentSplatUrl, environmentViewerUrl],
    );
    const effectiveSharpPointBudget = useMemo(() => {
        if (viewerDecision.renderSource.mode !== "sharp") {
            return null;
        }

        const pointBudget = resolveSharpPointBudget(environmentMetadata, viewerDecision.capabilities.maxTextureSize);
        return Number.isFinite(pointBudget) && pointBudget > 0 ? pointBudget : null;
    }, [environmentMetadata, viewerDecision.capabilities.maxTextureSize, viewerDecision.renderSource.mode]);
    const prefersPerformanceMode = Boolean(
        !isSingleImagePreview &&
            effectiveSharpPointBudget !== null &&
            effectiveSharpPointBudget >= HEAVY_SCENE_POINT_THRESHOLD,
    );
    const preflightFallback =
        viewerDecision.renderMode === "fallback"
            ? {
                  message: viewerDecision.fallbackMessage,
                  reason: viewerDecision.fallbackReason ?? "environment_render_failed",
              }
            : null;
    const activeFallback = runtimeFallback ?? preflightFallback;
    const renderMode: "webgl" | "fallback" = activeFallback ? "fallback" : "webgl";
    const renderError = activeFallback?.message ?? "";
    const renderFallbackReason = activeFallback?.reason ?? null;
    const hasRenderableEnvironment = Boolean(environmentSplatUrl || environmentViewerUrl);
    const interactiveFallbackImage =
        isSingleImagePreview && (renderMode === "fallback" || !hasRenderableEnvironment)
            ? previewProjectionImage ?? referenceImage ?? null
            : null;
    const usesInteractiveFallback = Boolean(interactiveFallbackImage);
    const shouldUsePreviewProjectionFallback = renderMode !== "fallback" && !usesInteractiveFallback && !hasRenderableEnvironment && Boolean(previewProjectionImage);
    const singleImagePreviewCamera = useMemo(() => resolveSingleImagePreviewCamera(environmentMetadata), [environmentMetadata]);
    const effectiveFocusRequest =
        previewAutofocusRequest && (!focusRequest || previewAutofocusRequest.token >= focusRequest.token)
            ? previewAutofocusRequest
            : focusRequest ?? null;
    const qualityPolicy = useMemo<ViewerQualityPolicy>(
        () =>
            resolveViewerQualityPolicy({
                decision: viewerDecision,
                metadata: environmentMetadata,
                effectivePointBudget: effectiveSharpPointBudget,
                isViewerReady,
                renderMode,
                renderFallbackReason,
                renderFallbackMessage: renderError,
                hasRenderableEnvironment,
                usesInteractiveFallback,
                shouldUsePreviewProjectionFallback,
                isSingleImagePreview,
            }),
        [
            effectiveSharpPointBudget,
            environmentMetadata,
            hasRenderableEnvironment,
            isSingleImagePreview,
            isViewerReady,
            renderError,
            renderFallbackReason,
            renderMode,
            shouldUsePreviewProjectionFallback,
            usesInteractiveFallback,
            viewerDecision,
        ],
    );
    const runtimeDiagnostics = useMemo<ViewerRuntimeDiagnostics>(() => {
        const hostCapabilityLane = resolveHostCapabilityLane(viewerDecision.capabilities);
        const operationalMode = resolveViewerRuntimeMode({
            renderMode,
            isViewerReady,
            usesInteractiveFallback,
            shouldUsePreviewProjectionFallback,
            hasRenderableEnvironment,
        });

        return {
            hostCapabilityLane,
            operationalMode,
            operationalLane: resolveViewerOperationalLane(operationalMode, hostCapabilityLane),
            coverage: resolveViewerDiagnosticCoverage(operationalMode),
            renderSourceMode: viewerDecision.renderSource.mode,
            renderMode,
            fallbackReason: renderFallbackReason,
            fallbackMessage: renderError,
            hasRenderableEnvironment,
            isSingleImagePreview,
            previewProjectionAvailable: Boolean(previewProjectionImage),
            referenceImageAvailable: Boolean(referenceImage),
            isViewerReady,
            maxTextureSize: viewerDecision.capabilities.maxTextureSize,
            label: resolveViewerRuntimeLabel(operationalMode, viewerDecision.renderSource.mode),
            detail: resolveViewerRuntimeDetail({
                mode: operationalMode,
                renderSourceMode: viewerDecision.renderSource.mode,
                fallbackMessage: renderError,
                hasRenderableEnvironment,
            }),
            canvasCreatedAtMs,
            viewerReadyAtMs,
            firstContextLossAtMs,
        };
    }, [
        canvasCreatedAtMs,
        firstContextLossAtMs,
        hasRenderableEnvironment,
        isSingleImagePreview,
        isViewerReady,
        previewProjectionImage,
        referenceImage,
        renderError,
        renderFallbackReason,
        renderMode,
        shouldUsePreviewProjectionFallback,
        usesInteractiveFallback,
        viewerReadyAtMs,
        viewerDecision.capabilities,
        viewerDecision.renderSource.mode,
    ]);

    useEffect(() => {
        contextLossCountRef.current = contextLossCount;
    }, [contextLossCount]);

    const clearRecoveryTimer = useCallback(() => {
        if (recoveryTimerRef.current !== null) {
            window.clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
        }
    }, []);

    const activateViewerFallback = useCallback((message: string, reason: ViewerFallbackReason = "environment_render_failed") => {
        clearRecoveryTimer();
        setIsViewerReady(false);
        setRuntimeFallback({ message, reason });
    }, [clearRecoveryTimer]);

    useEffect(() => {
        return () => {
            clearRecoveryTimer();
            canvasEventCleanupRef.current?.();
            canvasEventCleanupRef.current = null;
            canvasElementRef.current = null;
        };
    }, [clearRecoveryTimer]);

    useEffect(() => {
        setIsViewerReady(false);
        setRuntimeFallback(null);
        setContextLossCount(0);
        contextLossCountRef.current = 0;
        clearRecoveryTimer();
        setCanvasRecoveryNonce(0);
        setDeliveryRuntimeState(DEFAULT_VIEWER_DELIVERY_RUNTIME_STATE);
        sessionStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
        setCanvasCreatedAtMs(null);
        setViewerReadyAtMs(null);
        setFirstContextLossAtMs(null);
        canvasEventCleanupRef.current?.();
        canvasEventCleanupRef.current = null;
        canvasElementRef.current = null;
    }, [clearRecoveryTimer, environmentSplatUrl, environmentViewerUrl]);

    useEffect(() => {
        onViewerReadyChange((isViewerReady && renderMode === "webgl") || usesInteractiveFallback);
    }, [isViewerReady, onViewerReadyChange, renderMode, usesInteractiveFallback]);

    useEffect(() => {
        if (!isViewerReady || viewerReadyAtMs !== null) {
            return;
        }

        setViewerReadyAtMs(resolveSessionElapsedMs());
    }, [isViewerReady, resolveSessionElapsedMs, viewerReadyAtMs]);

    useEffect(() => {
        previewAutofocusKeyRef.current = "";
        setPreviewAutofocusRequest(null);
    }, [environmentSplatUrl, environmentViewerUrl, isSingleImagePreview]);

    const handleCanvasError = useCallback(
        (error: Error) => {
            const message = error.message || "WebGL viewer failed to initialize.";
            activateViewerFallback(message, classifyViewerFailure(message));
        },
        [activateViewerFallback],
    );

    const handleEnvironmentFatalError = useCallback(
        (message: string, reason: ViewerFallbackReason) => {
            activateViewerFallback(message, reason);
        },
        [activateViewerFallback],
    );

    const handlePreviewBounds = useCallback(
        (bounds: PreviewBounds) => {
            if (!isSingleImagePreview) {
                return;
            }

            if (singleImagePreviewCamera) {
                const key = `${environmentSplatUrl}|source-camera|${singleImagePreviewCamera.position.join(",")}|${singleImagePreviewCamera.target.join(",")}|${singleImagePreviewCamera.fov.toFixed(3)}`;
                if (previewAutofocusKeyRef.current === key) {
                    return;
                }
                previewAutofocusKeyRef.current = key;
                setPreviewAutofocusRequest({
                    ...singleImagePreviewCamera,
                    token: Date.now(),
                });
                return;
            }

            const key = `${environmentSplatUrl}|${bounds.center.join(",")}|${bounds.radius.toFixed(4)}|${(bounds.forward ?? [0, 0, 1]).join(",")}|${viewer.fov.toFixed(2)}`;
            if (previewAutofocusKeyRef.current === key) {
                return;
            }
            previewAutofocusKeyRef.current = key;

            const radius = Math.max(0.1, bounds.radius);
            const verticalFovRadians = THREE.MathUtils.degToRad(viewer.fov);
            const distance = Math.max(radius * 1.75, (radius / Math.tan(verticalFovRadians * 0.5)) * 0.96);
            const forward = new THREE.Vector3(...(bounds.forward ?? [0, 0, 1]));
            if (forward.lengthSq() <= 1e-6) {
                forward.set(0, 0, 1);
            }
            forward.normalize();
            const position = new THREE.Vector3(...bounds.center).addScaledVector(forward, distance);

            setPreviewAutofocusRequest({
                position: [position.x, position.y, position.z],
                target: bounds.center,
                fov: viewer.fov,
                lens_mm: Math.round(fovToLensMm(viewer.fov) * 10) / 10,
                token: Date.now(),
            });
        },
        [environmentSplatUrl, isSingleImagePreview, singleImagePreviewCamera, viewer.fov],
    );

    const handleCanvasCreated = useCallback(
        (gl: THREE.WebGLRenderer) => {
            canvasEventCleanupRef.current?.();
            clearRecoveryTimer();
            canvasElementRef.current = gl.domElement;
            const handleContextLost = (event: Event) => {
                event.preventDefault();
                const nextContextLossCount = contextLossCountRef.current + 1;
                contextLossCountRef.current = nextContextLossCount;
                setContextLossCount(nextContextLossCount);
                setFirstContextLossAtMs((current) => current ?? resolveSessionElapsedMs());
                setIsViewerReady(false);
                if (nextContextLossCount <= 1) {
                    setRuntimeFallback({
                        message: "WebGL context was lost. Rebuilding the live renderer with safer guardrails.",
                        reason: "context_lost",
                    });
                    clearRecoveryTimer();
                    recoveryTimerRef.current = window.setTimeout(() => {
                        recoveryTimerRef.current = null;
                        setRuntimeFallback(null);
                        setIsViewerReady(false);
                        setCanvasRecoveryNonce((current) => current + 1);
                    }, 900);
                    return;
                }
                activateViewerFallback("WebGL context was lost while rendering the viewer.", "context_lost");
            };
            const handleContextRestored = () => {
                if (recoveryTimerRef.current === null && contextLossCountRef.current <= 1) {
                    setRuntimeFallback(null);
                    setCanvasRecoveryNonce((current) => current + 1);
                }
            };
            gl.domElement.addEventListener("webglcontextlost", handleContextLost, false);
            gl.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);
            canvasEventCleanupRef.current = () => {
                canvasElementRef.current = null;
                gl.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
                gl.domElement.removeEventListener("webglcontextrestored", handleContextRestored, false);
            };

            gl.setClearColor(backgroundColor, 1);
            gl.domElement.style.backgroundColor = backgroundColor;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
            setCanvasCreatedAtMs((current) => current ?? resolveSessionElapsedMs());
            setRuntimeFallback(null);
            if (viewerDecision.renderSource.mode !== "sharp") {
                setIsViewerReady(true);
            }
        },
        [activateViewerFallback, backgroundColor, clearRecoveryTimer, resolveSessionElapsedMs, viewerDecision.renderSource.mode],
    );

    const handleSharpLiveStateChange = useCallback(
        ({ isLiveReady, loadState }: { isLiveReady: boolean; loadState: SharpGaussianLoadState }) => {
            if (viewerDecision.renderSource.mode !== "sharp") {
                return;
            }

            setIsViewerReady(isLiveReady);
            setDeliveryRuntimeState((current) => ({
                stagedDeliveryObserved: current.stagedDeliveryObserved || Boolean(loadState.stagedDelivery),
                upgradePending: Boolean(loadState.upgradePending),
                activeVariantLabel: loadState.activeVariantLabel ?? current.activeVariantLabel,
                upgradeVariantLabel: loadState.upgradePending
                    ? loadState.upgradeVariantLabel ?? current.upgradeVariantLabel
                    : loadState.upgradeVariantLabel ?? null,
            }));
        },
        [viewerDecision.renderSource.mode],
    );

    return {
        controlsRef,
        canvasElementRef,
        canvasRecoveryNonce,
        renderMode,
        renderError,
        referenceImage,
        previewProjectionImage,
        interactiveFallbackImage,
        usesInteractiveFallback,
        shouldUsePreviewProjectionFallback,
        isSingleImagePreview,
        environmentViewerUrl,
        environmentSplatUrl,
        environmentMetadata,
        effectiveSharpPointBudget,
        contextLossCount,
        deliveryManifestUrl: environmentRenderState.deliveryManifestUrl ?? null,
        deliveryManifestFirst: Boolean(environmentRenderState.deliveryManifestFirst),
        deliveryHasProgressiveVariants: Boolean(environmentRenderState.deliveryHasProgressiveVariants),
        deliveryHasCompressedVariants: Boolean(environmentRenderState.deliveryHasCompressedVariants),
        deliveryStagedObserved: deliveryRuntimeState.stagedDeliveryObserved,
        deliveryUpgradePending: deliveryRuntimeState.upgradePending,
        deliveryActiveVariantLabel: deliveryRuntimeState.activeVariantLabel,
        deliveryUpgradeVariantLabel: deliveryRuntimeState.upgradeVariantLabel,
        prefersPerformanceMode,
        qualityPolicy,
        effectiveFocusRequest,
        handleCanvasError,
        handleEnvironmentFatalError,
        handlePreviewBounds,
        handleCanvasCreated,
        handleSharpLiveStateChange,
        runtimeDiagnostics,
    };
}

export type ThreeOverlayViewerRuntimeController = ReturnType<typeof useThreeOverlayViewerRuntimeController>;
