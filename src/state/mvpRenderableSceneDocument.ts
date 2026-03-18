"use client";

import type { SceneDocumentV2 } from "../lib/scene-graph/types.ts";
import { selectRenderableSceneDocument } from "./mvpSceneSelectors.ts";
import type { MvpSceneDraftTransformMap, MvpSceneStore } from "./mvpSceneStore.ts";

interface RenderableSceneDocumentSnapshotCache {
    document: SceneDocumentV2;
    draftTransforms: MvpSceneDraftTransformMap;
    snapshot: SceneDocumentV2;
}

export function createRenderableSceneDocumentSnapshotGetter(store: MvpSceneStore) {
    const initialState = store.getState();
    const cache: RenderableSceneDocumentSnapshotCache = {
        document: initialState.document,
        draftTransforms: initialState.draftTransforms,
        snapshot: selectRenderableSceneDocument(initialState),
    };

    return () => {
        const state = store.getState();
        if (cache.document === state.document && cache.draftTransforms === state.draftTransforms) {
            return cache.snapshot;
        }

        const snapshot = selectRenderableSceneDocument(state);
        cache.document = state.document;
        cache.draftTransforms = state.draftTransforms;
        cache.snapshot = snapshot;
        return snapshot;
    };
}
