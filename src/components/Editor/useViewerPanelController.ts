"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import {
    CameraPathFrame,
    CameraPose,
    CameraView,
    SpatialPinType,
    WorkspaceSceneGraph,
    createId,
    lensMmToFov,
    normalizeWorkspaceSceneGraph,
} from "@/lib/mvp-workspace";
import type { FocusRequest, MvpEditorSessionStoreActions, MvpEditorSessionStoreState } from "@/state/mvpEditorSessionStore.ts";

export type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";

export type ViewerPanelSceneSlices = Pick<
    WorkspaceSceneGraph,
    "environment" | "assets" | "camera_views" | "pins" | "director_path" | "director_brief" | "viewer"
>;
export type ViewerOverlaySceneSlices = Pick<WorkspaceSceneGraph, "environment" | "assets" | "pins" | "viewer">;

export function normalizeViewerPanelSceneSlices(sceneGraph: WorkspaceSceneGraph | any): ViewerPanelSceneSlices {
    const normalizedSceneGraph = normalizeWorkspaceSceneGraph(sceneGraph);
    return {
        environment: normalizedSceneGraph.environment,
        assets: normalizedSceneGraph.assets,
        camera_views: normalizedSceneGraph.camera_views,
        pins: normalizedSceneGraph.pins,
        director_path: normalizedSceneGraph.director_path,
        director_brief: normalizedSceneGraph.director_brief,
        viewer: normalizedSceneGraph.viewer,
    };
}

export function pickViewerOverlaySceneSlices(sceneSlices: ViewerPanelSceneSlices): ViewerOverlaySceneSlices {
    return {
        environment: sceneSlices.environment,
        assets: sceneSlices.assets,
        pins: sceneSlices.pins,
        viewer: sceneSlices.viewer,
    };
}

type ViewerPanelSessionState = Pick<
    MvpEditorSessionStoreState,
    "focusRequest" | "captureRequestKey" | "isPinPlacementEnabled" | "pinType" | "isRecordingPath" | "viewerReady"
>;

type ViewerPanelSessionActions = Pick<
    MvpEditorSessionStoreActions,
    "requestFocus" | "requestViewCapture" | "setPinPlacementEnabled" | "setPinType" | "setRecordingPathEnabled" | "setViewerReady"
>;

interface ViewerPanelInteractionControllerOptions {
    routeVariant?: "workspace" | "preview";
    readOnly: boolean;
    pinCount: number;
    getCurrentSceneGraph: () => ViewerPanelSceneSlices;
    selectedPinId?: string | null;
    selectedViewId?: string | null;
    focusRequest?: FocusRequest;
    onAppendAsset?: (asset: Record<string, unknown>) => void;
    onUpdateViewerState?: (viewerPatch: Partial<WorkspaceSceneGraph["viewer"]>) => void;
    onAppendCameraView?: (view: CameraView) => void;
    onSetDirectorPath?: (path: CameraPathFrame[]) => void;
    onSelectPin?: (pinId: string | null) => void;
    onSelectView?: (viewId: string | null) => void;
    sessionState?: ViewerPanelSessionState;
    sessionActions?: ViewerPanelSessionActions;
}

export function useViewerPanelInteractionController({
    routeVariant = "workspace",
    readOnly,
    pinCount,
    getCurrentSceneGraph,
    selectedPinId,
    selectedViewId,
    focusRequest,
    onAppendAsset,
    onUpdateViewerState,
    onAppendCameraView,
    onSetDirectorPath,
    onSelectPin,
    onSelectView,
    sessionState,
    sessionActions,
}: ViewerPanelInteractionControllerOptions) {
    const isPreviewRoute = routeVariant === "preview";
    const [localCaptureRequestKey, setLocalCaptureRequestKey] = useState(0);
    const [localIsPinPlacementEnabled, setLocalIsPinPlacementEnabled] = useState(false);
    const [localPinType, setLocalPinType] = useState<SpatialPinType>("general");
    const [localIsRecordingPath, setLocalIsRecordingPath] = useState(false);
    const [localFocusRequest, setLocalFocusRequest] = useState<FocusRequest>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [localViewerReady, setLocalViewerReady] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const captureFallbackTimerRef = useRef<number | null>(null);
    const pendingCaptureRequestRef = useRef<number | null>(null);
    const previousPinCountRef = useRef(pinCount);
    const captureRequestKey = sessionState?.captureRequestKey ?? localCaptureRequestKey;
    const isPinPlacementEnabled = sessionState?.isPinPlacementEnabled ?? localIsPinPlacementEnabled;
    const pinType = sessionState?.pinType ?? localPinType;
    const isRecordingPath = sessionState?.isRecordingPath ?? localIsRecordingPath;
    const viewerReady = sessionState?.viewerReady ?? localViewerReady;
    const combinedFocusRequest = sessionState?.focusRequest
        ? sessionState.focusRequest
        : localFocusRequest && (!focusRequest || localFocusRequest.token >= focusRequest.token)
          ? localFocusRequest
          : focusRequest ?? null;

    const setPinPlacementEnabled = useCallback(
        (enabled: boolean) => {
            if (sessionActions) {
                sessionActions.setPinPlacementEnabled(enabled);
                return;
            }
            setLocalIsPinPlacementEnabled(enabled);
        },
        [sessionActions],
    );

    const setPinType = useCallback(
        (nextPinType: SpatialPinType) => {
            if (sessionActions) {
                sessionActions.setPinType(nextPinType);
                return;
            }
            setLocalPinType(nextPinType);
        },
        [sessionActions],
    );

    const setRecordingPathEnabled = useCallback(
        (enabled: boolean) => {
            if (sessionActions) {
                sessionActions.setRecordingPathEnabled(enabled);
                return;
            }
            setLocalIsRecordingPath(enabled);
        },
        [sessionActions],
    );

    const setViewerReady = useCallback(
        (ready: boolean) => {
            if (sessionActions) {
                sessionActions.setViewerReady(ready);
                return;
            }
            setLocalViewerReady(ready);
        },
        [sessionActions],
    );

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === containerRef.current);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (captureFallbackTimerRef.current !== null) {
                window.clearTimeout(captureFallbackTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (viewerReady) return;
        setPinPlacementEnabled(false);
        setRecordingPathEnabled(false);
        pendingCaptureRequestRef.current = null;
        if (captureFallbackTimerRef.current !== null) {
            window.clearTimeout(captureFallbackTimerRef.current);
            captureFallbackTimerRef.current = null;
        }
    }, [setPinPlacementEnabled, setRecordingPathEnabled, viewerReady]);

    useEffect(() => {
        if (isPinPlacementEnabled && pinCount > previousPinCountRef.current) {
            setPinPlacementEnabled(false);
        }
        previousPinCountRef.current = pinCount;
    }, [isPinPlacementEnabled, pinCount, setPinPlacementEnabled]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;

            let handled = false;
            if (isPinPlacementEnabled) {
                setPinPlacementEnabled(false);
                handled = true;
            }
            if (isRecordingPath) {
                setRecordingPathEnabled(false);
                handled = true;
            }
            if (document.fullscreenElement === containerRef.current) {
                handled = true;
                void document.exitFullscreen().catch(() => {
                    setIsFullscreen(false);
                });
            }
            if (handled) {
                event.preventDefault();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isPinPlacementEnabled, isRecordingPath, setPinPlacementEnabled, setRecordingPathEnabled]);

    useEffect(() => {
        if (!combinedFocusRequest || !onUpdateViewerState) return;
        onUpdateViewerState({
            fov: combinedFocusRequest.fov,
            lens_mm: combinedFocusRequest.lens_mm,
        });
    }, [combinedFocusRequest, onUpdateViewerState]);

    const handleDrop = useCallback(
        (event: DragEvent) => {
            if (readOnly) return;
            event.preventDefault();
            try {
                const assetData = event.dataTransfer.getData("asset");
                if (!assetData) return;
                const asset = JSON.parse(assetData);
                const nextAsset = {
                    ...asset,
                    instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                };
                if (!onAppendAsset) {
                    return;
                }
                onAppendAsset(nextAsset);
            } catch {
                // Ignore invalid drag payloads.
            }
        },
        [onAppendAsset, readOnly],
    );

    const handleDragOver = useCallback(
        (event: DragEvent) => {
            if (readOnly) return;
            event.preventDefault();
        },
        [readOnly],
    );

    const requestFocus = useCallback(
        (pose: CameraPose) => {
            if (onUpdateViewerState) {
                onUpdateViewerState({
                    fov: pose.fov,
                    lens_mm: pose.lens_mm,
                });
            }
            if (sessionActions) {
                sessionActions.requestFocus(pose);
                return;
            }
            setLocalFocusRequest({ ...pose, token: Date.now() });
        },
        [onUpdateViewerState, sessionActions],
    );

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) return;

        try {
            if (document.fullscreenElement === containerRef.current) {
                await document.exitFullscreen();
                return;
            }
            if (document.fullscreenElement && document.fullscreenElement !== containerRef.current) {
                await document.exitFullscreen();
            }
            if (typeof containerRef.current.requestFullscreen !== "function") return;
            await containerRef.current.requestFullscreen();
        } catch {
            setIsFullscreen(document.fullscreenElement === containerRef.current);
        }
    }, []);

    const setLens = useCallback(
        (lensMm: number) => {
            const fov = lensMmToFov(lensMm);
            if (!onUpdateViewerState) {
                return;
            }
            onUpdateViewerState({
                fov,
                lens_mm: lensMm,
            });
        },
        [onUpdateViewerState],
    );

    const appendCapturedView = useCallback(
        (pose: CameraPose) => {
            const currentSceneGraph = getCurrentSceneGraph();
            const nextViewId = createId("view");
            const nextView: CameraView = {
                id: nextViewId,
                label: `View ${currentSceneGraph.camera_views.length + 1}`,
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
        [getCurrentSceneGraph, onAppendCameraView, onSelectView, onUpdateViewerState],
    );

    const handleCapturePose = useCallback(
        (pose: CameraPose) => {
            if (pendingCaptureRequestRef.current === null) return;
            pendingCaptureRequestRef.current = null;
            if (captureFallbackTimerRef.current !== null) {
                window.clearTimeout(captureFallbackTimerRef.current);
                captureFallbackTimerRef.current = null;
            }
            appendCapturedView(pose);
        },
        [appendCapturedView],
    );

    const requestViewCapture = useCallback(() => {
        if (readOnly) return;
        const requestToken = Date.now();
        const currentSceneGraph = getCurrentSceneGraph();
        const selectedView = currentSceneGraph.camera_views.find((view) => view.id === selectedViewId) ?? null;
        const fallbackPose: CameraPose =
            selectedView ??
            combinedFocusRequest ?? {
                position: [5, 4, 6],
                target: [0, 0, 0],
                fov: currentSceneGraph.viewer.fov,
                lens_mm: currentSceneGraph.viewer.lens_mm,
            };

        if (!viewerReady) {
            appendCapturedView(fallbackPose);
            return;
        }

        pendingCaptureRequestRef.current = requestToken;
        if (captureFallbackTimerRef.current !== null) {
            window.clearTimeout(captureFallbackTimerRef.current);
        }

        if (sessionActions) {
            sessionActions.requestViewCapture();
        } else {
            setLocalCaptureRequestKey((value) => value + 1);
        }
        captureFallbackTimerRef.current = window.setTimeout(() => {
            if (pendingCaptureRequestRef.current !== requestToken) return;
            pendingCaptureRequestRef.current = null;
            captureFallbackTimerRef.current = null;
            appendCapturedView(fallbackPose);
        }, 350);
    }, [appendCapturedView, combinedFocusRequest, getCurrentSceneGraph, readOnly, selectedViewId, sessionActions, viewerReady]);

    const handlePathRecorded = useCallback(
        (path: CameraPathFrame[]) => {
            if (!onSetDirectorPath) {
                return;
            }
            onSetDirectorPath(path);
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
        const currentSceneGraph = getCurrentSceneGraph();
        const selectedPin = currentSceneGraph.pins.find((pin) => pin.id === selectedPinId) ?? null;
        const selectedView = currentSceneGraph.camera_views.find((view) => view.id === selectedViewId) ?? null;
        if (!selectedPin) return;
        const basePose = selectedView
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
                  fov: currentSceneGraph.viewer.fov,
                  lens_mm: currentSceneGraph.viewer.lens_mm,
              };
        requestFocus(basePose);
    }, [getCurrentSceneGraph, requestFocus, selectedPinId, selectedViewId]);

    const clearDirectorPath = useCallback(() => {
        onSetDirectorPath?.([]);
    }, [onSetDirectorPath]);

    const togglePinPlacement = useCallback(() => {
        setPinPlacementEnabled(!isPinPlacementEnabled);
    }, [isPinPlacementEnabled, setPinPlacementEnabled]);

    const changePinType = useCallback((nextPinType: SpatialPinType) => {
        setPinType(nextPinType);
    }, [setPinType]);

    const toggleRecordingPath = useCallback(() => {
        setRecordingPathEnabled(!isRecordingPath);
    }, [isRecordingPath, setRecordingPathEnabled]);

    return {
        isPreviewRoute,
        combinedFocusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        isRecordingPath,
        isFullscreen,
        viewerReady,
        containerRef,
        setViewerReady,
        handleDrop,
        handleDragOver,
        focusView,
        focusPin,
        requestViewCapture,
        handleCapturePose,
        handlePathRecorded,
        clearDirectorPath,
        toggleFullscreen,
        setLens,
        togglePinPlacement,
        changePinType,
        toggleRecordingPath,
    };
}
