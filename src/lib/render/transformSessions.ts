import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import type { SceneRuntimeNode } from "./sceneNodeRegistry.ts";
import { createNodeTransformPatchFromWorldMatrix, createSceneNodeLocalMatrix } from "./runtimeTransforms.ts";
import type { NodeTransformPatch, SceneNodeId, SceneNodeTransform, SceneToolMode } from "../scene-graph/types.ts";

export type SceneTransformSpace = "world" | "local";
export type SceneTransformMode = Exclude<SceneToolMode, "select">;

export interface SceneTransformSnapSettings {
    enabled: boolean;
    translate: number;
    rotate: number;
    scale: number;
}

export interface SceneTransformSessionNodeState {
    nodeId: SceneNodeId;
    initialLocalTransform: SceneNodeTransform;
    initialWorldMatrix: number[];
    parentWorldMatrix: number[] | null;
}

export interface SceneTransformSessionState {
    id: number;
    mode: SceneTransformMode;
    space: SceneTransformSpace;
    nodeIds: SceneNodeId[];
    anchorWorldMatrix: number[];
    nodes: Record<SceneNodeId, SceneTransformSessionNodeState>;
}

export const DEFAULT_TRANSFORM_SNAP_SETTINGS: SceneTransformSnapSettings = {
    enabled: false,
    translate: 0.5,
    rotate: Math.PI / 12,
    scale: 0.1,
};

const SNAP_VALUE_PRESETS: Record<SceneTransformMode, number[]> = {
    translate: [0.1, 0.25, 0.5, 1],
    rotate: [Math.PI / 36, Math.PI / 12, Math.PI / 4],
    scale: [0.05, 0.1, 0.25],
};

export function isTransformToolMode(tool: SceneToolMode): tool is SceneTransformMode {
    return tool === "translate" || tool === "rotate" || tool === "scale";
}

export function isTransformableSceneRuntimeNode(node: SceneRuntimeNode | null | undefined) {
    return Boolean(node && node.kind !== "splat");
}

export function createMatrixFromArray(values: number[] | null | undefined) {
    if (!Array.isArray(values) || values.length !== 16) {
        return null;
    }

    return new Matrix4().fromArray(values);
}

function quantizeValue(value: number, step: number) {
    if (!Number.isFinite(step) || step <= 0) {
        return value;
    }

    return Math.round(value / step) * step;
}

export function getTransformSnapValueForMode(settings: SceneTransformSnapSettings, mode: SceneTransformMode) {
    if (mode === "translate") {
        return settings.translate;
    }
    if (mode === "rotate") {
        return settings.rotate;
    }
    return settings.scale;
}

export function cycleTransformSnapValue(mode: SceneTransformMode, currentValue: number) {
    const presets = SNAP_VALUE_PRESETS[mode];
    const currentIndex = presets.findIndex((value) => Math.abs(value - currentValue) <= 1e-6);
    return presets[(currentIndex + 1 + presets.length) % presets.length];
}

export function quantizeTransformPatchForMode(
    patch: NodeTransformPatch,
    mode: SceneTransformMode,
    snapSettings: SceneTransformSnapSettings,
): NodeTransformPatch {
    if (!snapSettings.enabled) {
        return patch;
    }

    if (mode === "translate" && patch.position) {
        return {
            ...patch,
            position: patch.position.map((value) => quantizeValue(value, snapSettings.translate)) as SceneNodeTransform["position"],
        };
    }

    if (mode === "rotate" && patch.rotation) {
        return {
            ...patch,
            rotation: [
                quantizeValue(patch.rotation[0] ?? 0, snapSettings.rotate),
                quantizeValue(patch.rotation[1] ?? 0, snapSettings.rotate),
                quantizeValue(patch.rotation[2] ?? 0, snapSettings.rotate),
                1,
            ],
        };
    }

    if (mode === "scale" && patch.scale) {
        return {
            ...patch,
            scale: patch.scale.map((value) => quantizeValue(value, snapSettings.scale)) as SceneNodeTransform["scale"],
        };
    }

    return patch;
}

export function createSelectionTransformControlMatrix(nodes: SceneRuntimeNode[], space: SceneTransformSpace) {
    const transformableNodes = nodes.filter(isTransformableSceneRuntimeNode);
    const anchorMatrix = new Matrix4();
    if (transformableNodes.length === 0) {
        return anchorMatrix.identity();
    }

    const center = transformableNodes.reduce(
        (accumulator, node) => {
            accumulator.add(new Vector3(...node.worldTransform.position));
            return accumulator;
        },
        new Vector3(),
    );
    center.multiplyScalar(1 / transformableNodes.length);

    const quaternion = new Quaternion();
    if (space === "local") {
        const primaryNode = transformableNodes[0];
        const rotation = primaryNode?.worldTransform.rotation ?? [0, 0, 0, 1];
        quaternion.setFromEuler(new Euler(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0));
    } else {
        quaternion.identity();
    }

    return anchorMatrix.compose(center, quaternion, new Vector3(1, 1, 1));
}

export function createTransformSessionNodeState(node: SceneRuntimeNode): SceneTransformSessionNodeState | null {
    if (!isTransformableSceneRuntimeNode(node)) {
        return null;
    }

    return {
        nodeId: node.nodeId,
        initialLocalTransform: {
            position: [...node.localTransform.position],
            rotation: [...node.localTransform.rotation],
            scale: [...node.localTransform.scale],
        },
        initialWorldMatrix: [...node.worldMatrix],
        parentWorldMatrix: node.parentWorldMatrix ? [...node.parentWorldMatrix] : null,
    };
}

export function buildTransformSessionDrafts({
    session,
    nextAnchorWorldMatrix,
    snapSettings,
}: {
    session: SceneTransformSessionState;
    nextAnchorWorldMatrix: Matrix4;
    snapSettings: SceneTransformSnapSettings;
}) {
    const startAnchorWorldMatrix = createMatrixFromArray(session.anchorWorldMatrix);
    if (!startAnchorWorldMatrix) {
        return {};
    }

    const deltaWorldMatrix = nextAnchorWorldMatrix.clone().multiply(startAnchorWorldMatrix.clone().invert());

    return Object.fromEntries(
        session.nodeIds.flatMap((nodeId) => {
            const nodeState = session.nodes[nodeId];
            if (!nodeState) {
                return [];
            }

            const initialWorldMatrix = createMatrixFromArray(nodeState.initialWorldMatrix);
            if (!initialWorldMatrix) {
                return [];
            }

            const nextWorldMatrix = deltaWorldMatrix.clone().multiply(initialWorldMatrix);
            const nextPatch = createNodeTransformPatchFromWorldMatrix(
                nextWorldMatrix,
                createMatrixFromArray(nodeState.parentWorldMatrix),
            );

            return [[nodeId, quantizeTransformPatchForMode(nextPatch, session.mode, snapSettings)]];
        }),
    ) as Record<SceneNodeId, SceneNodeTransform>;
}

export function buildTransformSessionAnchorPreview(session: SceneTransformSessionState) {
    const anchorMatrix = createMatrixFromArray(session.anchorWorldMatrix);
    if (!anchorMatrix) {
        return createSelectionTransformControlMatrix([], session.space);
    }
    return anchorMatrix;
}

export function createWorldMatrixFromLocalTransform(transform: SceneNodeTransform, parentWorldMatrix: number[] | null = null) {
    const localMatrix = createSceneNodeLocalMatrix(transform);
    const parentMatrix = createMatrixFromArray(parentWorldMatrix);
    return parentMatrix ? parentMatrix.multiply(localMatrix) : localMatrix;
}
