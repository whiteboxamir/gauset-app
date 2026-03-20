"use client";

import {
    type CameraPathFrame,
    type CameraView,
    type SpatialPin,
    type ViewerState,
    type WorkspaceSceneGraph,
} from "@/lib/mvp-workspace";
import { sceneDocumentToWorkspaceAssets, sceneDocumentToWorkspaceEnvironment } from "@/lib/scene-graph/document.ts";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { useViewerPanelSceneActionController } from "./useViewerPanelSceneActionController";
import {
    useViewerPanelSessionController,
    type ViewerPanelSessionActions,
    type ViewerPanelSessionState,
} from "./useViewerPanelSessionController";

export type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";

export interface ViewerPanelSceneSlices {
    environment: WorkspaceSceneGraph["environment"];
    assets: WorkspaceSceneGraph["assets"];
    camera_views: CameraView[];
    pins: SpatialPin[];
    director_path: CameraPathFrame[];
    director_brief: string;
    viewer: ViewerState;
}

export interface ViewerOverlaySceneSlices {
    environment: WorkspaceSceneGraph["environment"];
    assets: WorkspaceSceneGraph["assets"];
    pins: SpatialPin[];
    viewer: ViewerState;
}

export interface ViewerPanelInteractionSceneSlices {
    camera_views: CameraView[];
    pins: SpatialPin[];
    viewer: ViewerState;
}

export function selectViewerPanelSceneSlicesFromDocument(sceneDocument: SceneDocumentV2): ViewerPanelSceneSlices {
    return {
        environment: sceneDocumentToWorkspaceEnvironment(sceneDocument),
        assets: sceneDocumentToWorkspaceAssets(sceneDocument),
        camera_views: [...sceneDocument.direction.cameraViews],
        pins: [...sceneDocument.direction.pins],
        director_path: [...sceneDocument.direction.directorPath],
        director_brief: sceneDocument.direction.directorBrief,
        viewer: {
            fov: sceneDocument.viewer.fov,
            lens_mm: sceneDocument.viewer.lens_mm,
        },
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

interface ViewerPanelInteractionControllerOptions {
    routeVariant?: "workspace" | "launchpad";
    readOnly: boolean;
    pinCount: number;
    getCurrentSceneSlices: () => ViewerPanelInteractionSceneSlices;
    selectedPinId?: string | null;
    selectedViewId?: string | null;
    focusRequest?: FocusRequest;
    onAppendAsset?: (asset: Record<string, unknown>) => void;
    onUpdateViewerState?: (viewerPatch: Partial<ViewerState>) => void;
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
    getCurrentSceneSlices,
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
    const sessionController = useViewerPanelSessionController({
        routeVariant,
        pinCount,
        focusRequest,
        sessionState,
        sessionActions,
    });
    const sceneActionController = useViewerPanelSceneActionController({
        readOnly,
        getCurrentSceneSlices,
        selectedPinId,
        selectedViewId,
        combinedFocusRequest: sessionController.combinedFocusRequest,
        viewerReady: sessionController.viewerReady,
        requestFocus: sessionController.requestFocus,
        issueCaptureRequest: sessionController.issueCaptureRequest,
        onAppendAsset,
        onUpdateViewerState,
        onAppendCameraView,
        onSetDirectorPath,
        onSelectPin,
        onSelectView,
    });

    return {
        ...sessionController,
        ...sceneActionController,
    };
}
