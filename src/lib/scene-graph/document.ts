import {
    type CameraPathFrame,
    type CameraView,
    createDefaultReviewRecord,
    createEmptyWorkspaceSceneGraph,
    createId,
    defaultWorldContinuityRecord,
    defaultViewerState,
    normalizeWorldContinuityRecord,
    parseQuaternionTuple,
    parseVector3Tuple,
    type QuaternionTuple,
    type SceneReviewRecord,
    type SpatialPin,
    type WorldContinuityRecord,
    type WorkspaceSceneGraph,
} from "../mvp-workspace.ts";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type {
    CameraNodeData,
    GroupNodeData,
    LightNodeData,
    MeshNodeData,
    NodeTransformPatch,
    SceneDocumentV2,
    SceneNodeId,
    SceneNodeKind,
    SceneNodeRecord,
    SceneNodeTransform,
    SplatNodeData,
    ViewerDocumentState,
} from "./types";

export const SCENE_DOCUMENT_VERSION = 2;

export function createDefaultTransform(): SceneNodeTransform {
    return {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
    };
}

export function createSceneNodeId(kind: SceneNodeKind) {
    return createId(kind);
}

export function createViewerDocumentState(): ViewerDocumentState {
    const viewer = defaultViewerState();
    return {
        ...viewer,
        activeCameraNodeId: null,
    };
}

export function createEmptySceneDocumentV2(review: SceneReviewRecord | null = null): SceneDocumentV2 {
    const workspace = createEmptyWorkspaceSceneGraph();
    return {
        version: SCENE_DOCUMENT_VERSION,
        rootIds: [],
        nodes: {},
        groups: {},
        cameras: {},
        lights: {},
        meshes: {},
        splats: {},
        direction: {
            cameraViews: workspace.camera_views,
            pins: workspace.pins,
            directorPath: workspace.director_path,
            directorBrief: workspace.director_brief,
        },
        continuity: defaultWorldContinuityRecord(),
        review: review ?? null,
        viewer: createViewerDocumentState(),
    };
}

export function cloneSceneDocument(document: SceneDocumentV2): SceneDocumentV2 {
    return structuredClone(document);
}

export function normalizeSceneDocumentDefaults(document: SceneDocumentV2): SceneDocumentV2 {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.continuity = normalizeWorldContinuityRecord((document as { continuity?: unknown }).continuity);
    return nextDocument;
}

export function createGroupNodeRecord(id = createSceneNodeId("group"), name = "Group"): SceneNodeRecord {
    return {
        id,
        kind: "group",
        parentId: null,
        childIds: [],
        name,
        visible: true,
        locked: false,
        transform: createDefaultTransform(),
    };
}

export function createGroupNodeData(id: SceneNodeId): GroupNodeData {
    return { id };
}

function coerceNodeRotation(input: unknown, fallback: QuaternionTuple = [0, 0, 0, 1]): QuaternionTuple {
    if (!Array.isArray(input)) {
        return fallback;
    }

    const values = input.map((value) => Number(value));
    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
        return [values[0], values[1], values[2], values[3]];
    }

    if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
        return [values[0], values[1], values[2], 1];
    }

    return fallback;
}

export function createMeshNodeData(id: SceneNodeId, asset: Record<string, unknown>): MeshNodeData {
    const metadata = { ...asset };
    if (
        !(typeof metadata.instanceId === "string" && metadata.instanceId) &&
        !(typeof metadata.instance_id === "string" && metadata.instance_id)
    ) {
        metadata.instanceId = createId("inst");
    }

    return {
        id,
        assetId: typeof asset.asset_id === "string" ? asset.asset_id : typeof asset.id === "string" ? asset.id : null,
        meshUrl: typeof asset.mesh === "string" ? asset.mesh : null,
        textureUrl: typeof asset.texture === "string" ? asset.texture : null,
        previewUrl: typeof asset.preview === "string" ? asset.preview : null,
        metadata,
    };
}

export function createSplatNodeData(id: SceneNodeId, environment: Record<string, unknown>): SplatNodeData {
    const urls = environment.urls && typeof environment.urls === "object" ? (environment.urls as Record<string, unknown>) : {};
    return {
        id,
        sceneId: typeof environment.id === "string" ? environment.id : null,
        viewerUrl: typeof urls.viewer === "string" ? urls.viewer : null,
        splatUrl: typeof urls.splats === "string" ? urls.splats : null,
        camerasUrl: typeof urls.cameras === "string" ? urls.cameras : null,
        metadataUrl: typeof urls.metadata === "string" ? urls.metadata : null,
        metadata: { ...environment },
    };
}

export function createCameraNodeData(id: SceneNodeId, camera: Partial<CameraNodeData> = {}): CameraNodeData {
    return {
        id,
        fov: Number.isFinite(camera.fov) ? Number(camera.fov) : defaultViewerState().fov,
        lens_mm: Number.isFinite(camera.lens_mm) ? Number(camera.lens_mm) : defaultViewerState().lens_mm,
        near: Number.isFinite(camera.near) ? Number(camera.near) : 0.01,
        far: Number.isFinite(camera.far) ? Number(camera.far) : 500,
        role: camera.role ?? "utility",
    };
}

export function createLightNodeData(id: SceneNodeId, light: Partial<LightNodeData> = {}): LightNodeData {
    return {
        id,
        lightType: light.lightType ?? "directional",
        intensity: Number.isFinite(light.intensity) ? Number(light.intensity) : 1,
        color: typeof light.color === "string" && light.color ? light.color : "#ffffff",
    };
}

export function createSceneNodeRecord(
    kind: SceneNodeKind,
    {
        id = createSceneNodeId(kind),
        name = kind === "splat" ? "Environment" : kind === "mesh" ? "Mesh" : kind === "camera" ? "Camera" : kind === "light" ? "Light" : "Group",
        parentId = null,
        transform,
    }: {
        id?: SceneNodeId;
        name?: string;
        parentId?: SceneNodeId | null;
        transform?: Partial<SceneNodeTransform> | null;
    } = {},
): SceneNodeRecord {
    return {
        id,
        kind,
        parentId,
        childIds: [],
        name,
        visible: true,
        locked: false,
        transform: {
            position: parseVector3Tuple(transform?.position, [0, 0, 0]),
            rotation: parseQuaternionTuple(transform?.rotation, [0, 0, 0, 1]),
            scale: parseVector3Tuple(transform?.scale, [1, 1, 1]),
        },
    };
}

export function addRootNode(document: SceneDocumentV2, node: SceneNodeRecord) {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.rootIds = [...nextDocument.rootIds, node.id];
    nextDocument.nodes[node.id] = node;
    return nextDocument;
}

function getSiblingNodeIds(document: SceneDocumentV2, parentId: SceneNodeId | null) {
    if (!parentId) {
        return document.rootIds;
    }

    return document.nodes[parentId]?.childIds ?? [];
}

function insertNodeIntoDocument(
    document: SceneDocumentV2,
    node: SceneNodeRecord,
    parentId: SceneNodeId | null = null,
    index?: number,
) {
    const nextDocument = cloneSceneDocument(document);
    const nextNode = {
        ...node,
        parentId,
    };
    nextDocument.nodes[nextNode.id] = nextNode;

    if (!parentId) {
        const rootIds = [...nextDocument.rootIds];
        const insertAt = typeof index === "number" ? Math.max(0, Math.min(index, rootIds.length)) : rootIds.length;
        rootIds.splice(insertAt, 0, nextNode.id);
        nextDocument.rootIds = rootIds;
        return nextDocument;
    }

    const parentNode = nextDocument.nodes[parentId];
    if (!parentNode || parentNode.kind !== "group") {
        nextDocument.rootIds = [...nextDocument.rootIds, nextNode.id];
        nextDocument.nodes[nextNode.id] = {
            ...nextNode,
            parentId: null,
        };
        return nextDocument;
    }

    const childIds = [...parentNode.childIds];
    const insertAt = typeof index === "number" ? Math.max(0, Math.min(index, childIds.length)) : childIds.length;
    childIds.splice(insertAt, 0, nextNode.id);
    nextDocument.nodes[parentId] = {
        ...parentNode,
        childIds,
    };
    return nextDocument;
}

function detachNodeFromDocument(document: SceneDocumentV2, nodeId: SceneNodeId) {
    const node = document.nodes[nodeId];
    if (!node) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    if (!node.parentId) {
        nextDocument.rootIds = nextDocument.rootIds.filter((rootId) => rootId !== nodeId);
        return nextDocument;
    }

    const parentNode = nextDocument.nodes[node.parentId];
    if (!parentNode) {
        return nextDocument;
    }

    nextDocument.nodes[node.parentId] = {
        ...parentNode,
        childIds: parentNode.childIds.filter((childId) => childId !== nodeId),
    };
    return nextDocument;
}

export function collectSceneNodeIdsDepthFirst(document: SceneDocumentV2, parentId: SceneNodeId | null = null): SceneNodeId[] {
    const ordered: SceneNodeId[] = [];
    const siblingIds = getSiblingNodeIds(document, parentId);

    const visit = (nodeId: SceneNodeId) => {
        const node = document.nodes[nodeId];
        if (!node) {
            return;
        }

        ordered.push(nodeId);
        node.childIds.forEach((childId) => visit(childId));
    };

    siblingIds.forEach((nodeId) => visit(nodeId));
    return ordered;
}

function collectSceneNodeSubtreeIds(document: SceneDocumentV2, nodeId: SceneNodeId): SceneNodeId[] {
    const ordered: SceneNodeId[] = [];

    const visit = (nextNodeId: SceneNodeId) => {
        const node = document.nodes[nextNodeId];
        if (!node) {
            return;
        }

        ordered.push(nextNodeId);
        node.childIds.forEach((childId) => visit(childId));
    };

    visit(nodeId);
    return ordered;
}

function isSceneNodeDescendant(document: SceneDocumentV2, nodeId: SceneNodeId, potentialAncestorId: SceneNodeId) {
    const node = document.nodes[nodeId];
    if (!node) {
        return false;
    }

    let currentParentId = node.parentId;
    while (currentParentId) {
        if (currentParentId === potentialAncestorId) {
            return true;
        }
        currentParentId = document.nodes[currentParentId]?.parentId ?? null;
    }

    return false;
}

export function upsertNodeTransform(
    document: SceneDocumentV2,
    nodeId: SceneNodeId,
    patch: NodeTransformPatch,
): SceneDocumentV2 {
    const existingNode = document.nodes[nodeId];
    if (!existingNode) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.nodes[nodeId] = {
        ...existingNode,
        transform: {
            position: patch.position ? parseVector3Tuple(patch.position, existingNode.transform.position) : existingNode.transform.position,
            rotation: patch.rotation ? parseQuaternionTuple(patch.rotation, existingNode.transform.rotation) : existingNode.transform.rotation,
            scale: patch.scale ? parseVector3Tuple(patch.scale, existingNode.transform.scale) : existingNode.transform.scale,
        },
    };
    return nextDocument;
}

export function applyDraftTransformsToSceneDocument(
    document: SceneDocumentV2,
    draftTransforms: Record<SceneNodeId, SceneNodeTransform | undefined>,
): SceneDocumentV2 {
    const entries = Object.entries(draftTransforms).filter(([, value]) => Boolean(value)) as Array<[SceneNodeId, SceneNodeTransform]>;
    if (entries.length === 0) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    entries.forEach(([nodeId, transform]) => {
        const existingNode = nextDocument.nodes[nodeId];
        if (!existingNode) {
            return;
        }
        nextDocument.nodes[nodeId] = {
            ...existingNode,
            transform,
        };
    });
    return nextDocument;
}

export function findMeshNodeIdByInstanceId(document: SceneDocumentV2, instanceId: string): SceneNodeId | null {
    if (!instanceId) {
        return null;
    }

    for (const [nodeId, mesh] of Object.entries(document.meshes)) {
        const metadata = mesh?.metadata ?? {};
        if (metadata.instanceId === instanceId || metadata.instance_id === instanceId) {
            return nodeId;
        }
    }

    return null;
}

export function appendMeshAssetToSceneDocument(document: SceneDocumentV2, asset: Record<string, unknown>): SceneDocumentV2 {
    const position = Array.isArray(asset.position) ? parseVector3Tuple(asset.position, [0, 0, 0]) : undefined;
    const scale = Array.isArray(asset.scale) ? parseVector3Tuple(asset.scale, [1, 1, 1]) : undefined;
    const node = createSceneNodeRecord("mesh", {
        name: typeof asset.name === "string" && asset.name ? asset.name : "Asset",
        transform: {
            position,
            rotation: coerceNodeRotation(asset.rotation),
            scale,
        },
    });

    const nextDocument = addRootNode(document, node);
    nextDocument.meshes[node.id] = createMeshNodeData(node.id, asset);
    return nextDocument;
}

export function appendGroupNodeToSceneDocument(
    document: SceneDocumentV2,
    options: {
        name?: string;
        parentId?: SceneNodeId | null;
    } = {},
) {
    const node = createSceneNodeRecord("group", {
        name: options.name ?? "Group",
        parentId: options.parentId ?? null,
    });
    const nextDocument = insertNodeIntoDocument(document, node, options.parentId ?? null);
    nextDocument.groups[node.id] = createGroupNodeData(node.id);
    return nextDocument;
}

export function appendCameraNodeToSceneDocument(
    document: SceneDocumentV2,
    options: {
        name?: string;
        parentId?: SceneNodeId | null;
        camera?: Partial<CameraNodeData>;
    } = {},
) {
    const node = createSceneNodeRecord("camera", {
        name: options.name ?? "Camera",
        parentId: options.parentId ?? null,
    });
    const nextDocument = insertNodeIntoDocument(document, node, options.parentId ?? null);
    nextDocument.cameras[node.id] = createCameraNodeData(node.id, options.camera);
    return nextDocument;
}

export function appendLightNodeToSceneDocument(
    document: SceneDocumentV2,
    options: {
        name?: string;
        parentId?: SceneNodeId | null;
        light?: Partial<LightNodeData>;
    } = {},
) {
    const node = createSceneNodeRecord("light", {
        name: options.name ?? "Light",
        parentId: options.parentId ?? null,
    });
    const nextDocument = insertNodeIntoDocument(document, node, options.parentId ?? null);
    nextDocument.lights[node.id] = createLightNodeData(node.id, options.light);
    return nextDocument;
}

export function renameSceneNode(document: SceneDocumentV2, nodeId: SceneNodeId, name: string): SceneDocumentV2 {
    const node = document.nodes[nodeId];
    const nextName = name.trim();
    if (!node || !nextName || node.name === nextName) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.nodes[nodeId] = {
        ...node,
        name: nextName,
    };
    return nextDocument;
}

export function setSceneNodeVisibility(document: SceneDocumentV2, nodeId: SceneNodeId, visible: boolean): SceneDocumentV2 {
    const node = document.nodes[nodeId];
    if (!node || node.visible === visible) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.nodes[nodeId] = {
        ...node,
        visible,
    };
    return nextDocument;
}

export function setSceneNodeLocked(document: SceneDocumentV2, nodeId: SceneNodeId, locked: boolean): SceneDocumentV2 {
    const node = document.nodes[nodeId];
    if (!node || node.locked === locked) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.nodes[nodeId] = {
        ...node,
        locked,
    };
    return nextDocument;
}

export function removeSceneNodeFromSceneDocument(document: SceneDocumentV2, nodeId: SceneNodeId): SceneDocumentV2 {
    const node = document.nodes[nodeId];
    if (!node) {
        return document;
    }

    const nextDocument = detachNodeFromDocument(document, nodeId);
    const subtreeIds = collectSceneNodeSubtreeIds(nextDocument, nodeId);
    subtreeIds.forEach((subtreeNodeId) => {
        delete nextDocument.nodes[subtreeNodeId];
        delete nextDocument.groups[subtreeNodeId];
        delete nextDocument.cameras[subtreeNodeId];
        delete nextDocument.lights[subtreeNodeId];
        delete nextDocument.meshes[subtreeNodeId];
        delete nextDocument.splats[subtreeNodeId];
    });

    if (nextDocument.viewer.activeCameraNodeId && subtreeIds.includes(nextDocument.viewer.activeCameraNodeId)) {
        nextDocument.viewer.activeCameraNodeId = null;
    }

    return nextDocument;
}

export function reparentSceneNode(
    document: SceneDocumentV2,
    nodeId: SceneNodeId,
    parentId: SceneNodeId | null,
    index?: number,
): SceneDocumentV2 {
    const node = document.nodes[nodeId];
    if (!node) {
        return document;
    }

    if (parentId === nodeId) {
        return document;
    }

    if (parentId && document.nodes[parentId]?.kind !== "group") {
        return document;
    }

    if (parentId && isSceneNodeDescendant(document, parentId, nodeId)) {
        return document;
    }

    if (node.parentId === parentId) {
        const siblingIds = getSiblingNodeIds(document, parentId);
        if (typeof index !== "number" || siblingIds[index] === nodeId) {
            return document;
        }
    }

    const detachedDocument = detachNodeFromDocument(document, nodeId);
    const nextDocument = insertNodeIntoDocument(
        detachedDocument,
        {
            ...detachedDocument.nodes[nodeId],
            parentId,
        },
        parentId,
        index,
    );
    return nextDocument;
}

export function patchCameraNodeData(
    document: SceneDocumentV2,
    nodeId: SceneNodeId,
    patch: Partial<Omit<CameraNodeData, "id">>,
): SceneDocumentV2 {
    const camera = document.cameras[nodeId];
    if (!camera) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.cameras[nodeId] = {
        ...camera,
        ...patch,
    };
    return nextDocument;
}

export function patchLightNodeData(
    document: SceneDocumentV2,
    nodeId: SceneNodeId,
    patch: Partial<Omit<LightNodeData, "id">>,
): SceneDocumentV2 {
    const light = document.lights[nodeId];
    if (!light) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.lights[nodeId] = {
        ...light,
        ...patch,
    };
    return nextDocument;
}

export function appendPinToSceneDocument(document: SceneDocumentV2, pin: SpatialPin): SceneDocumentV2 {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.pins = [...nextDocument.direction.pins, pin];
    return nextDocument;
}

export function removePinFromSceneDocument(document: SceneDocumentV2, pinId: string): SceneDocumentV2 {
    if (!document.direction.pins.some((pin) => pin.id === pinId)) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.pins = nextDocument.direction.pins.filter((pin) => pin.id !== pinId);
    return nextDocument;
}

export function appendCameraViewToSceneDocument(document: SceneDocumentV2, view: CameraView): SceneDocumentV2 {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.cameraViews = [...nextDocument.direction.cameraViews, view];
    return nextDocument;
}

export function removeCameraViewFromSceneDocument(document: SceneDocumentV2, viewId: string): SceneDocumentV2 {
    if (!document.direction.cameraViews.some((view) => view.id === viewId)) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.cameraViews = nextDocument.direction.cameraViews.filter((view) => view.id !== viewId);
    return nextDocument;
}

export function setDirectorPathOnSceneDocument(document: SceneDocumentV2, path: CameraPathFrame[]): SceneDocumentV2 {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.directorPath = [...path];
    return nextDocument;
}

export function setDirectorBriefOnSceneDocument(document: SceneDocumentV2, directorBrief: string): SceneDocumentV2 {
    if (document.direction.directorBrief === directorBrief) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.direction.directorBrief = directorBrief;
    return nextDocument;
}

export function patchSceneContinuityOnSceneDocument(document: SceneDocumentV2, patch: Partial<WorldContinuityRecord>): SceneDocumentV2 {
    const currentContinuity = normalizeWorldContinuityRecord((document as { continuity?: unknown }).continuity);
    const nextContinuity = {
        ...currentContinuity,
        ...patch,
    };

    if (
        nextContinuity.worldBible === currentContinuity.worldBible &&
        nextContinuity.castContinuity === currentContinuity.castContinuity &&
        nextContinuity.lookDevelopment === currentContinuity.lookDevelopment &&
        nextContinuity.shotPlan === currentContinuity.shotPlan
    ) {
        return document;
    }

    const nextDocument = cloneSceneDocument(document);
    nextDocument.continuity = nextContinuity;
    return nextDocument;
}

export function replaceEnvironmentOnSceneDocument(
    document: SceneDocumentV2,
    environment: Record<string, unknown> | null,
): SceneDocumentV2 {
    const environmentNodeId = findRootNodeIdByKind(document, "splat");

    if (!environment || typeof environment !== "object") {
        if (!environmentNodeId) {
            return document;
        }

        const nextDocument = cloneSceneDocument(document);
        nextDocument.rootIds = nextDocument.rootIds.filter((nodeId) => nodeId !== environmentNodeId);
        delete nextDocument.nodes[environmentNodeId];
        delete nextDocument.splats[environmentNodeId];
        return nextDocument;
    }

    const targetNodeId = environmentNodeId ?? createSceneNodeId("splat");
    const nextDocument = cloneSceneDocument(document);
    if (!environmentNodeId) {
        nextDocument.rootIds = [...nextDocument.rootIds, targetNodeId];
    }
    nextDocument.nodes[targetNodeId] = createSceneNodeRecord("splat", {
        id: targetNodeId,
        name:
            typeof environment.sourceLabel === "string" && environment.sourceLabel
                ? String(environment.sourceLabel)
                : "Environment",
    });
    nextDocument.splats[targetNodeId] = createSplatNodeData(targetNodeId, environment);
    return nextDocument;
}

export function patchViewerState(document: SceneDocumentV2, patch: Partial<ViewerDocumentState>): SceneDocumentV2 {
    const nextDocument = cloneSceneDocument(document);
    nextDocument.viewer = {
        ...nextDocument.viewer,
        ...patch,
    };
    return nextDocument;
}

function findRootNodeIdByKind(document: SceneDocumentV2, kind: SceneNodeKind): SceneNodeId | null {
    return document.rootIds.find((nodeId) => document.nodes[nodeId]?.kind === kind) ?? null;
}

function findSceneNodeIdByKind(document: SceneDocumentV2, kind: SceneNodeKind): SceneNodeId | null {
    return collectSceneNodeIdsDepthFirst(document).find((nodeId) => document.nodes[nodeId]?.kind === kind) ?? null;
}

function readAssetInstanceId(asset: Record<string, unknown>) {
    if (typeof asset.instanceId === "string" && asset.instanceId) {
        return asset.instanceId;
    }
    if (typeof asset.instance_id === "string" && asset.instance_id) {
        return asset.instance_id;
    }
    return null;
}

function readMeshAssetMatchKeys(mesh: MeshNodeData) {
    const metadata = mesh.metadata ?? {};
    return {
        instanceId:
            typeof metadata.instanceId === "string" && metadata.instanceId
                ? metadata.instanceId
                : typeof metadata.instance_id === "string" && metadata.instance_id
                  ? metadata.instance_id
                  : null,
        assetId:
            typeof mesh.assetId === "string" && mesh.assetId
                ? mesh.assetId
                : typeof metadata.id === "string" && metadata.id
                  ? metadata.id
                  : null,
    };
}

function mergeSceneRecordWithUrls(
    current: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const currentUrls = current?.urls && typeof current.urls === "object" ? (current.urls as Record<string, unknown>) : null;
    const incomingUrls = incoming.urls && typeof incoming.urls === "object" ? (incoming.urls as Record<string, unknown>) : null;

    return {
        ...(current ?? {}),
        ...incoming,
        ...(currentUrls || incomingUrls
            ? {
                  urls: {
                      ...(currentUrls ?? {}),
                      ...(incomingUrls ?? {}),
                  },
              }
            : {}),
    };
}

function createSceneNodeMatrix(transform: SceneNodeTransform) {
    const position = new Vector3(...parseVector3Tuple(transform.position, [0, 0, 0]));
    const rotation = parseVector3Tuple(transform.rotation, [0, 0, 0]);
    const quaternion = new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
    const scale = new Vector3(...parseVector3Tuple(transform.scale, [1, 1, 1]));
    return new Matrix4().compose(position, quaternion, scale);
}

function decomposeSceneNodeMatrix(matrix: Matrix4) {
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion);

    return {
        position: [position.x, position.y, position.z] as [number, number, number],
        rotation: [rotation.x, rotation.y, rotation.z] as [number, number, number],
        scale: [scale.x, scale.y, scale.z] as [number, number, number],
    };
}

interface ProjectedSceneNodeState {
    nodeId: SceneNodeId;
    node: SceneNodeRecord;
    worldMatrix: Matrix4;
    parentWorldMatrix: Matrix4 | null;
    effectiveVisible: boolean;
    effectiveLocked: boolean;
}

function collectProjectedSceneNodes(
    document: SceneDocumentV2,
    parentId: SceneNodeId | null = null,
    parentWorldMatrix: Matrix4 | null = null,
    parentVisible = true,
    parentLocked = false,
): ProjectedSceneNodeState[] {
    const projected: ProjectedSceneNodeState[] = [];

    getSiblingNodeIds(document, parentId).forEach((nodeId) => {
        const node = document.nodes[nodeId];
        if (!node) {
            return;
        }

        const worldMatrix = parentWorldMatrix
            ? parentWorldMatrix.clone().multiply(createSceneNodeMatrix(node.transform))
            : createSceneNodeMatrix(node.transform);
        const effectiveVisible = parentVisible && node.visible !== false;
        const effectiveLocked = parentLocked || node.locked === true;

        projected.push({
            nodeId,
            node,
            worldMatrix,
            parentWorldMatrix: parentWorldMatrix ? parentWorldMatrix.clone() : null,
            effectiveVisible,
            effectiveLocked,
        });

        projected.push(...collectProjectedSceneNodes(document, nodeId, worldMatrix, effectiveVisible, effectiveLocked));
    });

    return projected;
}

function createWorkspaceAssetFromMeshNode(document: SceneDocumentV2, nodeId: SceneNodeId, instanceIdOverride?: string) {
    const node = document.nodes[nodeId];
    const mesh = document.meshes[nodeId];
    if (!node || !mesh) {
        return null;
    }

    const metadata = mesh.metadata ?? {};
    const rotation = node.transform.rotation;
    return {
        ...metadata,
        asset_id: mesh.assetId ?? (typeof metadata.id === "string" ? metadata.id : nodeId),
        id: mesh.assetId ?? (typeof metadata.id === "string" ? metadata.id : nodeId),
        mesh: mesh.meshUrl ?? null,
        texture: mesh.textureUrl ?? null,
        preview: mesh.previewUrl ?? null,
        instanceId:
            instanceIdOverride ??
            (typeof metadata.instanceId === "string" && metadata.instanceId
                ? metadata.instanceId
                : typeof metadata.instance_id === "string" && metadata.instance_id
                  ? metadata.instance_id
                  : createId("inst")),
        position: [...node.transform.position],
        rotation: [rotation[0], rotation[1], rotation[2]],
        scale: [...node.transform.scale],
    };
}

export function removeMeshAssetFromSceneDocument(document: SceneDocumentV2, instanceId: string): SceneDocumentV2 {
    const nodeId = findMeshNodeIdByInstanceId(document, instanceId);
    if (!nodeId) {
        return document;
    }

    return removeSceneNodeFromSceneDocument(document, nodeId);
}

export function duplicateMeshAssetInSceneDocument(
    document: SceneDocumentV2,
    instanceId: string,
    offset: [number, number, number] = [0.75, 0, 0.75],
): SceneDocumentV2 {
    const nodeId = findMeshNodeIdByInstanceId(document, instanceId);
    if (!nodeId) {
        return document;
    }

    const nextAsset = createWorkspaceAssetFromMeshNode(document, nodeId, createId("inst"));
    if (!nextAsset) {
        return document;
    }

    const nextPosition = Array.isArray(nextAsset.position) ? nextAsset.position : [0, 0, 0];
    nextAsset.position = [
        Number(nextPosition[0] ?? 0) + offset[0],
        Number(nextPosition[1] ?? 0) + offset[1],
        Number(nextPosition[2] ?? 0) + offset[2],
    ];

    return appendMeshAssetToSceneDocument(document, nextAsset);
}

function createMeshTransformFromAsset(asset: Record<string, unknown>): SceneNodeTransform {
    return {
        position: parseVector3Tuple(asset.position, [0, 0, 0]),
        rotation: coerceNodeRotation(asset.rotation),
        scale: parseVector3Tuple(asset.scale, [1, 1, 1]),
    };
}

export function mergeWorkspaceSceneGraphIntoSceneDocument(
    document: SceneDocumentV2,
    workspace: WorkspaceSceneGraph,
): SceneDocumentV2 {
    let nextDocument = cloneSceneDocument(document);
    const workspaceEnvironment =
        workspace.environment && typeof workspace.environment === "object"
            ? (workspace.environment as Record<string, unknown>)
            : null;

    if (workspaceEnvironment) {
        const environmentNodeId = findSceneNodeIdByKind(nextDocument, "splat");
        if (environmentNodeId) {
            const currentNode = nextDocument.nodes[environmentNodeId];
            const currentSplat = nextDocument.splats[environmentNodeId];
            const mergedEnvironment = mergeSceneRecordWithUrls(currentSplat?.metadata, workspaceEnvironment);
            nextDocument.nodes[environmentNodeId] = {
                ...currentNode,
                name:
                    typeof workspaceEnvironment.name === "string" && workspaceEnvironment.name
                        ? workspaceEnvironment.name
                        : typeof workspaceEnvironment.sourceLabel === "string" && workspaceEnvironment.sourceLabel
                          ? workspaceEnvironment.sourceLabel
                          : currentNode?.name ?? "Environment",
            };
            nextDocument.splats[environmentNodeId] = createSplatNodeData(environmentNodeId, mergedEnvironment);
        } else {
            nextDocument = replaceEnvironmentOnSceneDocument(nextDocument, workspaceEnvironment);
        }
    }

    const existingMeshNodeIds = collectSceneNodeIdsDepthFirst(nextDocument).filter((nodeId) => nextDocument.nodes[nodeId]?.kind === "mesh");
    const usedMeshNodeIds = new Set<SceneNodeId>();

    workspace.assets.forEach((asset) => {
        const assetRecord = asset as Record<string, unknown>;
        const assetInstanceId = readAssetInstanceId(assetRecord);
        const assetId =
            typeof assetRecord.asset_id === "string" && assetRecord.asset_id
                ? assetRecord.asset_id
                : typeof assetRecord.id === "string" && assetRecord.id
                  ? assetRecord.id
                  : null;

        const matchedNodeId =
            existingMeshNodeIds.find((nodeId) => {
                if (usedMeshNodeIds.has(nodeId)) {
                    return false;
                }
                const keys = readMeshAssetMatchKeys(nextDocument.meshes[nodeId]);
                return (assetInstanceId && keys.instanceId === assetInstanceId) || (assetId && keys.assetId === assetId);
            }) ?? null;
        if (matchedNodeId) {
            usedMeshNodeIds.add(matchedNodeId);
            nextDocument.meshes[matchedNodeId] = createMeshNodeData(
                matchedNodeId,
                mergeSceneRecordWithUrls(nextDocument.meshes[matchedNodeId]?.metadata, assetRecord),
            );
            return;
        }

        const node = createSceneNodeRecord("mesh", {
            name: typeof assetRecord.name === "string" && assetRecord.name ? assetRecord.name : "Asset",
            transform: createMeshTransformFromAsset(assetRecord),
        });
        nextDocument = insertNodeIntoDocument(nextDocument, node);
        nextDocument.meshes[node.id] = createMeshNodeData(node.id, assetRecord);
    });

    return nextDocument;
}

export function ensureReviewRecord(sceneId?: string | null, review?: SceneReviewRecord | null) {
    return review ?? createDefaultReviewRecord(sceneId);
}

export function sceneDocumentToWorkspaceEnvironment(document: SceneDocumentV2) {
    const environmentProjection = collectProjectedSceneNodes(document).find(({ node }) => node.kind === "splat") ?? null;
    const environmentNodeId = environmentProjection?.nodeId ?? null;
    const environmentNode = environmentNodeId ? document.splats[environmentNodeId] : null;
    const node = environmentProjection?.node ?? null;
    const metadataUrls =
        environmentNode?.metadata?.urls && typeof environmentNode.metadata.urls === "object"
            ? (environmentNode.metadata.urls as Record<string, unknown>)
            : {};
    return environmentNode && environmentProjection?.effectiveVisible !== false
        ? {
              ...(environmentNode.metadata ?? {}),
              id: environmentNode.sceneId,
              name: node?.name ?? "Environment",
              visible: environmentProjection?.effectiveVisible ?? true,
              locked: environmentProjection?.effectiveLocked ?? false,
              urls: {
                  ...metadataUrls,
                  viewer: environmentNode.viewerUrl,
                  splats: environmentNode.splatUrl,
                  cameras: environmentNode.camerasUrl,
                  metadata: environmentNode.metadataUrl,
              },
          }
        : null;
}

export function sceneDocumentToWorkspaceAssets(document: SceneDocumentV2) {
    return collectProjectedSceneNodes(document).flatMap(({ nodeId, node, worldMatrix, parentWorldMatrix, effectiveVisible, effectiveLocked }) => {
        if (node.kind !== "mesh" || !effectiveVisible) {
            return [];
        }
        const mesh = document.meshes[nodeId];
        const worldTransform = decomposeSceneNodeMatrix(worldMatrix);
        return [{
            ...(mesh?.metadata ?? {}),
            asset_id: mesh?.assetId ?? nodeId,
            id: mesh?.assetId ?? nodeId,
            mesh: mesh?.meshUrl ?? null,
            texture: mesh?.textureUrl ?? null,
            preview: mesh?.previewUrl ?? null,
            name: node.name ?? (mesh?.assetId ?? nodeId),
            visible: effectiveVisible,
            locked: effectiveLocked,
            position: worldTransform.position,
            rotation: worldTransform.rotation,
            scale: worldTransform.scale,
            parentWorldMatrix: parentWorldMatrix ? Array.from(parentWorldMatrix.elements) : null,
        }];
    });
}

export function sceneDocumentToWorkspaceSceneGraph(document: SceneDocumentV2): WorkspaceSceneGraph {
    return {
        environment: sceneDocumentToWorkspaceEnvironment(document),
        assets: sceneDocumentToWorkspaceAssets(document),
        camera_views: [...document.direction.cameraViews],
        pins: [...document.direction.pins],
        director_path: [...document.direction.directorPath],
        director_brief: document.direction.directorBrief,
        viewer: {
            fov: document.viewer.fov,
            lens_mm: document.viewer.lens_mm,
        },
    };
}
