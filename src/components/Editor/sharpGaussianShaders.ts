import * as THREE from "three";

import { DIRECT_ORDER_CULL_SENTINEL, DIRECT_REST_MIN_AXIS_PX, SH_C0, type SharpGaussianPayload } from "./sharpGaussianShared";

export const DIRECT_GAUSSIAN_VERTEX_SHADER = `
precision highp float;
precision highp int;

in vec2 corner;

uniform sampler2D uCenterAlphaTexture;
uniform sampler2D uColorTexture;
uniform sampler2D uScaleTexture;
uniform sampler2D uRotationTexture;
uniform sampler2D uOrderTexture;
uniform vec2 uTextureSize;
uniform vec2 uOrderTextureSize;
uniform vec2 uViewport;
uniform float uCovarianceScale;
uniform float uMinAxisPx;
uniform float uMaxAxisPx;
uniform float uOrderTextureReady;
uniform float uCullSentinel;

flat out vec3 vColorPayload;
flat out float vAlpha;
flat out vec3 vViewDirection;
flat out ivec2 vTextureCoords;
flat out float vProjectedMajorAxisPx;
flat out float vProjectedMinorAxisPx;
out vec2 vLocalCoord;

ivec2 textureCoordsForIndex(uint index, vec2 textureSize) {
    uint width = uint(textureSize.x + 0.5);
    return ivec2(int(index % width), int(index / width));
}

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
    uint payloadIndex = uint(gl_InstanceID);

    if (uOrderTextureReady > 0.5) {
        ivec2 orderCoords = textureCoordsForIndex(payloadIndex, uOrderTextureSize);
        vec4 orderPair = texelFetch(uOrderTexture, orderCoords, 0);

        if (orderPair.x >= uCullSentinel * 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vColorPayload = vec3(0.0);
            vAlpha = 0.0;
            vViewDirection = vec3(0.0, 0.0, 1.0);
            vTextureCoords = ivec2(0);
            vLocalCoord = vec2(0.0);
            return;
        }

        payloadIndex = uint(orderPair.y + 0.5);
    }

    ivec2 coords = textureCoordsForIndex(payloadIndex, uTextureSize);
    vec4 centerAlpha = texelFetch(uCenterAlphaTexture, coords, 0);
    vec4 colorData = texelFetch(uColorTexture, coords, 0);
    vec4 scaleData = texelFetch(uScaleTexture, coords, 0);
    vec4 rotationData = texelFetch(uRotationTexture, coords, 0);

    vec3 instanceCenter = centerAlpha.xyz;
    float instanceAlpha = centerAlpha.w;
    vec3 instanceColor = colorData.rgb;
    vec3 instanceScale = scaleData.xyz;
    vec4 instanceRotation = rotationData;

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
    float covarianceXX = covariance2D[0][0] + 0.005;
    float covarianceXY = covariance2D[0][1];
    float covarianceYY = covariance2D[1][1] + 0.005;

    float trace = covarianceXX + covarianceYY;
    float determinant = max((covarianceXX * covarianceYY) - (covarianceXY * covarianceXY), 0.0);
    float discriminant = sqrt(max((trace * trace * 0.25) - determinant, 0.0));
    float lambdaMajor = max((trace * 0.5) + discriminant, 1e-5);
    float lambdaMinor = max((trace * 0.5) - discriminant, 1e-5);

    vec2 axisDirection = abs(covarianceXY) > 1e-6
        ? normalize(vec2(lambdaMajor - covarianceYY, covarianceXY))
        : vec2(1.0, 0.0);
    vec2 perpendicularDirection = vec2(-axisDirection.y, axisDirection.x);
    vec2 majorAxis = axisDirection * clamp(sqrt(lambdaMajor) * uCovarianceScale, uMinAxisPx, uMaxAxisPx);
    vec2 minorAxis = perpendicularDirection * clamp(sqrt(lambdaMinor) * uCovarianceScale, uMinAxisPx, uMaxAxisPx);
    float projectedMajorAxisPx = length(majorAxis);
    float projectedMinorAxisPx = length(minorAxis);

    vec2 pixelOffset = (corner.x * majorAxis) + (corner.y * minorAxis);
    vec2 ndcOffset = pixelOffset / vec2(0.5 * uViewport.x, 0.5 * uViewport.y);
    vec4 clipCenter = projectionMatrix * mvCenter4;
    vec3 ndcCenter = clipCenter.xyz / max(clipCenter.w, 1e-6);

    if (clipCenter.w <= 0.0 || abs(ndcCenter.x) > 1.02 || abs(ndcCenter.y) > 1.02 || ndcCenter.z < -1.0 || ndcCenter.z > 1.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vColorPayload = vec3(0.0);
        vAlpha = 0.0;
        vViewDirection = vec3(0.0, 0.0, 1.0);
        vTextureCoords = coords;
        vLocalCoord = vec2(0.0);
        return;
    }

    gl_Position = clipCenter;
    gl_Position.xy += ndcOffset * clipCenter.w;

    vec3 worldCenter = (modelMatrix * vec4(instanceCenter, 1.0)).xyz;

    vColorPayload = instanceColor;
    vAlpha = instanceAlpha;
    vViewDirection = normalize(cameraPosition - worldCenter);
    vTextureCoords = coords;
    vProjectedMajorAxisPx = projectedMajorAxisPx;
    vProjectedMinorAxisPx = projectedMinorAxisPx;
    vLocalCoord = corner;
}
`;

export const DIRECT_GAUSSIAN_FRAGMENT_SHADER = `
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform float uOpacityBoost;
uniform float uColorGain;
uniform float uColorContrast;
uniform float uColorSaturation;
uniform float uShadowLift;
uniform float uFilmicMix;
uniform float uCoreHaloMix;
uniform float uColorPayloadIsLinear;
uniform float uColorPayloadIsSHDC;
uniform float uHasSphericalHarmonics;
uniform int uShBasisCount;
uniform sampler2DArray uShTexture;

flat in vec3 vColorPayload;
flat in float vAlpha;
flat in vec3 vViewDirection;
flat in ivec2 vTextureCoords;
flat in float vProjectedMajorAxisPx;
flat in float vProjectedMinorAxisPx;
in vec2 vLocalCoord;

out vec4 outColor;

float shComponent(int componentIndex) {
    int layer = componentIndex / 4;
    int lane = componentIndex - (layer * 4);
    vec4 packed = texelFetch(uShTexture, ivec3(vTextureCoords, layer), 0);

    if (lane == 0) {
        return packed.x;
    }
    if (lane == 1) {
        return packed.y;
    }
    if (lane == 2) {
        return packed.z;
    }
    return packed.w;
}

vec3 shBasisCoefficient(int basisIndex) {
    int baseIndex = basisIndex * 3;
    return vec3(
        shComponent(baseIndex + 0),
        shComponent(baseIndex + 1),
        shComponent(baseIndex + 2)
    );
}

vec3 linearToSrgb(vec3 linearColor) {
    vec3 clampedColor = clamp(linearColor, 0.0, 1.0);
    vec3 low = clampedColor * 12.92;
    vec3 high = 1.055 * pow(clampedColor, vec3(1.0 / 2.4)) - 0.055;
    bvec3 cutoff = lessThanEqual(clampedColor, vec3(0.0031308));
    return vec3(
        cutoff.x ? low.x : high.x,
        cutoff.y ? low.y : high.y,
        cutoff.z ? low.z : high.z
    );
}

vec3 decodeBaseAlbedo() {
    if (uColorPayloadIsSHDC > 0.5) {
        return max(vColorPayload * ${SH_C0} + vec3(0.5), vec3(0.0));
    }

    vec3 color = max(vColorPayload, vec3(0.0));
    if (uColorPayloadIsLinear > 0.5) {
        return linearToSrgb(color);
    }

    return clamp(color, 0.0, 1.0);
}

vec3 evaluateViewDependentColor() {
    vec3 color = decodeBaseAlbedo();

    if (uColorPayloadIsSHDC > 0.5 && uHasSphericalHarmonics > 0.5) {
        vec3 dir = normalize(vViewDirection);
        float x = dir.x;
        float y = dir.y;
        float z = dir.z;

        if (uShBasisCount > 0) color += (-0.4886025119029199 * y) * shBasisCoefficient(0);
        if (uShBasisCount > 1) color += (0.4886025119029199 * z) * shBasisCoefficient(1);
        if (uShBasisCount > 2) color += (-0.4886025119029199 * x) * shBasisCoefficient(2);

        if (uShBasisCount > 3) color += (1.0925484305920792 * x * y) * shBasisCoefficient(3);
        if (uShBasisCount > 4) color += (-1.0925484305920792 * y * z) * shBasisCoefficient(4);
        if (uShBasisCount > 5) color += (0.31539156525252005 * (3.0 * z * z - 1.0)) * shBasisCoefficient(5);
        if (uShBasisCount > 6) color += (-1.0925484305920792 * x * z) * shBasisCoefficient(6);
        if (uShBasisCount > 7) color += (0.5462742152960396 * (x * x - y * y)) * shBasisCoefficient(7);

        if (uShBasisCount > 8) color += (-0.5900435899266435 * y * (3.0 * x * x - y * y)) * shBasisCoefficient(8);
        if (uShBasisCount > 9) color += (2.890611442640554 * x * y * z) * shBasisCoefficient(9);
        if (uShBasisCount > 10) color += (-0.4570457994644658 * y * (5.0 * z * z - 1.0)) * shBasisCoefficient(10);
        if (uShBasisCount > 11) color += (0.3731763325901154 * z * (5.0 * z * z - 3.0)) * shBasisCoefficient(11);
        if (uShBasisCount > 12) color += (-0.4570457994644658 * x * (5.0 * z * z - 1.0)) * shBasisCoefficient(12);
        if (uShBasisCount > 13) color += (1.445305721320277 * z * (x * x - y * y)) * shBasisCoefficient(13);
        if (uShBasisCount > 14) color += (-0.5900435899266435 * x * (x * x - 3.0 * y * y)) * shBasisCoefficient(14);
    }

    return max(color, vec3(0.0));
}

vec3 applyRichColorGrade(vec3 color) {
    vec3 workingColor = max(color, vec3(0.0));
    float luma = dot(workingColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 saturated = mix(vec3(luma), workingColor, uColorSaturation);
    vec3 contrasted = (saturated - 0.5) * uColorContrast + 0.5;
    float shadowMask = 1.0 - smoothstep(0.08, 0.42, luma);
    vec3 lifted = contrasted + vec3(shadowMask * uShadowLift);
    vec3 filmic = clamp(
        (lifted * (2.51 * lifted + 0.03)) / max(lifted * (2.43 * lifted + 0.59) + 0.14, vec3(0.14)),
        vec3(0.0),
        vec3(1.0)
    );
    return clamp(mix(lifted, filmic, clamp(uFilmicMix, 0.0, 1.0)), 0.0, 1.0);
}

float stableCoverageNoise(ivec2 coords) {
    vec2 seed = vec2(coords);
    return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    float radiusSquared = dot(vLocalCoord, vLocalCoord);
    float minorAxisPx = max(vProjectedMinorAxisPx, 0.01);
    float majorAxisPx = max(vProjectedMajorAxisPx, minorAxisPx);
    float anisotropy = clamp(majorAxisPx / minorAxisPx, 1.0, 16.0);
    float subPixelSoftness = clamp((1.2 - minorAxisPx) * 0.4, 0.0, 0.28);
    float anisotropySoftness = min((anisotropy - 1.0) * 0.025, 0.18);
    float edgeWidth = max(fwidth(radiusSquared) * (1.35 + subPixelSoftness + anisotropySoftness), 0.012);
    if (radiusSquared > 1.0 + edgeWidth) {
        discard;
    }

    float gaussianSharpness = mix(6.8, 8.4, clamp(minorAxisPx / 1.35, 0.0, 1.0));
    float softGaussian = exp(-gaussianSharpness * radiusSquared);
    float coreGaussian = exp(-(gaussianSharpness + 1.3) * radiusSquared);
    float haloGaussian = exp(-max(4.4, gaussianSharpness - 1.2) * radiusSquared);
    float gaussian = mix(softGaussian, max(coreGaussian, haloGaussian * 0.92), clamp(uCoreHaloMix, 0.0, 1.0));
    float edgeFade = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radiusSquared);
    float alpha = clamp(vAlpha * uOpacityBoost * gaussian * edgeFade, 0.0, 1.0);
    float alphaDiscardThreshold = mix(0.0011, 0.0018, stableCoverageNoise(vTextureCoords)) * (1.0 + subPixelSoftness * 0.4);

    if (alpha < alphaDiscardThreshold) {
        discard;
    }

    outColor = vec4(clamp(applyRichColorGrade(evaluateViewDependentColor() * uColorGain), 0.0, 1.0), alpha);
}
`;

export function createSharpGaussianMaterial({
    payload,
    isSingleImagePreview,
}: {
    payload: SharpGaussianPayload;
    isSingleImagePreview: boolean;
}) {
    const richnessEnabled = !isSingleImagePreview;
    const hasSphericalHarmonics = payload.shBasisCount > 0 && !isSingleImagePreview;
    return new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            uCenterAlphaTexture: { value: payload.centerAlphaTexture },
            uColorTexture: { value: payload.colorTexture },
            uScaleTexture: { value: payload.scaleTexture },
            uRotationTexture: { value: payload.rotationTexture },
            uOrderTexture: { value: payload.centerAlphaTexture },
            uTextureSize: { value: new THREE.Vector2(payload.textureWidth, payload.textureHeight) },
            uOrderTextureSize: { value: new THREE.Vector2(1, 1) },
            uViewport: { value: new THREE.Vector2(1, 1) },
            uCovarianceScale: { value: 1.0 },
            uMinAxisPx: { value: DIRECT_REST_MIN_AXIS_PX },
            uMaxAxisPx: { value: 96.0 },
            uOpacityBoost: { value: 1.0 },
            uColorGain: { value: 1.0 },
            uColorContrast: { value: richnessEnabled ? (hasSphericalHarmonics ? 1.07 : 1.04) : 1.0 },
            uColorSaturation: { value: richnessEnabled ? (hasSphericalHarmonics ? 1.12 : 1.07) : 1.0 },
            uShadowLift: { value: richnessEnabled ? (hasSphericalHarmonics ? 0.02 : 0.012) : 0.0 },
            uFilmicMix: { value: richnessEnabled ? (hasSphericalHarmonics ? 0.22 : 0.16) : 0.0 },
            uCoreHaloMix: { value: richnessEnabled ? 0.28 : 0.14 },
            uShTexture: { value: payload.shTexture },
            uColorPayloadIsLinear: { value: payload.colorPayloadMode === "albedo_linear" ? 1 : 0 },
            uColorPayloadIsSHDC: { value: payload.colorPayloadMode === "sh_dc" ? 1 : 0 },
            uHasSphericalHarmonics: { value: hasSphericalHarmonics ? 1 : 0 },
            uShBasisCount: { value: payload.shBasisCount },
            uOrderTextureReady: { value: 0 },
            uCullSentinel: { value: DIRECT_ORDER_CULL_SENTINEL },
        },
        vertexShader: DIRECT_GAUSSIAN_VERTEX_SHADER,
        fragmentShader: DIRECT_GAUSSIAN_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        dithering: true,
        toneMapped: false,
    });
}
