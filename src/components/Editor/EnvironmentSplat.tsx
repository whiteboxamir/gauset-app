"use client";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import { resolveEnvironmentRenderSource, type ViewerFallbackReason } from "@/lib/mvp-viewer";

import { LumaEnvironmentSplat } from "./LumaEnvironmentSplat";
import { SharpGaussianEnvironmentSplat } from "./SharpGaussianEnvironmentSplat";
import type { PreviewBounds, SharpGaussianLoadState } from "./sharpGaussianShared";

type EnvironmentSplatProps = {
    plyUrl?: string | null;
    viewerUrl?: string | null;
    metadata?: GeneratedEnvironmentMetadata | null;
    focusTarget?: [number, number, number] | null;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
    onSharpLiveStateChange?: (state: { isLiveReady: boolean; loadState: SharpGaussianLoadState }) => void;
    onSharpTransitionActiveChange?: (active: boolean) => void;
};

export default function EnvironmentSplat(props: EnvironmentSplatProps) {
    const resolved = resolveEnvironmentRenderSource(props);

    if (resolved.mode === "luma") {
        return <LumaEnvironmentSplat source={resolved.source} />;
    }

    if (resolved.mode === "sharp") {
        return (
            <SharpGaussianEnvironmentSplat
                source={resolved.source}
                metadata={props.metadata}
                focusTarget={props.focusTarget}
                onPreviewBounds={props.onPreviewBounds}
                onFatalError={props.onFatalError}
                onLiveStateChange={props.onSharpLiveStateChange}
                onTransitionActiveChange={props.onSharpTransitionActiveChange}
            />
        );
    }

    return null;
}
