"use client";

import { useCallback, useEffect, useState } from "react";

import { toProxyUrl } from "@/lib/mvp-api";

import {
    defaultEnvironmentUrls,
    fetchEnvironmentMetadata,
    type IntakeMode,
    type JobRecord,
    type JobType,
    type WorkspaceIntakeActions,
} from "./mvpWorkspaceIntakeShared";
import { useMvpWorkspaceCaptureController } from "./useMvpWorkspaceCaptureController";
import { useMvpWorkspaceGenerationController } from "./useMvpWorkspaceGenerationController";
import { useMvpWorkspaceIntakeSetupController } from "./useMvpWorkspaceIntakeSetupController";
import { useMvpWorkspaceUploadTrayController } from "./useMvpWorkspaceUploadTrayController";

export function useMvpWorkspaceIntakeController({
    setActiveScene,
    setAssetsList,
    replaceSceneEnvironment,
    markProgrammaticSceneChange,
    handleInputReady,
    handleGenerationStart,
    handleGenerationSuccess,
    handleGenerationError,
}: WorkspaceIntakeActions) {
    const [intakeMode, setIntakeMode] = useState<IntakeMode>("import");
    const [generatePrompt, setGeneratePrompt] = useState("");
    const [generateNegativePrompt, setGenerateNegativePrompt] = useState("");
    const [generateAspectRatio, setGenerateAspectRatio] = useState("16:9");
    const [generateCount, setGenerateCount] = useState(1);
    const [statusText, setStatusText] = useState("");
    const [errorText, setErrorText] = useState("");
    const [jobs, setJobs] = useState<JobRecord[]>([]);
    const setup = useMvpWorkspaceIntakeSetupController({
        generateAspectRatio,
        generateCount,
        setGenerateAspectRatio,
        setGenerateCount,
    });
    const uploadTray = useMvpWorkspaceUploadTrayController({
        backendMode: setup.backendMode,
        backendWritesDisabled: setup.backendWritesDisabled,
        backendWritesDisabledMessage: setup.backendWritesDisabledMessage,
        handleInputReady,
        selectedProviderMaxReferences: setup.selectedProviderMaxReferences,
        setErrorText,
        setStatusText,
    });
    const selectedReferenceCount = uploadTray.selectedReferenceIds.length;
    const setSelectedReferenceIds = uploadTray.setSelectedReferenceIds;

    useEffect(() => {
        if (!setup.selectedModelSupportsReferences && selectedReferenceCount > 0) {
            setSelectedReferenceIds([]);
        }
    }, [selectedReferenceCount, setSelectedReferenceIds, setup.selectedModelSupportsReferences]);

    const upsertJob = useCallback((job: JobRecord) => {
        setJobs((previous) => {
            const next = [...previous];
            const index = next.findIndex((item) => item.id === job.id);
            if (index >= 0) {
                next[index] = { ...next[index], ...job };
            } else {
                next.unshift(job);
            }
            return next
                .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
                .slice(0, 8);
        });
    }, []);

    const findActiveJob = useCallback(
        (type: JobType, imageId: string) =>
            jobs.find((job) => job.type === type && job.imageId === imageId && job.status === "processing"),
        [jobs],
    );

    const loadEnvironmentIntoScene = useCallback(
        async (
            sceneId: string,
            urlCandidates?: Record<string, string>,
            fileCandidates?: Record<string, string>,
            fallbackLane: "preview" | "reconstruction" = "preview",
        ) => {
            const fallbackUrls = defaultEnvironmentUrls(sceneId);
            const urls = {
                viewer: toProxyUrl(urlCandidates?.viewer ?? fallbackUrls.viewer),
                splats: toProxyUrl(urlCandidates?.splats ?? fallbackUrls.splats),
                cameras: toProxyUrl(urlCandidates?.cameras ?? fallbackUrls.cameras),
                metadata: toProxyUrl(urlCandidates?.metadata ?? fallbackUrls.metadata),
                preview_projection: toProxyUrl(urlCandidates?.preview_projection ?? fallbackUrls.preview_projection),
            };
            const metadata = await fetchEnvironmentMetadata(urls.metadata);
            markProgrammaticSceneChange();
            replaceSceneEnvironment({
                id: sceneId,
                lane: metadata?.lane ?? fallbackLane,
                urls,
                files: fileCandidates ?? null,
                metadata,
            });
            setActiveScene(sceneId);
            return {
                metadata,
            };
        },
        [markProgrammaticSceneChange, replaceSceneEnvironment, setActiveScene],
    );

    const generation = useMvpWorkspaceGenerationController({
        backendWritesDisabled: setup.backendWritesDisabled,
        backendWritesDisabledMessage: setup.backendWritesDisabledMessage,
        selectedUpload: uploadTray.selectedUpload,
        selectedProvider: setup.selectedProvider,
        selectedProviderModel: setup.selectedProviderModel,
        providerGenerationEnabled: setup.providerGenerationEnabled,
        previewCapability: setup.previewCapability,
        assetCapability: setup.assetCapability,
        generatePrompt,
        generateNegativePrompt,
        generateAspectRatio,
        generateCount,
        selectedReferenceIds: uploadTray.selectedReferenceIds,
        selectedModelSupportsNegativePrompt: setup.selectedModelSupportsNegativePrompt,
        selectedModelSupportsMultiOutput: setup.selectedModelSupportsMultiOutput,
        selectedModelSupportsReferences: setup.selectedModelSupportsReferences,
        appendGeneratedUploads: uploadTray.appendGeneratedUploads,
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
    });
    const capture = useMvpWorkspaceCaptureController({
        backendWritesDisabled: setup.backendWritesDisabled,
        backendWritesDisabledMessage: setup.backendWritesDisabledMessage,
        selectedUpload: uploadTray.selectedUpload,
        defaultMinimumCaptureImages: setup.defaultMinimumCaptureImages,
        defaultRecommendedCaptureImages: setup.defaultRecommendedCaptureImages,
        reconstructionAvailable: setup.reconstructionAvailable,
        reconstructionCapability: setup.reconstructionCapability,
        upsertJob,
        loadEnvironmentIntoScene,
        setStatusText,
        setErrorText,
        handleGenerationStart,
        handleGenerationSuccess,
        handleGenerationError,
    });

    return {
        fileInputRef: uploadTray.fileInputRef,
        intakeMode,
        setIntakeMode,
        isUploading: uploadTray.isUploading,
        isGeneratingImage: generation.isGeneratingImage,
        isGeneratingPreview: generation.isGeneratingPreview,
        isGeneratingAsset: generation.isGeneratingAsset,
        isUpdatingCapture: capture.isUpdatingCapture,
        isStartingReconstruction: capture.isStartingReconstruction,
        uploads: uploadTray.uploads,
        selectedUploadId: uploadTray.selectedUploadId,
        setSelectedUploadId: uploadTray.setSelectedUploadId,
        selectedUpload: uploadTray.selectedUpload,
        selectedUploadAnalysis: uploadTray.selectedUploadAnalysis,
        statusText,
        errorText,
        backendMode: setup.backendMode,
        backendMessage: setup.backendMessage,
        setupStatus: setup.setupStatus,
        providersLoading: setup.providersLoading,
        selectedProvider: setup.selectedProvider,
        selectedProviderModel: setup.selectedProviderModel,
        selectedProviderId: setup.selectedProviderId,
        setSelectedProviderId: setup.setSelectedProviderId,
        selectedModelId: setup.selectedModelId,
        setSelectedModelId: setup.setSelectedModelId,
        generatePrompt,
        setGeneratePrompt,
        generateNegativePrompt,
        setGenerateNegativePrompt,
        generateAspectRatio,
        setGenerateAspectRatio,
        generateCount,
        setGenerateCount,
        selectedReferenceIds: uploadTray.selectedReferenceIds,
        imageProviders: setup.imageProviders,
        jobs,
        captureSession: capture.captureSession,
        captureQualitySummary: capture.captureQualitySummary,
        captureBlockers: capture.captureBlockers,
        captureUniqueFrameCount: capture.captureUniqueFrameCount,
        captureDuplicateRatioPercent: capture.captureDuplicateRatioPercent,
        captureSetBlocked: capture.captureSetBlocked,
        captureNextActions: capture.captureNextActions,
        providerAspectRatios: setup.providerAspectRatios,
        selectedModelSupportsReferences: setup.selectedModelSupportsReferences,
        selectedModelSupportsNegativePrompt: setup.selectedModelSupportsNegativePrompt,
        selectedModelSupportsMultiOutput: setup.selectedModelSupportsMultiOutput,
        selectedProviderMaxOutputs: setup.selectedProviderMaxOutputs,
        selectedProviderMaxReferences: setup.selectedProviderMaxReferences,
        providerGenerationEnabled: setup.providerGenerationEnabled,
        previewCapability: setup.previewCapability,
        reconstructionCapability: setup.reconstructionCapability,
        assetCapability: setup.assetCapability,
        setupTruth: setup.setupTruth,
        reconstructionBackendName: setup.reconstructionBackendName,
        benchmarkStatusLabel: setup.benchmarkStatusLabel,
        releaseGateFailureCount: setup.releaseGateFailureCount,
        minimumCaptureImages: capture.minimumCaptureImages,
        recommendedCaptureImages: capture.recommendedCaptureImages,
        reconstructionAvailable: setup.reconstructionAvailable,
        backendWritesDisabled: setup.backendWritesDisabled,
        backendWritesDisabledMessage: setup.backendWritesDisabledMessage,
        reconstructionButtonLabel: capture.reconstructionButtonLabel,
        triggerFilePicker: uploadTray.triggerFilePicker,
        handleUpload: uploadTray.handleUpload,
        toggleReferenceSelection: uploadTray.toggleReferenceSelection,
        generateImage: generation.generateImage,
        generatePreview: generation.generatePreview,
        generateAsset: generation.generateAsset,
        addSelectedToCaptureSet: capture.addSelectedToCaptureSet,
        startReconstruction: capture.startReconstruction,
    };
}

export type MvpWorkspaceIntakeController = ReturnType<typeof useMvpWorkspaceIntakeController>;
