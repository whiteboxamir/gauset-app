"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from "react";

import { createEmptySceneDocumentV2 } from "../lib/scene-graph/document.ts";
import type { SceneDocumentV2 } from "../lib/scene-graph/types.ts";
import { createRenderableSceneDocumentSnapshotGetter } from "./mvpRenderableSceneDocument.ts";
import type { MvpSceneStore, MvpSceneStoreActions, MvpSceneStoreState } from "./mvpSceneStore.ts";

interface MvpSceneStoreContextValue {
    store: MvpSceneStore;
    getRenderableSceneDocumentSnapshot: () => SceneDocumentV2;
}

const EMPTY_SCENE_DOCUMENT = createEmptySceneDocumentV2();
const EMPTY_SCENE_STORE_STATE: MvpSceneStoreState = {
    document: EMPTY_SCENE_DOCUMENT,
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
const noopSubscribe = () => () => undefined;
const getEmptySceneDocument = () => EMPTY_SCENE_DOCUMENT;
const EMPTY_SCENE_ACTIONS: MvpSceneStoreActions = {
    loadSceneGraph: () => undefined,
    loadDocument: () => undefined,
    selectNodes: () => undefined,
    selectPin: () => undefined,
    selectView: () => undefined,
    clearSelection: () => undefined,
    setHoveredNodeId: () => undefined,
    setActiveTool: () => undefined,
    updateDraftTransform: () => undefined,
    updateDraftTransformByAssetInstanceId: () => undefined,
    clearDraftTransforms: () => undefined,
    commitDraftTransforms: () => undefined,
    setEnvironment: () => undefined,
    appendAsset: () => undefined,
    duplicateAsset: () => undefined,
    removeAsset: () => undefined,
    appendPin: () => undefined,
    removePin: () => undefined,
    appendCameraView: () => undefined,
    removeCameraView: () => undefined,
    setDirectorPath: () => undefined,
    setDirectorBrief: () => undefined,
    patchViewer: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
};

const MvpSceneStoreContext = createContext<MvpSceneStoreContextValue | null>(null);

export function MvpSceneStoreProvider({
    store,
    children,
}: {
    store: MvpSceneStore;
    children: React.ReactNode;
}) {
    const getRenderableSceneDocumentSnapshot = useMemo(() => createRenderableSceneDocumentSnapshotGetter(store), [store]);
    const memoizedValue = useMemo(
        () => ({
            store,
            getRenderableSceneDocumentSnapshot,
        }),
        [getRenderableSceneDocumentSnapshot, store],
    );

    return <MvpSceneStoreContext.Provider value={memoizedValue}>{children}</MvpSceneStoreContext.Provider>;
}

export function useMvpSceneStoreContext() {
    return useContext(MvpSceneStoreContext);
}

export function useRenderableSceneDocumentFromContext() {
    const context = useMvpSceneStoreContext();
    const subscribe = context ? context.store.subscribe : noopSubscribe;
    const getSnapshot = context ? context.getRenderableSceneDocumentSnapshot : getEmptySceneDocument;
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRenderableSceneDocumentSnapshotGetter() {
    const context = useMvpSceneStoreContext();
    return context ? context.getRenderableSceneDocumentSnapshot : getEmptySceneDocument;
}

export function useMvpSceneStoreActions() {
    const context = useMvpSceneStoreContext();
    return context ? context.store.getState().actions : EMPTY_SCENE_ACTIONS;
}

export function useMvpSceneStoreSelector<T>(
    selector: (state: MvpSceneStoreState) => T,
    isEqual: (previous: T, next: T) => boolean = Object.is,
) {
    const context = useMvpSceneStoreContext();
    const cacheRef = useRef<{ state: MvpSceneStoreState; selection: T } | null>(null);
    const subscribe = context ? context.store.subscribe : noopSubscribe;
    const getSnapshot = useCallback(() => {
        const state = context ? context.store.getState() : EMPTY_SCENE_STORE_STATE;
        const nextSelection = selector(state);
        const cached = cacheRef.current;

        if (cached && cached.state === state) {
            return cached.selection;
        }

        if (cached && isEqual(cached.selection, nextSelection)) {
            cacheRef.current = {
                state,
                selection: cached.selection,
            };
            return cached.selection;
        }

        cacheRef.current = {
            state,
            selection: nextSelection,
        };
        return nextSelection;
    }, [context, isEqual, selector]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRenderableSceneDocumentSelector<T>(
    selector: (document: SceneDocumentV2) => T,
    isEqual: (previous: T, next: T) => boolean = Object.is,
) {
    const context = useMvpSceneStoreContext();
    const cacheRef = useRef<{ document: SceneDocumentV2; selection: T } | null>(null);
    const subscribe = context ? context.store.subscribe : noopSubscribe;
    const getSnapshot = useCallback(() => {
        const document = context ? context.getRenderableSceneDocumentSnapshot() : EMPTY_SCENE_DOCUMENT;
        const nextSelection = selector(document);
        const cached = cacheRef.current;

        if (cached && cached.document === document) {
            return cached.selection;
        }

        if (cached && isEqual(cached.selection, nextSelection)) {
            cacheRef.current = {
                document,
                selection: cached.selection,
            };
            return cached.selection;
        }

        cacheRef.current = {
            document,
            selection: nextSelection,
        };
        return nextSelection;
    }, [context, isEqual, selector]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
