"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import type { ViewerFallbackReason } from "@/lib/mvp-viewer";

import { EnvironmentSplatStatus } from "./EnvironmentSplatStatus";
import { createSharpGaussianMaterial } from "./sharpGaussianShaders";
import type { PreviewBounds, SharpGaussianLoadState } from "./sharpGaussianShared";
import { useSharpGaussianOrderingController } from "./useSharpGaussianOrderingController";
import { useSharpGaussianPayloadController } from "./useSharpGaussianPayloadController";

export function SharpGaussianEnvironmentSplat({
    source,
    metadata,
    onPreviewBounds,
    onFatalError,
    onLiveStateChange,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
    onLiveStateChange?: (state: { isLiveReady: boolean; loadState: SharpGaussianLoadState }) => void;
}) {
    const { gl } = useThree();
    const sharpGaussian = useSharpGaussianPayloadController({
        source,
        metadata,
        maxTextureSize: gl.capabilities.maxTextureSize,
        onPreviewBounds,
        onFatalError,
    });
    const material = useMemo(
        () =>
            sharpGaussian.payload
                ? createSharpGaussianMaterial({
                      payload: sharpGaussian.payload,
                      isSingleImagePreview: sharpGaussian.isSingleImagePreview,
                  })
                : null,
        [sharpGaussian.isSingleImagePreview, sharpGaussian.payload],
    );
    const meshRef = useSharpGaussianOrderingController({
        payload: sharpGaussian.payload,
        material,
        isSingleImagePreview: sharpGaussian.isSingleImagePreview,
        opacityBoost: sharpGaussian.opacityBoost,
        colorGain: sharpGaussian.colorGain,
    });
    const candidateLiveReady = sharpGaussian.loadState.phase === "ready" && Boolean(sharpGaussian.payload && material);
    const reportedLiveStateRef = useRef<boolean | null>(null);
    const pendingLiveStateRef = useRef(false);

    useEffect(() => {
        if (!material) {
            return;
        }

        return () => {
            material.dispose();
        };
    }, [material]);

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

    if (!sharpGaussian.payload || !material) {
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
                    }}
                />
            ) : null}
            <mesh ref={meshRef} geometry={sharpGaussian.payload.geometry} material={material} frustumCulled={false} />
        </>
    );
}
