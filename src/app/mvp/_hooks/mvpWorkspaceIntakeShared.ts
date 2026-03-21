"use client";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import {
    hasAllowedDirectUploadExtension,
    isAllowedDirectUploadContentType,
    MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES,
    MVP_DIRECT_UPLOAD_ALLOWED_EXTENSIONS,
} from "@/lib/mvp-upload";
import type {
    BackendLaneCapability,
    CaptureSessionResponse,
    GeneratedEnvironmentMetadata,
    ProviderCatalogEntry,
    ProviderModelInfo,
    SetupStatusResponse,
    UploadResponse,
} from "@/lib/mvp-product";

import type { MvpWorkspaceShellController } from "./useMvpWorkspaceShellController";
import type { MvpWorkspaceSessionController } from "./useMvpWorkspaceSessionController";

export const POLL_INTERVAL_MS = 1200;
export const POLL_TIMEOUT_MS = 240_000;
const TRANSIENT_JOB_POLL_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type JobStatus = "processing" | "completed" | "failed";
export type IntakeMode = "import" | "generate";
export type JobType = "environment" | "asset" | "reconstruction" | "generated_image";

export interface GenerateResponse {
    job_id?: string;
    scene_id?: string;
    asset_id?: string;
    status: JobStatus;
    urls?: Record<string, string>;
}

export interface JobStatusResponse {
    id: string;
    type: JobType;
    status: JobStatus;
    error?: string | null;
    image_id?: string;
    created_at?: string;
    updated_at?: string;
    result?: {
        scene_id?: string;
        asset_id?: string;
        files?: Record<string, string>;
        urls?: Record<string, string>;
        images?: UploadResponse[];
    } | null;
}

export interface JobRecord {
    id: string;
    type: JobType;
    imageId: string;
    label: string;
    status: JobStatus;
    createdAt: string;
    updatedAt: string;
    error?: string;
}

export interface UploadItem extends UploadResponse {
    sourceName: string;
    previewUrl: string;
    uploadedAt: string;
}

export interface UploadQueueItem {
    id: string;
    fileName: string;
    sizeBytes: number;
    progressPercent: number;
    transport: "blob" | "backend" | "legacy";
    phase: "queued" | "uploading" | "registering" | "complete" | "error";
    errorMessage?: string;
}

export interface UploadQueueSummary {
    activeFileName: string;
    activeTransport: "blob" | "backend" | "legacy" | null;
    completedCount: number;
    totalCount: number;
}

export type WorkspaceIntakeActions = Pick<MvpWorkspaceShellController, "replaceSceneEnvironment"> &
    Pick<
        MvpWorkspaceSessionController,
        | "setActiveScene"
        | "setAssetsList"
        | "markProgrammaticSceneChange"
        | "handleInputReady"
        | "handleGenerationStart"
        | "handleGenerationSuccess"
        | "handleGenerationError"
    >;

export type MvpWorkspaceIntakeSetupState = {
    backendMode: "checking" | "ready" | "degraded" | "offline";
    backendMessage: string;
    setupStatus: SetupStatusResponse | null;
    providersLoading: boolean;
    imageProviders: ProviderCatalogEntry[];
    selectedProvider: ProviderCatalogEntry | null;
    selectedProviderModel: ProviderModelInfo | null;
    selectedProviderId: string;
    setSelectedProviderId: (value: string) => void;
    selectedModelId: string;
    setSelectedModelId: (value: string) => void;
    providerAspectRatios: string[];
    selectedModelSupportsReferences: boolean;
    selectedModelSupportsNegativePrompt: boolean;
    selectedModelSupportsMultiOutput: boolean;
    selectedProviderMaxOutputs: number;
    selectedProviderMaxReferences: number;
    providerGenerationEnabled: boolean;
    previewCapability: BackendLaneCapability | undefined;
    reconstructionCapability: BackendLaneCapability | undefined;
    assetCapability: BackendLaneCapability | undefined;
    setupTruth: string;
    reconstructionBackendName: string;
    benchmarkStatusLabel: string;
    releaseGateFailureCount: number;
    defaultMinimumCaptureImages: number;
    defaultRecommendedCaptureImages: number;
    reconstructionAvailable: boolean;
    backendWritesDisabled: boolean;
    backendWritesDisabledMessage: string;
};

export const ACCEPTED_IMAGE_TYPES = new Set(MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES);
export const ACCEPTED_IMAGE_EXTENSIONS = new Set(MVP_DIRECT_UPLOAD_ALLOWED_EXTENSIONS);

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientJobPollErrorMessage(message: string) {
    const normalized = message.trim().toLowerCase();
    return (
        normalized === "fetch failed" ||
        normalized === "failed to fetch" ||
        normalized.includes("backend could not be contacted") ||
        normalized.includes("network error") ||
        normalized.includes("socket hang up") ||
        normalized.includes("econnreset") ||
        normalized.includes("timed out")
    );
}

export const defaultEnvironmentUrls = (sceneId: string) => ({
    viewer: `/storage/scenes/${sceneId}/environment`,
    splats: `/storage/scenes/${sceneId}/environment/splats.ply`,
    cameras: `/storage/scenes/${sceneId}/environment/cameras.json`,
    metadata: `/storage/scenes/${sceneId}/environment/metadata.json`,
    preview_projection: `/storage/scenes/${sceneId}/environment/preview-projection.png`,
});

export const defaultAssetUrls = (assetId: string) => ({
    mesh: `/storage/assets/${assetId}/mesh.glb`,
    texture: `/storage/assets/${assetId}/texture.png`,
    preview: `/storage/assets/${assetId}/preview.png`,
});

export const formatBandLabel = (value?: string | null) => {
    if (!value) return "";
    return value.replaceAll("_", " ");
};

export const describeUnavailableCapability = (capability: BackendLaneCapability | undefined, fallback: string) => {
    const truth = capability?.truth?.trim();
    if (truth) {
        return truth;
    }

    const summary = capability?.summary?.trim();
    if (summary) {
        return summary;
    }

    return fallback;
};

export const truncateLabel = (value?: string | null, max = 52) => {
    if (!value) return "";
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export const getFileExtension = (value: string) => {
    const match = /\.[^.]+$/.exec(value.toLowerCase());
    return match?.[0] ?? "";
};

export const isSupportedImageFile = (file: File) => {
    if (isAllowedDirectUploadContentType(file.type)) {
        return true;
    }

    return hasAllowedDirectUploadExtension(file.name);
};

export async function pollJob(jobId: string): Promise<JobStatusResponse> {
    const start = Date.now();
    let lastTransientMessage = "";

    while (Date.now() - start < POLL_TIMEOUT_MS) {
        try {
            const response = await fetch(`${MVP_API_BASE_URL}/jobs/${jobId}`, { cache: "no-store" });
            if (!response.ok) {
                const message = await extractApiError(response, `Job polling failed (${response.status})`);
                if (TRANSIENT_JOB_POLL_STATUSES.has(response.status)) {
                    lastTransientMessage = message;
                    await sleep(POLL_INTERVAL_MS);
                    continue;
                }
                throw new Error(message);
            }

            const payload = (await response.json()) as JobStatusResponse;
            if (payload.status === "completed" || payload.status === "failed") {
                return payload;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Job polling failed.";
            if (isTransientJobPollErrorMessage(message)) {
                lastTransientMessage = message;
                await sleep(POLL_INTERVAL_MS);
                continue;
            }
            throw error;
        }

        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
        lastTransientMessage
            ? `Timed out waiting for generation job to finish. Last transient error: ${lastTransientMessage}`
            : "Timed out waiting for generation job to finish.",
    );
}

export async function fetchEnvironmentMetadata(metadataUrl: string) {
    try {
        const response = await fetch(metadataUrl, { cache: "no-store" });
        if (!response.ok) return null;
        return (await response.json()) as GeneratedEnvironmentMetadata;
    } catch {
        return null;
    }
}

export function deriveCaptureSessionNextCounts(
    captureSession: CaptureSessionResponse | null,
    defaultMinimumCaptureImages: number,
    defaultRecommendedCaptureImages: number,
) {
    return {
        minimumCaptureImages: captureSession?.minimum_images ?? defaultMinimumCaptureImages,
        recommendedCaptureImages: captureSession?.recommended_images ?? defaultRecommendedCaptureImages,
    };
}
