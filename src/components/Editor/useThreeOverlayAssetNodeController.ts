"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { toProxyUrl } from "@/lib/mvp-api";
import { createNodeTransformPatchFromWorldMatrix } from "@/lib/render/runtimeTransforms.ts";
import { disposeThreeObjectResources, type SceneRuntime } from "@/lib/render/sceneRuntime.ts";
import type { SceneToolMode } from "@/lib/scene-graph/types.ts";
import { parseVector3Tuple } from "@/lib/mvp-workspace";
import type { AssetTransformPatch, SceneAsset } from "./threeOverlayShared";

type ParsedMeshAsset = {
    format: "glb" | "gltf" | "obj";
    scene: THREE.Object3D;
};

type SceneAssetNodeRenderMode = "hidden" | "loading" | "mesh" | "fallback";

export function resolvePivotToolConfig(tool: SceneToolMode) {
    switch (tool) {
        case "translate":
            return {
                visible: true,
                disableAxes: false,
                disableSliders: false,
                disableRotations: true,
                disableScaling: true,
            };
        case "rotate":
            return {
                visible: true,
                disableAxes: true,
                disableSliders: true,
                disableRotations: false,
                disableScaling: true,
            };
        case "scale":
            return {
                visible: true,
                disableAxes: true,
                disableSliders: true,
                disableRotations: true,
                disableScaling: false,
            };
        default:
            return {
                visible: false,
                disableAxes: true,
                disableSliders: true,
                disableRotations: true,
                disableScaling: true,
            };
    }
}

function detectMeshFormat(buffer: ArrayBuffer) {
    const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
    if (headerBytes.length >= 4) {
        const magic = String.fromCharCode(headerBytes[0] ?? 0, headerBytes[1] ?? 0, headerBytes[2] ?? 0, headerBytes[3] ?? 0);
        if (magic === "glTF") {
            return "glb" as const;
        }
    }

    const headerText = new TextDecoder("utf-8").decode(headerBytes).replace(/^\uFEFF/, "").trimStart();
    if (headerText.startsWith("{")) {
        return "gltf" as const;
    }

    if (/^(?:#.*\n\s*)*(?:mtllib|o|g|v|vt|vn|usemtl|s|f)\b/m.test(headerText)) {
        return "obj" as const;
    }

    throw new Error("Unsupported mesh payload format.");
}

function parseGltfAsset(loader: GLTFLoader, payload: ArrayBuffer | string, resourcePath: string) {
    return new Promise<ParsedMeshAsset>((resolve, reject) => {
        loader.parse(
            payload,
            resourcePath,
            (gltf) => {
                resolve({
                    format: payload instanceof ArrayBuffer ? "glb" : "gltf",
                    scene: gltf.scene || new THREE.Group(),
                });
            },
            (error) => {
                reject(error instanceof Error ? error : new Error("GLTF parse failed."));
            },
        );
    });
}

async function loadMeshAsset(meshUrl: string, signal: AbortSignal) {
    const resolvedUrl = toProxyUrl(meshUrl);
    const response = await fetch(resolvedUrl, {
        cache: "force-cache",
        signal,
    });
    if (!response.ok) {
        throw new Error(`Could not load ${resolvedUrl}: ${response.status} ${response.statusText}`.trim());
    }

    const payload = await response.arrayBuffer();
    const format = detectMeshFormat(payload);
    const resourcePath = new URL("./", new URL(resolvedUrl, window.location.href)).toString();

    if (format === "obj") {
        const text = new TextDecoder("utf-8").decode(payload);
        return {
            format,
            scene: new OBJLoader().parse(text),
        } satisfies ParsedMeshAsset;
    }

    const gltfLoader = new GLTFLoader();
    if (format === "glb") {
        return parseGltfAsset(gltfLoader, payload, resourcePath);
    }

    const text = new TextDecoder("utf-8").decode(payload);
    return parseGltfAsset(gltfLoader, text, resourcePath);
}

function useThreeOverlayMeshAsset(meshUrl?: string) {
    const [parsedAsset, setParsedAsset] = useState<ParsedMeshAsset | null>(null);
    const [loadError, setLoadError] = useState<Error | null>(null);

    useEffect(() => {
        if (!meshUrl) {
            setParsedAsset(null);
            setLoadError(null);
            return;
        }

        const abortController = new AbortController();
        let ignore = false;
        setParsedAsset(null);
        setLoadError(null);

        void loadMeshAsset(meshUrl, abortController.signal)
            .then((nextAsset) => {
                if (ignore || abortController.signal.aborted) {
                    return;
                }
                setParsedAsset(nextAsset);
            })
            .catch((error) => {
                if (ignore || abortController.signal.aborted) {
                    return;
                }
                const resolvedError = error instanceof Error ? error : new Error("Mesh load failed.");
                console.error(`[ThreeOverlay] Mesh asset load failed for ${meshUrl}`, resolvedError);
                setLoadError(resolvedError);
            });

        return () => {
            ignore = true;
            abortController.abort();
        };
    }, [meshUrl]);

    const scene = useMemo(() => (parsedAsset ? clone(parsedAsset.scene) : null), [parsedAsset]);

    useEffect(() => {
        if (!scene) {
            return;
        }

        return () => {
            disposeThreeObjectResources(scene);
        };
    }, [scene]);

    return {
        scene,
        loadError,
    };
}

export interface UseThreeOverlayAssetNodeControllerOptions {
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
}

export function useThreeOverlayAssetNodeController({
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
}: UseThreeOverlayAssetNodeControllerOptions) {
    const { scene, loadError } = useThreeOverlayMeshAsset(asset.mesh);
    const pivotTool = useMemo(() => resolvePivotToolConfig(activeTool), [activeTool]);
    const position = parseVector3Tuple(asset.position, [0, 0, 0]);
    const rotation = parseVector3Tuple(asset.rotation, [0, 0, 0]);
    const scale = parseVector3Tuple(asset.scale, [1, 1, 1]);
    const isVisible = asset.visible !== false;
    const controlsVisible = !readOnly && selected && pivotTool.visible && asset.locked !== true && isVisible;
    const renderMode: SceneAssetNodeRenderMode =
        !asset.mesh || loadError ? "fallback" : scene ? "mesh" : "loading";

    const handleDrag = useCallback(
        (worldTransform: THREE.Matrix4) => {
            if (readOnly || asset.locked) {
                return;
            }
            const patch = createNodeTransformPatchFromWorldMatrix(
                worldTransform,
                Array.isArray(asset.parentWorldMatrix) && asset.parentWorldMatrix.length === 16
                    ? new THREE.Matrix4().fromArray(asset.parentWorldMatrix)
                    : null,
            );
            if (asset.nodeId && updateNodeTransform) {
                updateNodeTransform(asset.nodeId, patch);
                return;
            }
            updateAssetTransform(asset.instanceId, patch);
        },
        [asset.instanceId, asset.locked, asset.nodeId, asset.parentWorldMatrix, readOnly, updateAssetTransform, updateNodeTransform],
    );

    const handleDragEnd = useCallback(() => {
        if (!readOnly && !asset.locked) {
            onCommitTransform?.();
        }
    }, [asset.locked, onCommitTransform, readOnly]);

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
            if (!sceneRuntime || !asset.nodeId || !lifecycleKey) {
                return;
            }
            if (object) {
                sceneRuntime.bindObject(asset.nodeId, lifecycleKey, object);
                return;
            }
            sceneRuntime.unbindObject(asset.nodeId);
        },
        [asset.nodeId, lifecycleKey, sceneRuntime],
    );

    return {
        controlsVisible,
        pivotTool,
        renderMode,
        isVisible,
        scene,
        position,
        rotation,
        scale,
        handleDrag,
        handleDragEnd,
        handleSelect,
        handleGroupRef,
    };
}

export type ThreeOverlayAssetNodeController = ReturnType<typeof useThreeOverlayAssetNodeController>;
