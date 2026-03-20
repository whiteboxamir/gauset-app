"use client";

import { useCallback, useRef, useState } from "react";

import { extractApiError, MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";
import type {
    BackendLaneCapability,
    GeneratedEnvironmentMetadata,
    ProviderCatalogEntry,
    ProviderModelInfo,
    UploadResponse,
} from "@/lib/mvp-product";

import {
    defaultAssetUrls,
    describeUnavailableCapability,
    pollJob,
    truncateLabel,
    type GenerateResponse,
    type IntakeMode,
    type JobRecord,
    type JobType,
    type UploadItem,
    type WorkspaceIntakeActions,
} from "./mvpWorkspaceIntakeShared";

type EnvironmentSceneLoader = (
    sceneId: string,
    urlCandidates?: Record<string, string>,
    fileCandidates?: Record<string, string>,
    fallbackLane?: "preview" | "reconstruction",
) => Promise<{ metadata: GeneratedEnvironmentMetadata | null }>;

export function useMvpWorkspaceGenerationController({
    backendWritesDisabled,
    backendWritesDisabledMessage,
    selectedUpload,
    selectedProvider,
    selectedProviderModel,
    providerGenerationEnabled,
    previewCapability,
    assetCapability,
    generatePrompt,
    generateNegativePrompt,
    generateAspectRatio,
    generateCount,
    selectedReferenceIds,
    selectedModelSupportsNegativePrompt,
    selectedModelSupportsMultiOutput,
    selectedModelSupportsReferences,
    appendGeneratedUploads,
    setIntakeMode,
    upsertJob,
    findActiveJob,
    loadEnvironmentIntoScene,
    setStatusText,
    setErrorText,
    markProgrammaticSceneChange,
    setAssetsList,
    handleGenerationStart,
    handleGenerationSuccess,
    handleGenerationError,
}: {
    backendWritesDisabled: boolean;
    backendWritesDisabledMessage: string;
    selectedUpload: UploadItem | null;
    selectedProvider: ProviderCatalogEntry | null;
    selectedProviderModel: ProviderModelInfo | null;
    providerGenerationEnabled: boolean;
    previewCapability: BackendLaneCapability | undefined;
    assetCapability: BackendLaneCapability | undefined;
    generatePrompt: string;
    generateNegativePrompt: string;
    generateAspectRatio: string;
    generateCount: number;
    selectedReferenceIds: string[];
    selectedModelSupportsNegativePrompt: boolean;
    selectedModelSupportsMultiOutput: boolean;
    selectedModelSupportsReferences: boolean;
    appendGeneratedUploads: (generatedImages: UploadResponse[], providerLabel?: string | null) => UploadItem[];
    setIntakeMode: (mode: IntakeMode) => void;
    upsertJob: (job: JobRecord) => void;
    findActiveJob: (type: JobType, imageId: string) => JobRecord | undefined;
    loadEnvironmentIntoScene: EnvironmentSceneLoader;
    setStatusText: (value: string) => void;
    setErrorText: (value: string) => void;
    markProgrammaticSceneChange: WorkspaceIntakeActions["markProgrammaticSceneChange"];
    setAssetsList: WorkspaceIntakeActions["setAssetsList"];
    handleGenerationStart: WorkspaceIntakeActions["handleGenerationStart"];
    handleGenerationSuccess: WorkspaceIntakeActions["handleGenerationSuccess"];
    handleGenerationError: WorkspaceIntakeActions["handleGenerationError"];
}) {
    const previewGenerationLockRef = useRef<string | null>(null);
    const assetGenerationLockRef = useRef<string | null>(null);
    const generatedImageLockRef = useRef<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const [isGeneratingAsset, setIsGeneratingAsset] = useState(false);

    const runPreviewGeneration = useCallback(
        async (upload: Pick<UploadItem, "image_id" | "sourceName">) => {
            if (previewGenerationLockRef.current) {
                setStatusText("World preview already running.");
                return null;
            }

            previewGenerationLockRef.current = upload.image_id;
            try {
                const existingJob = findActiveJob("environment", upload.image_id);
                if (existingJob) {
                    setStatusText(`Preview already running: ${existingJob.id}`);
                    return null;
                }

                handleGenerationStart({
                    kind: "preview",
                    label: "Building world preview",
                    detail: `Turning ${upload.sourceName} into a persistent world preview.`,
                    inputLabel: upload.sourceName,
                });
                setStatusText(
                    previewCapability?.lane_truth === "single_image_lrm_preview"
                        ? "Analyzing the selected still and building the world preview. This local single-image lane can take a couple of minutes."
                        : "Analyzing selected still and building the world preview...",
                );

                const response = await fetch(`${MVP_API_BASE_URL}/generate/environment`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image_id: upload.image_id }),
                });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Preview generation failed (${response.status})`));
                }

                const payload = (await response.json()) as GenerateResponse;
                const jobId = payload.job_id ?? payload.scene_id;
                if (!jobId) {
                    throw new Error("Missing job id from preview generation response.");
                }

                setStatusText(
                    previewCapability?.lane_truth === "single_image_lrm_preview"
                        ? "World preview queued. This local single-image preview can take a couple of minutes; current output stays visible until the new preview is ready..."
                        : "World preview queued. Current output stays visible until the new preview is ready...",
                );

                upsertJob({
                    id: jobId,
                    type: "environment",
                    imageId: upload.image_id,
                    label: upload.sourceName,
                    status: "processing",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                const finalJob = await pollJob(jobId);
                upsertJob({
                    id: jobId,
                    type: "environment",
                    imageId: upload.image_id,
                    label: upload.sourceName,
                    status: finalJob.status,
                    createdAt: finalJob.created_at ?? new Date().toISOString(),
                    updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                    error: finalJob.error ?? undefined,
                });
                if (finalJob.status === "failed") {
                    throw new Error(finalJob.error || "Preview generation failed.");
                }

                const sceneId = finalJob.result?.scene_id ?? payload.scene_id ?? jobId;
                const result = await loadEnvironmentIntoScene(
                    sceneId,
                    finalJob.result?.urls ?? payload.urls,
                    finalJob.result?.files ?? undefined,
                    "preview",
                );
                handleGenerationSuccess({
                    kind: "preview",
                    label: "World preview ready",
                    detail: `Loaded ${sceneId} from ${upload.sourceName}.`,
                    inputLabel: upload.sourceName,
                    sceneId,
                });
                return {
                    sceneId,
                    metadata: result.metadata,
                };
            } finally {
                if (previewGenerationLockRef.current === upload.image_id) {
                    previewGenerationLockRef.current = null;
                }
            }
        },
        [
            findActiveJob,
            handleGenerationStart,
            handleGenerationSuccess,
            loadEnvironmentIntoScene,
            setStatusText,
            upsertJob,
        ],
    );

    const generateImage = useCallback(
        async ({ autoPreview }: { autoPreview: boolean }) => {
            if (backendWritesDisabled) {
                setErrorText(backendWritesDisabledMessage);
                return;
            }

            if (!providerGenerationEnabled) {
                setErrorText(
                    "Prompt-based still generation is disabled in this backend. Enable GAUSET_ENABLE_PROVIDER_IMAGE_GEN=1 or keep using upload-based preview and asset lanes.",
                );
                return;
            }

            const prompt = generatePrompt.trim();
            if (!selectedProvider || !selectedProviderModel) {
                setErrorText("No provider is ready for image generation.");
                return;
            }
            if (!selectedProvider.available) {
                setErrorText(selectedProvider.availability_reason ?? `${selectedProvider.label} is not ready in this backend.`);
                return;
            }
            if (!prompt) {
                setErrorText("Prompt is required for provider generation.");
                return;
            }
            if (autoPreview && !previewCapability?.available) {
                setErrorText(
                    describeUnavailableCapability(
                        previewCapability,
                        "Automatic world build is unavailable because the preview lane is not connected in this backend.",
                    ),
                );
                return;
            }

            const jobKey = `${selectedProvider.id}:${selectedProviderModel.id}:${prompt}`;
            if (generatedImageLockRef.current) {
                setStatusText("Image generation already running.");
                return;
            }

            const existingJob = findActiveJob("generated_image", jobKey);
            if (existingJob) {
                setStatusText(`Image generation already running: ${existingJob.id}`);
                return;
            }

            generatedImageLockRef.current = jobKey;
            setIsGeneratingImage(true);
            setErrorText("");
            handleGenerationStart({
                kind: "generated_image",
                label: autoPreview ? "Generating source still for a new world" : "Generating source still",
                detail: `${selectedProvider.label} is generating a still from your prompt.`,
                inputLabel: truncateLabel(prompt, 72),
            });
            setStatusText(
                autoPreview
                    ? `Generating a source still with ${selectedProvider.label} before building the world...`
                    : `Generating a source still with ${selectedProvider.label}...`,
            );

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/generate/image`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: selectedProvider.id,
                        model: selectedProviderModel.id,
                        prompt,
                        negative_prompt: selectedModelSupportsNegativePrompt ? generateNegativePrompt.trim() || undefined : undefined,
                        aspect_ratio: generateAspectRatio,
                        count: selectedModelSupportsMultiOutput ? generateCount : 1,
                        reference_image_ids: selectedModelSupportsReferences ? selectedReferenceIds : [],
                    }),
                });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Image generation failed (${response.status})`));
                }

                const payload = (await response.json()) as GenerateResponse;
                if (!payload.job_id) {
                    throw new Error("Missing job id from image generation response.");
                }

                upsertJob({
                    id: payload.job_id,
                    type: "generated_image",
                    imageId: jobKey,
                    label: `${selectedProvider.label} · ${truncateLabel(prompt, 36)}`,
                    status: "processing",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                const finalJob = await pollJob(payload.job_id);
                upsertJob({
                    id: payload.job_id,
                    type: "generated_image",
                    imageId: jobKey,
                    label: `${selectedProvider.label} · ${truncateLabel(prompt, 36)}`,
                    status: finalJob.status,
                    createdAt: finalJob.created_at ?? new Date().toISOString(),
                    updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                    error: finalJob.error ?? undefined,
                });

                if (finalJob.status === "failed") {
                    throw new Error(finalJob.error || "Image generation failed.");
                }

                const generatedImages = Array.isArray(finalJob.result?.images) ? finalJob.result.images : [];
                if (generatedImages.length === 0) {
                    throw new Error("Image generation completed without any usable outputs.");
                }

                const generatedItems = appendGeneratedUploads(generatedImages, selectedProvider.label);
                setIntakeMode("import");

                if (autoPreview && generatedItems.length > 0) {
                    setStatusText("Generated still ready. Building the persistent world now...");
                    const preview = await runPreviewGeneration(generatedItems[0]);
                    if (!preview) {
                        return;
                    }
                    setStatusText(
                        `${preview.metadata?.truth_label ?? "Preview"} ready: ${preview.sceneId}${
                            preview.metadata?.rendering?.color_encoding === "sh_dc_rgb" ? " · SH colorized" : ""
                        }`,
                    );
                    return;
                }

                handleGenerationSuccess({
                    kind: "generated_image",
                    label: "Source still ready",
                    detail:
                        generatedImages.length === 1
                            ? `Generated 1 still via ${selectedProvider.label}.`
                            : `Generated ${generatedImages.length} stills via ${selectedProvider.label}.`,
                    inputLabel: truncateLabel(prompt, 72),
                });
                setStatusText(
                    generatedImages.length === 1
                        ? `Generated 1 image via ${selectedProvider.label}.`
                        : `Generated ${generatedImages.length} images via ${selectedProvider.label}.`,
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : "Image generation failed.";
                setErrorText(message);
                handleGenerationError({
                    label: "Source still failed",
                    detail: message,
                });
            } finally {
                if (generatedImageLockRef.current === jobKey) {
                    generatedImageLockRef.current = null;
                }
                setIsGeneratingImage(false);
            }
        },
        [
            appendGeneratedUploads,
            backendWritesDisabled,
            backendWritesDisabledMessage,
            findActiveJob,
            generateAspectRatio,
            generateCount,
            generateNegativePrompt,
            generatePrompt,
            handleGenerationError,
            handleGenerationStart,
            handleGenerationSuccess,
            previewCapability,
            providerGenerationEnabled,
            runPreviewGeneration,
            selectedModelSupportsMultiOutput,
            selectedModelSupportsNegativePrompt,
            selectedModelSupportsReferences,
            selectedProvider,
            selectedProviderModel,
            selectedReferenceIds,
            setErrorText,
            setIntakeMode,
            setStatusText,
            upsertJob,
        ],
    );

    const generatePreview = useCallback(async () => {
        if (!selectedUpload) {
            return;
        }
        if (backendWritesDisabled) {
            setErrorText(backendWritesDisabledMessage);
            return;
        }
        if (!previewCapability?.available) {
            setErrorText(
                describeUnavailableCapability(
                    previewCapability,
                    "Preview generation is unavailable in this backend.",
                ),
            );
            return;
        }
        if (previewGenerationLockRef.current) {
            setStatusText("World preview already running.");
            return;
        }

        setIsGeneratingPreview(true);
        setErrorText("");
        setStatusText("Building a persistent world from the selected still...");

        try {
            const preview = await runPreviewGeneration(selectedUpload);
            if (!preview) {
                return;
            }
            setStatusText(
                `${preview.metadata?.truth_label ?? "Preview"} ready: ${preview.sceneId}${
                    preview.metadata?.rendering?.color_encoding === "sh_dc_rgb" ? " · SH colorized" : ""
                }`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "Preview generation failed.";
            setErrorText(message);
            handleGenerationError({
                label: "World preview failed",
                detail: message,
            });
        } finally {
            setIsGeneratingPreview(false);
        }
    }, [
        backendWritesDisabled,
        backendWritesDisabledMessage,
        handleGenerationError,
        previewCapability,
        runPreviewGeneration,
        selectedUpload,
        setErrorText,
        setStatusText,
    ]);

    const generateAsset = useCallback(async () => {
        if (!selectedUpload) {
            return;
        }
        if (backendWritesDisabled) {
            setErrorText(backendWritesDisabledMessage);
            return;
        }
        if (!assetCapability?.available) {
            setErrorText(
                describeUnavailableCapability(
                    assetCapability,
                    "Asset generation is unavailable in this backend.",
                ),
            );
            return;
        }
        if (assetGenerationLockRef.current) {
            setStatusText("3D asset extraction already running.");
            return;
        }

        const lockKey = selectedUpload.image_id;
        const existingJob = findActiveJob("asset", selectedUpload.image_id);
        if (existingJob) {
            setStatusText(`Asset already running: ${existingJob.id}`);
            return;
        }

        assetGenerationLockRef.current = lockKey;
        setIsGeneratingAsset(true);
        setErrorText("");
        handleGenerationStart({
            kind: "asset",
            label: "Extracting 3D asset",
            detail: `Turning ${selectedUpload.sourceName} into a reusable 3D asset.`,
            inputLabel: selectedUpload.sourceName,
        });
        setStatusText("Extracting a reusable 3D asset from the selected still...");

        try {
            const response = await fetch(`${MVP_API_BASE_URL}/generate/asset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_id: selectedUpload.image_id }),
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Asset generation failed (${response.status})`));
            }

            const payload = (await response.json()) as GenerateResponse;
            const jobId = payload.job_id ?? payload.asset_id;
            if (!jobId) {
                throw new Error("Missing job id from asset generation response.");
            }

            upsertJob({
                id: jobId,
                type: "asset",
                imageId: selectedUpload.image_id,
                label: selectedUpload.sourceName,
                status: "processing",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const finalJob = await pollJob(jobId);
            upsertJob({
                id: jobId,
                type: "asset",
                imageId: selectedUpload.image_id,
                label: selectedUpload.sourceName,
                status: finalJob.status,
                createdAt: finalJob.created_at ?? new Date().toISOString(),
                updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                error: finalJob.error ?? undefined,
            });
            if (finalJob.status === "failed") {
                throw new Error(finalJob.error || "Asset generation failed.");
            }

            const assetId = finalJob.result?.asset_id ?? payload.asset_id ?? jobId;
            const fallbackUrls = defaultAssetUrls(assetId);
            const urls = {
                mesh: toProxyUrl(finalJob.result?.urls?.mesh ?? payload.urls?.mesh ?? fallbackUrls.mesh),
                texture: toProxyUrl(finalJob.result?.urls?.texture ?? payload.urls?.texture ?? fallbackUrls.texture),
                preview: toProxyUrl(finalJob.result?.urls?.preview ?? payload.urls?.preview ?? fallbackUrls.preview),
            };

            const newAsset = {
                id: assetId,
                name: assetId,
                mesh: urls.mesh,
                texture: urls.texture,
                preview: urls.preview,
                instanceId: `inst_${Date.now()}`,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
            };
            markProgrammaticSceneChange();
            setAssetsList((previous: any[]) => [...previous, newAsset]);
            handleGenerationSuccess({
                kind: "asset",
                label: "3D asset ready",
                detail: `Added ${assetId} to the local asset tray.`,
                inputLabel: selectedUpload.sourceName,
                assetId,
            });
            setStatusText(`Asset ready: ${assetId}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Asset generation failed.";
            setErrorText(message);
            handleGenerationError({
                label: "3D asset failed",
                detail: message,
            });
        } finally {
            if (assetGenerationLockRef.current === lockKey) {
                assetGenerationLockRef.current = null;
            }
            setIsGeneratingAsset(false);
        }
    }, [
        assetCapability,
        backendWritesDisabled,
        backendWritesDisabledMessage,
        findActiveJob,
        handleGenerationError,
        handleGenerationStart,
        handleGenerationSuccess,
        markProgrammaticSceneChange,
        selectedUpload,
        setAssetsList,
        setErrorText,
        setStatusText,
        upsertJob,
    ]);

    return {
        isGeneratingImage,
        isGeneratingPreview,
        isGeneratingAsset,
        generateImage,
        generatePreview,
        generateAsset,
    };
}
