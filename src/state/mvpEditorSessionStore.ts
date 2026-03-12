"use client";

import { createStore } from "zustand/vanilla";

import type { CameraPose, SpatialPinType } from "@/lib/mvp-workspace";

export type FocusRequest = (CameraPose & { token: number }) | null;

export interface MvpEditorSessionStoreState {
    focusRequest: FocusRequest;
    captureRequestKey: number;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    viewerReady: boolean;
}

export interface MvpEditorSessionStoreActions {
    resetSession: () => void;
    requestFocus: (pose: CameraPose) => void;
    clearFocusRequest: () => void;
    requestViewCapture: () => void;
    setPinPlacementEnabled: (enabled: boolean) => void;
    setPinType: (pinType: SpatialPinType) => void;
    setRecordingPathEnabled: (enabled: boolean) => void;
    setViewerReady: (ready: boolean) => void;
}

export type MvpEditorSessionStore = ReturnType<typeof createMvpEditorSessionStore>;

function createInitialState(): MvpEditorSessionStoreState {
    return {
        focusRequest: null,
        captureRequestKey: 0,
        isPinPlacementEnabled: false,
        pinType: "general",
        isRecordingPath: false,
        viewerReady: false,
    };
}

export function createMvpEditorSessionStore() {
    return createStore<MvpEditorSessionStoreState & { actions: MvpEditorSessionStoreActions }>((set) => ({
        ...createInitialState(),
        actions: {
            resetSession: () => {
                set(createInitialState());
            },
            requestFocus: (pose) => {
                set({
                    focusRequest: {
                        ...pose,
                        token: Date.now(),
                    },
                });
            },
            clearFocusRequest: () => {
                set({
                    focusRequest: null,
                });
            },
            requestViewCapture: () => {
                set((state) => ({
                    captureRequestKey: state.captureRequestKey + 1,
                }));
            },
            setPinPlacementEnabled: (enabled) => {
                set({
                    isPinPlacementEnabled: enabled,
                });
            },
            setPinType: (pinType) => {
                set({
                    pinType,
                });
            },
            setRecordingPathEnabled: (enabled) => {
                set({
                    isRecordingPath: enabled,
                });
            },
            setViewerReady: (ready) => {
                set({
                    viewerReady: ready,
                    ...(ready
                        ? {}
                        : {
                              isPinPlacementEnabled: false,
                              isRecordingPath: false,
                          }),
                });
            },
        },
    }));
}

export function getMvpEditorSessionStoreActions(store: MvpEditorSessionStore) {
    return store.getState().actions;
}
