"use client";

import type { SpatialPinType } from "@/lib/mvp-workspace";

import type { FocusRequest, MvpEditorSessionStoreState } from "./mvpEditorSessionStore.ts";
import { useMvpEditorSessionStoreSelector } from "./mvpEditorSessionStoreContext.tsx";

const selectFocusRequest = (state: MvpEditorSessionStoreState): FocusRequest => state.focusRequest;
const selectCaptureRequestKey = (state: MvpEditorSessionStoreState) => state.captureRequestKey;
const selectIsPinPlacementEnabled = (state: MvpEditorSessionStoreState) => state.isPinPlacementEnabled;
const selectPinType = (state: MvpEditorSessionStoreState): SpatialPinType => state.pinType;
const selectIsRecordingPath = (state: MvpEditorSessionStoreState) => state.isRecordingPath;
const selectViewerReady = (state: MvpEditorSessionStoreState) => state.viewerReady;

export function useEditorSessionFocusRequest() {
    return useMvpEditorSessionStoreSelector(selectFocusRequest, Object.is);
}

export function useEditorSessionCaptureRequestKey() {
    return useMvpEditorSessionStoreSelector(selectCaptureRequestKey, Object.is);
}

export function useEditorSessionPinPlacementEnabled() {
    return useMvpEditorSessionStoreSelector(selectIsPinPlacementEnabled, Object.is);
}

export function useEditorSessionPinType() {
    return useMvpEditorSessionStoreSelector(selectPinType, Object.is);
}

export function useEditorSessionRecordingPath() {
    return useMvpEditorSessionStoreSelector(selectIsRecordingPath, Object.is);
}

export function useEditorSessionViewerReady() {
    return useMvpEditorSessionStoreSelector(selectViewerReady, Object.is);
}
