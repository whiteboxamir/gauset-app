import { applyDraftTransformsToSceneDocument } from "../lib/scene-graph/document.ts";
import type { MvpSceneStoreState } from "./mvpSceneStore";

export const selectSceneDocument = (state: MvpSceneStoreState) => state.document;
export const selectRenderableSceneDocument = (state: MvpSceneStoreState) =>
    applyDraftTransformsToSceneDocument(state.document, state.draftTransforms);
export const selectSelectedNodeIds = (state: MvpSceneStoreState) => state.selectedNodeIds;
export const selectSelectedPinId = (state: MvpSceneStoreState) => state.selectedPinId;
export const selectSelectedViewId = (state: MvpSceneStoreState) => state.selectedViewId;
export const selectHoveredNodeId = (state: MvpSceneStoreState) => state.hoveredNodeId;
export const selectDraftTransforms = (state: MvpSceneStoreState) => state.draftTransforms;
export const selectActiveTool = (state: MvpSceneStoreState) => state.activeTool;
export const selectTransformSpace = (state: MvpSceneStoreState) => state.transformSpace;
export const selectTransformSnap = (state: MvpSceneStoreState) => state.transformSnap;
export const selectTransformSession = (state: MvpSceneStoreState) => state.transformSession;
export const selectDirty = (state: MvpSceneStoreState) => state.dirty;
