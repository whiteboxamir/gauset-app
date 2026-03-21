import { normalizeWorkspaceSceneGraph, type WorkspaceSceneGraph } from "../mvp-workspace";
import {
    addRootNode,
    createCameraNodeData,
    createEmptySceneDocumentV2,
    createMeshNodeData,
    createSceneNodeRecord,
    createSplatNodeData,
    ensureReviewRecord,
    sceneDocumentToWorkspaceSceneGraph,
} from "./document";
import type { SceneDocumentV2 } from "./types";

function normalizeRotationTuple(input: unknown) {
    if (!Array.isArray(input)) {
        return undefined;
    }

    const values = input.map((value) => Number(value));
    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
        return [values[0], values[1], values[2], values[3]] as [number, number, number, number];
    }

    if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
        return [values[0], values[1], values[2], 1] as [number, number, number, number];
    }

    return undefined;
}

export function migratePersistedSceneGraphV1ToSceneDocumentV2(
    sceneGraph: WorkspaceSceneGraph | unknown,
): SceneDocumentV2 {
    const normalized = normalizeWorkspaceSceneGraph(sceneGraph);
    let document = createEmptySceneDocumentV2();
    document.direction = {
        cameraViews: normalized.camera_views,
        pins: normalized.pins,
        directorPath: normalized.director_path,
        directorBrief: normalized.director_brief,
    };
    document.viewer = {
        fov: normalized.viewer.fov,
        lens_mm: normalized.viewer.lens_mm,
        activeCameraNodeId: null,
    };
    document.review = ensureReviewRecord(normalized.environment?.id ? String(normalized.environment.id) : null, null);

    if (normalized.environment && typeof normalized.environment === "object") {
        const node = createSceneNodeRecord("splat", {
            name: typeof normalized.environment.sourceLabel === "string" ? normalized.environment.sourceLabel : "Environment",
        });
        document = addRootNode(document, node);
        document.splats[node.id] = createSplatNodeData(node.id, normalized.environment as Record<string, unknown>);
    }

    normalized.assets.forEach((asset, index) => {
        if (!asset || typeof asset !== "object") {
            return;
        }

        const assetRecord = asset as Record<string, unknown>;
        const node = createSceneNodeRecord("mesh", {
            name: typeof assetRecord.name === "string" && assetRecord.name ? assetRecord.name : `Asset ${index + 1}`,
            transform: {
                position: Array.isArray(assetRecord.position) ? (assetRecord.position as [number, number, number]) : undefined,
                rotation: normalizeRotationTuple(assetRecord.rotation),
                scale: Array.isArray(assetRecord.scale) ? (assetRecord.scale as [number, number, number]) : undefined,
            },
        });
        document = addRootNode(document, node);
        document.meshes[node.id] = createMeshNodeData(node.id, assetRecord);
    });

    const viewerCameraNode = createSceneNodeRecord("camera", {
        name: "Viewer Camera",
    });
    document = addRootNode(document, viewerCameraNode);
    document.cameras[viewerCameraNode.id] = createCameraNodeData(viewerCameraNode.id, {
        fov: normalized.viewer.fov,
        lens_mm: normalized.viewer.lens_mm,
        role: "viewer",
    });
    document.viewer.activeCameraNodeId = viewerCameraNode.id;

    return document;
}

export function migrateSceneGraphToSceneDocument(sceneGraph: unknown): SceneDocumentV2 {
    if (sceneGraph && typeof sceneGraph === "object" && (sceneGraph as { version?: unknown }).version === 2) {
        return structuredClone(sceneGraph as SceneDocumentV2);
    }

    if (
        sceneGraph &&
        typeof sceneGraph === "object" &&
        (sceneGraph as { __scene_document_v2?: { version?: unknown } }).__scene_document_v2?.version === 2
    ) {
        return structuredClone((sceneGraph as { __scene_document_v2: SceneDocumentV2 }).__scene_document_v2);
    }

    return migratePersistedSceneGraphV1ToSceneDocumentV2(sceneGraph);
}

export function migrateSceneDocumentToWorkspace(sceneDocument: SceneDocumentV2): WorkspaceSceneGraph {
    return sceneDocumentToWorkspaceSceneGraph(sceneDocument);
}
