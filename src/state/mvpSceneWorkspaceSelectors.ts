import {
    sceneDocumentToWorkspaceAssets,
    sceneDocumentToWorkspaceEnvironment,
} from "../lib/scene-graph/document.ts";
import type { SceneDocumentV2 } from "../lib/scene-graph/types.ts";
import type { WorkspaceSceneGraph } from "../lib/mvp-workspace.ts";
import { useRenderableSceneDocumentSelector } from "./mvpSceneStoreContext.tsx";

function jsonValueEqual<T>(previous: T, next: T) {
    return JSON.stringify(previous) === JSON.stringify(next);
}

const selectAssets = (document: SceneDocumentV2): WorkspaceSceneGraph["assets"] => sceneDocumentToWorkspaceAssets(document);
const selectEnvironment = (document: SceneDocumentV2): WorkspaceSceneGraph["environment"] => sceneDocumentToWorkspaceEnvironment(document);
const selectCameraViews = (document: SceneDocumentV2) => [...document.direction.cameraViews];
const selectPins = (document: SceneDocumentV2) => [...document.direction.pins];
const selectDirectorPath = (document: SceneDocumentV2) => [...document.direction.directorPath];
const selectDirectorBrief = (document: SceneDocumentV2) => document.direction.directorBrief;
const selectViewer = (document: SceneDocumentV2): WorkspaceSceneGraph["viewer"] => ({
    fov: document.viewer.fov,
    lens_mm: document.viewer.lens_mm,
});

export function useSceneEnvironmentSlice() {
    return useRenderableSceneDocumentSelector(selectEnvironment, jsonValueEqual);
}

export function useSceneAssetsSlice() {
    return useRenderableSceneDocumentSelector(selectAssets, jsonValueEqual);
}

export function useSceneCameraViewsSlice() {
    return useRenderableSceneDocumentSelector(selectCameraViews, jsonValueEqual);
}

export function useScenePinsSlice() {
    return useRenderableSceneDocumentSelector(selectPins, jsonValueEqual);
}

export function useSceneDirectorPathSlice() {
    return useRenderableSceneDocumentSelector(selectDirectorPath, jsonValueEqual);
}

export function useSceneDirectorBriefSlice() {
    return useRenderableSceneDocumentSelector(selectDirectorBrief, Object.is);
}

export function useSceneViewerSlice() {
    return useRenderableSceneDocumentSelector(selectViewer, jsonValueEqual);
}
