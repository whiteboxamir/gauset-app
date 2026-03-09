"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { LumaSplatsThree } from "@lumaai/luma-web";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { GeneratedEnvironmentMetadata } from "@/lib/mvp-product";

const SH_C0 = 0.28209479177387814;
const SHARP_PLY_CUSTOM_ATTRIBUTES = {
    shColor: ["f_dc_0", "f_dc_1", "f_dc_2"],
    splatOpacity: ["opacity"],
    splatScale: ["scale_0", "scale_1", "scale_2"],
    splatRotation: ["rot_0", "rot_1", "rot_2", "rot_3"],
};
const fallbackSplatColor = new THREE.Color("#8ad4ff");
const DIRECT_GAUSSIAN_VERTEX_SHADER = `
attribute vec2 corner;
attribute vec3 instanceCenter;
attribute vec3 instanceColor;
attribute float instanceAlpha;
attribute vec3 instanceScale;
attribute vec4 instanceRotation;
uniform vec2 uViewport;
uniform float uCovarianceScale;
uniform float uMinAxisPx;
uniform float uMaxAxisPx;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vLocalCoord;

mat3 quatToMat3(vec4 q) {
    vec4 nq = normalize(q);
    float x = nq.x;
    float y = nq.y;
    float z = nq.z;
    float w = nq.w;
    float xx = x * x;
    float yy = y * y;
    float zz = z * z;
    float xy = x * y;
    float xz = x * z;
    float yz = y * z;
    float wx = w * x;
    float wy = w * y;
    float wz = w * z;

    return mat3(
        1.0 - 2.0 * (yy + zz), 2.0 * (xy + wz), 2.0 * (xz - wy),
        2.0 * (xy - wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz + wx),
        2.0 * (xz + wy), 2.0 * (yz - wx), 1.0 - 2.0 * (xx + yy)
    );
}

void main() {
    vec4 mvCenter4 = modelViewMatrix * vec4(instanceCenter, 1.0);
    vec3 mvCenter = mvCenter4.xyz;
    float depth = max(-mvCenter.z, 0.001);

    mat3 rotation = quatToMat3(instanceRotation);
    mat3 scaleMatrix = mat3(
        instanceScale.x, 0.0, 0.0,
        0.0, instanceScale.y, 0.0,
        0.0, 0.0, instanceScale.z
    );
    mat3 covarianceView = mat3(modelViewMatrix) * rotation * scaleMatrix * scaleMatrix * transpose(rotation) * transpose(mat3(modelViewMatrix));

    float fx = projectionMatrix[0][0] * 0.5 * uViewport.x;
    float fy = projectionMatrix[1][1] * 0.5 * uViewport.y;
    float x = mvCenter.x;
    float y = mvCenter.y;
    float z = depth;

    mat3 jacobian = mat3(
        fx / z, 0.0, -(fx * x) / (z * z),
        0.0, fy / z, -(fy * y) / (z * z),
        0.0, 0.0, 0.0
    );

    mat3 covariance2D = jacobian * covarianceView * transpose(jacobian);
    float covarianceXX = covariance2D[0][0] + 0.3;
    float covarianceXY = covariance2D[0][1];
    float covarianceYY = covariance2D[1][1] + 0.3;

    float trace = covarianceXX + covarianceYY;
    float determinant = max((covarianceXX * covarianceYY) - (covarianceXY * covarianceXY), 0.0);
    float discriminant = sqrt(max((trace * trace * 0.25) - determinant, 0.0));
    float lambdaMajor = max((trace * 0.5) + discriminant, 1e-4);
    float lambdaMinor = max((trace * 0.5) - discriminant, 1e-4);

    vec2 axisDirection = abs(covarianceXY) > 1e-5
        ? normalize(vec2(lambdaMajor - covarianceYY, covarianceXY))
        : vec2(1.0, 0.0);
    vec2 perpendicularDirection = vec2(-axisDirection.y, axisDirection.x);
    vec2 majorAxis = axisDirection * clamp(sqrt(lambdaMajor) * uCovarianceScale, uMinAxisPx, uMaxAxisPx);
    vec2 minorAxis = perpendicularDirection * clamp(sqrt(lambdaMinor) * uCovarianceScale, uMinAxisPx, uMaxAxisPx);

    vec2 pixelOffset = (corner.x * majorAxis) + (corner.y * minorAxis);
    vec2 ndcOffset = pixelOffset / vec2(0.5 * uViewport.x, 0.5 * uViewport.y);
    vec4 clipCenter = projectionMatrix * mvCenter4;

    gl_Position = clipCenter;
    gl_Position.xy += ndcOffset * clipCenter.w;

    vColor = instanceColor;
    vAlpha = instanceAlpha;
    vLocalCoord = corner;
}
`;
const DIRECT_GAUSSIAN_FRAGMENT_SHADER = `
uniform float uOpacityBoost;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vLocalCoord;

void main() {
    float radiusSquared = dot(vLocalCoord, vLocalCoord);
    if (radiusSquared > 1.0) {
        discard;
    }

    float gaussian = exp(-4.5 * radiusSquared);
    float edgeFade = 1.0 - smoothstep(0.68, 1.0, radiusSquared);
    float alpha = clamp(vAlpha * uOpacityBoost * gaussian * edgeFade, 0.0, 1.0);

    if (alpha < 0.01) {
        discard;
    }

    gl_FragColor = vec4(vColor, alpha);
}
`;
const REAL_SPLAT_RENDERERS = new Set(["luma", "luma_web", "luma_capture", "luma_splats"]);
const SHARP_GAUSSIAN_RENDERERS = new Set(["sharp_gaussian_direct", "ply_gaussian_fallback", "sharp_ply"]);
const DEFAULT_SHARP_POINT_BUDGET = 220000;
const DIRECT_SORT_POSITION_EPSILON_SQ = 0.0025;
const DIRECT_SORT_ROTATION_EPSILON = 0.0008;

type EnvironmentSplatProps = {
    plyUrl?: string | null;
    viewerUrl?: string | null;
    metadata?: GeneratedEnvironmentMetadata | null;
};

type SharpGaussianBuffers = {
    geometry: THREE.InstancedBufferGeometry;
    instanceCenter: Float32Array;
    instanceColor: Float32Array;
    instanceAlpha: Float32Array;
    instanceScale: Float32Array;
    instanceRotation: Float32Array;
    count: number;
};

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

function srgbChannelToLinear(value: number) {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return Math.pow((value + 0.055) / 1.055, 2.4);
}

function sigmoid(value: number) {
    return 1 / (1 + Math.exp(-value));
}

function isLikelyLumaSource(source: string) {
    return /lumalabs\.ai\/capture\//i.test(source) || /\.(ksplat|splat)(\?.*)?$/i.test(source);
}

function resolveEnvironmentRenderSource({ plyUrl, viewerUrl, metadata }: EnvironmentSplatProps) {
    const rendering = metadata?.rendering;
    const explicitRenderer = String(rendering?.viewer_renderer ?? "").trim().toLowerCase();
    const explicitSource = String(rendering?.viewer_source ?? "").trim();
    const preferredViewerSource = String(viewerUrl ?? explicitSource).trim();
    const preferredPlySource = String(plyUrl ?? "").trim();

    if (preferredViewerSource && (REAL_SPLAT_RENDERERS.has(explicitRenderer) || isLikelyLumaSource(preferredViewerSource))) {
        return { mode: "luma" as const, source: preferredViewerSource };
    }

    if (preferredPlySource && (REAL_SPLAT_RENDERERS.has(explicitRenderer) || isLikelyLumaSource(preferredPlySource))) {
        return { mode: "luma" as const, source: preferredPlySource };
    }

    if (preferredPlySource && (SHARP_GAUSSIAN_RENDERERS.has(explicitRenderer) || explicitRenderer === "")) {
        return { mode: "sharp" as const, source: preferredPlySource };
    }

    if (preferredPlySource) {
        return { mode: "sharp" as const, source: preferredPlySource };
    }

    if (preferredViewerSource) {
        return { mode: "luma" as const, source: preferredViewerSource };
    }

    return { mode: "none" as const, source: "" };
}

function resolveSharpPointBudget(metadata?: GeneratedEnvironmentMetadata | null) {
    const preferred = Number(metadata?.delivery?.render_targets?.preferred_point_budget);
    if (Number.isFinite(preferred) && preferred > 0) {
        return Math.max(90000, Math.min(Math.round(preferred), 320000));
    }
    return DEFAULT_SHARP_POINT_BUDGET;
}

function resolveSharpSortInterval(pointCount: number) {
    if (pointCount >= 180000) {
        return 0.34;
    }
    if (pointCount >= 120000) {
        return 0.24;
    }
    return 0.16;
}

function flagInstancedAttributeForUpdate(geometry: THREE.InstancedBufferGeometry, attributeName: string) {
    const attribute = geometry.getAttribute(attributeName);
    if (attribute) {
        attribute.needsUpdate = true;
    }
}

function copyReorderedAttribute(source: Float32Array, target: Float32Array, order: Uint32Array, itemSize: number) {
    for (let sortedIndex = 0; sortedIndex < order.length; sortedIndex += 1) {
        const sourceOffset = order[sortedIndex] * itemSize;
        const targetOffset = sortedIndex * itemSize;
        for (let itemIndex = 0; itemIndex < itemSize; itemIndex += 1) {
            target[targetOffset + itemIndex] = source[sourceOffset + itemIndex];
        }
    }
    source.set(target);
}

function sortSharpGaussianBuffers(
    buffers: SharpGaussianBuffers,
    viewMatrix: THREE.Matrix4,
    order: Uint32Array,
    depths: Float32Array,
    scratchCenter: Float32Array,
    scratchColor: Float32Array,
    scratchAlpha: Float32Array,
    scratchScale: Float32Array,
    scratchRotation: Float32Array,
) {
    const viewElements = viewMatrix.elements;
    const instanceCenter = buffers.instanceCenter;

    for (let index = 0; index < buffers.count; index += 1) {
        const centerOffset = index * 3;
        order[index] = index;
        depths[index] =
            viewElements[2] * instanceCenter[centerOffset + 0] +
            viewElements[6] * instanceCenter[centerOffset + 1] +
            viewElements[10] * instanceCenter[centerOffset + 2] +
            viewElements[14];
    }

    order.sort((left, right) => depths[left] - depths[right]);

    copyReorderedAttribute(buffers.instanceCenter, scratchCenter, order, 3);
    copyReorderedAttribute(buffers.instanceColor, scratchColor, order, 3);
    copyReorderedAttribute(buffers.instanceAlpha, scratchAlpha, order, 1);
    copyReorderedAttribute(buffers.instanceScale, scratchScale, order, 3);
    copyReorderedAttribute(buffers.instanceRotation, scratchRotation, order, 4);

    flagInstancedAttributeForUpdate(buffers.geometry, "instanceCenter");
    flagInstancedAttributeForUpdate(buffers.geometry, "instanceColor");
    flagInstancedAttributeForUpdate(buffers.geometry, "instanceAlpha");
    flagInstancedAttributeForUpdate(buffers.geometry, "instanceScale");
    flagInstancedAttributeForUpdate(buffers.geometry, "instanceRotation");
}

function buildSharpGaussianBuffers(sourceGeometry: THREE.BufferGeometry, pointBudget: number): SharpGaussianBuffers {
    const position = sourceGeometry.getAttribute("position");
    if (!position) {
        return {
            geometry: new THREE.InstancedBufferGeometry(),
            instanceCenter: new Float32Array(),
            instanceColor: new Float32Array(),
            instanceAlpha: new Float32Array(),
            instanceScale: new Float32Array(),
            instanceRotation: new Float32Array(),
            count: 0,
        };
    }
    const shColor = sourceGeometry.getAttribute("shColor");
    if (!sourceGeometry.getAttribute("splatAlpha")) {
        const opacity = sourceGeometry.getAttribute("splatOpacity");
        const alphaValues = new Float32Array(position.count);
        alphaValues.fill(0.92);
        if (opacity && opacity.itemSize >= 1) {
            for (let index = 0; index < opacity.count; index += 1) {
                alphaValues[index] = clamp01(sigmoid(opacity.getX(index)));
            }
        }
        sourceGeometry.setAttribute("splatAlpha", new THREE.Float32BufferAttribute(alphaValues, 1));
    }
    const alpha = sourceGeometry.getAttribute("splatAlpha");
    const scale = sourceGeometry.getAttribute("splatScale");
    const rotation = sourceGeometry.getAttribute("splatRotation");
    const totalCount = position.count;
    const sampledCount = Math.min(totalCount, Math.max(1, pointBudget));

    const instanceCenter = new Float32Array(sampledCount * 3);
    const instanceColor = new Float32Array(sampledCount * 3);
    const instanceAlpha = new Float32Array(sampledCount);
    const instanceScale = new Float32Array(sampledCount * 3);
    const instanceRotation = new Float32Array(sampledCount * 4);

    const fallbackLinearR = fallbackSplatColor.r;
    const fallbackLinearG = fallbackSplatColor.g;
    const fallbackLinearB = fallbackSplatColor.b;

    for (let sampleIndex = 0; sampleIndex < sampledCount; sampleIndex += 1) {
        const sourceIndex = Math.min(totalCount - 1, Math.floor((sampleIndex * totalCount) / sampledCount));
        const centerOffset = sampleIndex * 3;
        const rotationOffset = sampleIndex * 4;

        instanceCenter[centerOffset + 0] = position.getX(sourceIndex);
        instanceCenter[centerOffset + 1] = position.getY(sourceIndex);
        instanceCenter[centerOffset + 2] = position.getZ(sourceIndex);

        if (shColor && shColor.itemSize >= 3) {
            instanceColor[centerOffset + 0] = srgbChannelToLinear(clamp01(shColor.getX(sourceIndex) * SH_C0 + 0.5));
            instanceColor[centerOffset + 1] = srgbChannelToLinear(clamp01(shColor.getY(sourceIndex) * SH_C0 + 0.5));
            instanceColor[centerOffset + 2] = srgbChannelToLinear(clamp01(shColor.getZ(sourceIndex) * SH_C0 + 0.5));
        } else {
            instanceColor[centerOffset + 0] = fallbackLinearR;
            instanceColor[centerOffset + 1] = fallbackLinearG;
            instanceColor[centerOffset + 2] = fallbackLinearB;
        }

        instanceAlpha[sampleIndex] = alpha?.itemSize ? alpha.getX(sourceIndex) : 0.92;

        if (scale && scale.itemSize >= 3) {
            instanceScale[centerOffset + 0] = Math.exp(scale.getX(sourceIndex));
            instanceScale[centerOffset + 1] = Math.exp(scale.getY(sourceIndex));
            instanceScale[centerOffset + 2] = Math.exp(scale.getZ(sourceIndex));
        } else {
            instanceScale[centerOffset + 0] = 0.02;
            instanceScale[centerOffset + 1] = 0.02;
            instanceScale[centerOffset + 2] = 0.02;
        }

        if (rotation && rotation.itemSize >= 4) {
            instanceRotation[rotationOffset + 0] = rotation.getX(sourceIndex);
            instanceRotation[rotationOffset + 1] = rotation.getY(sourceIndex);
            instanceRotation[rotationOffset + 2] = rotation.getZ(sourceIndex);
            instanceRotation[rotationOffset + 3] = rotation.getW(sourceIndex);
        } else {
            instanceRotation[rotationOffset + 0] = 0;
            instanceRotation[rotationOffset + 1] = 0;
            instanceRotation[rotationOffset + 2] = 0;
            instanceRotation[rotationOffset + 3] = 1;
        }
    }

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.instanceCount = sampledCount;
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute("corner", new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));

    const centerAttribute = new THREE.InstancedBufferAttribute(instanceCenter, 3);
    centerAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("instanceCenter", centerAttribute);

    const colorAttribute = new THREE.InstancedBufferAttribute(instanceColor, 3);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("instanceColor", colorAttribute);

    const alphaAttribute = new THREE.InstancedBufferAttribute(instanceAlpha, 1);
    alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("instanceAlpha", alphaAttribute);

    const scaleAttribute = new THREE.InstancedBufferAttribute(instanceScale, 3);
    scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("instanceScale", scaleAttribute);

    const rotationAttribute = new THREE.InstancedBufferAttribute(instanceRotation, 4);
    rotationAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("instanceRotation", rotationAttribute);

    if (!sourceGeometry.boundingSphere) {
        sourceGeometry.computeBoundingSphere();
    }
    if (!sourceGeometry.boundingBox) {
        sourceGeometry.computeBoundingBox();
    }
    geometry.boundingSphere = sourceGeometry.boundingSphere?.clone() ?? null;
    geometry.boundingBox = sourceGeometry.boundingBox?.clone() ?? null;

    return {
        geometry,
        instanceCenter,
        instanceColor,
        instanceAlpha,
        instanceScale,
        instanceRotation,
        count: sampledCount,
    };
}

function LumaEnvironmentSplat({ source }: { source: string }) {
    const splat = useMemo(
        () =>
            new LumaSplatsThree({
                source,
                loadingAnimationEnabled: false,
                particleRevealEnabled: false,
            }),
        [source],
    );

    useEffect(() => {
        return () => {
            splat.dispose();
        };
    }, [splat]);

    return <primitive object={splat} position={[0, 0, 0]} />;
}

function SharpGaussianEnvironmentSplat({
    source,
    metadata,
}: {
    source: string;
    metadata?: GeneratedEnvironmentMetadata | null;
}) {
    const { gl, size } = useThree();
    const sourceGeometry = useLoader(PLYLoader, source, (loader) => {
        loader.setCustomPropertyNameMapping(SHARP_PLY_CUSTOM_ATTRIBUTES);
    });
    const pointBudget = useMemo(() => resolveSharpPointBudget(metadata), [metadata]);
    const buffers = useMemo(() => buildSharpGaussianBuffers(sourceGeometry, pointBudget), [pointBudget, sourceGeometry]);
    const geometry = buffers.geometry;
    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                uniforms: {
                    uViewport: { value: new THREE.Vector2(1, 1) },
                    uCovarianceScale: { value: 3.0 },
                    uMinAxisPx: { value: 1.2 },
                    uMaxAxisPx: { value: 96.0 },
                    uOpacityBoost: { value: 0.92 },
                },
                vertexShader: DIRECT_GAUSSIAN_VERTEX_SHADER,
                fragmentShader: DIRECT_GAUSSIAN_FRAGMENT_SHADER,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.NormalBlending,
            }),
        [],
    );
    const sortScratch = useMemo(
        () => ({
            order: new Uint32Array(buffers.count),
            depths: new Float32Array(buffers.count),
            center: new Float32Array(buffers.instanceCenter.length),
            color: new Float32Array(buffers.instanceColor.length),
            alpha: new Float32Array(buffers.instanceAlpha.length),
            scale: new Float32Array(buffers.instanceScale.length),
            rotation: new Float32Array(buffers.instanceRotation.length),
        }),
        [buffers],
    );
    const lastSortTimeRef = useRef(Number.NEGATIVE_INFINITY);
    const lastSortedCameraPositionRef = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    const lastSortedCameraQuaternionRef = useRef(new THREE.Quaternion());
    const hasSortedRef = useRef(false);

    useEffect(() => {
        material.uniforms.uViewport.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    }, [gl, material, size.height, size.width]);

    useFrame(({ camera, clock }) => {
        if (buffers.count < 2) {
            return;
        }

        const elapsed = clock.elapsedTime;
        if (elapsed - lastSortTimeRef.current < resolveSharpSortInterval(buffers.count)) {
            return;
        }

        const positionDeltaSq = lastSortedCameraPositionRef.current.distanceToSquared(camera.position);
        const rotationDelta = 1 - Math.abs(lastSortedCameraQuaternionRef.current.dot(camera.quaternion));
        const cameraMovedEnough =
            !hasSortedRef.current ||
            positionDeltaSq > DIRECT_SORT_POSITION_EPSILON_SQ ||
            rotationDelta > DIRECT_SORT_ROTATION_EPSILON;

        if (!cameraMovedEnough) {
            return;
        }

        sortSharpGaussianBuffers(
            buffers,
            camera.matrixWorldInverse,
            sortScratch.order,
            sortScratch.depths,
            sortScratch.center,
            sortScratch.color,
            sortScratch.alpha,
            sortScratch.scale,
            sortScratch.rotation,
        );

        lastSortTimeRef.current = elapsed;
        lastSortedCameraPositionRef.current.copy(camera.position);
        lastSortedCameraQuaternionRef.current.copy(camera.quaternion);
        hasSortedRef.current = true;
    });

    useEffect(() => {
        return () => {
            material.dispose();
        };
    }, [material]);

    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

export default function EnvironmentSplat(props: EnvironmentSplatProps) {
    const resolved = resolveEnvironmentRenderSource(props);

    if (resolved.mode === "luma") {
        return <LumaEnvironmentSplat source={resolved.source} />;
    }

    if (resolved.mode === "sharp") {
        return <SharpGaussianEnvironmentSplat source={resolved.source} metadata={props.metadata} />;
    }

    return null;
}
