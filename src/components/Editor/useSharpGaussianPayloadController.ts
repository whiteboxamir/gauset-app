"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import { classifyViewerFailure, isSingleImagePreviewMetadata, type ViewerFallbackReason } from "@/lib/mvp-viewer";

import {
    DEFAULT_SHARP_GAUSSIAN_LOAD_STATE,
    HEAVY_SCENE_POINT_THRESHOLD,
    STAGED_REFINEMENT_BYTE_BUDGET_HIGH,
    STAGED_REFINEMENT_BYTE_BUDGET_LOW,
    STAGED_REFINEMENT_BYTE_BUDGET_MEDIUM,
    type PreviewBounds,
    type SharpGaussianPayload,
    type SharpGaussianResidentPayload,
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
import { resolveSharpGaussianManifestSource, type SharpGaussianManifestPage } from "@/lib/sharpGaussianDeliveryManifest";

const MAX_RESIDENT_REFINEMENT_LAYERS = 6;
const PAGE_REFINE_INTERVAL_MS = 420;
const PAGE_REFINE_START_DELAY_MS = 1200;

function scorePageDistance(
    focusCenter: [number, number, number],
    pageFocusCenter: [number, number, number] | null,
    pageFocusRadius: number | null,
) {
    if (pageFocusCenter === null) {
        return Number.POSITIVE_INFINITY;
    }

    return (
        Math.hypot(
            pageFocusCenter[0] - focusCenter[0],
            pageFocusCenter[1] - focusCenter[1],
            pageFocusCenter[2] - focusCenter[2],
        ) - (pageFocusRadius ?? 0)
    );
}

function scorePageRole(pageRole: string | null | undefined) {
    if (pageRole === "hero") {
        return 0;
    }
    if (pageRole === "supporting") {
        return 1;
    }
    return 2;
}

function resolveResidentByteBudget(pointBudget: number) {
    if (pointBudget >= 1_400_000) {
        return STAGED_REFINEMENT_BYTE_BUDGET_HIGH;
    }
    if (pointBudget >= 950_000) {
        return STAGED_REFINEMENT_BYTE_BUDGET_MEDIUM;
    }
    return STAGED_REFINEMENT_BYTE_BUDGET_LOW;
}

function sortResidentPayloads(layers: SharpGaussianResidentPayload[], focusCenter?: [number, number, number] | null) {
    return [...layers].sort((left, right) => {
        if (left.sticky !== right.sticky) {
            return left.sticky ? -1 : 1;
        }
        if (left.preload !== right.preload) {
            return left.preload ? -1 : 1;
        }
        const leftRoleScore = scorePageRole(left.pageRole);
        const rightRoleScore = scorePageRole(right.pageRole);
        if (leftRoleScore !== rightRoleScore) {
            return leftRoleScore - rightRoleScore;
        }
        if (left.evictionPriority !== right.evictionPriority) {
            return left.evictionPriority - right.evictionPriority;
        }
        if (focusCenter) {
            const leftDistance = scorePageDistance(focusCenter, left.focusCenter, left.focusRadius);
            const rightDistance = scorePageDistance(focusCenter, right.focusCenter, right.focusRadius);
            if (leftDistance !== rightDistance) {
                return leftDistance - rightDistance;
            }
        }
        if (left.role !== right.role) {
            if (left.role === "bootstrap") {
                return -1;
            }
            if (right.role === "bootstrap") {
                return 1;
            }
        }

        if (left.priority !== right.priority) {
            return left.priority - right.priority;
        }

        const leftPageIndex = left.pageIndex ?? Number.POSITIVE_INFINITY;
        const rightPageIndex = right.pageIndex ?? Number.POSITIVE_INFINITY;
        if (leftPageIndex !== rightPageIndex) {
            return leftPageIndex - rightPageIndex;
        }

        return left.id.localeCompare(right.id);
    });
}

function enforceResidentPayloadBudget(
    layers: SharpGaussianResidentPayload[],
    pointBudget: number,
    byteBudget: number,
    focusCenter?: [number, number, number] | null,
) {
    const sorted = sortResidentPayloads(layers, focusCenter);
    const kept: SharpGaussianResidentPayload[] = [];
    const evicted: SharpGaussianResidentPayload[] = [];
    let residentPointCount = 0;
    let residentByteCount = 0;

    for (const layer of sorted) {
        const nextLayerCount = Math.max(0, layer.pointCount || layer.payload.count || 0);
        const nextLayerBytes = Math.max(0, layer.bytes || 0);
        const isBootstrap = layer.role === "bootstrap";
        const overLayerCap = !isBootstrap && kept.filter((item) => item.role !== "bootstrap").length >= MAX_RESIDENT_REFINEMENT_LAYERS;
        const overPointBudget = !isBootstrap && residentPointCount + nextLayerCount > pointBudget && kept.length > 0;
        const overByteBudget = !isBootstrap && nextLayerBytes > 0 && residentByteCount + nextLayerBytes > byteBudget && kept.length > 0;

        if (overLayerCap || overPointBudget || overByteBudget) {
            evicted.push(layer);
            continue;
        }

        kept.push(layer);
        residentPointCount += nextLayerCount;
        residentByteCount += nextLayerBytes;
    }

    return {
        kept: sortResidentPayloads(kept, focusCenter),
        evicted,
        residentPointCount,
        residentByteCount,
    };
}

function buildResidentPayloadLayer({
    id,
    label,
    role,
    pageRole = null,
    priority,
    pageIndex,
    progressive,
    bytes = 0,
    focusCenter = null,
    focusRadius = null,
    sticky = false,
    preload = false,
    evictionPriority = 0,
    payload,
}: {
    id: string;
    label: string | null;
    role: SharpGaussianResidentPayload["role"];
    pageRole?: string | null;
    priority: number;
    pageIndex: number | null;
    progressive: boolean;
    bytes?: number;
    focusCenter?: [number, number, number] | null;
    focusRadius?: number | null;
    sticky?: boolean;
    preload?: boolean;
    evictionPriority?: number;
    payload: SharpGaussianPayload;
}): SharpGaussianResidentPayload {
    return {
        id,
        label,
        role,
        pageRole,
        priority,
        pageIndex,
        progressive,
        pointCount: payload.count,
        bytes,
        focusCenter,
        focusRadius,
        sticky,
        preload,
        evictionPriority,
        residentAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
        lastTouchedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
        payload,
    };
}

export function useSharpGaussianPayloadController({
    source,
    metadata,
    focusTarget,
    maxTextureSize,
    onPreviewBounds,
    onFatalError,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
    focusTarget?: [number, number, number] | null;
    maxTextureSize: number;
    onPreviewBounds?: (bounds: PreviewBounds) => void;
    onFatalError?: (message: string, reason: ViewerFallbackReason) => void;
}) {
    const pointBudget = useMemo(() => resolveSharpPointBudget(metadata, maxTextureSize), [maxTextureSize, metadata]);
    const isSingleImagePreview = useMemo(() => isSingleImagePreviewMetadata(metadata), [metadata]);
    const opacityBoost = useMemo(() => resolvePreviewOpacityBoost(metadata), [metadata]);
    const colorGain = useMemo(() => resolvePreviewColorGain(metadata), [metadata]);
    const residentByteBudget = useMemo(() => resolveResidentByteBudget(pointBudget), [pointBudget]);
    const payloadLayersRef = useRef<SharpGaussianResidentPayload[]>([]);
    const loadGenerationRef = useRef(0);
    const focusTargetRef = useRef<[number, number, number] | null>(focusTarget ?? null);
    const [payloadLayers, setPayloadLayers] = useState<SharpGaussianResidentPayload[]>([]);
    const [loadState, setLoadState] = useState(DEFAULT_SHARP_GAUSSIAN_LOAD_STATE);

    useEffect(() => {
        focusTargetRef.current = focusTarget ?? null;
    }, [focusTarget]);

    useEffect(() => {
        const previousLayers = payloadLayersRef.current;
        payloadLayersRef.current = payloadLayers;
        const nextPayloadSet = new Set(payloadLayers.map((layer) => layer.payload));
        for (const previousLayer of previousLayers) {
            if (!nextPayloadSet.has(previousLayer.payload)) {
                disposeSharpGaussianPayload(previousLayer.payload);
            }
        }
    }, [payloadLayers]);

    useEffect(() => {
        return () => {
            if (payloadLayersRef.current.length > 0) {
                payloadLayersRef.current.forEach((layer) => disposeSharpGaussianPayload(layer.payload));
                payloadLayersRef.current = [];
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
        const pageLoadTimerIds = new Set<number>();

        const isStale = () => ignore || abortController.signal.aborted || loadGenerationRef.current !== loadGeneration;

        setPayloadLayers([]);
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
                            residentLayerCount: 0,
                            residentPointCount: 0,
                            residentByteCount: 0,
                            inflightPageCount: 0,
                            refinePagesLoaded: 0,
                            refinePagesPending: 0,
                            deliveryProgressFraction: 0,
                            evictions: 0,
                            deliveryPauseReason: null,
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
                const baseLayer = buildResidentPayloadLayer({
                    id: deliveryPlan.variant?.id ?? "initial",
                    label: activeVariantLabel,
                    role: deliveryPlan.streaming ? "bootstrap" : deliveryPlan.upgradeVariant ? "bootstrap" : "full",
                    pageRole: deliveryPlan.streaming ? "hero" : null,
                    priority: deliveryPlan.variant?.priority ?? 0,
                    pageIndex: null,
                    progressive: Boolean(deliveryPlan.variant?.progressive),
                    bytes: deliveryPlan.variant?.bytes ?? 0,
                    focusCenter: nextPayload.previewFocus?.center ?? null,
                    focusRadius: nextPayload.previewFocus?.radius ?? null,
                    sticky: true,
                    preload: true,
                    evictionPriority: 0,
                    payload: nextPayload,
                });
                setPayloadLayers([baseLayer]);
                const shouldAttemptStagedUpgrade = Boolean(
                    !deliveryPlan.streaming &&
                        deliveryPlan.staged &&
                        deliveryPlan.upgradeSource &&
                        deliveryPlan.upgradeVariant &&
                        pointBudget < HEAVY_SCENE_POINT_THRESHOLD &&
                        nextPayload.count <= STAGED_UPGRADE_MAX_INITIAL_POINTS,
                );

                const shouldAttemptProgressivePages = Boolean(
                    deliveryPlan.streaming &&
                        deliveryPlan.refinePages.length > 0 &&
                        nextPayload.count < pointBudget &&
                        pointBudget < HEAVY_SCENE_POINT_THRESHOLD * 1.8,
                );

                if (shouldAttemptProgressivePages) {
                    const resolveRuntimeFocusCenter = () =>
                        focusTargetRef.current ??
                        nextPayload.previewFocus?.center ??
                        (nextPayload.geometry.boundingSphere
                            ? ([
                                  nextPayload.geometry.boundingSphere.center.x,
                                  nextPayload.geometry.boundingSphere.center.y,
                                  nextPayload.geometry.boundingSphere.center.z,
                              ] as [number, number, number])
                            : ([0, 0, 0] as [number, number, number]));
                    const remainingPages = [...deliveryPlan.refinePages];
                    const inflightPageIds = new Set<string>();
                    let residentLayers = [baseLayer];
                    let residentPointCount = baseLayer.pointCount;
                    let residentByteCount = baseLayer.bytes;
                    let loadedPages = 0;
                    let evictionCount = 0;
                    let skippedPages = 0;

                    const syncReadyState = (message: string, pauseReason?: string | null) => {
                        const settledPages = loadedPages + skippedPages;
                        const pendingPages = Math.max(0, deliveryPlan.refinePages.length - settledPages - inflightPageIds.size);
                        setLoadState({
                            phase: "ready",
                            message,
                            activeVariantLabel,
                            upgradeVariantLabel: pendingPages > 0 ? `${pendingPages} pages pending` : null,
                            stagedDelivery: true,
                            upgradePending: pendingPages > 0 || inflightPageIds.size > 0,
                            residentLayerCount: residentLayers.length,
                            residentPointCount,
                            residentByteCount,
                            inflightPageCount: inflightPageIds.size,
                            refinePagesLoaded: loadedPages,
                            refinePagesPending: pendingPages,
                            deliveryProgressFraction:
                                deliveryPlan.refinePages.length > 0 ? Math.min(1, settledPages / deliveryPlan.refinePages.length) : 1,
                            evictions: evictionCount,
                            deliveryPauseReason: pauseReason ?? null,
                        });
                    };

                    syncReadyState(
                        `${describeVariantLabel(activeVariantLabel)} live. Progressive scene detail will settle in behind the first frame.`,
                        "Waiting for first-light stability",
                    );

                    const queuePageLoad = (page: SharpGaussianManifestPage, index: number) => {
                        if (isStale()) {
                            return;
                        }

                        const estimatedPageCount = Math.max(0, page.pointCount ?? 0);
                        const canAdmitPage = estimatedPageCount <= 0 || estimatedPageCount <= pointBudget;
                        if (!canAdmitPage) {
                            skippedPages += 1;
                            syncReadyState(
                                `${describeVariantLabel(activeVariantLabel)} live. A detail page was skipped because it exceeded the safe residency budget.`,
                                "Page exceeded safe residency budget",
                            );
                            return;
                        }
                        inflightPageIds.add(page.id);

                        const timerId = window.setTimeout(() => {
                            pageLoadTimerIds.delete(timerId);
                            if (isStale()) {
                                inflightPageIds.delete(page.id);
                                return;
                            }

                            void (async () => {
                                try {
                                    const pagePayload = await loadSharpGaussianPayload({
                                        source: page.source,
                                        pointBudget: Math.min(pointBudget, page.pointCount ?? pointBudget),
                                        maxTextureSize,
                                        metadata,
                                        signal: abortController.signal,
                                        onProgress: (message) => {
                                            if (!isStale()) {
                                                setLoadState((current) => ({
                                                    ...current,
                                                    phase: "ready",
                                                    message: `${message} Streaming detail page ${index + 1}/${deliveryPlan.refinePages.length}...`,
                                                    upgradePending: true,
                                                    deliveryPauseReason: "Loading next focus detail page",
                                                }));
                                            }
                                        },
                                    });

                                    if (isStale()) {
                                        inflightPageIds.delete(page.id);
                                        disposeSharpGaussianPayload(pagePayload);
                                        return;
                                    }

                                    const nextLayer = buildResidentPayloadLayer({
                                        id: page.id,
                                        label: page.label ?? `Detail page ${index + 1}`,
                                        role: "page",
                                        pageRole: page.role,
                                        priority: page.priority ?? index + 1,
                                        pageIndex: page.pageIndex ?? index,
                                        progressive: true,
                                        bytes: page.bytes ?? 0,
                                        focusCenter: page.focusCenter,
                                        focusRadius: page.focusRadius,
                                        sticky: page.sticky,
                                        preload: page.preload,
                                        evictionPriority: page.evictionPriority ?? 0,
                                        payload: pagePayload,
                                    });
                                    inflightPageIds.delete(page.id);
                                    const nextResidentState = enforceResidentPayloadBudget(
                                        [...residentLayers, nextLayer],
                                        pointBudget,
                                        residentByteBudget,
                                        resolveRuntimeFocusCenter(),
                                    );
                                    residentLayers = nextResidentState.kept;
                                    residentPointCount = nextResidentState.residentPointCount;
                                    residentByteCount = nextResidentState.residentByteCount;
                                    evictionCount += nextResidentState.evicted.length;
                                    nextResidentState.evicted.forEach((layer) => {
                                        if (layer !== nextLayer) {
                                            disposeSharpGaussianPayload(layer.payload);
                                        }
                                    });
                                    if (nextResidentState.evicted.includes(nextLayer)) {
                                        disposeSharpGaussianPayload(pagePayload);
                                        skippedPages += 1;
                                        syncReadyState(
                                            `${describeVariantLabel(activeVariantLabel)} live. Detail focus shifted, so one refinement page was deferred to keep the scene graceful.`,
                                            "Reprioritizing for current focus",
                                        );
                                        return;
                                    }

                                    setPayloadLayers(residentLayers);
                                    loadedPages += 1;
                                    syncReadyState(
                                        remainingPages.length === 0 && inflightPageIds.size === 0
                                            ? `${describeVariantLabel(activeVariantLabel)} live. Premium detail is fully resident within the browser-safe budget.`
                                            : `${describeVariantLabel(activeVariantLabel)} live. Detail is settling around the current focus.`,
                                        nextResidentState.evicted.length > 0 ? "Keeping premium detail near the current focus" : null,
                                    );
                                } catch (pageError) {
                                    if (isStale() || isAbortError(pageError)) {
                                        inflightPageIds.delete(page.id);
                                        return;
                                    }

                                    console.warn("[EnvironmentSplat] Skipping streamed refinement page after failure.", pageError);
                                    inflightPageIds.delete(page.id);
                                    skippedPages += 1;
                                    syncReadyState(
                                        `${describeVariantLabel(activeVariantLabel)} live. A detail page was skipped to protect stability.`,
                                        "A detail page was skipped for stability",
                                    );
                                }
                            })();
                        }, Math.max(180, page.preload ? 140 : 260 + index * 40));

                        pageLoadTimerIds.add(timerId);
                    };

                    const idleWindow = window as Window & {
                        requestIdleCallback?: (
                            callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
                            options?: { timeout: number },
                        ) => number;
                    };
                    const pickNextPage = () => {
                            if (remainingPages.length === 0) {
                                return null;
                            }
                            const focusCenter = resolveRuntimeFocusCenter();
                            remainingPages.sort((left, right) => {
                            const leftRoleScore = scorePageRole(left.role);
                            const rightRoleScore = scorePageRole(right.role);
                            if (leftRoleScore !== rightRoleScore) {
                                return leftRoleScore - rightRoleScore;
                            }
                            if (left.preload !== right.preload) {
                                return left.preload ? -1 : 1;
                            }
                            if (left.sticky !== right.sticky) {
                                return left.sticky ? -1 : 1;
                            }
                            const leftDistance = scorePageDistance(focusCenter, left.focusCenter, left.focusRadius);
                            const rightDistance = scorePageDistance(focusCenter, right.focusCenter, right.focusRadius);
                            if (leftDistance !== rightDistance) {
                                return leftDistance - rightDistance;
                            }
                            const leftPriority = left.priority ?? Number.POSITIVE_INFINITY;
                            const rightPriority = right.priority ?? Number.POSITIVE_INFINITY;
                            if (leftPriority !== rightPriority) {
                                return leftPriority - rightPriority;
                            }
                            return (left.pageIndex ?? 0) - (right.pageIndex ?? 0);
                        });
                        return remainingPages.shift() ?? null;
                    };

                    const beginProgressiveRefine = () => {
                        const scheduleNextPage = () => {
                            if (isStale()) {
                                return;
                            }
                            const page = pickNextPage();
                            if (!page) {
                                syncReadyState(
                                    `${describeVariantLabel(activeVariantLabel)} live. Premium detail is fully resident within the browser-safe budget.`,
                                    null,
                                );
                                return;
                            }
                            const currentIndex = deliveryPlan.refinePages.length - remainingPages.length - 1;
                            queuePageLoad(page, currentIndex);

                            const followupTimerId = window.setTimeout(() => {
                                pageLoadTimerIds.delete(followupTimerId);
                                scheduleNextPage();
                            }, PAGE_REFINE_INTERVAL_MS);
                            pageLoadTimerIds.add(followupTimerId);
                        };

                        scheduleNextPage();
                    };

                    if (typeof idleWindow.requestIdleCallback === "function") {
                        upgradeIdleCallbackId = idleWindow.requestIdleCallback(() => {
                            upgradeIdleCallbackId = null;
                            beginProgressiveRefine();
                        }, { timeout: 2500 });
                    } else {
                        upgradeStartTimer = window.setTimeout(() => {
                            upgradeStartTimer = null;
                            beginProgressiveRefine();
                        }, PAGE_REFINE_START_DELAY_MS);
                    }
                    return;
                }

                if (shouldAttemptStagedUpgrade) {
                    setLoadState({
                        phase: "ready",
                        message: `${describeVariantLabel(activeVariantLabel)} live. Premium refinement will start when the browser has headroom.`,
                        activeVariantLabel,
                        upgradeVariantLabel,
                        stagedDelivery: true,
                        upgradePending: true,
                        residentLayerCount: 1,
                        residentPointCount: nextPayload.count,
                        residentByteCount: baseLayer.bytes,
                        inflightPageCount: 0,
                        refinePagesLoaded: 0,
                        refinePagesPending: 0,
                        deliveryProgressFraction: 0,
                        evictions: 0,
                        deliveryPauseReason: "Waiting for browser headroom",
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
                                                deliveryPauseReason: "Loading richer live variant",
                                            });
                                        }
                                    },
                                });

                                if (isStale()) {
                                    disposeSharpGaussianPayload(upgradedPayload);
                                    return;
                                }

                                setPayloadLayers([
                                    buildResidentPayloadLayer({
                                        id: deliveryPlan.upgradeVariant?.id ?? "upgraded",
                                        label: upgradeVariantLabel,
                                        role: "full",
                                        pageRole: "hero",
                                        priority: deliveryPlan.upgradeVariant?.priority ?? 0,
                                        pageIndex: null,
                                        progressive: Boolean(deliveryPlan.upgradeVariant?.progressive),
                                        bytes: deliveryPlan.upgradeVariant?.bytes ?? 0,
                                        focusCenter: upgradedPayload.previewFocus?.center ?? null,
                                        focusRadius: upgradedPayload.previewFocus?.radius ?? null,
                                        sticky: true,
                                        preload: true,
                                        evictionPriority: 0,
                                        payload: upgradedPayload,
                                    }),
                                ]);
                                setLoadState({
                                    phase: "ready",
                                    message: `${describeVariantLabel(upgradeVariantLabel)} live.`,
                                    activeVariantLabel: upgradeVariantLabel,
                                    upgradeVariantLabel: null,
                                    stagedDelivery: true,
                                    upgradePending: false,
                                    residentLayerCount: 1,
                                    residentPointCount: upgradedPayload.count,
                                    residentByteCount: deliveryPlan.upgradeVariant?.bytes ?? upgradedPayload.count,
                                    inflightPageCount: 0,
                                    refinePagesLoaded: 0,
                                    refinePagesPending: 0,
                                    deliveryProgressFraction: 1,
                                    evictions: 0,
                                    deliveryPauseReason: null,
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
                                    residentLayerCount: 1,
                                    residentPointCount: nextPayload.count,
                                    residentByteCount: baseLayer.bytes,
                                    inflightPageCount: 0,
                                    refinePagesLoaded: 0,
                                    refinePagesPending: 0,
                                    deliveryProgressFraction: 0,
                                    evictions: 0,
                                    deliveryPauseReason: "Premium refinement was skipped for stability",
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
                    residentLayerCount: 1,
                    residentPointCount: nextPayload.count,
                    residentByteCount: baseLayer.bytes,
                    inflightPageCount: 0,
                    refinePagesLoaded: 0,
                    refinePagesPending: 0,
                    deliveryProgressFraction: 1,
                    evictions: 0,
                    deliveryPauseReason: null,
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
                setPayloadLayers([]);
                setLoadState({
                    phase: "error",
                    message,
                    activeVariantLabel: null,
                    upgradeVariantLabel: null,
                    stagedDelivery: false,
                    upgradePending: false,
                    residentLayerCount: 0,
                    residentPointCount: 0,
                    residentByteCount: 0,
                    inflightPageCount: 0,
                    refinePagesLoaded: 0,
                    refinePagesPending: 0,
                    deliveryProgressFraction: 0,
                    evictions: 0,
                    deliveryPauseReason: null,
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
            pageLoadTimerIds.forEach((timerId) => window.clearTimeout(timerId));
            pageLoadTimerIds.clear();
            abortController.abort();
        };
    }, [maxTextureSize, metadata, onFatalError, pointBudget, source]);

    useEffect(() => {
        const primaryPayload = payloadLayers[0]?.payload ?? null;
        if (!primaryPayload || !onPreviewBounds || !isSingleImagePreview) {
            return;
        }

        const bounds = resolveSharpGaussianPreviewBounds(primaryPayload);
        if (bounds) {
            onPreviewBounds(bounds);
        }
    }, [isSingleImagePreview, onPreviewBounds, payloadLayers]);

    return {
        payload: payloadLayers[0]?.payload ?? null,
        payloadLayers,
        loadState,
        isSingleImagePreview,
        opacityBoost,
        colorGain,
    };
}
