"use client";

import { useEffect, useMemo, useRef } from "react";

import { EMPTY_SCENE_NODE_REGISTRY, createSceneNodeRegistry, getPrimarySplatNode } from "@/lib/render/sceneNodeRegistry.ts";
import { createSceneRuntime } from "@/lib/render/sceneRuntime.ts";
import type { SceneDocumentV2, SceneNodeId } from "@/lib/scene-graph/types.ts";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import type { MvpSceneSelectionMode } from "@/state/mvpSceneStore.ts";
import { type SpatialPin, type SpatialPinType, type ViewerState, type WorkspaceSceneGraph } from "@/lib/mvp-workspace";
import type { AssetTransformPatch } from "./threeOverlayShared";
import { useThreeOverlayInteractionController } from "./useThreeOverlayInteractionController";
import { useThreeOverlayViewerRuntimeController } from "./useThreeOverlayViewerRuntimeController";

interface UseThreeOverlaySurfaceControllerOptions {
    environment: WorkspaceSceneGraph["environment"];
    viewer: ViewerState;
    sceneDocument?: SceneDocumentV2;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    readOnly: boolean;
    backgroundColor: string;
    selectedNodeIds?: SceneNodeId[];
    selectedAssetInstanceIds: string[];
    onViewerReadyChange: (ready: boolean) => void;
    onSelectPin?: (pinId: string | null) => void;
    onClearSelection?: () => void;
    onSelectNode?: (nodeId: SceneNodeId, options?: { mode?: MvpSceneSelectionMode }) => void;
    onSelectAsset?: (instanceId: string, options?: { mode?: MvpSceneSelectionMode }) => void;
    onUpdateNodeTransformDraft?: (nodeId: SceneNodeId, patch: AssetTransformPatch) => void;
    onUpdateAssetTransformDraft?: (instanceId: string, patch: AssetTransformPatch) => void;
    onCommitSceneTransforms?: () => void;
    onAppendPin?: (pin: SpatialPin) => void;
}

export function useThreeOverlaySurfaceController({
    environment,
    viewer,
    sceneDocument,
    focusRequest,
    captureRequestKey,
    isPinPlacementEnabled,
    pinType,
    readOnly,
    backgroundColor,
    selectedNodeIds = [],
    selectedAssetInstanceIds,
    onViewerReadyChange,
    onSelectPin,
    onClearSelection,
    onSelectNode,
    onSelectAsset,
    onUpdateNodeTransformDraft,
    onUpdateAssetTransformDraft,
    onCommitSceneTransforms,
    onAppendPin,
}: UseThreeOverlaySurfaceControllerOptions) {
    void captureRequestKey;

    const sceneNodeRegistry = useMemo(
        () => (sceneDocument ? createSceneNodeRegistry(sceneDocument) : EMPTY_SCENE_NODE_REGISTRY),
        [sceneDocument],
    );
    const primarySplatNode = useMemo(() => getPrimarySplatNode(sceneNodeRegistry), [sceneNodeRegistry]);
    const runtimeEnvironment = primarySplatNode?.environment ?? environment;
    const runtimeMeshNodes = useMemo(
        () => sceneNodeRegistry.meshNodeIds.map((nodeId) => sceneNodeRegistry.byId[nodeId]).filter((node) => node?.kind === "mesh"),
        [sceneNodeRegistry],
    );
    const runtimeCameraNodes = useMemo(
        () => sceneNodeRegistry.cameraNodeIds.map((nodeId) => sceneNodeRegistry.byId[nodeId]).filter((node) => node?.kind === "camera"),
        [sceneNodeRegistry],
    );
    const runtimeLightNodes = useMemo(
        () => sceneNodeRegistry.lightNodeIds.map((nodeId) => sceneNodeRegistry.byId[nodeId]).filter((node) => node?.kind === "light"),
        [sceneNodeRegistry],
    );
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const sceneRuntimeRef = useRef(createSceneRuntime());

    const viewerRuntime = useThreeOverlayViewerRuntimeController({
        environment: runtimeEnvironment,
        viewer,
        focusRequest,
        backgroundColor,
        onViewerReadyChange,
    });
    const interactionController = useThreeOverlayInteractionController({
        controlsRef: viewerRuntime.controlsRef,
        canvasElementRef: viewerRuntime.canvasElementRef,
        isPinPlacementEnabled,
        pinType,
        readOnly,
        onSelectPin,
        onClearSelection,
        onSelectNode,
        onSelectAsset,
        onUpdateNodeTransformDraft,
        onUpdateAssetTransformDraft,
        onCommitSceneTransforms,
        onAppendPin,
    });
    const selectedAssetInstanceIdSet = useMemo(() => new Set(selectedAssetInstanceIds), [selectedAssetInstanceIds]);
    const viewerRuntimeSurface = viewerRuntime;

    useEffect(() => {
        sceneRuntimeRef.current.syncRegistry(sceneNodeRegistry);
    }, [sceneNodeRegistry]);

    useEffect(() => {
        const sceneRuntime = sceneRuntimeRef.current;
        return () => {
            sceneRuntime.dispose();
        };
    }, []);

    return {
        ...viewerRuntimeSurface,
        sceneRuntime: sceneRuntimeRef.current,
        sceneNodeRegistry,
        primarySplatNode,
        runtimeMeshNodes,
        runtimeCameraNodes,
        runtimeLightNodes,
        selectedNodeIdSet,
        selectedAssetInstanceIdSet,
        ...interactionController,
    };
}

export type ThreeOverlaySurfaceController = ReturnType<typeof useThreeOverlaySurfaceController>;
