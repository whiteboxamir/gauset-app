import {
    sceneDocumentToWorkspaceAssets,
    sceneDocumentToWorkspaceEnvironment,
    sceneDocumentToWorkspaceSceneGraph,
} from "../lib/scene-graph/document.ts";
import type { SceneDocumentV2 } from "../lib/scene-graph/types.ts";
import type { WorkspaceSceneGraph } from "../lib/mvp-workspace.ts";

export const selectSceneEnvironmentFromDocument = (document: SceneDocumentV2): WorkspaceSceneGraph["environment"] =>
    sceneDocumentToWorkspaceEnvironment(document);

export const selectSceneAssetsFromDocument = (document: SceneDocumentV2): WorkspaceSceneGraph["assets"] =>
    sceneDocumentToWorkspaceAssets(document);

export const selectSceneCameraViewsFromDocument = (document: SceneDocumentV2) => [...document.direction.cameraViews];

export const selectScenePinsFromDocument = (document: SceneDocumentV2) => [...document.direction.pins];

export const selectSceneDirectorPathFromDocument = (document: SceneDocumentV2) => [...document.direction.directorPath];

export const selectSceneDirectorBriefFromDocument = (document: SceneDocumentV2) => document.direction.directorBrief;

export const selectSceneViewerFromDocument = (document: SceneDocumentV2): WorkspaceSceneGraph["viewer"] => ({
    fov: document.viewer.fov,
    lens_mm: document.viewer.lens_mm,
});

export function selectCompatibilityWorkspaceSceneGraphFromDocument(document: SceneDocumentV2): WorkspaceSceneGraph {
    return sceneDocumentToWorkspaceSceneGraph(document);
}
