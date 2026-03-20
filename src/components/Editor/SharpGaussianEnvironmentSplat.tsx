"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import type { ViewerFallbackReason } from "@/lib/mvp-viewer";

import { EnvironmentSplatStatus } from "./EnvironmentSplatStatus";
import { createSharpGaussianMaterial } from "./sharpGaussianShaders";
import type { PreviewBounds, SharpGaussianLoadState, SharpGaussianResidentPayload } from "./sharpGaussianShared";
import { useSharpGaussianOrderingController } from "./useSharpGaussianOrderingController";
import { useSharpGaussianPayloadController } from "./useSharpGaussianPayloadController";

const PAGE_LAYER_FADE_IN_MS = 360;

function SharpGaussianPayloadLayerMesh({
    layer,
    isSingleImagePreview,
    opacityBoost,
    colorGain,
    transitionActive,
}: {
    layer: SharpGaussianResidentPayload;
    isSingleImagePreview: boolean;
    opacityBoost: number;
    colorGain: number;
    transitionActive: boolean;
}) {
    const material = useMemo(
        () =>
            createSharpGaussianMaterial({
                payload: layer.payload,
                isSingleImagePreview,
            }),
        [isSingleImagePreview, layer.payload],
    );
    const fadeStartedAtRef = useRef<number | null>(null);
    const meshRef = useSharpGaussianOrderingController({
        payload: layer.payload,
        material,
        isSingleImagePreview,
        opacityBoost,
        colorGain,
        renderOrder: layer.role === "bootstrap" ? 0 : 100 + (layer.pageIndex ?? layer.priority),
        transitionActive,
    });

    useEffect(() => {
        return () => {
            material.dispose();
        };
    }, [material]);

    useFrame(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (fadeStartedAtRef.current === null) {
            fadeStartedAtRef.current = now;
        }
        const shouldAnimate = layer.role === "page";
        const nextOpacity = shouldAnimate
            ? Math.min(1, (now - fadeStartedAtRef.current) / PAGE_LAYER_FADE_IN_MS)
            : 1;
        material.uniforms.uLayerOpacity.value = nextOpacity;
    });

    return <mesh ref={meshRef} geometry={layer.payload.geometry} material={material} frustumCulled={false} />;
}

export function SharpGaussianEnvironmentSplat({
    source,
    metadata,
    focusTarget,
    onPreviewBounds,
    onFatalError,
    onLiveStateChange,
    onTransitionActiveChange,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
    focusTarget?: [number, number, number] | null;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
    onLiveStateChange?: (state: { isLiveReady: boolean; loadState: SharpGaussianLoadState }) => void;
    onTransitionActiveChange?: (active: boolean) => void;
}) {
    const { gl } = useThree();
    const sharpGaussian = useSharpGaussianPayloadController({
        source,
        metadata,
        focusTarget,
        maxTextureSize: gl.capabilities.maxTextureSize,
        onPreviewBounds,
        onFatalError,
    });
    const candidateLiveReady = sharpGaussian.loadState.phase === "ready" && sharpGaussian.payloadLayers.length > 0;
    const reportedLiveStateRef = useRef<boolean | null>(null);
    const pendingLiveStateRef = useRef(false);
    const transitionActiveRef = useRef(false);
    const [transitionActive, setTransitionActive] = useState(false);

    useFrame(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const nextTransitionActive = sharpGaussian.payloadLayers.some(
            (layer) => layer.role === "page" && now - layer.residentAt < PAGE_LAYER_FADE_IN_MS,
        );
        if (nextTransitionActive !== transitionActiveRef.current) {
            transitionActiveRef.current = nextTransitionActive;
            setTransitionActive(nextTransitionActive);
            onTransitionActiveChange?.(nextTransitionActive);
        }
    });

    useEffect(() => {
        return () => {
            if (transitionActiveRef.current) {
                transitionActiveRef.current = false;
                setTransitionActive(false);
                onTransitionActiveChange?.(false);
            }
        };
    }, [onTransitionActiveChange]);

    useEffect(() => {
        if (!onLiveStateChange) {
            return;
        }

        pendingLiveStateRef.current = candidateLiveReady;
        if (!candidateLiveReady && reportedLiveStateRef.current !== false) {
            reportedLiveStateRef.current = false;
            onLiveStateChange({
                isLiveReady: false,
                loadState: sharpGaussian.loadState,
            });
        }
    }, [candidateLiveReady, onLiveStateChange, sharpGaussian.loadState]);

    useFrame(() => {
        if (!onLiveStateChange || !pendingLiveStateRef.current || reportedLiveStateRef.current === true) {
            return;
        }

        reportedLiveStateRef.current = true;
        onLiveStateChange({
            isLiveReady: true,
            loadState: sharpGaussian.loadState,
        });
    });

    if (sharpGaussian.loadState.phase === "error") {
        return <EnvironmentSplatStatus text={`Environment splat failed: ${sharpGaussian.loadState.message}`} tone="error" />;
    }

    if (sharpGaussian.payloadLayers.length === 0) {
        return <EnvironmentSplatStatus text={sharpGaussian.loadState.message} />;
    }

    return (
        <>
            {sharpGaussian.loadState.upgradePending ? (
                <EnvironmentSplatStatus
                    text={sharpGaussian.loadState.message}
                    tone="info"
                    placement="corner"
                    diagnostics={{
                        "data-staged-delivery": sharpGaussian.loadState.stagedDelivery ? "true" : "false",
                        "data-upgrade-pending": sharpGaussian.loadState.upgradePending ? "true" : "false",
                        "data-active-variant-label": sharpGaussian.loadState.activeVariantLabel ?? "",
                        "data-upgrade-variant-label": sharpGaussian.loadState.upgradeVariantLabel ?? "",
                        "data-resident-layer-count": String(sharpGaussian.loadState.residentLayerCount ?? sharpGaussian.payloadLayers.length),
                        "data-resident-point-count": String(
                            sharpGaussian.loadState.residentPointCount ??
                                sharpGaussian.payloadLayers.reduce((sum, layer) => sum + layer.pointCount, 0),
                        ),
                        "data-refine-pages-loaded": String(sharpGaussian.loadState.refinePagesLoaded ?? 0),
                        "data-refine-pages-pending": String(sharpGaussian.loadState.refinePagesPending ?? 0),
                        "data-delivery-pause-reason": sharpGaussian.loadState.deliveryPauseReason ?? "",
                    }}
                />
            ) : null}
            {sharpGaussian.payloadLayers.map((layer) => (
                <SharpGaussianPayloadLayerMesh
                    key={layer.id}
                    layer={layer}
                    isSingleImagePreview={sharpGaussian.isSingleImagePreview}
                    opacityBoost={sharpGaussian.opacityBoost}
                    colorGain={sharpGaussian.colorGain}
                    transitionActive={transitionActive}
                />
            ))}
        </>
    );
}
