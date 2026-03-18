"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import type { ViewerFallbackReason } from "@/lib/mvp-viewer";

import { EnvironmentSplatStatus } from "./EnvironmentSplatStatus";
import { createSharpGaussianMaterial } from "./sharpGaussianShaders";
import type { PreviewBounds } from "./sharpGaussianShared";
import { useSharpGaussianOrderingController } from "./useSharpGaussianOrderingController";
import { useSharpGaussianPayloadController } from "./useSharpGaussianPayloadController";

export function SharpGaussianEnvironmentSplat({
    source,
    metadata,
    onPreviewBounds,
    onFatalError,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
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

    useEffect(() => {
        if (!material) {
            return;
        }

        return () => {
            material.dispose();
        };
    }, [material]);

    if (sharpGaussian.loadState.phase === "error") {
        return <EnvironmentSplatStatus text={`Environment splat failed: ${sharpGaussian.loadState.message}`} tone="error" />;
    }

    if (!sharpGaussian.payload || !material) {
        return <EnvironmentSplatStatus text={sharpGaussian.loadState.message} />;
    }

    return <mesh ref={meshRef} geometry={sharpGaussian.payload.geometry} material={material} frustumCulled={false} />;
}
