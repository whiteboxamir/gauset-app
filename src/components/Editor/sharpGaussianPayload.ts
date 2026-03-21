import * as THREE from "three";

import { isLegacyDegradedSingleImagePreviewMetadata, type GeneratedEnvironmentMetadata } from "@/lib/mvp-product";
import { isSingleImagePreviewMetadata } from "@/lib/mvp-viewer";

import {
    DENSE_PREVIEW_POINT_BUDGET_DESKTOP,
    DENSE_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY,
    DENSE_PREVIEW_POINT_BUDGET_LOW_MEMORY,
    DIRECT_ORDER_CULL_SENTINEL,
    MAX_GPU_SORT_WORKING_SET_BYTES,
    RECONSTRUCTION_POINT_BUDGET_DESKTOP,
    RECONSTRUCTION_POINT_BUDGET_HIGH_CAPABILITY,
    RECONSTRUCTION_POINT_BUDGET_LOW_MEMORY,
    STANDARD_PREVIEW_POINT_BUDGET_DESKTOP,
    STANDARD_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY,
    STANDARD_PREVIEW_POINT_BUDGET_LOW_MEMORY,
    type PreviewBounds,
    type SerializedSharpGaussianPayload,
    type SharpGaussianOrderTexture,
    type SharpGaussianPayload,
} from "./sharpGaussianShared";

const TRANSIENT_STORAGE_FETCH_STATUSES = new Set([502, 503, 504]);
const SPLAT_FETCH_RETRY_DELAYS_MS = [180, 420, 900];
const SPLAT_FETCH_CACHE_MODE: RequestCache = process.env.NODE_ENV === "development" ? "no-store" : "force-cache";

type NavigatorWithDeviceMemory = Navigator & {
    deviceMemory?: number;
};

function isDenseFallbackPreviewMetadata(metadata?: GeneratedEnvironmentMetadata | null) {
    const qualityTier = String(metadata?.quality_tier ?? "").trim().toLowerCase();
    const sourceFormat = String(metadata?.rendering?.source_format ?? "").trim().toLowerCase();
    const sourceRenderer = String(metadata?.preview_enhancement?.source_renderer ?? "").trim().toLowerCase();

    return (
        qualityTier === "single_image_preview_dense_fallback" ||
        sourceFormat.includes("dense_preview_fallback") ||
        sourceRenderer === "gauset-depth-synth-fallback"
    );
}

function shouldApplyPreviewOrientation(metadata?: GeneratedEnvironmentMetadata | null) {
    if (typeof metadata?.rendering?.apply_preview_orientation === "boolean") {
        if (metadata.rendering.apply_preview_orientation === false && isLegacyDegradedSingleImagePreviewMetadata(metadata)) {
            return true;
        }
        return metadata.rendering.apply_preview_orientation;
    }

    return isSingleImagePreviewMetadata(metadata);
}

function resolvePreviewSourcePointCount(metadata?: GeneratedEnvironmentMetadata | null) {
    const explicitSourceCount = Number(metadata?.preview_enhancement?.density?.source_count ?? NaN);
    if (Number.isFinite(explicitSourceCount) && explicitSourceCount > 0) {
        return explicitSourceCount;
    }

    const preferredPointBudget = Number(metadata?.delivery?.render_targets?.preferred_point_budget ?? metadata?.point_count ?? NaN);
    const previewDensityMultiplier = Number(
        metadata?.preview_enhancement?.density?.multiplier ?? metadata?.rendering?.preview_density_multiplier ?? NaN,
    );

    if (Number.isFinite(preferredPointBudget) && preferredPointBudget > 0 && Number.isFinite(previewDensityMultiplier) && previewDensityMultiplier > 1) {
        return Math.max(1, Math.round(preferredPointBudget / previewDensityMultiplier));
    }

    return null;
}

export function resolveSharpPointBudget(
    metadata?: GeneratedEnvironmentMetadata | null,
    maxTextureSize?: number | null,
) {
    const deviceMemory =
        typeof navigator !== "undefined" && typeof (navigator as NavigatorWithDeviceMemory).deviceMemory === "number"
            ? (navigator as NavigatorWithDeviceMemory).deviceMemory ?? null
            : null;
    const hardwareConcurrency =
        typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
    const lowMemoryDevice = deviceMemory !== null && deviceMemory <= 4;
    const coarsePointerDevice = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const hasDenseShPreview = String(metadata?.rendering?.color_encoding ?? "").trim().toLowerCase() === "sh_dc_rgb";
    const hasDenseFallbackPreview = isDenseFallbackPreviewMetadata(metadata);
    const metadataBudget = Number(
        metadata?.delivery?.render_targets?.preferred_point_budget ?? metadata?.point_count ?? Number.POSITIVE_INFINITY,
    );
    const highCapabilityDevice =
        !coarsePointerDevice &&
        !lowMemoryDevice &&
        (deviceMemory === null || deviceMemory >= 8) &&
        (hardwareConcurrency === null || hardwareConcurrency >= 8) &&
        (maxTextureSize === null || maxTextureSize === undefined || maxTextureSize >= 8192);

    if (!isSingleImagePreviewMetadata(metadata)) {
        const reconstructionBudgetCap =
            lowMemoryDevice || coarsePointerDevice
                ? RECONSTRUCTION_POINT_BUDGET_LOW_MEMORY
                : highCapabilityDevice
                  ? RECONSTRUCTION_POINT_BUDGET_HIGH_CAPABILITY
                  : RECONSTRUCTION_POINT_BUDGET_DESKTOP;

        if (Number.isFinite(metadataBudget) && metadataBudget > 0) {
            return Math.min(metadataBudget, reconstructionBudgetCap);
        }

        return reconstructionBudgetCap;
    }

    const sourcePointCount = resolvePreviewSourcePointCount(metadata);

    const budgetCap = hasDenseShPreview
        ? lowMemoryDevice || coarsePointerDevice
            ? DENSE_PREVIEW_POINT_BUDGET_LOW_MEMORY
            : highCapabilityDevice
              ? DENSE_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY
              : DENSE_PREVIEW_POINT_BUDGET_DESKTOP
        : lowMemoryDevice || coarsePointerDevice
          ? STANDARD_PREVIEW_POINT_BUDGET_LOW_MEMORY
          : highCapabilityDevice
            ? STANDARD_PREVIEW_POINT_BUDGET_HIGH_CAPABILITY
            : STANDARD_PREVIEW_POINT_BUDGET_DESKTOP;

    if (hasDenseFallbackPreview && Number.isFinite(metadataBudget) && metadataBudget > 0) {
        return Math.min(metadataBudget, budgetCap);
    }

    if (sourcePointCount !== null) {
        const sourceScaledTarget =
            hasDenseShPreview && highCapabilityDevice
                ? Math.round(sourcePointCount * 1.7)
                : hasDenseShPreview
                  ? Math.round(sourcePointCount * 1.25)
                  : sourcePointCount;
        return Math.min(
            metadataBudget,
            Math.max(
                lowMemoryDevice || coarsePointerDevice ? Math.min(sourcePointCount, budgetCap) : sourcePointCount,
                Math.min(sourceScaledTarget, budgetCap),
            ),
        );
    }

    if (Number.isFinite(metadataBudget) && metadataBudget > 0) {
        return Math.min(metadataBudget, budgetCap);
    }

    return budgetCap;
}

export function resolvePreviewOpacityBoost(metadata?: GeneratedEnvironmentMetadata | null) {
    if (!isSingleImagePreviewMetadata(metadata)) {
        return 1;
    }

    const liftedMeanLuma = Number(metadata?.preview_enhancement?.exposure?.mean_luma_after ?? NaN);

    if (isDenseFallbackPreviewMetadata(metadata)) {
        if (!Number.isFinite(liftedMeanLuma)) {
            return 1.16;
        }
        if (liftedMeanLuma < 0.38) {
            return 1.3;
        }
        if (liftedMeanLuma < 0.48) {
            return 1.2;
        }
        return 1.12;
    }

    if (!Number.isFinite(liftedMeanLuma)) {
        return 1.12;
    }
    if (liftedMeanLuma < 0.14) {
        return 1.7;
    }
    if (liftedMeanLuma < 0.22) {
        return 1.48;
    }
    if (liftedMeanLuma < 0.3) {
        return 1.28;
    }
    return 1.08;
}

export function resolvePreviewColorGain(metadata?: GeneratedEnvironmentMetadata | null) {
    if (!isSingleImagePreviewMetadata(metadata)) {
        return 1;
    }

    const liftedMeanLuma = Number(metadata?.preview_enhancement?.exposure?.mean_luma_after ?? NaN);
    if (!Number.isFinite(liftedMeanLuma)) {
        return 1.05;
    }
    if (liftedMeanLuma < 0.12) {
        return 1.95;
    }
    if (liftedMeanLuma < 0.18) {
        return 1.65;
    }
    if (liftedMeanLuma < 0.28) {
        return 1.35;
    }
    if (liftedMeanLuma < 0.38) {
        return 1.15;
    }
    return 1;
}

function isRetryableSplatFetchStatus(status: number) {
    return TRANSIENT_STORAGE_FETCH_STATUSES.has(status);
}

function resolveSplatFetchRetryDelayMs(response: Response, attempt: number) {
    const retryAfterHeader = response.headers.get("retry-after");
    if (retryAfterHeader) {
        const retryAfterSeconds = Number.parseFloat(retryAfterHeader);
        if (Number.isFinite(retryAfterSeconds)) {
            return Math.max(0, Math.min(2_500, Math.round(retryAfterSeconds * 1000)));
        }
    }
    return SPLAT_FETCH_RETRY_DELAYS_MS[attempt] ?? SPLAT_FETCH_RETRY_DELAYS_MS[SPLAT_FETCH_RETRY_DELAYS_MS.length - 1] ?? 0;
}

export function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
}

function isRetryableSplatFetchError(error: unknown) {
    if (isAbortError(error)) {
        return false;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    return /fetch/i.test(error.message) || /network/i.test(error.message) || /bad gateway/i.test(error.message);
}

async function waitForRetryDelay(delayMs: number, signal: AbortSignal) {
    if (delayMs <= 0) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);

        const onAbort = () => {
            window.clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            reject(new DOMException("Aborted", "AbortError"));
        };

        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function createSharpGaussianQuadGeometry() {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.instanceCount = 0;
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute("corner", new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    return geometry;
}

function createSharpGaussianTexture(data: Uint16Array, width: number, height: number) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

function createSharpGaussianArrayTexture(data: Uint16Array, width: number, height: number, depth: number) {
    const texture = new THREE.DataArrayTexture(data, width, height, depth);
    texture.type = THREE.HalfFloatType;
    texture.format = THREE.RGBAFormat;
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

function createSharpGaussianOrderTexture(data: Float32Array, width: number, height: number) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

function resolveSharpGaussianOrderTextureSize(count: number) {
    const safeCount = Math.max(1, Math.ceil(count));
    const width = Math.max(1, Math.ceil(Math.sqrt(safeCount)));
    const height = Math.max(1, Math.ceil(safeCount / width));
    return {
        width,
        height,
        capacity: width * height,
    };
}

export function syncSharpGaussianOrderTexturePayload(
    current: SharpGaussianOrderTexture | null,
    activeIndices: Uint32Array,
    cullSentinel = DIRECT_ORDER_CULL_SENTINEL,
) {
    const nextSize = resolveSharpGaussianOrderTextureSize(activeIndices.length);
    if (!current || current.capacity !== nextSize.capacity || current.width !== nextSize.width || current.height !== nextSize.height) {
        current?.texture.dispose();
        const data = new Float32Array(nextSize.capacity * 4);

        for (let index = 0; index < nextSize.capacity; index += 1) {
            data[index * 4] = cullSentinel;
        }

        for (let index = 0; index < activeIndices.length; index += 1) {
            const baseOffset = index * 4;
            data[baseOffset + 0] = 0;
            data[baseOffset + 1] = activeIndices[index];
            data[baseOffset + 2] = 1;
        }

        return {
            texture: createSharpGaussianOrderTexture(data, nextSize.width, nextSize.height),
            width: nextSize.width,
            height: nextSize.height,
            capacity: nextSize.capacity,
            data,
        };
    }

    current.data.fill(0);
    for (let index = 0; index < current.capacity; index += 1) {
        current.data[index * 4] = cullSentinel;
    }

    for (let index = 0; index < activeIndices.length; index += 1) {
        const baseOffset = index * 4;
        current.data[baseOffset + 0] = 0;
        current.data[baseOffset + 1] = activeIndices[index];
        current.data[baseOffset + 2] = 1;
    }

    current.texture.needsUpdate = true;
    return current;
}

export function buildSharpGaussianPayloadFromSerialized(data: SerializedSharpGaussianPayload): SharpGaussianPayload {
    const geometry = createSharpGaussianQuadGeometry();
    geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(...data.boundingBoxMin),
        new THREE.Vector3(...data.boundingBoxMax),
    );
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...data.boundingSphereCenter), data.boundingSphereRadius);

    return {
        geometry,
        centerAlphaTexture: createSharpGaussianTexture(data.centerAlphaData, data.textureWidth, data.textureHeight),
        colorTexture: createSharpGaussianTexture(data.colorData, data.textureWidth, data.textureHeight),
        scaleTexture: createSharpGaussianTexture(data.scaleData, data.textureWidth, data.textureHeight),
        rotationTexture: createSharpGaussianTexture(data.rotationData, data.textureWidth, data.textureHeight),
        shTexture: createSharpGaussianArrayTexture(data.shData, data.shTextureWidth, data.shTextureHeight, data.shTextureDepth),
        shTextureWidth: data.shTextureWidth,
        shTextureHeight: data.shTextureHeight,
        shTextureDepth: data.shTextureDepth,
        colorPayloadMode: data.colorPayloadMode,
        shBasisCount: data.shBasisCount,
        textureWidth: data.textureWidth,
        textureHeight: data.textureHeight,
        count: data.count,
        chunks: data.chunks.map((chunk) => ({
            start: chunk.start,
            count: chunk.count,
            code: chunk.code,
            boundingBox: new THREE.Box3(new THREE.Vector3(...chunk.boundingBoxMin), new THREE.Vector3(...chunk.boundingBoxMax)),
            boundingSphere: new THREE.Sphere(new THREE.Vector3(...chunk.boundingSphereCenter), chunk.boundingSphereRadius),
        })),
        sceneRadius: data.sceneRadius,
        previewFocus: {
            center: data.previewFocusCenter,
            radius: Math.max(1e-3, data.previewFocusRadius),
            forward: data.previewFocusForward,
        },
        debugSamples: data.debugSamples,
    };
}

export function disposeSharpGaussianPayload(payload: SharpGaussianPayload) {
    payload.geometry.dispose();
    payload.centerAlphaTexture.dispose();
    payload.colorTexture.dispose();
    payload.scaleTexture.dispose();
    payload.rotationTexture.dispose();
    payload.shTexture.dispose();
}

export function resolveSharpGaussianPreviewBounds(payload: SharpGaussianPayload): PreviewBounds | null {
    const sphere = payload.previewFocus ?? (payload.geometry.boundingSphere
        ? {
              center: [
                  payload.geometry.boundingSphere.center.x,
                  payload.geometry.boundingSphere.center.y,
                  payload.geometry.boundingSphere.center.z,
              ] as [number, number, number],
              radius: payload.geometry.boundingSphere.radius,
              forward: [0, 0, 1] as [number, number, number],
          }
        : null);

    if (!sphere) {
        return null;
    }

    return {
        center: sphere.center,
        radius: Math.max(1e-3, sphere.radius),
        forward: sphere.forward,
    };
}

async function buildSharpGaussianPayloadInWorker({
    sourceBuffer,
    pointBudget,
    maxTextureSize,
    metadata,
    signal,
    onProgress,
}: {
    sourceBuffer: ArrayBuffer;
    pointBudget: number;
    maxTextureSize: number;
    metadata?: GeneratedEnvironmentMetadata | null;
    signal: AbortSignal;
    onProgress?: (message: string) => void;
}) {
    const worker = new Worker(new URL("./sharpGaussianPlyWorker.ts", import.meta.url), { type: "module" });

    return await new Promise<SharpGaussianPayload>((resolve, reject) => {
        let settled = false;

        const finalize = (callback: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            signal.removeEventListener("abort", onAbort);
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
            callback();
        };

        const onAbort = () => {
            finalize(() => reject(new DOMException("Aborted", "AbortError")));
        };

        if (signal.aborted) {
            onAbort();
            return;
        }

        signal.addEventListener("abort", onAbort, { once: true });

        worker.onmessage = (event: MessageEvent) => {
            const data = event.data as
                | { type: "progress"; label?: string }
                | { type: "success"; payload: SerializedSharpGaussianPayload }
                | { type: "error"; message?: string; stack?: string };

            if (data.type === "progress") {
                if (typeof data.label === "string") {
                    onProgress?.(data.label);
                }
                return;
            }

            if (data.type === "success") {
                finalize(() => resolve(buildSharpGaussianPayloadFromSerialized(data.payload)));
                return;
            }

            finalize(() => {
                const error = new Error(data.message || "Worker parse failed.");
                if (data.stack) {
                    error.stack = data.stack;
                }
                reject(error);
            });
        };

        worker.onerror = (event) => {
            finalize(() => reject(event.error instanceof Error ? event.error : new Error(event.message || "Worker parse failed.")));
        };

        worker.postMessage(
            {
                type: "parse",
                buffer: sourceBuffer,
                pointBudget,
                maxTextureSize,
                colorEncoding: metadata?.rendering?.color_encoding ?? null,
                applyPreviewOrientation: shouldApplyPreviewOrientation(metadata),
            },
            [sourceBuffer],
        );
    });
}

export async function loadSharpGaussianPayload({
    source,
    pointBudget,
    maxTextureSize,
    metadata,
    signal,
    onProgress,
}: {
    source: string;
    pointBudget: number;
    maxTextureSize: number;
    metadata?: GeneratedEnvironmentMetadata | null;
    signal: AbortSignal;
    onProgress?: (message: string) => void;
}) {
    let arrayBuffer: ArrayBuffer | null = null;

    for (let attempt = 0; attempt <= SPLAT_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            const response = await fetch(source, {
                cache: SPLAT_FETCH_CACHE_MODE,
                signal,
            });

            if (!response.ok) {
                const message = `Could not load ${source}: ${response.status} ${response.statusText}`.trim();
                if (!isRetryableSplatFetchStatus(response.status) || attempt >= SPLAT_FETCH_RETRY_DELAYS_MS.length) {
                    throw new Error(message);
                }

                const nextAttempt = attempt + 2;
                const totalAttempts = SPLAT_FETCH_RETRY_DELAYS_MS.length + 1;
                const proxyStatus = response.headers.get("x-gauset-proxy-status");
                const retryDelayMs = resolveSplatFetchRetryDelayMs(response, attempt);
                onProgress?.(
                    proxyStatus === "backend-unavailable"
                        ? `Local backend unavailable. Retrying environment splat ${nextAttempt}/${totalAttempts}...`
                        : `Storage proxy unavailable (${response.status}). Retrying environment splat ${nextAttempt}/${totalAttempts}...`,
                );
                await waitForRetryDelay(retryDelayMs, signal);
                continue;
            }

            arrayBuffer = await response.arrayBuffer();
            break;
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            if (!isRetryableSplatFetchError(error) || attempt >= SPLAT_FETCH_RETRY_DELAYS_MS.length) {
                throw error;
            }

            const nextAttempt = attempt + 2;
            const totalAttempts = SPLAT_FETCH_RETRY_DELAYS_MS.length + 1;
            onProgress?.(`Waiting for local storage bridge. Retrying environment splat ${nextAttempt}/${totalAttempts}...`);
            await waitForRetryDelay(SPLAT_FETCH_RETRY_DELAYS_MS[attempt], signal);
        }
    }

    if (!arrayBuffer) {
        throw new Error(`Could not load ${source}: storage proxy did not return a splat payload.`.trim());
    }

    onProgress?.(`Parsing environment splat in worker (${Math.max(1, Math.round(arrayBuffer.byteLength / (1024 * 1024)))}MB)...`);

    return await buildSharpGaussianPayloadInWorker({
        sourceBuffer: arrayBuffer,
        pointBudget,
        maxTextureSize,
        metadata,
        signal,
        onProgress,
    });
}

export { DIRECT_ORDER_CULL_SENTINEL, MAX_GPU_SORT_WORKING_SET_BYTES };
