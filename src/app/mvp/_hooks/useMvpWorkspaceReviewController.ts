"use client";

import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import type { CameraView, SpatialPin, ViewerState } from "@/lib/mvp-workspace";
import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore.ts";
import type { MvpSceneStoreActions } from "@/state/mvpSceneStore.ts";

import type { SceneVersion } from "./mvpWorkspaceReviewShared";
import { useMvpWorkspaceReviewFocusController } from "./useMvpWorkspaceReviewFocusController";
import { useMvpWorkspaceReviewPersistenceController } from "./useMvpWorkspaceReviewPersistenceController";
import { useMvpWorkspaceReviewShareController } from "./useMvpWorkspaceReviewShareController";

export type { IssueDraft, LegacyComment, SceneVersion } from "./mvpWorkspaceReviewShared";

interface UseMvpWorkspaceReviewControllerOptions {
    activeScene: string | null;
    assetsList: any[];
    sceneDocument: SceneDocumentV2;
    cameraViews: CameraView[];
    pins: SpatialPin[];
    viewer: ViewerState;
    versions: SceneVersion[];
    lastSavedAt: string | null;
    selectedPinId: string | null;
    selectedViewId: string | null;
    sceneStoreActions: Pick<MvpSceneStoreActions, "selectPin" | "selectView">;
    editorSessionActions: Pick<MvpEditorSessionStoreActions, "requestFocus">;
    onExport?: () => void;
}

export function useMvpWorkspaceReviewController({
    activeScene,
    assetsList,
    sceneDocument,
    cameraViews,
    pins,
    viewer,
    versions,
    lastSavedAt,
    selectedPinId,
    selectedViewId,
    sceneStoreActions,
    editorSessionActions,
    onExport,
}: UseMvpWorkspaceReviewControllerOptions) {
    const persistence = useMvpWorkspaceReviewPersistenceController({
        activeScene,
        cameraViews,
        pins,
        versions,
        lastSavedAt,
        selectedPinId,
        selectedViewId,
    });
    const focus = useMvpWorkspaceReviewFocusController({
        cameraViews,
        pins,
        viewer,
        selectedPinId,
        selectedViewId,
        sceneStoreActions,
        editorSessionActions,
    });
    const share = useMvpWorkspaceReviewShareController({
        activeScene,
        assetsList,
        sceneDocument,
        selectedVersion: persistence.selectedVersion,
        reviewData: persistence.reviewData,
        onExport,
    });

    return {
        ...persistence,
        ...share,
        ...focus,
    };
}

export type MvpWorkspaceReviewController = ReturnType<typeof useMvpWorkspaceReviewController>;
