import { createStore } from "zustand/vanilla";
import {
    DEFAULT_TRANSFORM_SNAP_SETTINGS,
    isTransformToolMode,
    type SceneTransformMode,
    type SceneTransformSessionNodeState,
    type SceneTransformSessionState,
    type SceneTransformSnapSettings,
    type SceneTransformSpace,
} from "../lib/render/transformSessions.ts";
import {
    appendCameraNodeToSceneDocument,
    appendCameraViewToSceneDocument,
    appendGroupNodeToSceneDocument,
    appendLightNodeToSceneDocument,
    appendMeshAssetToSceneDocument,
    appendPinToSceneDocument,
    cloneSceneDocument,
    createEmptySceneDocumentV2,
    duplicateMeshAssetInSceneDocument,
    findMeshNodeIdByInstanceId,
    patchCameraNodeData,
    patchLightNodeData,
    patchViewerState,
    removeCameraViewFromSceneDocument,
    removeMeshAssetFromSceneDocument,
    removePinFromSceneDocument,
    removeSceneNodeFromSceneDocument,
    renameSceneNode,
    replaceEnvironmentOnSceneDocument,
    reparentSceneNode,
    patchSceneContinuityOnSceneDocument,
    setSceneNodeLocked,
    setSceneNodeVisibility,
    setDirectorBriefOnSceneDocument,
    setDirectorPathOnSceneDocument,
    upsertNodeTransform,
} from "../lib/scene-graph/document.ts";
import { migrateSceneGraphToSceneDocument } from "../lib/scene-graph/migrate.ts";
import type { CameraPathFrame, CameraView, SpatialPin, WorldContinuityRecord } from "../lib/mvp-workspace";
import type {
    CameraNodeData,
    LightNodeData,
    NodeTransformPatch,
    SceneDocumentV2,
    SceneNodeId,
    SceneNodeTransform,
    SceneToolMode,
    ViewerDocumentState,
} from "../lib/scene-graph/types";

export interface MvpSceneDraftTransformMap {
    [nodeId: SceneNodeId]: SceneNodeTransform | undefined;
}

export type MvpSceneSelectionMode = "replace" | "add" | "toggle" | "remove";

export interface MvpSceneStoreState {
    document: SceneDocumentV2;
    selectedNodeIds: SceneNodeId[];
    selectedPinId: string | null;
    selectedViewId: string | null;
    hoveredNodeId: SceneNodeId | null;
    activeTool: SceneToolMode;
    draftTransforms: MvpSceneDraftTransformMap;
    transformSpace: SceneTransformSpace;
    transformSnap: SceneTransformSnapSettings;
    transformSession: SceneTransformSessionState | null;
    dirty: boolean;
    history: SceneDocumentV2[];
    future: SceneDocumentV2[];
}

export interface MvpSceneStoreActions {
    loadSceneGraph: (sceneGraph: unknown) => void;
    loadDocument: (document: SceneDocumentV2) => void;
    selectNodes: (nodeIds: SceneNodeId[], options?: { mode?: MvpSceneSelectionMode }) => void;
    selectPin: (pinId: string | null) => void;
    selectView: (viewId: string | null) => void;
    clearSelection: () => void;
    setHoveredNodeId: (nodeId: SceneNodeId | null) => void;
    setActiveTool: (tool: SceneToolMode) => void;
    setTransformSpace: (space: SceneTransformSpace) => void;
    setTransformSnapEnabled: (enabled: boolean) => void;
    patchTransformSnap: (patch: Partial<Omit<SceneTransformSnapSettings, "enabled">>) => void;
    beginTransformSession: (session: {
        nodeIds: SceneNodeId[];
        mode: SceneTransformMode;
        space: SceneTransformSpace;
        anchorWorldMatrix: number[];
        nodes: Record<SceneNodeId, SceneTransformSessionNodeState>;
    }) => void;
    updateTransformSessionDrafts: (drafts: Record<SceneNodeId, NodeTransformPatch>) => void;
    cancelTransformSession: () => void;
    commitTransformSession: () => void;
    updateDraftTransform: (nodeId: SceneNodeId, patch: NodeTransformPatch) => void;
    updateDraftTransformByAssetInstanceId: (instanceId: string, patch: NodeTransformPatch) => void;
    clearDraftTransforms: () => void;
    commitDraftTransforms: () => void;
    setEnvironment: (environment: Record<string, unknown> | null) => void;
    appendAsset: (asset: Record<string, unknown>) => void;
    duplicateAsset: (instanceId: string) => void;
    removeAsset: (instanceId: string) => void;
    appendGroup: (options?: { name?: string; parentId?: SceneNodeId | null }) => void;
    appendCamera: (options?: { name?: string; parentId?: SceneNodeId | null; camera?: Partial<CameraNodeData> }) => void;
    appendLight: (options?: { name?: string; parentId?: SceneNodeId | null; light?: Partial<LightNodeData> }) => void;
    removeNode: (nodeId: SceneNodeId) => void;
    renameNode: (nodeId: SceneNodeId, name: string) => void;
    setNodeVisibility: (nodeId: SceneNodeId, visible: boolean) => void;
    setNodeLocked: (nodeId: SceneNodeId, locked: boolean) => void;
    reparentNode: (nodeId: SceneNodeId, parentId: SceneNodeId | null, index?: number) => void;
    updateNodeTransform: (nodeId: SceneNodeId, patch: NodeTransformPatch) => void;
    patchCameraNode: (nodeId: SceneNodeId, patch: Partial<Omit<CameraNodeData, "id">>) => void;
    patchLightNode: (nodeId: SceneNodeId, patch: Partial<Omit<LightNodeData, "id">>) => void;
    appendPin: (pin: SpatialPin) => void;
    removePin: (pinId: string) => void;
    appendCameraView: (view: CameraView) => void;
    removeCameraView: (viewId: string) => void;
    setDirectorPath: (path: CameraPathFrame[]) => void;
    setDirectorBrief: (directorBrief: string) => void;
    patchContinuity: (patch: Partial<WorldContinuityRecord>) => void;
    patchViewer: (patch: Partial<ViewerDocumentState>) => void;
    undo: () => void;
    redo: () => void;
}

export type MvpSceneStore = ReturnType<typeof createMvpSceneStore>;

let transformSessionIdCounter = 0;

function mergeTransform(existing: SceneNodeTransform, patch: NodeTransformPatch): SceneNodeTransform {
    return {
        position: patch.position ?? existing.position,
        rotation: patch.rotation ?? existing.rotation,
        scale: patch.scale ?? existing.scale,
    };
}

function createInitialState(document?: SceneDocumentV2): MvpSceneStoreState {
    return {
        document: document ? cloneSceneDocument(document) : createEmptySceneDocumentV2(),
        selectedNodeIds: [],
        selectedPinId: null,
        selectedViewId: null,
        hoveredNodeId: null,
        activeTool: "select",
        draftTransforms: {},
        transformSpace: "world",
        transformSnap: {
            ...DEFAULT_TRANSFORM_SNAP_SETTINGS,
        },
        transformSession: null,
        dirty: false,
        history: [],
        future: [],
    };
}

function createNodeSelection(nodeIds: SceneNodeId[]) {
    return {
        selectedNodeIds: [...nodeIds],
        selectedPinId: null,
        selectedViewId: null,
    };
}

function createPinSelection(pinId: string | null) {
    return {
        selectedNodeIds: [],
        selectedPinId: pinId,
        selectedViewId: null,
    };
}

function createViewSelection(viewId: string | null) {
    return {
        selectedNodeIds: [],
        selectedPinId: null,
        selectedViewId: viewId,
    };
}

function createEmptySelection() {
    return {
        selectedNodeIds: [],
        selectedPinId: null,
        selectedViewId: null,
    };
}

function createSelectionFromMode(state: MvpSceneStoreState, nodeIds: SceneNodeId[], mode: MvpSceneSelectionMode = "replace") {
    const selected = new Set(state.selectedNodeIds);

    if (mode === "replace") {
        return createNodeSelection(nodeIds);
    }

    if (mode === "add") {
        nodeIds.forEach((nodeId) => selected.add(nodeId));
    } else if (mode === "toggle") {
        nodeIds.forEach((nodeId) => {
            if (selected.has(nodeId)) {
                selected.delete(nodeId);
                return;
            }
            selected.add(nodeId);
        });
    } else if (mode === "remove") {
        nodeIds.forEach((nodeId) => {
            selected.delete(nodeId);
        });
    }

    const nextNodeIds = Array.from(selected);
    return nextNodeIds.length > 0 ? createNodeSelection(nextNodeIds) : createEmptySelection();
}

function findInsertedNodeId(previous: SceneDocumentV2, next: SceneDocumentV2) {
    return Object.keys(next.nodes).find((nodeId) => !previous.nodes[nodeId]) ?? null;
}

function sanitizeSelectionForDocument(document: SceneDocumentV2, state: MvpSceneStoreState) {
    return {
        selectedNodeIds: state.selectedNodeIds.filter((nodeId) => Boolean(document.nodes[nodeId])),
        selectedPinId:
            state.selectedPinId && document.direction.pins.some((pin) => pin.id === state.selectedPinId) ? state.selectedPinId : null,
        selectedViewId:
            state.selectedViewId && document.direction.cameraViews.some((view) => view.id === state.selectedViewId)
                ? state.selectedViewId
                : null,
        hoveredNodeId: state.hoveredNodeId && document.nodes[state.hoveredNodeId] ? state.hoveredNodeId : null,
    };
}

function commitDocumentMutation(
    state: MvpSceneStoreState,
    mutate: (document: SceneDocumentV2) => SceneDocumentV2,
): Partial<MvpSceneStoreState> | null {
    const nextDocument = mutate(state.document);
    if (nextDocument === state.document) {
        return null;
    }

    return {
        ...sanitizeSelectionForDocument(nextDocument, state),
        document: nextDocument,
        draftTransforms: {},
        transformSession: null,
        dirty: true,
        history: [...state.history, cloneSceneDocument(state.document)],
        future: [],
    };
}

export function createMvpSceneStore(initialDocument?: SceneDocumentV2) {
    return createStore<MvpSceneStoreState & { actions: MvpSceneStoreActions }>((set, get) => ({
        ...createInitialState(initialDocument),
        actions: {
            loadSceneGraph: (sceneGraph) => {
                const document = migrateSceneGraphToSceneDocument(sceneGraph);
                const state = get();
                set({
                    ...createInitialState(document),
                    transformSpace: state.transformSpace,
                    transformSnap: state.transformSnap,
                });
            },
            loadDocument: (document) => {
                const state = get();
                set({
                    ...createInitialState(document),
                    transformSpace: state.transformSpace,
                    transformSnap: state.transformSnap,
                });
            },
            selectNodes: (nodeIds, options = {}) => {
                const state = get();
                const nextNodeIds = Array.from(new Set(nodeIds)).filter((nodeId) => Boolean(state.document.nodes[nodeId]));
                const nextSelection = createSelectionFromMode(state, nextNodeIds, options.mode ?? "replace");
                set({
                    ...nextSelection,
                    transformSession: null,
                    draftTransforms: {},
                });
            },
            selectPin: (pinId) => {
                const nextPinId = pinId && get().document.direction.pins.some((pin) => pin.id === pinId) ? pinId : null;
                set({
                    ...(nextPinId ? createPinSelection(nextPinId) : { selectedPinId: null }),
                    transformSession: null,
                    draftTransforms: {},
                });
            },
            selectView: (viewId) => {
                const nextViewId = viewId && get().document.direction.cameraViews.some((view) => view.id === viewId) ? viewId : null;
                set({
                    ...(nextViewId ? createViewSelection(nextViewId) : { selectedViewId: null }),
                    transformSession: null,
                    draftTransforms: {},
                });
            },
            clearSelection: () => {
                set({
                    ...createEmptySelection(),
                    transformSession: null,
                    draftTransforms: {},
                });
            },
            setHoveredNodeId: (nodeId) => {
                set({ hoveredNodeId: nodeId });
            },
            setActiveTool: (tool) => {
                set((state) => ({
                    activeTool: tool,
                    transformSession: isTransformToolMode(tool) ? state.transformSession : null,
                    draftTransforms: isTransformToolMode(tool) ? state.draftTransforms : {},
                }));
            },
            setTransformSpace: (space) => {
                set({ transformSpace: space });
            },
            setTransformSnapEnabled: (enabled) => {
                set((state) => ({
                    transformSnap: {
                        ...state.transformSnap,
                        enabled,
                    },
                }));
            },
            patchTransformSnap: (patch) => {
                set((state) => ({
                    transformSnap: {
                        ...state.transformSnap,
                        ...patch,
                    },
                }));
            },
            beginTransformSession: ({ nodeIds, mode, space, anchorWorldMatrix, nodes }) => {
                const state = get();
                const filteredNodeIds = nodeIds.filter((nodeId) => Boolean(state.document.nodes[nodeId]) && Boolean(nodes[nodeId]));
                if (!isTransformToolMode(mode) || filteredNodeIds.length === 0 || !Array.isArray(anchorWorldMatrix) || anchorWorldMatrix.length !== 16) {
                    return;
                }

                set({
                    activeTool: mode,
                    transformSpace: space,
                    transformSession: {
                        id: ++transformSessionIdCounter,
                        mode,
                        space,
                        nodeIds: filteredNodeIds,
                        anchorWorldMatrix: [...anchorWorldMatrix],
                        nodes: Object.fromEntries(filteredNodeIds.map((nodeId) => [nodeId, nodes[nodeId]])),
                    },
                    draftTransforms: {},
                });
            },
            updateTransformSessionDrafts: (drafts) => {
                const state = get();
                if (!state.transformSession) {
                    return;
                }

                const nextDraftTransforms = { ...state.draftTransforms };
                Object.entries(drafts).forEach(([nodeId, patch]) => {
                    if (!patch || !state.transformSession?.nodes[nodeId] || !state.document.nodes[nodeId] || state.document.nodes[nodeId]?.locked) {
                        return;
                    }

                    const baseTransform =
                        nextDraftTransforms[nodeId] ?? state.draftTransforms[nodeId] ?? state.transformSession.nodes[nodeId]?.initialLocalTransform;
                    if (!baseTransform) {
                        return;
                    }

                    nextDraftTransforms[nodeId] = mergeTransform(baseTransform, patch);
                });

                set({
                    draftTransforms: nextDraftTransforms,
                });
            },
            cancelTransformSession: () => {
                set({
                    transformSession: null,
                    draftTransforms: {},
                });
            },
            commitTransformSession: () => {
                get().actions.commitDraftTransforms();
            },
            updateDraftTransform: (nodeId, patch) => {
                const state = get();
                const node = state.document.nodes[nodeId];
                const baseTransform = state.draftTransforms[nodeId] ?? node?.transform;
                if (!baseTransform || node?.locked) {
                    return;
                }

                set({
                    draftTransforms: {
                        ...state.draftTransforms,
                        [nodeId]: mergeTransform(baseTransform, patch),
                    },
                });
            },
            updateDraftTransformByAssetInstanceId: (instanceId, patch) => {
                const state = get();
                const nodeId = findMeshNodeIdByInstanceId(state.document, instanceId);
                if (!nodeId) {
                    return;
                }
                state.actions.updateDraftTransform(nodeId, patch);
            },
            clearDraftTransforms: () => {
                set({
                    draftTransforms: {},
                    transformSession: null,
                });
            },
            commitDraftTransforms: () => {
                const state = get();
                const entries = Object.entries(state.draftTransforms).filter(([, value]) => Boolean(value)) as Array<
                    [SceneNodeId, SceneNodeTransform]
                >;
                if (entries.length === 0) {
                    if (state.transformSession) {
                        set({ transformSession: null, draftTransforms: {} });
                    }
                    return;
                }

                let nextDocument = cloneSceneDocument(state.document);
                entries.forEach(([nodeId, transform]) => {
                    nextDocument = upsertNodeTransform(nextDocument, nodeId, transform);
                });

                set({
                    ...sanitizeSelectionForDocument(nextDocument, state),
                    document: nextDocument,
                    draftTransforms: {},
                    transformSession: null,
                    dirty: true,
                    history: [...state.history, cloneSceneDocument(state.document)],
                    future: [],
                });
            },
            setEnvironment: (environment) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => replaceEnvironmentOnSceneDocument(document, environment));
                if (nextState) {
                    set(nextState);
                }
            },
            appendAsset: (asset) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendMeshAssetToSceneDocument(document, asset));
                if (nextState) {
                    set(nextState);
                }
            },
            duplicateAsset: (instanceId) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => duplicateMeshAssetInSceneDocument(document, instanceId));
                if (nextState) {
                    set(nextState);
                }
            },
            removeAsset: (instanceId) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => removeMeshAssetFromSceneDocument(document, instanceId));
                if (nextState) {
                    set(nextState);
                }
            },
            appendGroup: (options = {}) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendGroupNodeToSceneDocument(document, options));
                const nextNodeId = nextState ? findInsertedNodeId(state.document, nextState.document!) : null;
                if (nextState) {
                    set(nextNodeId ? { ...nextState, ...createNodeSelection([nextNodeId]) } : nextState);
                }
            },
            appendCamera: (options = {}) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendCameraNodeToSceneDocument(document, options));
                const nextNodeId = nextState ? findInsertedNodeId(state.document, nextState.document!) : null;
                if (nextState) {
                    set(nextNodeId ? { ...nextState, ...createNodeSelection([nextNodeId]) } : nextState);
                }
            },
            appendLight: (options = {}) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendLightNodeToSceneDocument(document, options));
                const nextNodeId = nextState ? findInsertedNodeId(state.document, nextState.document!) : null;
                if (nextState) {
                    set(nextNodeId ? { ...nextState, ...createNodeSelection([nextNodeId]) } : nextState);
                }
            },
            removeNode: (nodeId) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => removeSceneNodeFromSceneDocument(document, nodeId));
                if (nextState) {
                    set(nextState);
                }
            },
            renameNode: (nodeId, name) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => renameSceneNode(document, nodeId, name));
                if (nextState) {
                    set(nextState);
                }
            },
            setNodeVisibility: (nodeId, visible) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => setSceneNodeVisibility(document, nodeId, visible));
                if (nextState) {
                    set(nextState);
                }
            },
            setNodeLocked: (nodeId, locked) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => setSceneNodeLocked(document, nodeId, locked));
                if (nextState) {
                    set(nextState);
                }
            },
            reparentNode: (nodeId, parentId, index) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => reparentSceneNode(document, nodeId, parentId, index));
                if (nextState) {
                    set(nextState);
                }
            },
            updateNodeTransform: (nodeId, patch) => {
                const state = get();
                const node = state.document.nodes[nodeId];
                if (!node || node.locked) {
                    return;
                }
                const nextState = commitDocumentMutation(state, (document) => upsertNodeTransform(document, nodeId, patch));
                if (nextState) {
                    set(nextState);
                }
            },
            patchCameraNode: (nodeId, patch) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => patchCameraNodeData(document, nodeId, patch));
                if (nextState) {
                    set(nextState);
                }
            },
            patchLightNode: (nodeId, patch) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => patchLightNodeData(document, nodeId, patch));
                if (nextState) {
                    set(nextState);
                }
            },
            appendPin: (pin) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendPinToSceneDocument(document, pin));
                if (nextState) {
                    set({
                        ...nextState,
                        ...createPinSelection(pin.id),
                    });
                }
            },
            removePin: (pinId) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => removePinFromSceneDocument(document, pinId));
                if (nextState) {
                    set(nextState);
                }
            },
            appendCameraView: (view) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => appendCameraViewToSceneDocument(document, view));
                if (nextState) {
                    set({
                        ...nextState,
                        ...createViewSelection(view.id),
                    });
                }
            },
            removeCameraView: (viewId) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => removeCameraViewFromSceneDocument(document, viewId));
                if (nextState) {
                    set(nextState);
                }
            },
            setDirectorPath: (path) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => setDirectorPathOnSceneDocument(document, path));
                if (nextState) {
                    set(nextState);
                }
            },
            setDirectorBrief: (directorBrief) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => setDirectorBriefOnSceneDocument(document, directorBrief));
                if (nextState) {
                    set(nextState);
                }
            },
            patchContinuity: (patch) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => patchSceneContinuityOnSceneDocument(document, patch));
                if (nextState) {
                    set(nextState);
                }
            },
            patchViewer: (patch) => {
                const state = get();
                const nextState = commitDocumentMutation(state, (document) => patchViewerState(document, patch));
                if (nextState) {
                    set(nextState);
                }
            },
            undo: () => {
                const state = get();
                const previous = state.history[state.history.length - 1];
                if (!previous) {
                    return;
                }

                const nextDocument = cloneSceneDocument(previous);
                set({
                    ...sanitizeSelectionForDocument(nextDocument, state),
                    document: nextDocument,
                    history: state.history.slice(0, -1),
                    future: [cloneSceneDocument(state.document), ...state.future],
                    draftTransforms: {},
                    transformSession: null,
                    dirty: true,
                });
            },
            redo: () => {
                const state = get();
                const next = state.future[0];
                if (!next) {
                    return;
                }

                const nextDocument = cloneSceneDocument(next);
                set({
                    ...sanitizeSelectionForDocument(nextDocument, state),
                    document: nextDocument,
                    history: [...state.history, cloneSceneDocument(state.document)],
                    future: state.future.slice(1),
                    draftTransforms: {},
                    transformSession: null,
                    dirty: true,
                });
            },
        },
    }));
}

export function getSceneStoreActions(store: MvpSceneStore) {
    return store.getState().actions;
}
