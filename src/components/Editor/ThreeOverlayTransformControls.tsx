"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";

import type { SceneNodeRegistry } from "@/lib/render/sceneNodeRegistry.ts";
import {
    buildTransformSessionDrafts,
    createSelectionTransformControlMatrix,
    createTransformSessionNodeState,
    getTransformSnapValueForMode,
    isTransformToolMode,
    isTransformableSceneRuntimeNode,
    type SceneTransformSessionState,
    type SceneTransformSnapSettings,
    type SceneTransformSpace,
} from "@/lib/render/transformSessions.ts";
import type { NodeTransformPatch, SceneNodeId, SceneToolMode } from "@/lib/scene-graph/types.ts";

export interface ThreeOverlayTransformControlsProps {
    sceneNodeRegistry: SceneNodeRegistry;
    selectedNodeIds: SceneNodeId[];
    activeTool: SceneToolMode;
    readOnly: boolean;
    transformSpace: SceneTransformSpace;
    transformSnap: SceneTransformSnapSettings;
    transformSession: SceneTransformSessionState | null;
    onBeginTransformSession?: (session: {
        nodeIds: SceneNodeId[];
        mode: Exclude<SceneToolMode, "select">;
        space: SceneTransformSpace;
        anchorWorldMatrix: number[];
        nodes: SceneTransformSessionState["nodes"];
    }) => void;
    onUpdateTransformSessionDrafts?: (drafts: Record<SceneNodeId, NodeTransformPatch>) => void;
    onCancelTransformSession?: () => void;
    onCommitTransformSession?: () => void;
}

export const ThreeOverlayTransformControls = React.memo(function ThreeOverlayTransformControls({
    sceneNodeRegistry,
    selectedNodeIds,
    activeTool,
    readOnly,
    transformSpace,
    transformSnap,
    transformSession,
    onBeginTransformSession,
    onUpdateTransformSessionDrafts,
    onCancelTransformSession,
    onCommitTransformSession,
}: ThreeOverlayTransformControlsProps) {
    const transformableNodes = useMemo(
        () =>
            selectedNodeIds
                .map((nodeId) => sceneNodeRegistry.byId[nodeId])
                .filter((node) => isTransformableSceneRuntimeNode(node) && node.effectiveLocked !== true),
        [sceneNodeRegistry.byId, selectedNodeIds],
    );
    const controlMode = isTransformToolMode(activeTool) ? activeTool : null;
    const isInteractive = !readOnly && Boolean(controlMode) && transformableNodes.length > 0;
    const anchorMatrix = useMemo(
        () => createSelectionTransformControlMatrix(transformableNodes, transformSpace),
        [transformSpace, transformableNodes],
    );
    const proxyRef = useRef<THREE.Group | null>(null);
    const activeSessionRef = useRef<SceneTransformSessionState | null>(transformSession);

    useEffect(() => {
        activeSessionRef.current = transformSession;
    }, [transformSession]);

    useLayoutEffect(() => {
        if (!proxyRef.current || activeSessionRef.current) {
            return;
        }

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        anchorMatrix.decompose(position, quaternion, scale);
        proxyRef.current.position.copy(position);
        proxyRef.current.quaternion.copy(quaternion);
        proxyRef.current.scale.copy(scale);
        proxyRef.current.updateMatrixWorld(true);
    }, [anchorMatrix]);

    useEffect(() => {
        if (!transformSession || readOnly) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }

            activeSessionRef.current = null;
            onCancelTransformSession?.();
            event.preventDefault();
        };

        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [onCancelTransformSession, readOnly, transformSession]);

    const handleMouseDown = useCallback(() => {
        if (!proxyRef.current || !controlMode || !isInteractive) {
            return;
        }

        const nodes = Object.fromEntries(
            transformableNodes.flatMap((node) => {
                const nodeState = createTransformSessionNodeState(node);
                return nodeState ? [[node.nodeId, nodeState]] : [];
            }),
        );
        const nodeIds = Object.keys(nodes);
        if (nodeIds.length === 0) {
            return;
        }

        const nextSession: SceneTransformSessionState = {
            id: Date.now(),
            mode: controlMode,
            space: transformSpace,
            nodeIds,
            anchorWorldMatrix: Array.from(proxyRef.current.matrixWorld.elements),
            nodes,
        };
        activeSessionRef.current = nextSession;
        onBeginTransformSession?.({
            nodeIds,
            mode: controlMode,
            space: transformSpace,
            anchorWorldMatrix: nextSession.anchorWorldMatrix,
            nodes,
        });
    }, [controlMode, isInteractive, onBeginTransformSession, transformSpace, transformableNodes]);

    const handleObjectChange = useCallback(() => {
        const activeSession = activeSessionRef.current;
        if (!proxyRef.current || !activeSession) {
            return;
        }

        onUpdateTransformSessionDrafts?.(
            buildTransformSessionDrafts({
                session: activeSession,
                nextAnchorWorldMatrix: proxyRef.current.matrixWorld.clone(),
                snapSettings: transformSnap,
            }),
        );
    }, [onUpdateTransformSessionDrafts, transformSnap]);

    const handleMouseUp = useCallback(() => {
        if (!activeSessionRef.current) {
            return;
        }

        activeSessionRef.current = null;
        onCommitTransformSession?.();
    }, [onCommitTransformSession]);

    if (!isInteractive || !controlMode) {
        return null;
    }

    const translationSnap = transformSnap.enabled && controlMode === "translate" ? getTransformSnapValueForMode(transformSnap, controlMode) : null;
    const rotationSnap = transformSnap.enabled && controlMode === "rotate" ? getTransformSnapValueForMode(transformSnap, controlMode) : null;
    const scaleSnap = transformSnap.enabled && controlMode === "scale" ? getTransformSnapValueForMode(transformSnap, controlMode) : null;

    return (
        <TransformControls
            enabled
            mode={controlMode}
            space={transformSpace}
            translationSnap={translationSnap}
            rotationSnap={rotationSnap}
            scaleSnap={scaleSnap}
            size={0.85}
            onMouseDown={handleMouseDown}
            onObjectChange={handleObjectChange}
            onMouseUp={handleMouseUp}
        >
            <group ref={proxyRef}>
                <mesh visible={false}>
                    <sphereGeometry args={[0.001]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
            </group>
        </TransformControls>
    );
});
