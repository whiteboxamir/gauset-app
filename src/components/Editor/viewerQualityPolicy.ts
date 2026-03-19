import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import type { ViewerCapabilityDecision, ViewerFallbackReason } from "@/lib/mvp-viewer";

import { HEAVY_SCENE_POINT_THRESHOLD } from "./sharpGaussianShared";

export type ViewerQualityMode = "premium" | "balanced" | "safe" | "reference" | "fallback" | "booting";

export type ViewerQualityTier = "premium" | "standard" | "guarded" | "reference" | "fallback" | "booting";

export type ViewerPresentationProfile = "cinematic" | "cinematic_safe" | "steady" | "reference" | "fallback" | "booting";

export interface ViewerQualityPolicy {
    mode: ViewerQualityMode;
    tier: ViewerQualityTier;
    label: string;
    summary: string;
    premiumEffectsEnabled: boolean;
    cautiousMode: boolean;
    presentationProfile: ViewerPresentationProfile;
    hideEditorGridWhenLive: boolean;
    isWebGL2Baseline: boolean;
    hasRenderableEnvironment: boolean;
    renderSourceMode: ViewerCapabilityDecision["renderSource"]["mode"];
    fallbackReason: ViewerFallbackReason | null;
    effectivePointBudget: number | null;
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveFallbackLabel(reason: ViewerFallbackReason | null) {
    switch (reason) {
        case "context_lost":
            return "Recovery mode";
        case "webgl2_required":
        case "webgl_unavailable":
        case "ext_color_buffer_float_required":
        case "texture_size_exceeded":
            return "Viewer fallback";
        case "environment_render_failed":
        default:
            return "Viewer fallback";
    }
}

function resolveFallbackSummary(reason: ViewerFallbackReason | null, fallbackMessage: string) {
    if (fallbackMessage) {
        return fallbackMessage;
    }

    switch (reason) {
        case "context_lost":
            return "The browser lost the WebGL context, so we switched into recovery mode.";
        case "webgl2_required":
            return "This device does not expose WebGL2, so the live renderer cannot start.";
        case "webgl_unavailable":
            return "WebGL could not be initialized in this environment.";
        case "ext_color_buffer_float_required":
            return "This device is missing EXT_color_buffer_float, so the sharp renderer cannot start.";
        case "texture_size_exceeded":
            return "The scene exceeds the device texture ceiling, so we stepped down to a safer mode.";
        case "environment_render_failed":
        default:
            return "The live viewer could not start on this host.";
    }
}

export function resolveViewerQualityPolicy({
    decision,
    metadata,
    effectivePointBudget,
    isViewerReady,
    renderMode,
    renderFallbackReason,
    renderFallbackMessage,
    hasRenderableEnvironment,
    usesInteractiveFallback,
    shouldUsePreviewProjectionFallback,
    isSingleImagePreview,
}: {
    decision: ViewerCapabilityDecision;
    metadata?: GeneratedEnvironmentMetadata | null;
    effectivePointBudget: number | null;
    isViewerReady: boolean;
    renderMode: "webgl" | "fallback";
    renderFallbackReason: ViewerFallbackReason | null;
    renderFallbackMessage: string;
    hasRenderableEnvironment: boolean;
    usesInteractiveFallback: boolean;
    shouldUsePreviewProjectionFallback: boolean;
    isSingleImagePreview: boolean;
}): ViewerQualityPolicy {
    const qualityTier = normalizeText(metadata?.quality_tier);
    const sourceFormat = normalizeText(metadata?.rendering?.source_format);
    const isDensePreview = qualityTier.includes("dense") || sourceFormat.includes("dense_preview");
    const isWebGL2Baseline = decision.capabilities.webgl2Supported;
    const hasHighTextureBudget = decision.capabilities.maxTextureSize === null || decision.capabilities.maxTextureSize >= 8192;
    const premiumCapableHost = isWebGL2Baseline && hasHighTextureBudget && decision.capabilities.extColorBufferFloatSupported;
    const liveWebGL = renderMode === "webgl" && isViewerReady;
    const referenceSurfaceActive = usesInteractiveFallback || shouldUsePreviewProjectionFallback || isSingleImagePreview;
    const fallbackActive = renderMode === "fallback";
    const heavySceneBudget = effectivePointBudget !== null && effectivePointBudget >= HEAVY_SCENE_POINT_THRESHOLD;
    const stabilityFirst = fallbackActive || !liveWebGL || referenceSurfaceActive || heavySceneBudget || isDensePreview;
    const premiumEffectsEnabled = liveWebGL && !stabilityFirst && decision.renderSource.mode !== "none";

    if (fallbackActive) {
        return {
            mode: "fallback",
            tier: "fallback",
            label: resolveFallbackLabel(renderFallbackReason),
            summary: resolveFallbackSummary(renderFallbackReason, renderFallbackMessage),
            premiumEffectsEnabled: false,
            cautiousMode: true,
            presentationProfile: "fallback",
            hideEditorGridWhenLive: false,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    if (!liveWebGL && !referenceSurfaceActive) {
        return {
            mode: "booting",
            tier: "booting",
            label: "Warming up",
            summary: "Preparing the live renderer on this device.",
            premiumEffectsEnabled: false,
            cautiousMode: true,
            presentationProfile: "booting",
            hideEditorGridWhenLive: false,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    if (referenceSurfaceActive) {
        return {
            mode: "reference",
            tier: "reference",
            label: "Reference mode",
            summary: "Showing a guided reference surface while live rendering is deferred.",
            premiumEffectsEnabled: false,
            cautiousMode: true,
            presentationProfile: "reference",
            hideEditorGridWhenLive: false,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    if (heavySceneBudget && premiumCapableHost && decision.renderSource.mode === "sharp") {
        return {
            mode: "balanced",
            tier: "guarded",
            label: "Premium-safe live",
            summary: "Live rendering is active with safer caps, while inexpensive cinematic polish stays on where this host can sustain it.",
            premiumEffectsEnabled: true,
            cautiousMode: true,
            presentationProfile: "cinematic_safe",
            hideEditorGridWhenLive: true,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    if (heavySceneBudget || isDensePreview) {
        return {
            mode: "safe",
            tier: "guarded",
            label: "Safe live",
            summary: "Live rendering is active with browser-safe caps to keep the scene stable.",
            premiumEffectsEnabled,
            cautiousMode: true,
            presentationProfile: "steady",
            hideEditorGridWhenLive: true,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    if (premiumCapableHost && decision.renderSource.mode === "sharp") {
        return {
            mode: "premium",
            tier: "premium",
            label: "Cinematic live",
            summary: "WebGL2 is live at the highest quality this device can comfortably sustain.",
            premiumEffectsEnabled: true,
            cautiousMode: false,
            presentationProfile: "cinematic",
            hideEditorGridWhenLive: true,
            isWebGL2Baseline,
            hasRenderableEnvironment,
            renderSourceMode: decision.renderSource.mode,
            fallbackReason: renderFallbackReason,
            effectivePointBudget,
        };
    }

    return {
        mode: "balanced",
        tier: "standard",
        label: "Balanced live",
        summary: "Live rendering is active with a steady default quality profile.",
        premiumEffectsEnabled,
        cautiousMode: false,
        presentationProfile: premiumEffectsEnabled ? "cinematic_safe" : "steady",
        hideEditorGridWhenLive: true,
        isWebGL2Baseline,
        hasRenderableEnvironment,
        renderSourceMode: decision.renderSource.mode,
        fallbackReason: renderFallbackReason,
        effectivePointBudget,
    };
}
