"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import { classifyViewerFailure, isSingleImagePreviewMetadata, type ViewerFallbackReason } from "@/lib/mvp-viewer";

import {
    DEFAULT_SHARP_GAUSSIAN_LOAD_STATE,
    type PreviewBounds,
    type SharpGaussianPayload,
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

        const isStale = () => ignore || abortController.signal.aborted || loadGenerationRef.current !== loadGeneration;

        setPayload(null);
        setLoadState(DEFAULT_SHARP_GAUSSIAN_LOAD_STATE);

        const loadPayload = async () => {
            try {
                if (typeof Worker === "undefined") {
                    throw new Error("Environment splat parsing requires Web Worker support.");
                }

                const nextPayload = await loadSharpGaussianPayload({
                    source,
                    pointBudget,
                    maxTextureSize,
                    metadata,
                    signal: abortController.signal,
                    onProgress: (message) => {
                        if (!isStale()) {
                            setLoadState({
                                phase: "loading",
                                message,
                            });
                        }
                    },
                });

                if (isStale()) {
                    disposeSharpGaussianPayload(nextPayload);
                    return;
                }

                setPayload(nextPayload);
                setLoadState({
                    phase: "ready",
                    message: "Environment splat loaded.",
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
