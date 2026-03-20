import { useMemo } from "react";

import { useRenderableSceneDocumentSelector } from "./mvpSceneStoreContext.tsx";
import {
    selectSceneAssetsFromDocument,
    selectSceneCameraViewsFromDocument,
    selectSceneDirectorBriefFromDocument,
    selectSceneDirectorPathFromDocument,
    selectSceneEnvironmentFromDocument,
    selectScenePinsFromDocument,
    selectSceneViewerFromDocument,
} from "./mvpSceneWorkspace.ts";

function jsonValueEqual<T>(previous: T, next: T) {
    return JSON.stringify(previous) === JSON.stringify(next);
}

export function useSceneEnvironmentSlice() {
    return useRenderableSceneDocumentSelector(selectSceneEnvironmentFromDocument, jsonValueEqual);
}

export function useSceneAssetsSlice() {
    return useRenderableSceneDocumentSelector(selectSceneAssetsFromDocument, jsonValueEqual);
}

export function useSceneCameraViewsSlice() {
    return useRenderableSceneDocumentSelector(selectSceneCameraViewsFromDocument, jsonValueEqual);
}

export function useScenePinsSlice() {
    return useRenderableSceneDocumentSelector(selectScenePinsFromDocument, jsonValueEqual);
}

export function useSceneDirectorPathSlice() {
    return useRenderableSceneDocumentSelector(selectSceneDirectorPathFromDocument, jsonValueEqual);
}

export function useSceneDirectorBriefSlice() {
    return useRenderableSceneDocumentSelector(selectSceneDirectorBriefFromDocument, Object.is);
}

export function useSceneViewerSlice() {
    return useRenderableSceneDocumentSelector(selectSceneViewerFromDocument, jsonValueEqual);
}

export function useSceneViewerInteractionSlice() {
    const camera_views = useSceneCameraViewsSlice();
    const pins = useScenePinsSlice();
    const viewer = useSceneViewerSlice();

    return useMemo(
        () => ({
            camera_views,
            pins,
            viewer,
        }),
        [camera_views, pins, viewer],
    );
}
