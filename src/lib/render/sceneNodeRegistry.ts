import type { WorkspaceSceneGraph } from "../mvp-workspace.ts";
import type { CameraNodeData, LightNodeData, MeshNodeData, SceneDocumentV2, SceneNodeId, SceneNodeKind, SceneNodeRecord, SplatNodeData } from "../scene-graph/types.ts";
import { collectSceneNodeRuntimeTransforms, sceneNodeMatrixToArray } from "./runtimeTransforms.ts";

export interface SceneRuntimeNodeBase {
    nodeId: SceneNodeId;
    kind: SceneNodeKind;
    name: string;
    parentId: SceneNodeId | null;
    childIds: SceneNodeId[];
    visible: boolean;
    locked: boolean;
    effectiveVisible: boolean;
    effectiveLocked: boolean;
    localTransform: SceneNodeRecord["transform"];
    worldTransform: SceneNodeRecord["transform"];
    worldMatrix: number[];
    parentWorldMatrix: number[] | null;
    lifecycleKey: string;
}

export interface SceneRuntimeMeshNode extends SceneRuntimeNodeBase {
    kind: "mesh";
    assetId: string | null;
    instanceId: string;
    meshUrl: string | null;
    textureUrl: string | null;
    previewUrl: string | null;
    metadata: Record<string, unknown>;
}

export interface SceneRuntimeSplatNode extends SceneRuntimeNodeBase {
    kind: "splat";
    sceneId: string | null;
    viewerUrl: string | null;
    splatUrl: string | null;
    camerasUrl: string | null;
    metadataUrl: string | null;
    metadata: Record<string, unknown>;
    environment: WorkspaceSceneGraph["environment"] | null;
}

export interface SceneRuntimeCameraNode extends SceneRuntimeNodeBase {
    kind: "camera";
    camera: CameraNodeData;
}

export interface SceneRuntimeLightNode extends SceneRuntimeNodeBase {
    kind: "light";
    light: LightNodeData;
}

export interface SceneRuntimeGroupNode extends SceneRuntimeNodeBase {
    kind: "group";
}

export type SceneRuntimeNode =
    | SceneRuntimeMeshNode
    | SceneRuntimeSplatNode
    | SceneRuntimeCameraNode
    | SceneRuntimeLightNode
    | SceneRuntimeGroupNode;

export interface SceneNodeRegistry {
    byId: Record<SceneNodeId, SceneRuntimeNode>;
    orderedNodeIds: SceneNodeId[];
    meshNodeIds: SceneNodeId[];
    splatNodeIds: SceneNodeId[];
    cameraNodeIds: SceneNodeId[];
    lightNodeIds: SceneNodeId[];
    groupNodeIds: SceneNodeId[];
    primarySplatNodeId: SceneNodeId | null;
}

export const EMPTY_SCENE_NODE_REGISTRY: SceneNodeRegistry = {
    byId: {},
    orderedNodeIds: [],
    meshNodeIds: [],
    splatNodeIds: [],
    cameraNodeIds: [],
    lightNodeIds: [],
    groupNodeIds: [],
    primarySplatNodeId: null,
};

function readMeshInstanceId(mesh: MeshNodeData) {
    const metadata = mesh.metadata ?? {};
    if (typeof metadata.instanceId === "string" && metadata.instanceId) {
        return metadata.instanceId;
    }
    if (typeof metadata.instance_id === "string" && metadata.instance_id) {
        return metadata.instance_id;
    }
    return mesh.id;
}

function createBaseRuntimeNode(
    node: SceneNodeRecord,
    options: Omit<SceneRuntimeNodeBase, "nodeId" | "kind" | "name" | "parentId" | "childIds" | "visible" | "locked" | "localTransform">,
) {
    return {
        nodeId: node.id,
        kind: node.kind,
        name: node.name,
        parentId: node.parentId,
        childIds: [...node.childIds],
        visible: node.visible !== false,
        locked: node.locked === true,
        localTransform: {
            position: [...node.transform.position] as SceneNodeRecord["transform"]["position"],
            rotation: [...node.transform.rotation] as SceneNodeRecord["transform"]["rotation"],
            scale: [...node.transform.scale] as SceneNodeRecord["transform"]["scale"],
        },
        ...options,
    };
}

function createEnvironmentProjection(node: SceneNodeRecord, splat: SplatNodeData, effectiveVisible: boolean, effectiveLocked: boolean) {
    if (!effectiveVisible) {
        return null;
    }

    const metadataUrls =
        splat.metadata?.urls && typeof splat.metadata.urls === "object" ? (splat.metadata.urls as Record<string, unknown>) : {};

    return {
        ...(splat.metadata ?? {}),
        id: splat.sceneId,
        name: node.name,
        visible: effectiveVisible,
        locked: effectiveLocked,
        urls: {
            ...metadataUrls,
            viewer: splat.viewerUrl,
            splats: splat.splatUrl,
            cameras: splat.camerasUrl,
            metadata: splat.metadataUrl,
        },
    } satisfies WorkspaceSceneGraph["environment"];
}

function createMeshLifecycleKey(mesh: MeshNodeData, instanceId: string) {
    return [
        "mesh",
        instanceId,
        mesh.assetId ?? "",
        mesh.meshUrl ?? "",
        mesh.textureUrl ?? "",
        mesh.previewUrl ?? "",
    ].join("|");
}

function createSplatLifecycleKey(splat: SplatNodeData) {
    return [
        "splat",
        splat.sceneId ?? "",
        splat.viewerUrl ?? "",
        splat.splatUrl ?? "",
        splat.metadataUrl ?? "",
    ].join("|");
}

export function createSceneNodeRegistry(document: SceneDocumentV2): SceneNodeRegistry {
    const byId: Record<SceneNodeId, SceneRuntimeNode> = {};
    const orderedNodeIds: SceneNodeId[] = [];
    const meshNodeIds: SceneNodeId[] = [];
    const splatNodeIds: SceneNodeId[] = [];
    const cameraNodeIds: SceneNodeId[] = [];
    const lightNodeIds: SceneNodeId[] = [];
    const groupNodeIds: SceneNodeId[] = [];

    collectSceneNodeRuntimeTransforms(document).forEach((transformState) => {
        const node = document.nodes[transformState.nodeId];
        if (!node) {
            return;
        }

        const baseNode = createBaseRuntimeNode(node, {
            effectiveVisible: transformState.effectiveVisible,
            effectiveLocked: transformState.effectiveLocked,
            worldTransform: transformState.worldTransform,
            worldMatrix: sceneNodeMatrixToArray(transformState.worldMatrix) ?? [],
            parentWorldMatrix: sceneNodeMatrixToArray(transformState.parentWorldMatrix),
            lifecycleKey: `${node.kind}|${node.id}`,
        });

        let runtimeNode: SceneRuntimeNode | null = null;
        if (node.kind === "mesh") {
            const mesh = document.meshes[node.id];
            if (!mesh) {
                return;
            }
            const instanceId = readMeshInstanceId(mesh);
            runtimeNode = {
                ...baseNode,
                kind: "mesh",
                assetId: mesh.assetId,
                instanceId,
                meshUrl: mesh.meshUrl,
                textureUrl: mesh.textureUrl,
                previewUrl: mesh.previewUrl,
                metadata: { ...(mesh.metadata ?? {}) },
                lifecycleKey: createMeshLifecycleKey(mesh, instanceId),
            };
            meshNodeIds.push(node.id);
        } else if (node.kind === "splat") {
            const splat = document.splats[node.id];
            if (!splat) {
                return;
            }
            runtimeNode = {
                ...baseNode,
                kind: "splat",
                sceneId: splat.sceneId,
                viewerUrl: splat.viewerUrl,
                splatUrl: splat.splatUrl,
                camerasUrl: splat.camerasUrl,
                metadataUrl: splat.metadataUrl,
                metadata: { ...(splat.metadata ?? {}) },
                environment: createEnvironmentProjection(node, splat, transformState.effectiveVisible, transformState.effectiveLocked),
                lifecycleKey: createSplatLifecycleKey(splat),
            };
            splatNodeIds.push(node.id);
        } else if (node.kind === "camera") {
            const camera = document.cameras[node.id];
            if (!camera) {
                return;
            }
            runtimeNode = {
                ...baseNode,
                kind: "camera",
                camera: { ...camera },
                lifecycleKey: ["camera", camera.role, camera.fov, camera.lens_mm, camera.near, camera.far].join("|"),
            };
            cameraNodeIds.push(node.id);
        } else if (node.kind === "light") {
            const light = document.lights[node.id];
            if (!light) {
                return;
            }
            runtimeNode = {
                ...baseNode,
                kind: "light",
                light: { ...light },
                lifecycleKey: ["light", light.lightType, light.intensity, light.color].join("|"),
            };
            lightNodeIds.push(node.id);
        } else if (node.kind === "group") {
            runtimeNode = {
                ...baseNode,
                kind: "group",
                lifecycleKey: "group",
            };
            groupNodeIds.push(node.id);
        }

        if (!runtimeNode) {
            return;
        }

        orderedNodeIds.push(node.id);
        byId[node.id] = runtimeNode;
    });

    const primarySplatNodeId =
        splatNodeIds.find((nodeId) => byId[nodeId]?.kind === "splat" && (byId[nodeId] as SceneRuntimeSplatNode).environment) ?? null;

    return {
        byId,
        orderedNodeIds,
        meshNodeIds,
        splatNodeIds,
        cameraNodeIds,
        lightNodeIds,
        groupNodeIds,
        primarySplatNodeId,
    };
}

export function getPrimarySplatNode(registry: SceneNodeRegistry) {
    const nodeId = registry.primarySplatNodeId;
    if (!nodeId) {
        return null;
    }

    const node = registry.byId[nodeId];
    return node?.kind === "splat" ? node : null;
}
