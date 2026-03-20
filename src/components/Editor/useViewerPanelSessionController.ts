"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type CameraPose, type SpatialPinType } from "@/lib/mvp-workspace";
import type { FocusRequest, MvpEditorSessionStoreActions, MvpEditorSessionStoreState } from "@/state/mvpEditorSessionStore.ts";

export type ViewerPanelSessionState = Pick<
    MvpEditorSessionStoreState,
    "focusRequest" | "captureRequestKey" | "isPinPlacementEnabled" | "pinType" | "isRecordingPath" | "viewerReady"
>;

export type ViewerPanelSessionActions = Pick<
    MvpEditorSessionStoreActions,
    "requestFocus" | "requestViewCapture" | "setPinPlacementEnabled" | "setPinType" | "setRecordingPathEnabled" | "setViewerReady"
>;

interface UseViewerPanelSessionControllerOptions {
    routeVariant?: "workspace" | "preview";
    pinCount: number;
    focusRequest?: FocusRequest;
    sessionState?: ViewerPanelSessionState;
    sessionActions?: ViewerPanelSessionActions;
}

export function useViewerPanelSessionController({
    routeVariant = "workspace",
    pinCount,
    focusRequest,
    sessionState,
    sessionActions,
}: UseViewerPanelSessionControllerOptions) {
    const [localCaptureRequestKey, setLocalCaptureRequestKey] = useState(0);
    const [localIsPinPlacementEnabled, setLocalIsPinPlacementEnabled] = useState(false);
    const [localPinType, setLocalPinType] = useState<SpatialPinType>("general");
    const [localIsRecordingPath, setLocalIsRecordingPath] = useState(false);
    const [localFocusRequest, setLocalFocusRequest] = useState<FocusRequest>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [localViewerReady, setLocalViewerReady] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
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

    const requestFocus = useCallback(
        (pose: CameraPose) => {
            if (sessionActions) {
                sessionActions.requestFocus(pose);
                return;
            }
            setLocalFocusRequest({ ...pose, token: Date.now() });
        },
        [sessionActions],
    );

    const issueCaptureRequest = useCallback(() => {
        if (sessionActions) {
            sessionActions.requestViewCapture();
            return;
        }
        setLocalCaptureRequestKey((value) => value + 1);
    }, [sessionActions]);

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
        if (viewerReady) {
            return;
        }

        setPinPlacementEnabled(false);
        setRecordingPathEnabled(false);
    }, [setPinPlacementEnabled, setRecordingPathEnabled, viewerReady]);

    useEffect(() => {
        if (isPinPlacementEnabled && pinCount > previousPinCountRef.current) {
            setPinPlacementEnabled(false);
        }
        previousPinCountRef.current = pinCount;
    }, [isPinPlacementEnabled, pinCount, setPinPlacementEnabled]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }

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

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) {
            return;
        }

        try {
            if (document.fullscreenElement === containerRef.current) {
                await document.exitFullscreen();
                return;
            }
            if (document.fullscreenElement && document.fullscreenElement !== containerRef.current) {
                await document.exitFullscreen();
            }
            if (typeof containerRef.current.requestFullscreen !== "function") {
                return;
            }
            await containerRef.current.requestFullscreen();
        } catch {
            setIsFullscreen(document.fullscreenElement === containerRef.current);
        }
    }, []);

    const togglePinPlacement = useCallback(() => {
        setPinPlacementEnabled(!isPinPlacementEnabled);
    }, [isPinPlacementEnabled, setPinPlacementEnabled]);

    const changePinType = useCallback(
        (nextPinType: SpatialPinType) => {
            setPinType(nextPinType);
        },
        [setPinType],
    );

    const toggleRecordingPath = useCallback(() => {
        setRecordingPathEnabled(!isRecordingPath);
    }, [isRecordingPath, setRecordingPathEnabled]);

    return {
        isPreviewRoute: routeVariant === "preview",
        combinedFocusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        isRecordingPath,
        isFullscreen,
        viewerReady,
        containerRef,
        requestFocus,
        issueCaptureRequest,
        setViewerReady,
        toggleFullscreen,
        togglePinPlacement,
        changePinType,
        toggleRecordingPath,
    };
}

export type ViewerPanelSessionController = ReturnType<typeof useViewerPanelSessionController>;
