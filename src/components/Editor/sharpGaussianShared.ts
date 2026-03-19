import type { Box3, DataArrayTexture, DataTexture, InstancedBufferGeometry, Sphere } from "three";

export const SH_REST_COMPONENT_COUNT = 45;
export const SH_MAX_BASIS_COUNT = SH_REST_COMPONENT_COUNT / 3;
export const SH_C0 = 0.28209479177387814;
export const TARGET_POINTS_PER_CHUNK = 16384;
export const MAX_POINTS_PER_CHUNK = 32768;
export const MAX_CHUNK_OCTREE_LEVEL = 6;
export const PREVIEW_INTERACTION_POINT_BUDGET = 900_000;
export const PREVIEW_INTERACTION_MIN_AXIS_PX = 0.14;
export const PREVIEW_INTERACTION_MAX_AXIS_PX = 56;
export const PREVIEW_REST_MIN_AXIS_PX = 0.1;
export const PREVIEW_REST_MAX_AXIS_PX = 96;
export const PREVIEW_INTERACTION_SORT_THRESHOLD_MULTIPLIER = 0.9;
export const PREVIEW_SORT_THRESHOLD_MULTIPLIER = 2.5;
export const MAX_GPU_SORT_WORKING_SET_BYTES = 128 * 1024 * 1024;
export const DIRECT_REST_MIN_AXIS_PX = 0.1;
export const DIRECT_MOTION_MIN_AXIS_PX = 0.135;
export const DIRECT_STRESS_MIN_AXIS_PX = 0.165;
export const DIRECT_MOTION_SORT_MAX_REUSE_FRAMES = 3;
export const DIRECT_ROTATION_SORT_MAX_REUSE_FRAMES = 2;
export const RECONSTRUCTION_POINT_BUDGET_HIGH_CAPABILITY = 1_500_000;
export const RECONSTRUCTION_POINT_BUDGET_DESKTOP = 1_250_000;
export const RECONSTRUCTION_POINT_BUDGET_LOW_MEMORY = 900_000;
export const HEAVY_SCENE_POINT_THRESHOLD = 1_000_000;
export const DENSE_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY = 2_000_000;
export const DENSE_PREVIEW_POINT_BUDGET_DESKTOP = 1_500_000;
export const DENSE_PREVIEW_POINT_BUDGET_LOW_MEMORY = 900_000;
export const STANDARD_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY = 1_500_000;
export const STANDARD_PREVIEW_POINT_BUDGET_DESKTOP = 1_250_000;
export const STANDARD_PREVIEW_POINT_BUDGET_LOW_MEMORY = 750_000;
export const STAGED_UPGRADE_MAX_INITIAL_POINTS = 650_000;
export const DIRECT_SORT_POSITION_EPSILON_SQ = 0.0001;
export const DIRECT_SORT_ROTATION_EPSILON = 0.00004;
export const DIRECT_ORDER_CULL_SENTINEL = 65504;

export type PreviewBounds = {
    center: [number, number, number];
    radius: number;
    forward?: [number, number, number];
};

export type SharpGaussianColorPayloadMode = "albedo_linear" | "albedo_srgb" | "sh_dc";

export type SharpGaussianPreviewFocus = {
    center: [number, number, number];
    radius: number;
    forward: [number, number, number];
};

export type SharpGaussianChunk = {
    start: number;
    count: number;
    code: number;
    boundingBox: Box3;
    boundingSphere: Sphere;
};

export type SharpGaussianOrderTexture = {
    texture: DataTexture;
    width: number;
    height: number;
    capacity: number;
    data: Float32Array;
};

export type SharpGaussianDebugSample = {
    sampleIndex: number;
    sourceIndex: number;
    position: [number, number, number];
    scale: [number, number, number];
    color: [number, number, number];
    colorPayloadMode: SharpGaussianColorPayloadMode;
};

export type SharpGaussianPayload = {
    geometry: InstancedBufferGeometry;
    centerAlphaTexture: DataTexture;
    colorTexture: DataTexture;
    scaleTexture: DataTexture;
    rotationTexture: DataTexture;
    shTexture: DataArrayTexture;
    shTextureWidth: number;
    shTextureHeight: number;
    shTextureDepth: number;
    colorPayloadMode: SharpGaussianColorPayloadMode;
    shBasisCount: number;
    textureWidth: number;
    textureHeight: number;
    count: number;
    chunks: SharpGaussianChunk[];
    sceneRadius: number;
    previewFocus: SharpGaussianPreviewFocus | null;
    debugSamples: SharpGaussianDebugSample[];
};

export type SerializedSharpGaussianChunk = {
    start: number;
    count: number;
    code: number;
    boundingBoxMin: [number, number, number];
    boundingBoxMax: [number, number, number];
    boundingSphereCenter: [number, number, number];
    boundingSphereRadius: number;
};

export type SerializedSharpGaussianPayload = {
    centerAlphaData: Uint16Array;
    colorData: Uint16Array;
    scaleData: Uint16Array;
    rotationData: Uint16Array;
    shData: Uint16Array;
    shTextureWidth: number;
    shTextureHeight: number;
    shTextureDepth: number;
    colorPayloadMode: SharpGaussianColorPayloadMode;
    shBasisCount: number;
    textureWidth: number;
    textureHeight: number;
    count: number;
    chunks: SerializedSharpGaussianChunk[];
    sceneRadius: number;
    boundingBoxMin: [number, number, number];
    boundingBoxMax: [number, number, number];
    boundingSphereCenter: [number, number, number];
    boundingSphereRadius: number;
    previewFocusCenter: [number, number, number];
    previewFocusRadius: number;
    previewFocusForward: [number, number, number];
    debugSamples: SharpGaussianDebugSample[];
};

export type SharpGaussianLoadState = {
    phase: "loading" | "ready" | "error";
    message: string;
    activeVariantLabel?: string | null;
    upgradeVariantLabel?: string | null;
    stagedDelivery?: boolean;
    upgradePending?: boolean;
};

export const DEFAULT_SHARP_GAUSSIAN_LOAD_STATE: SharpGaussianLoadState = {
    phase: "loading",
    message: "Fetching environment splat...",
    activeVariantLabel: null,
    upgradeVariantLabel: null,
    stagedDelivery: false,
    upgradePending: false,
};
