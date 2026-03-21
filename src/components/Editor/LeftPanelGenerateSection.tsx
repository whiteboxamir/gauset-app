"use client";

import { Loader2, Sparkles } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";

type LeftPanelGenerateSectionProps = Pick<
    MvpWorkspaceIntakeController,
    | "backendMode"
    | "backendWritesDisabled"
    | "generateAspectRatio"
    | "generateCount"
    | "generateImage"
    | "generateNegativePrompt"
    | "generatePrompt"
    | "imageProviders"
    | "isGeneratingImage"
    | "previewCapability"
    | "providerAspectRatios"
    | "providerGenerationEnabled"
    | "providersLoading"
    | "selectedModelSupportsMultiOutput"
    | "selectedModelSupportsNegativePrompt"
    | "selectedModelSupportsReferences"
    | "selectedProvider"
    | "selectedProviderMaxOutputs"
    | "selectedProviderMaxReferences"
    | "selectedProviderModel"
    | "selectedReferenceIds"
    | "setGenerateAspectRatio"
    | "setGenerateCount"
    | "setGenerateNegativePrompt"
    | "setGeneratePrompt"
    | "setSelectedModelId"
    | "setSelectedProviderId"
    | "toggleReferenceSelection"
    | "uploads"
> & {
    clarityMode?: boolean;
};

export function LeftPanelGenerateSection({
    backendMode,
    backendWritesDisabled,
    clarityMode = false,
    generateAspectRatio,
    generateCount,
    generateImage,
    generateNegativePrompt,
    generatePrompt,
    imageProviders,
    isGeneratingImage,
    previewCapability,
    providerAspectRatios,
    providerGenerationEnabled,
    providersLoading,
    selectedModelSupportsMultiOutput,
    selectedModelSupportsNegativePrompt,
    selectedModelSupportsReferences,
    selectedProvider,
    selectedProviderMaxOutputs,
    selectedProviderMaxReferences,
    selectedProviderModel,
    selectedReferenceIds,
    setGenerateAspectRatio,
    setGenerateCount,
    setGenerateNegativePrompt,
    setGeneratePrompt,
    setSelectedModelId,
    setSelectedProviderId,
    toggleReferenceSelection,
    uploads,
}: LeftPanelGenerateSectionProps) {
    const providerStatusDetail = providersLoading
        ? "Loading provider catalog..."
        : !providerGenerationEnabled
          ? "Prompt-based still generation is disabled in this backend. Set GAUSET_ENABLE_PROVIDER_IMAGE_GEN=1."
          : !imageProviders.length
            ? "No image providers are registered in this backend."
            : selectedProvider?.available
              ? `${selectedProvider.label} is connected.${selectedModelSupportsReferences ? " Reference-image prompting is available." : ""}`
              : selectedProvider?.availability_reason ?? "This provider is not ready in the current backend.";
    const buildWorldStatusDetail =
        previewCapability?.available
            ? "Generate still + build world will hand the first generated still directly into the preview lane."
            : previewCapability?.truth ??
              previewCapability?.summary ??
              "Automatic world build is unavailable because the preview lane is not connected in this backend.";

    const generateControls = (
        <>
            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Provider</span>
                    <select
                        value={selectedProvider?.id ?? ""}
                        onChange={(event) => setSelectedProviderId(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none"
                    >
                        {imageProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}
                                {provider.available ? "" : " (Unavailable)"}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Model</span>
                    <select
                        value={selectedProviderModel?.id ?? ""}
                        onChange={(event) => setSelectedModelId(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none"
                    >
                        {(selectedProvider?.models ?? []).map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Prompt</span>
                <textarea
                    value={generatePrompt}
                    onChange={(event) => setGeneratePrompt(event.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-neutral-600"
                    placeholder="Example: warm cafe interior, window light, practical neon sign, grounded camera height"
                />
            </label>
        </>
    );

    const advancedControls = (
        <>
            <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Negative prompt</span>
                <input
                    value={generateNegativePrompt}
                    onChange={(event) => setGenerateNegativePrompt(event.target.value)}
                    disabled={!selectedModelSupportsNegativePrompt}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-neutral-600 disabled:opacity-50"
                    placeholder="cartoon, text, watermark, low detail"
                />
                {!selectedModelSupportsNegativePrompt ? (
                    <p className="text-[11px] text-neutral-500">
                        {selectedProviderModel?.label ?? "This model"} does not expose negative prompting.
                    </p>
                ) : null}
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Aspect ratio</span>
                    <select
                        value={generateAspectRatio}
                        onChange={(event) => setGenerateAspectRatio(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none"
                    >
                        {providerAspectRatios.map((ratio) => (
                            <option key={ratio} value={ratio}>
                                {ratio}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Count</span>
                    <select
                        value={selectedModelSupportsMultiOutput ? generateCount : 1}
                        onChange={(event) => setGenerateCount(Number(event.target.value))}
                        disabled={!selectedModelSupportsMultiOutput}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                    >
                        {Array.from({ length: selectedProviderMaxOutputs }, (_, index) => index + 1).map((count) => (
                            <option key={count} value={count}>
                                {count}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {selectedModelSupportsReferences ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Reference images</p>
                            <p className="mt-1 text-[11px] text-neutral-400">
                                Choose up to {selectedProviderMaxReferences} stills from the current tray.
                            </p>
                        </div>
                        <span className="text-[11px] text-neutral-500">
                            {selectedReferenceIds.length}/{selectedProviderMaxReferences}
                        </span>
                    </div>
                    {uploads.length > 0 ? (
                        <div className="mt-3 grid grid-cols-4 gap-2">
                            {uploads.map((upload) => {
                                const isSelected = selectedReferenceIds.includes(upload.image_id);
                                return (
                                    <button
                                        key={`reference-${upload.image_id}`}
                                        type="button"
                                        onClick={() => toggleReferenceSelection(upload.image_id)}
                                        className={`relative aspect-square rounded-xl border bg-neutral-950 bg-cover bg-center transition-all ${
                                            isSelected ? "border-sky-400 shadow-lg shadow-sky-950/30" : "border-neutral-800"
                                        }`}
                                        style={{ backgroundImage: `url(${upload.previewUrl})` }}
                                        title={upload.sourceName}
                                    >
                                        <span className="sr-only">{upload.sourceName}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="mt-3 text-[11px] text-neutral-500">Import or generate at least one still before using references.</p>
                    )}
                </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-[11px] text-neutral-400">
                {providerStatusDetail}
                {selectedProvider?.required_env?.length ? (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                        Required env: {selectedProvider.required_env.join(", ")}
                    </div>
                ) : null}
                {selectedProvider?.setup_hint ? (
                    <div className="mt-2 text-[11px] leading-5 text-neutral-500">{selectedProvider.setup_hint}</div>
                ) : null}
                {selectedProvider?.documentation_url ? (
                    <a
                        href={selectedProvider.documentation_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-[11px] text-sky-300 transition-colors hover:text-sky-200"
                    >
                        Provider docs
                    </a>
                ) : null}
            </div>
        </>
    );

    return (
        <div className="mb-5 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,38,0.8),rgba(10,14,19,0.92))] p-5 shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Optional source generation</p>
                    <p className="mt-3 text-xl font-medium tracking-tight text-white">
                        {providersLoading ? "Loading generation lane" : "Generate a source still, then attach it"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Create a still from a prompt, then attach it to the same world record. Generation stays secondary to the saved-world workflow.
                    </p>
                </div>
                {isGeneratingImage ? (
                    <Loader2 className="h-8 w-8 shrink-0 animate-spin text-sky-400" />
                ) : (
                    <Sparkles className="h-8 w-8 shrink-0 text-sky-300" />
                )}
            </div>

            <div className="mt-5 space-y-3">
                {generateControls}

                {clarityMode ? (
                    <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                            Advanced image controls
                        </summary>
                        <div className="mt-4 space-y-3">{advancedControls}</div>
                    </details>
                ) : (
                    advancedControls
                )}

                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => void generateImage({ autoPreview: false })}
                        disabled={
                            backendMode === "offline" ||
                            backendWritesDisabled ||
                            isGeneratingImage ||
                            providersLoading ||
                            !providerGenerationEnabled ||
                            !selectedProvider ||
                            !selectedProvider.available ||
                            !selectedProviderModel
                        }
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-white font-medium transition-all hover:bg-white/[0.1] disabled:opacity-50 disabled:hover:bg-white/[0.06]"
                    >
                        {isGeneratingImage ? "Generating..." : "Generate source still only"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void generateImage({ autoPreview: true })}
                        disabled={
                            backendMode === "offline" ||
                            backendWritesDisabled ||
                            isGeneratingImage ||
                            providersLoading ||
                            !providerGenerationEnabled ||
                            !selectedProvider ||
                            !selectedProvider.available ||
                            !selectedProviderModel ||
                            !previewCapability?.available
                        }
                        className="w-full rounded-2xl bg-sky-400 px-4 py-3.5 text-black font-medium transition-all hover:bg-sky-300 disabled:opacity-50 disabled:hover:bg-sky-400"
                    >
                        {isGeneratingImage ? "Generating..." : "Generate still, then build world"}
                    </button>
                </div>

                {backendWritesDisabled ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[11px] leading-5 text-amber-100">
                        Writes are disabled for this deployment, so generated stills cannot be persisted into the intake tray.
                    </div>
                ) : null}

                {!previewCapability?.available ? (
                    <div
                        className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[11px] leading-5 text-amber-100"
                        data-testid="mvp-generate-preview-truth"
                    >
                        <p className="font-medium uppercase tracking-[0.16em] text-[10px] text-amber-50">World-build handoff offline</p>
                        <p className="mt-2">{buildWorldStatusDetail}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
