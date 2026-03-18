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
            <div className="relative flex h-full items-center justify-center p-6">
                <div className="w-full max-w-lg rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(10,14,21,0.94),rgba(7,10,14,0.94))] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/80">Viewer fallback</p>
                    <p className="mt-3 text-lg font-medium text-white">3D viewer unavailable</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                        {message || "This browser or environment could not initialize the WebGL viewer. Import, review, export, and other non-3D controls remain available."}
                    </p>
                    <p className="mt-3 text-[11px] leading-5 text-neutral-300">
                        Camera capture, scene-note placement, and path recording stay disabled until the viewer can create a render context.
                    </p>
                </div>
            </div>
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
