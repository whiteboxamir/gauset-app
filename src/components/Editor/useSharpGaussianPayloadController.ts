"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import { classifyViewerFailure, isSingleImagePreviewMetadata, type ViewerFallbackReason } from "@/lib/mvp-viewer";

import {
    DEFAULT_SHARP_GAUSSIAN_LOAD_STATE,
    HEAVY_SCENE_POINT_THRESHOLD,
    type PreviewBounds,
    type SharpGaussianPayload,
    STAGED_UPGRADE_MAX_INITIAL_POINTS,
} from "./sharpGaussianShared";
import {
    disposeSharpGaussianPayload,
    isAbortError,
    loadSharpGaussianPayload,
    resolvePreviewColorGain,
    resolvePreviewOpacityBoost,
    resolveSharpGaussianPreviewBounds,
    resolveSharpPointBudget,
} from "./sharpGaussianPayload";
import { resolveSharpGaussianManifestSource } from "@/lib/sharpGaussianDeliveryManifest";

export function useSharpGaussianPayloadController({
    source,
    metadata,
    maxTextureSize,
    onPreviewBounds,
    onFatalError,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
    maxTextureSize: number;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
}) {
    const pointBudget = useMemo(() => resolveSharpPointBudget(metadata, maxTextureSize), [maxTextureSize, metadata]);
    const isSingleImagePreview = useMemo(() => isSingleImagePreviewMetadata(metadata), [metadata]);
    const opacityBoost = useMemo(() => resolvePreviewOpacityBoost(metadata), [metadata]);
    const colorGain = useMemo(() => resolvePreviewColorGain(metadata), [metadata]);
    const payloadRef = useRef<SharpGaussianPayload | null>(null);
    const loadGenerationRef = useRef(0);
    const [payload, setPayload] = useState<SharpGaussianPayload | null>(null);
    const [loadState, setLoadState] = useState(DEFAULT_SHARP_GAUSSIAN_LOAD_STATE);

    useEffect(() => {
        const previousPayload = payloadRef.current;
        payloadRef.current = payload;
        if (previousPayload && previousPayload !== payload) {
            disposeSharpGaussianPayload(previousPayload);
        }
    }, [payload]);

    useEffect(() => {
        return () => {
            if (payloadRef.current) {
                disposeSharpGaussianPayload(payloadRef.current);
                payloadRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const loadGeneration = loadGenerationRef.current + 1;
        loadGenerationRef.current = loadGeneration;
        let ignore = false;
        const abortController = new AbortController();
        let loadStartTimer: number | null = null;
        let upgradeStartTimer: number | null = null;
        let upgradeIdleCallbackId: number | null = null;

        const isStale = () => ignore || abortController.signal.aborted || loadGenerationRef.current !== loadGeneration;

        setPayload(null);
        setLoadState(DEFAULT_SHARP_GAUSSIAN_LOAD_STATE);

        const loadPayload = async () => {
            try {
                if (typeof Worker === "undefined") {
                    throw new Error("Environment splat parsing requires Web Worker support.");
                }

                const describeVariantLabel = (value?: string | null) => (value ? value : "Live scene");

                const reportProgress = (message: string) => {
                    if (!isStale()) {
                        setLoadState({
                            phase: "loading",
                            message,
                            activeVariantLabel: null,
                            upgradeVariantLabel: null,
                            stagedDelivery: false,
                            upgradePending: false,
                        });
                    }
                };

                const deliveryPlan = await resolveSharpGaussianManifestSource({
                    source,
                    maxTextureSize,
                    desiredPointBudget: pointBudget,
                    signal: abortController.signal,
                    onProgress: reportProgress,
                });

                const nextPayload = await loadSharpGaussianPayload({
                    source: deliveryPlan.source,
                    pointBudget,
                    maxTextureSize,
                    metadata,
                    signal: abortController.signal,
                    onProgress: reportProgress,
                });

                if (isStale()) {
                    disposeSharpGaussianPayload(nextPayload);
                    return;
                }

                setPayload(nextPayload);
                const activeVariantLabel =
                    deliveryPlan.variant?.label ??
                    deliveryPlan.variant?.role ??
                    deliveryPlan.variant?.id ??
                    null;
                const upgradeVariantLabel =
                    deliveryPlan.upgradeVariant?.label ??
                    deliveryPlan.upgradeVariant?.role ??
                    deliveryPlan.upgradeVariant?.id ??
                    null;
                const shouldAttemptStagedUpgrade = Boolean(
                    deliveryPlan.staged &&
                        deliveryPlan.upgradeSource &&
                        deliveryPlan.upgradeVariant &&
                        pointBudget < HEAVY_SCENE_POINT_THRESHOLD &&
                        nextPayload.count <= STAGED_UPGRADE_MAX_INITIAL_POINTS,
                );

                if (shouldAttemptStagedUpgrade) {
                    setLoadState({
                        phase: "ready",
                        message: `${describeVariantLabel(activeVariantLabel)} live. Premium refinement will start when the browser has headroom.`,
                        activeVariantLabel,
                        upgradeVariantLabel,
                        stagedDelivery: true,
                        upgradePending: true,
                    });

                    const beginUpgrade = () => {
                        if (upgradeStartTimer !== null) {
                            window.clearTimeout(upgradeStartTimer);
                            upgradeStartTimer = null;
                        }
                        if (upgradeIdleCallbackId !== null) {
                            const idleWindow = window as Window & {
                                cancelIdleCallback?: (handle: number) => void;
                            };
                            idleWindow.cancelIdleCallback?.(upgradeIdleCallbackId);
                            upgradeIdleCallbackId = null;
                        }
                        if (isStale()) {
                            return;
                        }

                        void (async () => {
                            try {
                                const upgradedPayload = await loadSharpGaussianPayload({
                                    source: deliveryPlan.upgradeSource!,
                                    pointBudget,
                                    maxTextureSize,
                                    metadata,
                                    signal: abortController.signal,
                                    onProgress: (message) => {
                                        if (!isStale()) {
                                            setLoadState({
                                                phase: "ready",
                                                message: `${message} Refining live view without interrupting the current scene...`,
                                                activeVariantLabel,
                                                upgradeVariantLabel,
                                                stagedDelivery: true,
                                                upgradePending: true,
                                            });
                                        }
                                    },
                                });

                                if (isStale()) {
                                    disposeSharpGaussianPayload(upgradedPayload);
                                    return;
                                }

                                setPayload(upgradedPayload);
                                setLoadState({
                                    phase: "ready",
                                    message: `${describeVariantLabel(upgradeVariantLabel)} live.`,
                                    activeVariantLabel: upgradeVariantLabel,
                                    upgradeVariantLabel: null,
                                    stagedDelivery: true,
                                    upgradePending: false,
                                });
                            } catch (upgradeError) {
                                if (isStale() || isAbortError(upgradeError)) {
                                    return;
                                }

                                console.warn("[EnvironmentSplat] Keeping initial live variant after staged refinement failed.", upgradeError);
                                setLoadState({
                                    phase: "ready",
                                    message: `${describeVariantLabel(activeVariantLabel)} live. Premium refinement was skipped to keep the scene stable.`,
                                    activeVariantLabel,
                                    upgradeVariantLabel,
                                    stagedDelivery: true,
                                    upgradePending: false,
                                });
                            }
                        })();
                    };
                    const idleWindow = window as Window & {
                        requestIdleCallback?: (
                            callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
                            options?: { timeout: number },
                        ) => number;
                    };
                    if (typeof idleWindow.requestIdleCallback === "function") {
                        upgradeIdleCallbackId = idleWindow.requestIdleCallback(() => {
                            upgradeIdleCallbackId = null;
                            beginUpgrade();
                        }, { timeout: 3000 });
                    } else {
                        upgradeStartTimer = window.setTimeout(beginUpgrade, 1800);
                    }
                    return;
                }

                setLoadState({
                    phase: "ready",
                    message:
                        deliveryPlan.staged && deliveryPlan.upgradeSource && deliveryPlan.upgradeVariant
                            ? `${describeVariantLabel(activeVariantLabel)} live. Premium refinement was withheld to keep memory headroom available.`
                            : `${describeVariantLabel(activeVariantLabel)} live.`,
                    activeVariantLabel,
                    upgradeVariantLabel: null,
                    stagedDelivery: Boolean(deliveryPlan.staged),
                    upgradePending: false,
                });
            } catch (error) {
                if (isStale() || isAbortError(error)) {
                    return;
                }

                const message = error instanceof Error ? error.message : "Environment splat failed to load.";
                if (/Could not load .*: (502|503|504)\b/.test(message)) {
                    console.warn(`[EnvironmentSplat] Transient storage fetch failed for ${source}`, error);
                } else {
                    console.error(`[EnvironmentSplat] Failed to load ${source}`, error);
                }
                setPayload(null);
                setLoadState({
                    phase: "error",
                    message,
                    activeVariantLabel: null,
                    upgradeVariantLabel: null,
                    stagedDelivery: false,
                    upgradePending: false,
                });
                onFatalError?.(message, classifyViewerFailure(message));
            }
        };

        // Defer kickoff so the first Strict Mode mount can cleanly cancel before spawning
        // duplicate fetches/workers, while real mounts still start on the next task.
        loadStartTimer = window.setTimeout(() => {
            loadStartTimer = null;
            if (isStale()) {
                return;
            }
            void loadPayload();
        }, 0);

        return () => {
            ignore = true;
            if (loadStartTimer !== null) {
                window.clearTimeout(loadStartTimer);
            }
            if (upgradeStartTimer !== null) {
                window.clearTimeout(upgradeStartTimer);
            }
            if (upgradeIdleCallbackId !== null) {
                const idleWindow = window as Window & {
                    cancelIdleCallback?: (handle: number) => void;
                };
                idleWindow.cancelIdleCallback?.(upgradeIdleCallbackId);
            }
            abortController.abort();
        };
    }, [maxTextureSize, metadata, onFatalError, pointBudget, source]);

    useEffect(() => {
        if (!payload || !onPreviewBounds || !isSingleImagePreview) {
            return;
        }

        const bounds = resolveSharpGaussianPreviewBounds(payload);
        if (bounds) {
            onPreviewBounds(bounds);
        }
    }, [isSingleImagePreview, onPreviewBounds, payload]);

    return {
        payload,
        loadState,
        isSingleImagePreview,
        opacityBoost,
        colorGain,
    };
}
