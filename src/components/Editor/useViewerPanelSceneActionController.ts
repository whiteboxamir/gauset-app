"use client";

import { useCallback, useEffect, useRef, type DragEvent } from "react";

import { type CameraPathFrame, type CameraPose, type CameraView, type ViewerState, createId, lensMmToFov } from "@/lib/mvp-workspace";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import type { ViewerPanelInteractionSceneSlices } from "./useViewerPanelController";

interface UseViewerPanelSceneActionControllerOptions {
    readOnly: boolean;
    getCurrentSceneSlices: () => ViewerPanelInteractionSceneSlices;
    selectedPinId?: string | null;
    selectedViewId?: string | null;
    combinedFocusRequest: FocusRequest;
    viewerReady: boolean;
    requestFocus: (pose: CameraPose) => void;
    issueCaptureRequest: () => void;
    onAppendAsset?: (asset: Record<string, unknown>) => void;
    onUpdateViewerState?: (viewerPatch: Partial<ViewerState>) => void;
    onAppendCameraView?: (view: CameraView) => void;
    onSetDirectorPath?: (path: CameraPathFrame[]) => void;
    onSelectPin?: (pinId: string | null) => void;
    onSelectView?: (viewId: string | null) => void;
}

export function useViewerPanelSceneActionController({
    readOnly,
    getCurrentSceneSlices,
    selectedPinId,
    selectedViewId,
    combinedFocusRequest,
    viewerReady,
    requestFocus,
    issueCaptureRequest,
    onAppendAsset,
    onUpdateViewerState,
    onAppendCameraView,
    onSetDirectorPath,
    onSelectPin,
    onSelectView,
}: UseViewerPanelSceneActionControllerOptions) {
    const captureFallbackTimerRef = useRef<number | null>(null);
    const pendingCaptureRequestRef = useRef<number | null>(null);

    const clearPendingCapture = useCallback(() => {
        pendingCaptureRequestRef.current = null;
        if (captureFallbackTimerRef.current !== null) {
            window.clearTimeout(captureFallbackTimerRef.current);
            captureFallbackTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearPendingCapture();
        };
    }, [clearPendingCapture]);

    useEffect(() => {
        if (viewerReady) {
            return;
        }

        clearPendingCapture();
    }, [clearPendingCapture, viewerReady]);

    useEffect(() => {
        if (!combinedFocusRequest || !onUpdateViewerState) {
            return;
        }

        onUpdateViewerState({
            fov: combinedFocusRequest.fov,
            lens_mm: combinedFocusRequest.lens_mm,
        });
    }, [combinedFocusRequest, onUpdateViewerState]);

    const handleDrop = useCallback(
        (event: DragEvent) => {
            if (readOnly) {
                return;
            }

            event.preventDefault();
            try {
                const assetData = event.dataTransfer.getData("asset");
                if (!assetData) {
                    return;
                }

                const asset = JSON.parse(assetData);
                onAppendAsset?.({
                    ...asset,
                    instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                });
            } catch {
                // Ignore invalid drag payloads.
            }
        },
        [onAppendAsset, readOnly],
    );

    const handleDragOver = useCallback(
        (event: DragEvent) => {
            if (readOnly) {
                return;
            }

            event.preventDefault();
        },
        [readOnly],
    );

    const setLens = useCallback(
        (lensMm: number) => {
            if (!onUpdateViewerState) {
                return;
            }

            onUpdateViewerState({
                fov: lensMmToFov(lensMm),
                lens_mm: lensMm,
            });
        },
        [onUpdateViewerState],
    );

    const appendCapturedView = useCallback(
        (pose: CameraPose) => {
            const currentSceneSlices = getCurrentSceneSlices();
            const nextViewId = createId("view");
            const nextView: CameraView = {
                id: nextViewId,
                label: `View ${currentSceneSlices.camera_views.length + 1}`,
                position: pose.position,
                target: pose.target,
                fov: pose.fov,
                lens_mm: pose.lens_mm,
                note: "",
            };
            if (!onAppendCameraView) {
                return;
            }

            onAppendCameraView(nextView);
            onUpdateViewerState?.({
                fov: pose.fov,
                lens_mm: pose.lens_mm,
            });
            onSelectView?.(nextViewId);
        },
        [getCurrentSceneSlices, onAppendCameraView, onSelectView, onUpdateViewerState],
    );

    const handleCapturePose = useCallback(
        (pose: CameraPose) => {
            if (pendingCaptureRequestRef.current === null) {
                return;
            }

            clearPendingCapture();
            appendCapturedView(pose);
        },
        [appendCapturedView, clearPendingCapture],
    );

    const requestViewCapture = useCallback(() => {
        if (readOnly) {
            return;
        }

        const requestToken = Date.now();
        const currentSceneSlices = getCurrentSceneSlices();
        const selectedView = currentSceneSlices.camera_views.find((view) => view.id === selectedViewId) ?? null;
        const fallbackPose: CameraPose =
            selectedView ??
            combinedFocusRequest ?? {
                position: [5, 4, 6],
                target: [0, 0, 0],
                fov: currentSceneSlices.viewer.fov,
                lens_mm: currentSceneSlices.viewer.lens_mm,
            };

        if (!viewerReady) {
            appendCapturedView(fallbackPose);
            return;
        }

        pendingCaptureRequestRef.current = requestToken;
        if (captureFallbackTimerRef.current !== null) {
            window.clearTimeout(captureFallbackTimerRef.current);
        }

        issueCaptureRequest();
        captureFallbackTimerRef.current = window.setTimeout(() => {
            if (pendingCaptureRequestRef.current !== requestToken) {
                return;
            }

            clearPendingCapture();
        appendCapturedView(fallbackPose);
        }, 350);
    }, [
        appendCapturedView,
        clearPendingCapture,
        combinedFocusRequest,
        getCurrentSceneSlices,
        issueCaptureRequest,
        readOnly,
        selectedViewId,
        viewerReady,
    ]);

    const handlePathRecorded = useCallback(
        (path: CameraPathFrame[]) => {
            onSetDirectorPath?.(path);
        },
        [onSetDirectorPath],
    );

    const focusView = useCallback(
        (view: CameraView) => {
            onSelectView?.(view.id);
            onSelectPin?.(null);
            requestFocus({
                position: view.position,
                target: view.target,
                fov: view.fov,
                lens_mm: view.lens_mm,
            });
        },
        [onSelectPin, onSelectView, requestFocus],
    );

    const focusPin = useCallback(() => {
        const currentSceneSlices = getCurrentSceneSlices();
        const selectedPin = currentSceneSlices.pins.find((pin) => pin.id === selectedPinId) ?? null;
        const selectedView = currentSceneSlices.camera_views.find((view) => view.id === selectedViewId) ?? null;
        if (!selectedPin) {
            return;
        }

        requestFocus(
            selectedView
                ? {
                      position: selectedView.position,
                      target: selectedPin.position,
                      fov: selectedView.fov,
                      lens_mm: selectedView.lens_mm,
                  }
                : {
                      position: [
                          selectedPin.position[0] + 4,
                          selectedPin.position[1] + 2,
                          selectedPin.position[2] + 4,
                      ] as [number, number, number],
                      target: selectedPin.position,
                      fov: currentSceneSlices.viewer.fov,
                      lens_mm: currentSceneSlices.viewer.lens_mm,
                  },
        );
    }, [getCurrentSceneSlices, requestFocus, selectedPinId, selectedViewId]);

    const clearDirectorPath = useCallback(() => {
        onSetDirectorPath?.([]);
    }, [onSetDirectorPath]);

    return {
        handleDrop,
        handleDragOver,
        focusView,
        focusPin,
        requestViewCapture,
        handleCapturePose,
        handlePathRecorded,
        clearDirectorPath,
        setLens,
    };
}

export type ViewerPanelSceneActionController = ReturnType<typeof useViewerPanelSceneActionController>;
