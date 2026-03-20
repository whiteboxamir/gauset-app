"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { estimateGpuSortWorkingSetBytes, SharpGaussianGpuSorter } from "./sharpGaussianGpuSort";
import { syncSharpGaussianOrderTexturePayload } from "./sharpGaussianPayload";
import {
    DIRECT_MOTION_MIN_AXIS_PX,
    DIRECT_MOTION_SORT_MAX_REUSE_FRAMES,
    DIRECT_ORDER_CULL_SENTINEL,
    DIRECT_REST_MIN_AXIS_PX,
    DIRECT_ROTATION_SORT_MAX_REUSE_FRAMES,
    DIRECT_SORT_POSITION_EPSILON_SQ,
    DIRECT_SORT_ROTATION_EPSILON,
    DIRECT_STRESS_MIN_AXIS_PX,
    MAX_GPU_SORT_WORKING_SET_BYTES,
    PREVIEW_INTERACTION_MIN_AXIS_PX,
    PREVIEW_INTERACTION_MAX_AXIS_PX,
    PREVIEW_INTERACTION_POINT_BUDGET,
    PREVIEW_INTERACTION_SORT_THRESHOLD_MULTIPLIER,
    PREVIEW_REST_MIN_AXIS_PX,
    PREVIEW_REST_MAX_AXIS_PX,
    PREVIEW_SORT_THRESHOLD_MULTIPLIER,
    type SharpGaussianOrderTexture,
    type SharpGaussianPayload,
} from "./sharpGaussianShared";

function areSharpChunkSelectionsEqual(left: number[], right: number[]) {
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }

    return true;
}

function buildVisibleSharpGaussianActiveIndices(payload: SharpGaussianPayload, visibleChunkIndices: number[], visibleCount: number) {
    const activeIndices = new Uint32Array(visibleCount);
    let offset = 0;

    for (let chunkCursor = 0; chunkCursor < visibleChunkIndices.length; chunkCursor += 1) {
        const chunk = payload.chunks[visibleChunkIndices[chunkCursor]];
        for (let localIndex = 0; localIndex < chunk.count; localIndex += 1) {
            activeIndices[offset] = chunk.start + localIndex;
            offset += 1;
        }
    }

    return activeIndices;
}

type VisibleSharpGaussianChunkCandidate = {
    chunkIndex: number;
    distanceSq: number;
    sortDepth: number;
};

function buildDepthOrderedSharpGaussianActiveIndices(
    payload: SharpGaussianPayload,
    visibleChunkCandidates: VisibleSharpGaussianChunkCandidate[],
    visibleCount: number,
) {
    const sortedCandidates = [...visibleChunkCandidates].sort((left, right) => {
        if (left.sortDepth !== right.sortDepth) {
            return right.sortDepth - left.sortDepth;
        }
        return right.distanceSq - left.distanceSq;
    });
    const activeIndices = new Uint32Array(visibleCount);
    let offset = 0;

    for (let chunkCursor = 0; chunkCursor < sortedCandidates.length; chunkCursor += 1) {
        const chunk = payload.chunks[sortedCandidates[chunkCursor].chunkIndex];
        for (let localIndex = 0; localIndex < chunk.count; localIndex += 1) {
            activeIndices[offset] = chunk.start + localIndex;
            offset += 1;
        }
    }

    return activeIndices;
}

function shouldUseCpuOrderingForSharpGaussian(visibleCount: number, maxTextureSize: number) {
    try {
        return estimateGpuSortWorkingSetBytes(visibleCount, maxTextureSize) > MAX_GPU_SORT_WORKING_SET_BYTES;
    } catch {
        return true;
    }
}

function selectPreviewInteractionChunks(
    payload: SharpGaussianPayload,
    visibleChunkCandidates: Array<{ chunkIndex: number; distanceSq: number }>,
    pointBudget: number,
) {
    if (visibleChunkCandidates.length === 0) {
        return {
            chunkIndices: [] as number[],
            visibleCount: 0,
        };
    }

    const sortedCandidates = [...visibleChunkCandidates].sort((left, right) => left.distanceSq - right.distanceSq);
    const selectedChunkIndices: number[] = [];
    let visibleCount = 0;

    for (let candidateIndex = 0; candidateIndex < sortedCandidates.length; candidateIndex += 1) {
        const chunkIndex = sortedCandidates[candidateIndex].chunkIndex;
        const chunk = payload.chunks[chunkIndex];

        if (selectedChunkIndices.length > 0 && visibleCount + chunk.count > pointBudget) {
            continue;
        }

        selectedChunkIndices.push(chunkIndex);
        visibleCount += chunk.count;

        if (visibleCount >= pointBudget) {
            break;
        }
    }

    if (selectedChunkIndices.length === 0) {
        const firstChunkIndex = sortedCandidates[0].chunkIndex;
        selectedChunkIndices.push(firstChunkIndex);
        visibleCount = payload.chunks[firstChunkIndex]?.count ?? 0;
    }

    selectedChunkIndices.sort((left, right) => left - right);

    return {
        chunkIndices: selectedChunkIndices,
        visibleCount,
    };
}

export function useSharpGaussianOrderingController({
    payload,
    material,
    isSingleImagePreview,
    opacityBoost,
    colorGain,
    renderOrder = 0,
    transitionActive = false,
}: {
    payload: SharpGaussianPayload | null;
    material: THREE.ShaderMaterial | null;
    isSingleImagePreview: boolean;
    opacityBoost: number;
    colorGain: number;
    renderOrder?: number;
    transitionActive?: boolean;
}) {
    const { gl, size } = useThree();
    const meshRef = useRef<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null>(null);
    const gpuSorterRef = useRef<SharpGaussianGpuSorter | null>(null);
    const cpuOrderTextureRef = useRef<SharpGaussianOrderTexture | null>(null);
    const hasSortedRef = useRef(false);
    const visibleChunkIndicesRef = useRef<number[]>([]);
    const frustumRef = useRef(new THREE.Frustum());
    const frustumMatrixRef = useRef(new THREE.Matrix4());
    const worldChunkSphereRef = useRef(new THREE.Sphere());
    const cameraSpaceChunkCenterRef = useRef(new THREE.Vector3());
    const lastSortedCameraPositionRef = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    const lastSortedCameraQuaternionRef = useRef(new THREE.Quaternion());
    const lastFrameCameraPositionRef = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    const lastFrameCameraQuaternionRef = useRef(new THREE.Quaternion());
    const sortReuseFrameCountRef = useRef(0);

    useEffect(() => {
        if (!material) {
            return;
        }

        material.uniforms.uViewport.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    }, [gl, material, size.height, size.width]);

    useEffect(() => {
        if (!material) {
            return;
        }

        material.uniforms.uOpacityBoost.value = opacityBoost;
    }, [material, opacityBoost]);

    useEffect(() => {
        if (!material) {
            return;
        }

        material.uniforms.uColorGain.value = colorGain;
    }, [colorGain, material]);

    useEffect(() => {
        if (!material || !payload) {
            return;
        }

        const lastSortedCameraPosition = lastSortedCameraPositionRef.current;
        const lastSortedCameraQuaternion = lastSortedCameraQuaternionRef.current;
        const lastFrameCameraPosition = lastFrameCameraPositionRef.current;
        const lastFrameCameraQuaternion = lastFrameCameraQuaternionRef.current;

        payload.geometry.instanceCount = 0;
        visibleChunkIndicesRef.current = [];
        gpuSorterRef.current?.dispose();
        gpuSorterRef.current = null;
        cpuOrderTextureRef.current?.texture.dispose();
        cpuOrderTextureRef.current = null;
        material.uniforms.uOrderTextureReady.value = 0;
        material.uniforms.uMinAxisPx.value = isSingleImagePreview ? PREVIEW_REST_MIN_AXIS_PX : DIRECT_REST_MIN_AXIS_PX;
        material.uniforms.uMaxAxisPx.value = isSingleImagePreview ? PREVIEW_REST_MAX_AXIS_PX : 96.0;
        hasSortedRef.current = false;
        sortReuseFrameCountRef.current = 0;
        lastSortedCameraPositionRef.current.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        lastSortedCameraQuaternionRef.current.identity();
        lastFrameCameraPositionRef.current.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        lastFrameCameraQuaternionRef.current.identity();

        return () => {
            gpuSorterRef.current?.dispose();
            gpuSorterRef.current = null;
            cpuOrderTextureRef.current?.texture.dispose();
            cpuOrderTextureRef.current = null;
            material.uniforms.uOrderTextureReady.value = 0;
            material.uniforms.uMinAxisPx.value = DIRECT_REST_MIN_AXIS_PX;
            material.uniforms.uMaxAxisPx.value = 96.0;
            payload.geometry.instanceCount = 0;
            visibleChunkIndicesRef.current = [];
            hasSortedRef.current = false;
            sortReuseFrameCountRef.current = 0;
            lastSortedCameraPosition.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
            lastSortedCameraQuaternion.identity();
            lastFrameCameraPosition.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
            lastFrameCameraQuaternion.identity();
        };
    }, [isSingleImagePreview, material, payload]);

    useEffect(() => {
        if (!transitionActive) {
            return;
        }
        sortReuseFrameCountRef.current = Number.POSITIVE_INFINITY;
    }, [transitionActive]);

    useFrame(({ camera }) => {
        if (!payload || !material) {
            return;
        }

        const mesh = meshRef.current;
        if (!mesh || payload.count === 0 || payload.chunks.length === 0) {
            payload.geometry.instanceCount = 0;
            material.uniforms.uOrderTextureReady.value = 0;
            return;
        }

        mesh.renderOrder = renderOrder;

        let frameTranslationDelta = 0;
        let frameAngularDelta = 0;
        if (!Number.isFinite(lastFrameCameraPositionRef.current.x)) {
            lastFrameCameraPositionRef.current.copy(camera.position);
            lastFrameCameraQuaternionRef.current.copy(camera.quaternion);
        } else {
            frameTranslationDelta = lastFrameCameraPositionRef.current.distanceTo(camera.position);
            const frameQuaternionAlignment = Math.min(1, Math.abs(lastFrameCameraQuaternionRef.current.dot(camera.quaternion)));
            frameAngularDelta = 2 * Math.acos(frameQuaternionAlignment);
        }

        const frameTranslationThreshold = Math.max(0.0002, payload.sceneRadius * (isSingleImagePreview ? 0.0002 : 0.00008));
        const frameAngularThreshold = isSingleImagePreview ? 0.0012 : 0.00075;
        const interactionActive = frameTranslationDelta > frameTranslationThreshold || frameAngularDelta > frameAngularThreshold;
        const previewInteractionActive = isSingleImagePreview && interactionActive;
        const stressedMotion =
            !isSingleImagePreview &&
            (frameTranslationDelta > frameTranslationThreshold * 4 || frameAngularDelta > frameAngularThreshold * 3);
        const targetMinAxisPx = isSingleImagePreview
            ? previewInteractionActive
                ? PREVIEW_INTERACTION_MIN_AXIS_PX
                : PREVIEW_REST_MIN_AXIS_PX
            : stressedMotion
              ? DIRECT_STRESS_MIN_AXIS_PX
              : interactionActive
                ? DIRECT_MOTION_MIN_AXIS_PX
                : DIRECT_REST_MIN_AXIS_PX;
        const currentMinAxisPx = material.uniforms.uMinAxisPx.value as number;
        material.uniforms.uMinAxisPx.value = THREE.MathUtils.lerp(currentMinAxisPx, targetMinAxisPx, interactionActive ? 0.28 : 0.14);
        material.uniforms.uMaxAxisPx.value =
            isSingleImagePreview && previewInteractionActive ? PREVIEW_INTERACTION_MAX_AXIS_PX : PREVIEW_REST_MAX_AXIS_PX;
        lastFrameCameraPositionRef.current.copy(camera.position);
        lastFrameCameraQuaternionRef.current.copy(camera.quaternion);

        mesh.updateMatrixWorld();
        frustumMatrixRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustumRef.current.setFromProjectionMatrix(frustumMatrixRef.current);

        const visibleChunkCandidates: VisibleSharpGaussianChunkCandidate[] = [];

        for (let chunkIndex = 0; chunkIndex < payload.chunks.length; chunkIndex += 1) {
            const chunk = payload.chunks[chunkIndex];
            worldChunkSphereRef.current.copy(chunk.boundingSphere).applyMatrix4(mesh.matrixWorld);
            const cameraInsideChunk = worldChunkSphereRef.current.containsPoint(camera.position);
            if (!cameraInsideChunk && !frustumRef.current.intersectsSphere(worldChunkSphereRef.current)) {
                continue;
            }

            cameraSpaceChunkCenterRef.current.copy(worldChunkSphereRef.current.center).applyMatrix4(camera.matrixWorldInverse);
            visibleChunkCandidates.push({
                chunkIndex,
                distanceSq: worldChunkSphereRef.current.center.distanceToSquared(camera.position),
                sortDepth: -cameraSpaceChunkCenterRef.current.z + worldChunkSphereRef.current.radius,
            });
        }

        const nextVisibleSelection =
            isSingleImagePreview && previewInteractionActive
                ? selectPreviewInteractionChunks(payload, visibleChunkCandidates, PREVIEW_INTERACTION_POINT_BUDGET)
                : {
                      chunkIndices: visibleChunkCandidates.map((candidate) => candidate.chunkIndex),
                      visibleCount: visibleChunkCandidates.reduce(
                          (count, candidate) => count + payload.chunks[candidate.chunkIndex].count,
                          0,
                      ),
                  };
        const nextVisibleChunkIndices = nextVisibleSelection.chunkIndices;
        const visibleCount = nextVisibleSelection.visibleCount;

        const visibilityChanged = !areSharpChunkSelectionsEqual(visibleChunkIndicesRef.current, nextVisibleChunkIndices);
        if (visibilityChanged) {
            visibleChunkIndicesRef.current = nextVisibleChunkIndices;
        }

        payload.geometry.instanceCount = visibleCount;
        if (visibleCount === 0) {
            gpuSorterRef.current?.setActiveIndices(new Uint32Array(0));
            cpuOrderTextureRef.current?.texture.dispose();
            cpuOrderTextureRef.current = null;
            material.uniforms.uOrderTextureReady.value = 0;
            hasSortedRef.current = false;
            sortReuseFrameCountRef.current = 0;
            return;
        }

        const visibleChunkDistanceMap = new Map<number, number>();
        const visibleChunkSortDepthMap = new Map<number, number>();
        for (let candidateIndex = 0; candidateIndex < visibleChunkCandidates.length; candidateIndex += 1) {
            const candidate = visibleChunkCandidates[candidateIndex];
            visibleChunkDistanceMap.set(candidate.chunkIndex, candidate.distanceSq);
            visibleChunkSortDepthMap.set(candidate.chunkIndex, candidate.sortDepth);
        }
        const orderedVisibleChunkCandidates: VisibleSharpGaussianChunkCandidate[] = nextVisibleChunkIndices.map((chunkIndex) => ({
            chunkIndex,
            distanceSq: visibleChunkDistanceMap.get(chunkIndex) ?? Number.POSITIVE_INFINITY,
            sortDepth: visibleChunkSortDepthMap.get(chunkIndex) ?? Number.POSITIVE_INFINITY,
        }));
        const useCpuOrdering =
            isSingleImagePreview || shouldUseCpuOrderingForSharpGaussian(visibleCount, gl.capabilities.maxTextureSize);
        if (useCpuOrdering && gpuSorterRef.current) {
            gpuSorterRef.current.dispose();
            gpuSorterRef.current = null;
        }

        if (useCpuOrdering) {
            const needsOrderRefresh = visibilityChanged || !cpuOrderTextureRef.current;
            if (needsOrderRefresh) {
                const activeIndices = buildDepthOrderedSharpGaussianActiveIndices(
                    payload,
                    orderedVisibleChunkCandidates,
                    visibleCount,
                );
                cpuOrderTextureRef.current = syncSharpGaussianOrderTexturePayload(
                    cpuOrderTextureRef.current,
                    activeIndices,
                    DIRECT_ORDER_CULL_SENTINEL,
                );
                material.uniforms.uOrderTexture.value = cpuOrderTextureRef.current.texture;
                material.uniforms.uOrderTextureSize.value.set(cpuOrderTextureRef.current.width, cpuOrderTextureRef.current.height);
                material.uniforms.uCullSentinel.value = DIRECT_ORDER_CULL_SENTINEL;
                material.uniforms.uOrderTextureReady.value = 1;
                lastSortedCameraPositionRef.current.copy(camera.position);
                lastSortedCameraQuaternionRef.current.copy(camera.quaternion);
                hasSortedRef.current = true;
                sortReuseFrameCountRef.current = 0;
                return;
            }
        } else if (visibilityChanged || !gpuSorterRef.current) {
            const activeIndices = buildVisibleSharpGaussianActiveIndices(payload, nextVisibleChunkIndices, visibleCount);
            const currentSorter = gpuSorterRef.current;
            const shouldRecreateSorter =
                !currentSorter ||
                currentSorter.sortCapacity < visibleCount ||
                currentSorter.sortCapacity > Math.max(4096, visibleCount * 4);

            if (shouldRecreateSorter) {
                currentSorter?.dispose();
                gpuSorterRef.current = new SharpGaussianGpuSorter({
                    renderer: gl,
                    centerAlphaTexture: payload.centerAlphaTexture,
                    payloadTextureWidth: payload.textureWidth,
                    payloadTextureHeight: payload.textureHeight,
                    activeIndices,
                });
                material.uniforms.uOrderTextureSize.value.set(gpuSorterRef.current.orderTextureWidth, gpuSorterRef.current.orderTextureHeight);
                material.uniforms.uCullSentinel.value = gpuSorterRef.current.cullSentinel;
            } else if (currentSorter) {
                currentSorter.setActiveIndices(activeIndices);
            }

            cpuOrderTextureRef.current?.texture.dispose();
            cpuOrderTextureRef.current = null;
            const gpuSorter = gpuSorterRef.current;
            if (!gpuSorter) {
                return;
            }

            gpuSorter.update(camera);
            material.uniforms.uOrderTexture.value = gpuSorter.getTexture();
            material.uniforms.uOrderTextureReady.value = 1;
            lastSortedCameraPositionRef.current.copy(camera.position);
            lastSortedCameraQuaternionRef.current.copy(camera.quaternion);
            hasSortedRef.current = true;
            sortReuseFrameCountRef.current = 0;
            return;
        }

        const gpuSorter = gpuSorterRef.current;
        if (!useCpuOrdering && !gpuSorter) {
            return;
        }

        const positionDeltaSq = lastSortedCameraPositionRef.current.distanceToSquared(camera.position);
        const translationDelta = Math.sqrt(positionDeltaSq);
        const quaternionAlignment = Math.min(1, Math.abs(lastSortedCameraQuaternionRef.current.dot(camera.quaternion)));
        const angularDelta = 2 * Math.acos(quaternionAlignment);
        const pureRotationDelta = positionDeltaSq <= DIRECT_SORT_POSITION_EPSILON_SQ;
        const sortThresholdMultiplier =
            isSingleImagePreview && previewInteractionActive
                ? PREVIEW_INTERACTION_SORT_THRESHOLD_MULTIPLIER
                : isSingleImagePreview
                  ? PREVIEW_SORT_THRESHOLD_MULTIPLIER
                  : 1;
        const pureRotationAngleThreshold = Math.max(DIRECT_SORT_ROTATION_EPSILON * 48, 0.004363323129985824) * sortThresholdMultiplier;
        const viewMotionThreshold = Math.max(0.0008, payload.sceneRadius * 0.00055) * sortThresholdMultiplier;
        const motionForcedResortFrameBudget =
            !useCpuOrdering && !isSingleImagePreview && interactionActive
                ? frameAngularDelta > frameAngularThreshold * 1.5
                    ? DIRECT_ROTATION_SORT_MAX_REUSE_FRAMES
                    : DIRECT_MOTION_SORT_MAX_REUSE_FRAMES
                : Number.POSITIVE_INFINITY;
        const reachedReuseFrameBudget = sortReuseFrameCountRef.current >= motionForcedResortFrameBudget;
        const canReuseSort =
            hasSortedRef.current &&
            !transitionActive &&
            ((pureRotationDelta && angularDelta <= pureRotationAngleThreshold) || translationDelta + payload.sceneRadius * angularDelta <= viewMotionThreshold) &&
            !reachedReuseFrameBudget;

        if (canReuseSort) {
            if (interactionActive && Number.isFinite(motionForcedResortFrameBudget)) {
                sortReuseFrameCountRef.current += 1;
            } else {
                sortReuseFrameCountRef.current = 0;
            }
            return;
        }

        if (useCpuOrdering) {
            const activeIndices = buildDepthOrderedSharpGaussianActiveIndices(
                payload,
                orderedVisibleChunkCandidates,
                visibleCount,
            );
            cpuOrderTextureRef.current = syncSharpGaussianOrderTexturePayload(
                cpuOrderTextureRef.current,
                activeIndices,
                DIRECT_ORDER_CULL_SENTINEL,
            );
            material.uniforms.uOrderTexture.value = cpuOrderTextureRef.current.texture;
            material.uniforms.uOrderTextureSize.value.set(cpuOrderTextureRef.current.width, cpuOrderTextureRef.current.height);
            material.uniforms.uCullSentinel.value = DIRECT_ORDER_CULL_SENTINEL;
            material.uniforms.uOrderTextureReady.value = 1;
            lastSortedCameraPositionRef.current.copy(camera.position);
            lastSortedCameraQuaternionRef.current.copy(camera.quaternion);
            hasSortedRef.current = true;
            sortReuseFrameCountRef.current = 0;
            return;
        }

        if (!gpuSorter) {
            return;
        }

        gpuSorter.update(camera);
        material.uniforms.uOrderTexture.value = gpuSorter.getTexture();
        material.uniforms.uOrderTextureReady.value = 1;
        lastSortedCameraPositionRef.current.copy(camera.position);
        lastSortedCameraQuaternionRef.current.copy(camera.quaternion);
        hasSortedRef.current = true;
        sortReuseFrameCountRef.current = 0;
    });

    return meshRef;
}
