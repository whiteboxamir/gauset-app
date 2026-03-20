"use client";

import { useCallback, useMemo } from "react";

import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import { useSceneActiveTool, useSceneSelectedNodeIds, useSceneSelectedPinId, useSceneTransformSession, useSceneTransformSnap, useSceneTransformSpace } from "@/state/mvpSceneEditorSelectors.ts";
import {
    useEditorSessionCaptureRequestKey,
    useEditorSessionFocusRequest,
    useEditorSessionPinPlacementEnabled,
    useEditorSessionPinType,
    useEditorSessionRecordingPath,
} from "@/state/mvpEditorSessionSelectors.ts";
import { useMvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStoreContext.tsx";
import {
    useMvpSceneStoreActions,
    useRenderableSceneDocumentFromContext,
    useRenderableSceneDocumentSelector,
} from "@/state/mvpSceneStoreContext.tsx";
import { useSceneAssetsSlice, useSceneEnvironmentSlice, useScenePinsSlice, useSceneViewerSlice } from "@/state/mvpSceneWorkspaceSelectors.ts";
import type { MvpSceneSelectionMode } from "@/state/mvpSceneStore.ts";

function jsonValueEqual<T>(previous: T, next: T) {
    return JSON.stringify(previous) === JSON.stringify(next);
}

function selectMeshNodeIdByInstanceId(document: SceneDocumentV2) {
    return Object.fromEntries(
        Object.entries(document.meshes).flatMap(([nodeId, mesh]) => {
            const metadata = mesh?.metadata ?? {};
            const instanceId =
                typeof metadata.instanceId === "string" && metadata.instanceId
                    ? metadata.instanceId
                    : typeof metadata.instance_id === "string" && metadata.instance_id
                      ? metadata.instance_id
                      : null;
            return instanceId ? [[instanceId, nodeId]] : [];
        }),
    );
}

export function useMvpWorkspaceThreeOverlayController() {
    const sceneStoreActions = useMvpSceneStoreActions();
    const editorSessionActions = useMvpEditorSessionStoreActions();
    const sceneDocument = useRenderableSceneDocumentFromContext();
    const environment = useSceneEnvironmentSlice();
    const assets = useSceneAssetsSlice();
    const pins = useScenePinsSlice();
    const viewer = useSceneViewerSlice();
    const selectedNodeIds = useSceneSelectedNodeIds();
    const selectedPinId = useSceneSelectedPinId();
    const activeTool = useSceneActiveTool();
    const transformSpace = useSceneTransformSpace();
    const transformSnap = useSceneTransformSnap();
    const transformSession = useSceneTransformSession();
    const focusRequest = useEditorSessionFocusRequest();
    const captureRequestKey = useEditorSessionCaptureRequestKey();
    const isPinPlacementEnabled = useEditorSessionPinPlacementEnabled();
    const pinType = useEditorSessionPinType();
    const isRecordingPath = useEditorSessionRecordingPath();
    const assetNodeIdByInstanceId = useRenderableSceneDocumentSelector(selectMeshNodeIdByInstanceId, jsonValueEqual);

    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const selectedAssetInstanceIds = useMemo(
        () =>
            Object.entries(assetNodeIdByInstanceId).flatMap(([instanceId, nodeId]) =>
                selectedNodeIdSet.has(nodeId) ? [instanceId] : [],
            ),
        [assetNodeIdByInstanceId, selectedNodeIdSet],
    );

    const handleSelectAsset = useCallback(
        (instanceId: string, options?: { mode?: MvpSceneSelectionMode }) => {
            const nodeId = assetNodeIdByInstanceId[instanceId];
            if (!nodeId) {
                return;
            }

            sceneStoreActions.selectNodes([nodeId], options);
            if (activeTool === "select") {
                sceneStoreActions.setActiveTool("translate");
            }
        },
        [activeTool, assetNodeIdByInstanceId, sceneStoreActions],
    );

    const handleSelectNode = useCallback(
        (nodeId: string, options?: { mode?: "replace" | "add" | "toggle" | "remove" }) => {
            sceneStoreActions.selectNodes([nodeId], options);
            if (activeTool === "select") {
                sceneStoreActions.setActiveTool("translate");
            }
        },
        [activeTool, sceneStoreActions],
    );

    return {
        sceneDocument,
        environment,
        assets,
        pins,
        viewer,
        focusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        isRecordingPath,
        transformSpace,
        transformSnap,
        transformSession,
        onViewerReadyChange: editorSessionActions.setViewerReady,
        selectedNodeIds,
        selectedPinId,
        selectedAssetInstanceIds,
        activeTool,
        onSelectPin: sceneStoreActions.selectPin,
        onClearSelection: sceneStoreActions.clearSelection,
        onSelectNode: handleSelectNode,
        onSelectAsset: handleSelectAsset,
        onBeginTransformSession: sceneStoreActions.beginTransformSession,
        onUpdateTransformSessionDrafts: sceneStoreActions.updateTransformSessionDrafts,
        onCancelTransformSession: sceneStoreActions.cancelTransformSession,
        onCommitTransformSession: sceneStoreActions.commitTransformSession,
        onUpdateNodeTransformDraft: sceneStoreActions.updateDraftTransform,
        onUpdateAssetTransformDraft: sceneStoreActions.updateDraftTransformByAssetInstanceId,
        onCommitSceneTransforms: sceneStoreActions.commitDraftTransforms,
        onAppendPin: sceneStoreActions.appendPin,
    };
}

export type MvpWorkspaceThreeOverlayController = ReturnType<typeof useMvpWorkspaceThreeOverlayController>;
