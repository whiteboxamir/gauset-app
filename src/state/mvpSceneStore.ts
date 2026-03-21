import { createStore } from "zustand/vanilla";
import {
    appendCameraViewToSceneDocument,
    appendMeshAssetToSceneDocument,
    appendPinToSceneDocument,
    cloneSceneDocument,
    createEmptySceneDocumentV2,
    duplicateMeshAssetInSceneDocument,
    findMeshNodeIdByInstanceId,
    patchViewerState,
    removeCameraViewFromSceneDocument,
    removeMeshAssetFromSceneDocument,
    removePinFromSceneDocument,
    replaceEnvironmentOnSceneDocument,
    setDirectorBriefOnSceneDocument,
    setDirectorPathOnSceneDocument,
    upsertNodeTransform,
} from "../lib/scene-graph/document";
import { migrateSceneGraphToSceneDocument } from "../lib/scene-graph/migrate";
import type { CameraPathFrame, CameraView, SpatialPin } from "../lib/mvp-workspace";
import type { NodeTransformPatch, SceneDocumentV2, SceneNodeId, SceneNodeTransform, SceneToolMode, ViewerDocumentState } from "../lib/scene-graph/types";

export interface MvpSceneDraftTransformMap {
    [nodeId: SceneNodeId]: SceneNodeTransform | undefined;
}

export interface MvpSceneStoreState {
    document: SceneDocumentV2;
    selectedNodeIds: SceneNodeId[];
    selectedPinId: string | null;
    selectedViewId: string | null;
    hoveredNodeId: SceneNodeId | null;
    activeTool: SceneToolMode;
    draftTransforms: MvpSceneDraftTransformMap;
    dirty: boolean;
    history: SceneDocumentV2[];
    future: SceneDocumentV2[];
}

export interface MvpSceneStoreActions {
    loadSceneGraph: (sceneGraph: unknown) => void;
    loadDocument: (document: SceneDocumentV2) => void;
    selectNodes: (nodeIds: SceneNodeId[]) => void;
    selectPin: (pinId: string | null) => void;
    selectView: (viewId: string | null) => void;
    clearSelection: () => void;
    setHoveredNodeId: (nodeId: SceneNodeId | null) => void;
    setActiveTool: (tool: SceneToolMode) => void;
    updateDraftTransform: (nodeId: SceneNodeId, patch: NodeTransformPatch) => void;
    updateDraftTransformByAssetInstanceId: (instanceId: string, patch: NodeTransformPatch) => void;
    clearDraftTransforms: () => void;
    commitDraftTransforms: () => void;
    setEnvironment: (environment: Record<string, unknown> | null) => void;
    appendAsset: (asset: Record<string, unknown>) => void;
    duplicateAsset: (instanceId: string) => void;
    removeAsset: (instanceId: string) => void;
    appendPin: (pin: SpatialPin) => void;
    removePin: (pinId: string) => void;
    appendCameraView: (view: CameraView) => void;
    removeCameraView: (viewId: string) => void;
    setDirectorPath: (path: CameraPathFrame[]) => void;
    setDirectorBrief: (directorBrief: string) => void;
    patchViewer: (patch: Partial<ViewerDocumentState>) => void;
    undo: () => void;
    redo: () => void;
}

export type MvpSceneStore = ReturnType<typeof createMvpSceneStore>;

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
                set({
                    ...createInitialState(document),
                });
            },
            loadDocument: (document) => {
                set({
                    ...createInitialState(document),
                });
            },
            selectNodes: (nodeIds) => {
                const nextNodeIds = Array.from(new Set(nodeIds)).filter((nodeId) => Boolean(get().document.nodes[nodeId]));
                set(nextNodeIds.length > 0 ? createNodeSelection(nextNodeIds) : { selectedNodeIds: [] });
            },
            selectPin: (pinId) => {
                const nextPinId = pinId && get().document.direction.pins.some((pin) => pin.id === pinId) ? pinId : null;
                set(nextPinId ? createPinSelection(nextPinId) : { selectedPinId: null });
            },
            selectView: (viewId) => {
                const nextViewId = viewId && get().document.direction.cameraViews.some((view) => view.id === viewId) ? viewId : null;
                set(nextViewId ? createViewSelection(nextViewId) : { selectedViewId: null });
            },
            clearSelection: () => {
                set(createEmptySelection());
            },
            setHoveredNodeId: (nodeId) => {
                set({ hoveredNodeId: nodeId });
            },
            setActiveTool: (tool) => {
                set({ activeTool: tool });
            },
            updateDraftTransform: (nodeId, patch) => {
                const state = get();
                const baseTransform = state.draftTransforms[nodeId] ?? state.document.nodes[nodeId]?.transform;
                if (!baseTransform) {
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
                set({ draftTransforms: {} });
            },
            commitDraftTransforms: () => {
                const state = get();
                const entries = Object.entries(state.draftTransforms).filter(([, value]) => Boolean(value)) as Array<
                    [SceneNodeId, SceneNodeTransform]
                >;
                if (entries.length === 0) {
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
                    dirty: true,
                });
            },
        },
    }));
}

export function getSceneStoreActions(store: MvpSceneStore) {
    return store.getState().actions;
}
