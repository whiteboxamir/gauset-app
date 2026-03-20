"use client";

import { useCallback, useMemo } from "react";

import { cycleTransformSnapValue, getTransformSnapValueForMode, isTransformToolMode } from "@/lib/render/transformSessions.ts";
import {
    pickViewerOverlaySceneSlices,
    useViewerPanelInteractionController,
} from "@/components/Editor/useViewerPanelController";
import {
    useSceneActiveTool,
    useSceneSelectedPinId,
    useSceneSelectedViewId,
    useSceneTransformSnap,
    useSceneTransformSpace,
} from "@/state/mvpSceneEditorSelectors.ts";
import { useMvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStoreContext.tsx";
import {
    useEditorSessionCaptureRequestKey,
    useEditorSessionFocusRequest,
    useEditorSessionPinPlacementEnabled,
    useEditorSessionPinType,
    useEditorSessionRecordingPath,
    useEditorSessionViewerReady,
} from "@/state/mvpEditorSessionSelectors.ts";
import { useMvpSceneStoreActions } from "@/state/mvpSceneStoreContext.tsx";
import {
    useSceneAssetsSlice,
    useSceneCameraViewsSlice,
    useSceneDirectorBriefSlice,
    useSceneDirectorPathSlice,
    useSceneEnvironmentSlice,
    useScenePinsSlice,
    useSceneViewerSlice,
    useSceneViewerInteractionSlice,
} from "@/state/mvpSceneWorkspaceSelectors.ts";

import { useMvpWorkspaceSession } from "../_state/mvpWorkspaceSessionContext";

interface UseMvpWorkspaceViewerControllerOptions {
    routeVariant?: "workspace" | "preview";
    readOnly: boolean;
}

export function useMvpWorkspaceViewerController({
    routeVariant = "workspace",
    readOnly,
}: UseMvpWorkspaceViewerControllerOptions) {
    const workspaceSession = useMvpWorkspaceSession();
    const sceneStoreActions = useMvpSceneStoreActions();
    const editorSessionActions = useMvpEditorSessionStoreActions();
    const environment = useSceneEnvironmentSlice();
    const assets = useSceneAssetsSlice();
    const camera_views = useSceneCameraViewsSlice();
    const pins = useScenePinsSlice();
    const director_path = useSceneDirectorPathSlice();
    const director_brief = useSceneDirectorBriefSlice();
    const viewer = useSceneViewerSlice();
    const viewerInteractionScene = useSceneViewerInteractionSlice();
    const selectedPinId = useSceneSelectedPinId();
    const selectedViewId = useSceneSelectedViewId();
    const activeTool = useSceneActiveTool();
    const transformSpace = useSceneTransformSpace();
    const transformSnap = useSceneTransformSnap();
    const editorSessionFocusRequest = useEditorSessionFocusRequest();
    const editorSessionCaptureRequestKey = useEditorSessionCaptureRequestKey();
    const editorSessionPinPlacementEnabled = useEditorSessionPinPlacementEnabled();
    const editorSessionPinType = useEditorSessionPinType();
    const editorSessionRecordingPath = useEditorSessionRecordingPath();
    const editorSessionViewerReady = useEditorSessionViewerReady();

    const sceneSlices = useMemo(
        () => ({
            environment,
            assets,
            camera_views,
            pins,
            director_path,
            director_brief,
            viewer,
        }),
        [assets, camera_views, director_brief, director_path, environment, pins, viewer],
    );

    const overlaySceneSlices = useMemo(
        () => pickViewerOverlaySceneSlices(sceneSlices),
        [sceneSlices],
    );
    const getCurrentSceneSlices = useCallback(
        () => viewerInteractionScene,
        [viewerInteractionScene],
    );
    const interactionController = useViewerPanelInteractionController({
        routeVariant,
        readOnly,
        pinCount: viewerInteractionScene.pins.length,
        getCurrentSceneSlices,
        selectedPinId,
        selectedViewId,
        onAppendAsset: sceneStoreActions.appendAsset,
        onUpdateViewerState: sceneStoreActions.patchViewer,
        onAppendCameraView: sceneStoreActions.appendCameraView,
        onSetDirectorPath: sceneStoreActions.setDirectorPath,
        onSelectPin: sceneStoreActions.selectPin,
        onSelectView: sceneStoreActions.selectView,
        sessionState: {
            focusRequest: editorSessionFocusRequest,
            captureRequestKey: editorSessionCaptureRequestKey,
            isPinPlacementEnabled: editorSessionPinPlacementEnabled,
            pinType: editorSessionPinType,
            isRecordingPath: editorSessionRecordingPath,
            viewerReady: editorSessionViewerReady,
        },
        sessionActions: editorSessionActions,
    });
    const toggleTransformSnap = useCallback(() => {
        sceneStoreActions.setTransformSnapEnabled(!transformSnap.enabled);
    }, [sceneStoreActions, transformSnap.enabled]);
    const cycleActiveToolSnap = useCallback(() => {
        if (!isTransformToolMode(activeTool)) {
            return;
        }

        const nextValue = cycleTransformSnapValue(activeTool, getTransformSnapValueForMode(transformSnap, activeTool));
        if (activeTool === "translate") {
            sceneStoreActions.patchTransformSnap({ translate: nextValue });
            return;
        }
        if (activeTool === "rotate") {
            sceneStoreActions.patchTransformSnap({ rotate: nextValue });
            return;
        }
        sceneStoreActions.patchTransformSnap({ scale: nextValue });
    }, [activeTool, sceneStoreActions, transformSnap]);

    return {
        ...interactionController,
        sceneSlices,
        overlaySceneSlices,
        selectedPinId,
        selectedViewId,
        activeTool,
        transformSpace,
        transformSnap,
        hudState: workspaceSession.hudState,
        processingStatus: workspaceSession.stepStatus,
        canUseAdvancedDensity: workspaceSession.canUseAdvancedDensity,
        isAdvancedDensityEnabled: workspaceSession.isAdvancedDensityEnabled,
        toggleAdvancedDensity: workspaceSession.toggleAdvancedDensity,
        toggleLeftHud: workspaceSession.toggleLeftRail,
        toggleRightHud: workspaceSession.toggleRightRail,
        toggleDirectorHud: workspaceSession.toggleDirectorHud,
        selectPin: sceneStoreActions.selectPin,
        selectView: sceneStoreActions.selectView,
        setActiveTool: sceneStoreActions.setActiveTool,
        setTransformSpace: sceneStoreActions.setTransformSpace,
        setTransformSnapEnabled: sceneStoreActions.setTransformSnapEnabled,
        patchTransformSnap: sceneStoreActions.patchTransformSnap,
        toggleTransformSnap,
        cycleActiveToolSnap,
        setDirectorBrief: sceneStoreActions.setDirectorBrief,
    };
}

export type MvpWorkspaceViewerController = ReturnType<typeof useMvpWorkspaceViewerController>;
