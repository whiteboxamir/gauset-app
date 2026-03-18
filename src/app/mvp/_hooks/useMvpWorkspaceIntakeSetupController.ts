"use client";

import { useEffect, useMemo, useState } from "react";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import {
    type BackendMode,
    normalizeSetupStatus,
    type ProviderCatalogResponse,
    type SetupStatusResponse,
} from "@/lib/mvp-product";

import { formatBandLabel, type MvpWorkspaceIntakeSetupState } from "./mvpWorkspaceIntakeShared";

export function useMvpWorkspaceIntakeSetupController({
    initialProviderId = null,
    generateAspectRatio,
    generateCount,
    setGenerateAspectRatio,
    setGenerateCount,
}: {
    initialProviderId?: string | null;
    generateAspectRatio: string;
    generateCount: number;
    setGenerateAspectRatio: (value: string) => void;
    setGenerateCount: (value: number) => void;
}): MvpWorkspaceIntakeSetupState {
    const [backendMode, setBackendMode] = useState<BackendMode>("checking");
    const [backendMessage, setBackendMessage] = useState("Checking backend capabilities...");
    const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);
    const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogResponse | null>(null);
    const [providersLoading, setProvidersLoading] = useState(false);
    const [selectedProviderId, setSelectedProviderId] = useState(initialProviderId ?? "");
    const [selectedModelId, setSelectedModelId] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadProviders = async () => {
            setProvidersLoading(true);
            try {
                const response = await fetch(`${MVP_API_BASE_URL}/providers`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Provider catalog failed (${response.status})`));
                }

                const payload = (await response.json()) as ProviderCatalogResponse;
                if (!cancelled) {
                    setProviderCatalog(payload);
                }
            } catch {
                if (!cancelled) {
                    setProviderCatalog(null);
                }
            } finally {
                if (!cancelled) {
                    setProvidersLoading(false);
                }
            }
        };

        const loadSetupStatus = async () => {
            setBackendMode("checking");
            setBackendMessage("Checking backend capabilities...");
            try {
                const response = await fetch(`${MVP_API_BASE_URL}/setup/status`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Backend setup check failed (${response.status})`));
                }

                const payload = normalizeSetupStatus(await response.json());
                if (cancelled) {
                    return;
                }

                const previewAvailable = Boolean(payload.capabilities?.preview?.available);
                const reconstructionLaneAvailable = Boolean(payload.capabilities?.reconstruction?.available);
                const assetAvailable = Boolean(payload.capabilities?.asset?.available);
                const directoriesReady = Object.values(payload.directories ?? {}).every(Boolean);
                const mode: BackendMode =
                    directoriesReady && (previewAvailable || reconstructionLaneAvailable || assetAvailable) ? "ready" : "degraded";

                setSetupStatus(payload);
                setBackendMode(mode);
                setBackendMessage(
                    payload.backend?.truth ??
                        (mode === "ready"
                            ? "Preview and asset lanes are available."
                            : "The backend responded, but one or more generation lanes are unavailable."),
                );
                void loadProviders();
            } catch (error) {
                if (cancelled) {
                    return;
                }

                setSetupStatus(null);
                setProviderCatalog(null);
                setProvidersLoading(false);
                setBackendMode("offline");
                setBackendMessage(error instanceof Error ? error.message : "Gauset backend is unavailable.");
            }
        };

        void loadSetupStatus();

        return () => {
            cancelled = true;
        };
    }, []);

    const imageProviders = useMemo(
        () => (providerCatalog?.providers ?? []).filter((provider) => provider.media_kind === "image"),
        [providerCatalog],
    );
    const availableImageProviders = useMemo(
        () => imageProviders.filter((provider) => provider.available),
        [imageProviders],
    );
    const selectedProvider = useMemo(
        () =>
            imageProviders.find((provider) => provider.id === selectedProviderId) ??
            availableImageProviders[0] ??
            imageProviders[0] ??
            null,
        [availableImageProviders, imageProviders, selectedProviderId],
    );
    const selectedProviderModel = useMemo(
        () =>
            selectedProvider?.models.find((model) => model.id === (selectedModelId || selectedProvider?.default_model || "")) ??
            selectedProvider?.models[0] ??
            null,
        [selectedModelId, selectedProvider],
    );
    const providerAspectRatios = useMemo(
        () =>
            selectedProvider?.supported_aspect_ratios && selectedProvider.supported_aspect_ratios.length > 0
                ? selectedProvider.supported_aspect_ratios
                : ["1:1", "4:3", "3:4", "16:9", "9:16"],
        [selectedProvider],
    );

    const selectedModelSupportsReferences =
        selectedProviderModel?.supports_references ?? selectedProvider?.supports_references ?? false;
    const selectedModelSupportsNegativePrompt = selectedProviderModel?.supports_negative_prompt ?? true;
    const selectedModelSupportsMultiOutput =
        selectedProviderModel?.supports_multi_output ?? selectedProvider?.supports_multi_output ?? false;
    const selectedProviderMaxOutputs = Math.max(1, selectedProvider?.max_outputs ?? 1);
    const selectedProviderMaxReferences = Math.max(0, selectedProvider?.max_reference_images ?? 0);
    const providerGenerationEnabled = Boolean(providerCatalog?.enabled ?? setupStatus?.provider_generation?.enabled);

    useEffect(() => {
        if (!selectedProvider) {
            if (selectedProviderId) {
                setSelectedProviderId("");
            }
            return;
        }

        if (selectedProvider.id !== selectedProviderId) {
            setSelectedProviderId(selectedProvider.id);
        }
    }, [selectedProvider, selectedProviderId]);

    useEffect(() => {
        if (!selectedProviderModel) {
            if (selectedModelId) {
                setSelectedModelId("");
            }
            return;
        }

        if (selectedProviderModel.id !== selectedModelId) {
            setSelectedModelId(selectedProviderModel.id);
        }
    }, [selectedModelId, selectedProviderModel]);

    useEffect(() => {
        if (!selectedModelSupportsMultiOutput && generateCount !== 1) {
            setGenerateCount(1);
        }

        if (providerAspectRatios.length > 0 && !providerAspectRatios.includes(generateAspectRatio)) {
            setGenerateAspectRatio(providerAspectRatios[0]);
        }
    }, [
        generateAspectRatio,
        generateCount,
        providerAspectRatios,
        selectedModelSupportsMultiOutput,
        setGenerateAspectRatio,
        setGenerateCount,
    ]);

    const previewCapability = setupStatus?.capabilities?.preview;
    const reconstructionCapability = setupStatus?.capabilities?.reconstruction;
    const assetCapability = setupStatus?.capabilities?.asset;
    const setupTruth = setupStatus?.backend?.truth ?? "";
    const reconstructionBackendName = setupStatus?.reconstruction_backend?.name ?? "missing";
    const benchmarkStatusLabel = formatBandLabel(setupStatus?.benchmark_status?.status) || "not benchmarked";
    const releaseGateFailureCount = Object.values(setupStatus?.release_gates ?? {}).filter((value) => value === false).length;
    const defaultMinimumCaptureImages = setupStatus?.capture?.minimum_images ?? 8;
    const defaultRecommendedCaptureImages = setupStatus?.capture?.recommended_images ?? defaultMinimumCaptureImages;
    const reconstructionAvailable = Boolean(reconstructionCapability?.available);
    const backendWritesDisabled = setupStatus?.storage?.public_write_safe === false;
    const backendWritesDisabledMessage =
        setupStatus?.storage?.availability_reason ??
        "Writes are disabled until durable storage is configured for this deployment.";

    return {
        backendMode,
        backendMessage,
        setupStatus,
        providersLoading,
        imageProviders,
        selectedProvider,
        selectedProviderModel,
        selectedProviderId,
        setSelectedProviderId,
        selectedModelId,
        setSelectedModelId,
        providerAspectRatios,
        selectedModelSupportsReferences,
        selectedModelSupportsNegativePrompt,
        selectedModelSupportsMultiOutput,
        selectedProviderMaxOutputs,
        selectedProviderMaxReferences,
        providerGenerationEnabled,
        previewCapability,
        reconstructionCapability,
        assetCapability,
        setupTruth,
        reconstructionBackendName,
        benchmarkStatusLabel,
        releaseGateFailureCount,
        defaultMinimumCaptureImages,
        defaultRecommendedCaptureImages,
        reconstructionAvailable,
        backendWritesDisabled,
        backendWritesDisabledMessage,
    };
}
