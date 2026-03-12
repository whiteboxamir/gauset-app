"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from "react";

import type {
    MvpEditorSessionStore,
    MvpEditorSessionStoreActions,
    MvpEditorSessionStoreState,
} from "./mvpEditorSessionStore.ts";

interface MvpEditorSessionStoreContextValue {
    store: MvpEditorSessionStore;
}

const EMPTY_EDITOR_SESSION_STORE_STATE: MvpEditorSessionStoreState = {
    focusRequest: null,
    captureRequestKey: 0,
    isPinPlacementEnabled: false,
    pinType: "general",
    isRecordingPath: false,
    viewerReady: false,
};
const noopSubscribe = () => () => undefined;
const EMPTY_EDITOR_SESSION_ACTIONS: MvpEditorSessionStoreActions = {
    resetSession: () => undefined,
    requestFocus: () => undefined,
    clearFocusRequest: () => undefined,
    requestViewCapture: () => undefined,
    setPinPlacementEnabled: () => undefined,
    setPinType: () => undefined,
    setRecordingPathEnabled: () => undefined,
    setViewerReady: () => undefined,
};

const MvpEditorSessionStoreContext = createContext<MvpEditorSessionStoreContextValue | null>(null);

export function MvpEditorSessionStoreProvider({
    store,
    children,
}: {
    store: MvpEditorSessionStore;
    children: React.ReactNode;
}) {
    const value = useMemo(
        () => ({
            store,
        }),
        [store],
    );

    return <MvpEditorSessionStoreContext.Provider value={value}>{children}</MvpEditorSessionStoreContext.Provider>;
}

export function useMvpEditorSessionStoreContext() {
    return useContext(MvpEditorSessionStoreContext);
}

export function useMvpEditorSessionStoreActions() {
    const context = useMvpEditorSessionStoreContext();
    return context ? context.store.getState().actions : EMPTY_EDITOR_SESSION_ACTIONS;
}

export function useMvpEditorSessionStoreSelector<T>(
    selector: (state: MvpEditorSessionStoreState) => T,
    isEqual: (previous: T, next: T) => boolean = Object.is,
) {
    const context = useMvpEditorSessionStoreContext();
    const cacheRef = useRef<{ state: MvpEditorSessionStoreState; selection: T } | null>(null);
    const subscribe = context ? context.store.subscribe : noopSubscribe;
    const getSnapshot = useCallback(() => {
        const state = context ? context.store.getState() : EMPTY_EDITOR_SESSION_STORE_STATE;
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
