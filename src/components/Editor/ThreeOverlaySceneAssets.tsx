"use client";

import React, { useCallback, useMemo } from "react";
import { PivotControls } from "@react-three/drei";
import * as THREE from "three";

import type { SceneRuntimeCameraNode, SceneRuntimeLightNode } from "@/lib/render/sceneNodeRegistry.ts";
import { createNodeTransformPatchFromWorldMatrix } from "@/lib/render/runtimeTransforms.ts";
import type { SceneRuntime } from "@/lib/render/sceneRuntime.ts";
import type { SceneToolMode } from "@/lib/scene-graph/types.ts";
import { LoadingLabel } from "./ThreeOverlayLoadingLabel";
import { type AssetTransformPatch, type SceneAsset } from "./threeOverlayShared";
import { resolvePivotToolConfig, useThreeOverlayAssetNodeController } from "./useThreeOverlayAssetNodeController";

interface SceneAssetNodeProps {
    asset: SceneAsset;
    updateAssetTransform: (instanceId: string, patch: AssetTransformPatch) => void;
    updateNodeTransform?: (nodeId: string, patch: AssetTransformPatch) => void;
    onCommitTransform?: () => void;
    readOnly: boolean;
    selected: boolean;
    activeTool: SceneToolMode;
    onSelect: (event: { stopPropagation?: () => void; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
    sceneRuntime?: SceneRuntime;
    lifecycleKey?: string;
    showControls?: boolean;
}

function AssetFallbackRenderable({ selected }: { selected: boolean }) {
    return (
        <mesh castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={selected ? "#60a5fa" : "#4ade80"} roughness={0.3} metalness={0.4} />
        </mesh>
    );
}

export const SceneAssetNode = React.memo(function SceneAssetNode({
    asset,
    updateAssetTransform,
    updateNodeTransform,
    onCommitTransform,
    readOnly,
    selected,
    activeTool,
    onSelect,
    sceneRuntime,
    lifecycleKey,
    showControls = true,
}: SceneAssetNodeProps) {
    const assetNode = useThreeOverlayAssetNodeController({
        asset,
        updateAssetTransform,
        updateNodeTransform,
        onCommitTransform,
        readOnly,
        selected,
        activeTool,
        onSelect,
        sceneRuntime,
        lifecycleKey,
    });

    if (assetNode.renderMode === "loading") {
        return <LoadingLabel text="Loading mesh..." />;
    }

    return (
        <PivotControls
            visible={showControls && assetNode.controlsVisible}
            enabled={showControls && assetNode.controlsVisible}
            scale={80}
            depthTest={false}
            lineWidth={3}
            anchor={[0, 0, 0]}
            disableAxes={assetNode.pivotTool.disableAxes}
            disableSliders={assetNode.pivotTool.disableSliders}
            disableRotations={assetNode.pivotTool.disableRotations}
            disableScaling={assetNode.pivotTool.disableScaling}
            onDrag={assetNode.handleDrag}
            onDragEnd={assetNode.handleDragEnd}
        >
            <group
                ref={assetNode.handleGroupRef}
                visible={assetNode.isVisible}
                position={assetNode.position}
                rotation={assetNode.rotation}
                scale={assetNode.scale}
                onClick={(event) => {
                    assetNode.handleSelect(event);
                }}
            >
                {assetNode.renderMode === "fallback" ? <AssetFallbackRenderable selected={selected} /> : null}
                {assetNode.renderMode === "mesh" && assetNode.scene ? <primitive object={assetNode.scene} /> : null}
            </group>
        </PivotControls>
    );
});

interface SceneUtilityNodeProps {
    node: SceneRuntimeCameraNode | SceneRuntimeLightNode;
    updateNodeTransform?: (nodeId: string, patch: AssetTransformPatch) => void;
    onCommitTransform?: () => void;
    readOnly: boolean;
    selected: boolean;
    activeTool: SceneToolMode;
    onSelect: (event: { stopPropagation?: () => void; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
    sceneRuntime?: SceneRuntime;
    showControls?: boolean;
}

function UtilityNodeGlyph({ node, selected }: { node: SceneRuntimeCameraNode | SceneRuntimeLightNode; selected: boolean }) {
    if (node.kind === "camera") {
        return (
            <>
                <mesh position={[0, 0, 0.18]}>
                    <boxGeometry args={[0.42, 0.26, 0.36]} />
                    <meshStandardMaterial color={selected ? "#f8fafc" : "#c4b5fd"} emissive={selected ? "#7c3aed" : "#312e81"} />
                </mesh>
                <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.18, 0.32, 4]} />
                    <meshStandardMaterial color={selected ? "#ede9fe" : "#8b5cf6"} emissive={selected ? "#6d28d9" : "#312e81"} />
                </mesh>
            </>
        );
    }

    return (
        <>
            <mesh>
                <sphereGeometry args={[0.18, 18, 18]} />
                <meshStandardMaterial color={selected ? "#fde68a" : node.light.color} emissive={node.light.color} emissiveIntensity={0.45} />
            </mesh>
            <mesh position={[0, 0.32, 0]} rotation={[0, 0, Math.PI / 4]}>
                <torusGeometry args={[0.3, 0.02, 8, 24]} />
                <meshStandardMaterial color={selected ? "#fef3c7" : "#f59e0b"} emissive="#92400e" emissiveIntensity={0.25} />
            </mesh>
        </>
    );
}

export const SceneUtilityNode = React.memo(function SceneUtilityNode({
    node,
    updateNodeTransform,
    onCommitTransform,
    readOnly,
    selected,
    activeTool,
    onSelect,
    sceneRuntime,
    showControls = true,
}: SceneUtilityNodeProps) {
    const pivotTool = useMemo(() => resolvePivotToolConfig(activeTool), [activeTool]);
    const controlsVisible = !readOnly && selected && pivotTool.visible && node.effectiveLocked !== true && node.effectiveVisible;
    const position = node.worldTransform.position;
    const rotation = [node.worldTransform.rotation[0] ?? 0, node.worldTransform.rotation[1] ?? 0, node.worldTransform.rotation[2] ?? 0] as [
        number,
        number,
        number,
    ];
    const scale = node.worldTransform.scale;
    const handleDrag = useCallback(
        (worldTransform: THREE.Matrix4) => {
            if (readOnly || node.effectiveLocked || !updateNodeTransform) {
                return;
            }
            updateNodeTransform(
                node.nodeId,
                createNodeTransformPatchFromWorldMatrix(
                    worldTransform,
                    Array.isArray(node.parentWorldMatrix) && node.parentWorldMatrix.length === 16
                        ? new THREE.Matrix4().fromArray(node.parentWorldMatrix)
                        : null,
                ),
            );
        },
        [node.effectiveLocked, node.nodeId, node.parentWorldMatrix, readOnly, updateNodeTransform],
    );
    const handleDragEnd = useCallback(() => {
        if (!readOnly && !node.effectiveLocked) {
            onCommitTransform?.();
        }
    }, [node.effectiveLocked, onCommitTransform, readOnly]);
    const handleSelect = useCallback(
        (event: { stopPropagation?: () => void; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
            if (readOnly) {
                return;
            }
            event.stopPropagation?.();
            onSelect(event);
        },
        [onSelect, readOnly],
    );
    const handleGroupRef = useCallback(
        (object: THREE.Group | null) => {
            if (!sceneRuntime) {
                return;
            }
            if (object) {
                sceneRuntime.bindObject(node.nodeId, node.lifecycleKey, object);
                return;
            }
            sceneRuntime.unbindObject(node.nodeId);
        },
        [node.lifecycleKey, node.nodeId, sceneRuntime],
    );

    return (
        <PivotControls
            visible={showControls && controlsVisible}
            enabled={showControls && controlsVisible}
            scale={60}
            depthTest={false}
            lineWidth={3}
            anchor={[0, 0, 0]}
            disableAxes={pivotTool.disableAxes}
            disableSliders={pivotTool.disableSliders}
            disableRotations={pivotTool.disableRotations}
            disableScaling={pivotTool.disableScaling}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
        >
            <group
                ref={handleGroupRef}
                visible={node.effectiveVisible}
                position={position}
                rotation={rotation}
                scale={scale}
                onClick={(event) => {
                    handleSelect(event);
                }}
            >
                <UtilityNodeGlyph node={node} selected={selected} />
            </group>
        </PivotControls>
    );
});
