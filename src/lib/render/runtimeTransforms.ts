import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { parseQuaternionTuple, parseVector3Tuple } from "../mvp-workspace.ts";
import type { NodeTransformPatch, SceneDocumentV2, SceneNodeId, SceneNodeTransform } from "../scene-graph/types.ts";

export interface SceneNodeRuntimeTransformState {
    nodeId: SceneNodeId;
    parentId: SceneNodeId | null;
    childIds: SceneNodeId[];
    localMatrix: Matrix4;
    worldMatrix: Matrix4;
    parentWorldMatrix: Matrix4 | null;
    effectiveVisible: boolean;
    effectiveLocked: boolean;
    worldTransform: SceneNodeTransform;
}

export function createSceneNodeLocalMatrix(transform: SceneNodeTransform) {
    const position = new Vector3(...parseVector3Tuple(transform.position, [0, 0, 0]));
    const rotation = parseQuaternionTuple(transform.rotation, [0, 0, 0, 1]);
    const quaternion = new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
    const scale = new Vector3(...parseVector3Tuple(transform.scale, [1, 1, 1]));
    return new Matrix4().compose(position, quaternion, scale);
}

export function decomposeSceneNodeMatrix(matrix: Matrix4): SceneNodeTransform {
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion);

    return {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z, 1],
        scale: [scale.x, scale.y, scale.z],
    };
}

export function createNodeTransformPatchFromWorldMatrix(worldMatrix: Matrix4, parentWorldMatrix: Matrix4 | null = null): NodeTransformPatch {
    const localMatrix = parentWorldMatrix ? parentWorldMatrix.clone().invert().multiply(worldMatrix) : worldMatrix.clone();
    return decomposeSceneNodeMatrix(localMatrix);
}

export function sceneNodeMatrixToArray(matrix: Matrix4 | null) {
    return matrix ? Array.from(matrix.elements) : null;
}

function collectSiblingNodeIds(document: SceneDocumentV2, parentId: SceneNodeId | null) {
    if (!parentId) {
        return document.rootIds;
    }

    return document.nodes[parentId]?.childIds ?? [];
}

export function collectSceneNodeRuntimeTransforms(
    document: SceneDocumentV2,
    parentId: SceneNodeId | null = null,
    parentWorldMatrix: Matrix4 | null = null,
    parentVisible = true,
    parentLocked = false,
): SceneNodeRuntimeTransformState[] {
    const projected: SceneNodeRuntimeTransformState[] = [];

    collectSiblingNodeIds(document, parentId).forEach((nodeId) => {
        const node = document.nodes[nodeId];
        if (!node) {
            return;
        }

        const localMatrix = createSceneNodeLocalMatrix(node.transform);
        const worldMatrix = parentWorldMatrix ? parentWorldMatrix.clone().multiply(localMatrix) : localMatrix.clone();
        const effectiveVisible = parentVisible && node.visible !== false;
        const effectiveLocked = parentLocked || node.locked === true;

        projected.push({
            nodeId,
            parentId: node.parentId,
            childIds: [...node.childIds],
            localMatrix,
            worldMatrix,
            parentWorldMatrix: parentWorldMatrix ? parentWorldMatrix.clone() : null,
            effectiveVisible,
            effectiveLocked,
            worldTransform: decomposeSceneNodeMatrix(worldMatrix),
        });

        projected.push(...collectSceneNodeRuntimeTransforms(document, nodeId, worldMatrix, effectiveVisible, effectiveLocked));
    });

    return projected;
}
