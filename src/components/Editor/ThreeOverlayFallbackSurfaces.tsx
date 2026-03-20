"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import {
    type CameraPathFrame,
    type CameraPose,
    type SpatialPin,
    type SpatialPinType,
    type Vector3Tuple,
    type ViewerState,
    createId,
    formatPinTypeLabel,
    nowIso,
} from "@/lib/mvp-workspace";
import { pinColors } from "./threeOverlayShared";
import { useViewerCameraPathRecorder } from "./useViewerCameraPathRecorder";

const INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH = 5;
const INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT = 3;
const INTERACTIVE_FALLBACK_CAMERA_HEIGHT = 1.6;
const INTERACTIVE_FALLBACK_CAMERA_DISTANCE = 6;

type FallbackSurfaceVariant = "recovery" | "compatibility" | "scale" | "generic";

function classifyFallbackSurfaceVariant(message?: string): FallbackSurfaceVariant {
    const normalized = (message ?? "").trim().toLowerCase();

    if (normalized.includes("context was lost") || normalized.includes("context lost")) {
        return "recovery";
    }
    if (normalized.includes("webgl2") || normalized.includes("webgl")) {
        return "compatibility";
    }
    if (normalized.includes("texture size") || normalized.includes("too large")) {
        return "scale";
    }
    return "generic";
}

function resolveFallbackSurfaceCopy(message?: string, referenceImage?: string | null) {
    const variant = classifyFallbackSurfaceVariant(message);
    const hasReferenceImage = Boolean(referenceImage);

    if (variant === "recovery") {
        return {
            eyebrow: "Recovery mode",
            title: "The live viewer lost its GPU context",
            body: message || "We switched to a safe fallback so the scene stays inspectable while the browser recovers.",
            footnote: hasReferenceImage
                ? "The reference image remains visible, and a refresh after freeing GPU memory may bring the live canvas back."
                : "Try closing GPU-heavy tabs or refreshing after a short pause to give the browser a better recovery path.",
        };
    }

    if (variant === "compatibility") {
        return {
            eyebrow: "Compatibility mode",
            title: "This browser could not start the live viewer",
            body: message || "We kept the workspace honest by showing a safe fallback instead of a broken canvas.",
            footnote: "A Chromium-based browser with WebGL2 and a current graphics stack usually gives the best result.",
        };
    }

    if (variant === "scale") {
        return {
            eyebrow: "Scale limit reached",
            title: "This scene exceeded the local GPU budget",
            body: message || "The viewer stepped down to a safer surface instead of risking an unstable render.",
            footnote: "Reducing the export size or using a stronger GPU should restore live 3D rendering.",
        };
    }

    return {
        eyebrow: "Viewer fallback",
        title: "Live 3D is unavailable right now",
        body: message || "We stayed honest and kept the workspace usable without pretending the live renderer is active.",
        footnote: hasReferenceImage
            ? "The reference image is still available for review, comments, and export work."
            : "Review, export, and the rest of the workspace remain available while the viewer is in fallback.",
    };
}

function FallbackStatusPanel({
    eyebrow,
    title,
    body,
    footnote,
    chips,
    centered = false,
}: {
    eyebrow: string;
    title: string;
    body: string;
    footnote?: string;
    chips?: string[];
    centered?: boolean;
}) {
    return (
        <div
            className={
                centered
                    ? "relative flex h-full items-center justify-center p-6"
                    : "pointer-events-none absolute left-5 top-5 z-10 w-[min(26rem,calc(100%-2.5rem))]"
            }
        >
            <div className="w-full rounded-[24px] border border-white/12 bg-[linear-gradient(180deg,rgba(10,14,21,0.96),rgba(7,10,14,0.94))] p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-cyan-100/18 bg-cyan-100/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100/90">
                        {eyebrow}
                    </span>
                    {chips?.map((chip) => (
                        <span
                            key={chip}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70"
                        >
                            {chip}
                        </span>
                    ))}
                </div>
                <p className="mt-3 text-[15px] font-medium text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-200">{body}</p>
                {footnote ? <p className="mt-3 text-[11px] leading-5 text-neutral-300">{footnote}</p> : null}
            </div>
        </div>
    );
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function createInteractiveFallbackPoseFromNormalizedPoint(xNorm: number, yNorm: number, viewer: ViewerState): CameraPose {
    const targetX = (clamp01(xNorm) - 0.5) * INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH * 2;
    const targetY = (0.5 - clamp01(yNorm)) * INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT * 2;

    return {
        position: [targetX, targetY + INTERACTIVE_FALLBACK_CAMERA_HEIGHT, INTERACTIVE_FALLBACK_CAMERA_DISTANCE],
        target: [targetX, targetY, 0],
        fov: viewer.fov,
        lens_mm: viewer.lens_mm,
    };
}

function projectInteractiveFallbackPin(position: Vector3Tuple) {
    return {
        left: clamp01((position[0] + INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH) / (INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH * 2)) * 100,
        top: clamp01(0.5 - position[1] / (INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT * 2)) * 100,
    };
}

export const ThreeOverlayFallback = React.memo(function ThreeOverlayFallback({
    message,
    referenceImage,
}: {
    message?: string;
    referenceImage?: string | null;
}) {
    const copy = resolveFallbackSurfaceCopy(message, referenceImage);
    return (
        <div
            className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_22%),linear-gradient(180deg,#06080b_0%,#040507_100%)]"
            data-testid="mvp-three-overlay-fallback"
        >
            {referenceImage ? (
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30"
                    style={{ backgroundImage: `url(${referenceImage})` }}
                />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,6,9,0.72),rgba(4,5,7,0.94))]" />
            <FallbackStatusPanel
                centered
                eyebrow={copy.eyebrow}
                title={copy.title}
                body={copy.body}
                footnote={copy.footnote}
                chips={referenceImage ? ["Reference image"] : ["Live 3D off"]}
            />
        </div>
    );
});

export const SingleImagePreviewSurface = React.memo(function SingleImagePreviewSurface({ imageUrl }: { imageUrl: string }) {
    return (
        <div
            className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#040507_0%,#020304_100%)]"
            data-testid="mvp-single-image-preview-surface"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
            />
            <FallbackStatusPanel
                eyebrow="Reference preview"
                title="Projected image"
                body="This is the source image projected into the viewer while the live 3D surface is unavailable or intentionally skipped."
                footnote="It keeps the scene legible without pretending the live renderer is active."
                chips={["Preview", "Reference"]}
            />
        </div>
    );
});

export const InteractiveSingleImageFallbackSurface = React.memo(function InteractiveSingleImageFallbackSurface({
    imageUrl,
    viewer,
    pins,
    selectedPinId,
    isPinPlacementEnabled,
    pinType,
    isRecordingPath,
    focusRequest,
    captureRequestKey,
    readOnly,
    onAddPin,
    onSelectPin,
    onCapturePose,
    onPathRecorded,
    onClearSelection,
}: {
    imageUrl: string;
    viewer: ViewerState;
    pins: SpatialPin[];
    selectedPinId: string | null;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    readOnly: boolean;
    onAddPin: (pin: SpatialPin) => void;
    onSelectPin: (pinId: string | null) => void;
    onCapturePose?: (pose: CameraPose) => void;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
    onClearSelection: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dragActiveRef = useRef(false);
    const dragDistanceRef = useRef(0);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const currentPoseRef = useRef<CameraPose>(createInteractiveFallbackPoseFromNormalizedPoint(0.5, 0.5, viewer));
    const lastCaptureRequestRef = useRef(0);
    const lastFocusTokenRef = useRef(0);
    const [currentPose, setCurrentPose] = useState<CameraPose>(() => createInteractiveFallbackPoseFromNormalizedPoint(0.5, 0.5, viewer));

    useEffect(() => {
        currentPoseRef.current = currentPose;
    }, [currentPose]);

    useEffect(() => {
        setCurrentPose((previous) => {
            const nextPose = {
                ...previous,
                fov: viewer.fov,
                lens_mm: viewer.lens_mm,
            };
            currentPoseRef.current = nextPose;
            return nextPose;
        });
    }, [viewer.fov, viewer.lens_mm]);

    useEffect(() => {
        if (!focusRequest || focusRequest.token === lastFocusTokenRef.current) {
            return;
        }

        lastFocusTokenRef.current = focusRequest.token;
        const nextPose = {
            position: focusRequest.position,
            target: focusRequest.target,
            fov: focusRequest.fov,
            lens_mm: focusRequest.lens_mm,
            up: focusRequest.up,
        };
        currentPoseRef.current = nextPose;
        setCurrentPose(nextPose);
    }, [focusRequest]);

    useEffect(() => {
        if (!onCapturePose || captureRequestKey === 0 || captureRequestKey === lastCaptureRequestRef.current) {
            return;
        }

        lastCaptureRequestRef.current = captureRequestKey;
        onCapturePose(currentPoseRef.current);
    }, [captureRequestKey, onCapturePose]);

    useViewerCameraPathRecorder({
        isRecordingPath,
        onPathRecorded,
        getCurrentFrame: useCallback(
            () => ({
                position: currentPoseRef.current.position,
                target: currentPoseRef.current.target,
                rotation: [0, 0, 0, 1],
                fov: currentPoseRef.current.fov,
            }),
            [],
        ),
    });

    const resolvePointerPoint = useCallback(
        (clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) {
                return null;
            }

            const xNorm = clamp01((clientX - rect.left) / rect.width);
            const yNorm = clamp01((clientY - rect.top) / rect.height);
            return {
                xNorm,
                yNorm,
                pose: createInteractiveFallbackPoseFromNormalizedPoint(xNorm, yNorm, viewer),
            };
        },
        [viewer],
    );

    return (
        <div
            className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#040507_0%,#020304_100%)]"
            data-testid="mvp-interactive-fallback-surface"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%)]" />
            <FallbackStatusPanel
                eyebrow="Interactive preview"
                title={readOnly ? "Review-only directing surface" : "Direct from the reference image"}
                body={
                    readOnly
                        ? "You can inspect the scene, select pins, and review framing while the live renderer stays in fallback."
                        : "You can reframe the scene and place pins from the reference image while we stay honest about the live renderer being unavailable."
                }
                footnote={
                    isRecordingPath
                        ? "Path recording is active and will capture the fallback camera pose."
                        : "Path recording is off for this session, but pin placement and camera framing still work."
                }
                chips={readOnly ? ["View only", "Reference"] : ["Pins enabled", "Reference"]}
            />
            <canvas
                ref={canvasRef}
                data-testid="mvp-interactive-fallback-canvas"
                className="absolute inset-0 h-full w-full touch-none bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${imageUrl})` }}
                onPointerDown={(event) => {
                    if (readOnly || !isRecordingPath) {
                        dragActiveRef.current = false;
                        dragDistanceRef.current = 0;
                        lastPointerRef.current = { x: event.clientX, y: event.clientY };
                        return;
                    }

                    const point = resolvePointerPoint(event.clientX, event.clientY);
                    if (!point) {
                        return;
                    }

                    dragActiveRef.current = true;
                    dragDistanceRef.current = 0;
                    lastPointerRef.current = { x: event.clientX, y: event.clientY };
                    currentPoseRef.current = point.pose;
                    setCurrentPose(point.pose);
                }}
                onPointerMove={(event) => {
                    const previousPointer = lastPointerRef.current;
                    if (previousPointer) {
                        dragDistanceRef.current += Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y);
                    }
                    lastPointerRef.current = { x: event.clientX, y: event.clientY };

                    if (readOnly || !isRecordingPath || !dragActiveRef.current) {
                        return;
                    }

                    const point = resolvePointerPoint(event.clientX, event.clientY);
                    if (!point) {
                        return;
                    }

                    currentPoseRef.current = point.pose;
                    setCurrentPose(point.pose);
                }}
                onPointerUp={() => {
                    dragActiveRef.current = false;
                    lastPointerRef.current = null;
                }}
                onPointerLeave={() => {
                    dragActiveRef.current = false;
                    lastPointerRef.current = null;
                }}
                onClick={(event) => {
                    if (dragDistanceRef.current > 4) {
                        dragDistanceRef.current = 0;
                        return;
                    }

                    if (readOnly) {
                        return;
                    }

                    if (isPinPlacementEnabled) {
                        const point = resolvePointerPoint(event.clientX, event.clientY);
                        if (!point) {
                            return;
                        }

                        currentPoseRef.current = point.pose;
                        setCurrentPose(point.pose);
                        onAddPin({
                            id: createId("pin"),
                            label: `${formatPinTypeLabel(pinType)} Pin`,
                            type: pinType,
                            position: point.pose.target,
                            created_at: nowIso(),
                        });
                        return;
                    }

                    onClearSelection();
                }}
            />
            <div className="pointer-events-none absolute inset-0">
                {pins.map((pin) => {
                    const location = projectInteractiveFallbackPin(pin.position);
                    const isSelected = pin.id === selectedPinId;

                    return (
                        <button
                            key={pin.id}
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectPin(pin.id);
                            }}
                            className={`pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs shadow-lg transition-transform hover:scale-110 ${pinColors(pin.type, isSelected)}`}
                            style={{ left: `${location.left}%`, top: `${location.top}%` }}
                            title={pin.label}
                        >
                            <MapPin className="h-4 w-4" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
