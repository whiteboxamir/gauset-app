"use client";

import { useMvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";
import { useMvpWorkspaceShell } from "@/app/mvp/_state/mvpWorkspaceShellContext";
import { useMvpWorkspaceSession } from "@/app/mvp/_state/mvpWorkspaceSessionContext";

import { LeftPanelActivityLog } from "./LeftPanelActivityLog";
import { LeftPanelCaptureWorkspace } from "./LeftPanelCaptureWorkspace";
import { LeftPanelGenerateSection } from "./LeftPanelGenerateSection";
import { LeftPanelImportSection } from "./LeftPanelImportSection";
import { LeftPanelWorkspaceSummary } from "./LeftPanelWorkspaceSummary";
import type { LeftPanelPreviewWorkspaceNavigation } from "./leftPanelShared";

interface LeftPanelProps {
    clarityMode?: boolean;
    previewWorkspaceNavigation?: LeftPanelPreviewWorkspaceNavigation | null;
}

export default function LeftPanel({
    clarityMode = false,
    previewWorkspaceNavigation = null,
}: LeftPanelProps) {
    const { replaceSceneEnvironment } = useMvpWorkspaceShell();
    const {
        setActiveScene,
        setAssetsList,
        markProgrammaticSceneChange,
        handleInputReady,
        handleGenerationStart,
        handleGenerationSuccess,
        handleGenerationError,
    } = useMvpWorkspaceSession();
    const intake = useMvpWorkspaceIntakeController({
        setActiveScene,
        setAssetsList,
        replaceSceneEnvironment,
        markProgrammaticSceneChange,
        handleInputReady,
        handleGenerationStart,
        handleGenerationSuccess,
        handleGenerationError,
    });
    const showCondensedOfflineState = intake.backendMode === "offline" && !intake.selectedUpload && (intake.captureSession?.frame_count ?? 0) === 0;

    return (
        <div
            className={
                clarityMode
                    ? "h-full overflow-y-auto px-4 py-4 text-neutral-300"
                    : "h-full overflow-y-auto px-4 py-4 text-neutral-300"
            }
        >
            <LeftPanelWorkspaceSummary
                clarityMode={clarityMode}
                previewWorkspaceNavigation={previewWorkspaceNavigation}
                assetCapability={intake.assetCapability}
                backendMessage={intake.backendMessage}
                backendMode={intake.backendMode}
                benchmarkStatusLabel={intake.benchmarkStatusLabel}
                captureSession={intake.captureSession}
                minimumCaptureImages={intake.minimumCaptureImages}
                previewCapability={intake.previewCapability}
                recommendedCaptureImages={intake.recommendedCaptureImages}
                reconstructionBackendName={intake.reconstructionBackendName}
                reconstructionCapability={intake.reconstructionCapability}
                releaseGateFailureCount={intake.releaseGateFailureCount}
                selectedUpload={intake.selectedUpload}
                setupTruth={intake.setupTruth}
            />

            <input
                ref={intake.fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                multiple
                className="hidden"
                onChange={intake.handleUpload}
            />

            {!showCondensedOfflineState ? (
                <div className="space-y-4">
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.02] p-1">
                        <div className="mb-2 px-2 pt-1">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Intake mode</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            <button
                                type="button"
                                onClick={() => intake.setIntakeMode("import")}
                                className={`rounded-[14px] px-4 py-2.5 text-[12px] font-medium transition-all ${
                                    intake.intakeMode === "import"
                                        ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.08)]"
                                        : "text-neutral-400 hover:bg-white/[0.03] hover:text-white"
                                }`}
                            >
                                Import
                            </button>
                            <button
                                type="button"
                                onClick={() => intake.setIntakeMode("generate")}
                                className={`rounded-[14px] px-4 py-2.5 text-[12px] font-medium transition-all ${
                                    intake.intakeMode === "generate"
                                        ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.08)]"
                                        : "text-neutral-400 hover:bg-white/[0.03] hover:text-white"
                                }`}
                            >
                                Generate
                            </button>
                        </div>
                    </div>

                    {intake.intakeMode === "import" ? (
                        <LeftPanelImportSection
                            backendMode={intake.backendMode}
                            backendWritesDisabled={intake.backendWritesDisabled}
                            backendWritesDisabledMessage={intake.backendWritesDisabledMessage}
                            isUploading={intake.isUploading}
                            reconstructionAvailable={intake.reconstructionAvailable}
                            triggerFilePicker={intake.triggerFilePicker}
                        />
                    ) : (
                        <LeftPanelGenerateSection
                            clarityMode={clarityMode}
                            backendMode={intake.backendMode}
                            backendWritesDisabled={intake.backendWritesDisabled}
                            generateAspectRatio={intake.generateAspectRatio}
                            generateCount={intake.generateCount}
                            generateImage={intake.generateImage}
                            generateNegativePrompt={intake.generateNegativePrompt}
                            generatePrompt={intake.generatePrompt}
                            imageProviders={intake.imageProviders}
                            isGeneratingImage={intake.isGeneratingImage}
                            previewCapability={intake.previewCapability}
                            providerAspectRatios={intake.providerAspectRatios}
                            providerGenerationEnabled={intake.providerGenerationEnabled}
                            providersLoading={intake.providersLoading}
                            selectedModelSupportsMultiOutput={intake.selectedModelSupportsMultiOutput}
                            selectedModelSupportsNegativePrompt={intake.selectedModelSupportsNegativePrompt}
                            selectedModelSupportsReferences={intake.selectedModelSupportsReferences}
                            selectedProvider={intake.selectedProvider}
                            selectedProviderMaxOutputs={intake.selectedProviderMaxOutputs}
                            selectedProviderMaxReferences={intake.selectedProviderMaxReferences}
                            selectedProviderModel={intake.selectedProviderModel}
                            selectedReferenceIds={intake.selectedReferenceIds}
                            setGenerateAspectRatio={intake.setGenerateAspectRatio}
                            setGenerateCount={intake.setGenerateCount}
                            setGenerateNegativePrompt={intake.setGenerateNegativePrompt}
                            setGeneratePrompt={intake.setGeneratePrompt}
                            setSelectedModelId={intake.setSelectedModelId}
                            setSelectedProviderId={intake.setSelectedProviderId}
                            toggleReferenceSelection={intake.toggleReferenceSelection}
                            uploads={intake.uploads}
                        />
                    )}

                    <LeftPanelCaptureWorkspace
                        addSelectedToCaptureSet={intake.addSelectedToCaptureSet}
                        assetCapability={intake.assetCapability}
                        backendMode={intake.backendMode}
                        backendWritesDisabled={intake.backendWritesDisabled}
                        captureBlockers={intake.captureBlockers}
                        captureDuplicateRatioPercent={intake.captureDuplicateRatioPercent}
                        captureNextActions={intake.captureNextActions}
                        captureQualitySummary={intake.captureQualitySummary}
                        captureSession={intake.captureSession}
                        captureSetBlocked={intake.captureSetBlocked}
                        captureUniqueFrameCount={intake.captureUniqueFrameCount}
                        errorText={intake.errorText}
                        generateAsset={intake.generateAsset}
                        generatePreview={intake.generatePreview}
                        isGeneratingAsset={intake.isGeneratingAsset}
                        isGeneratingPreview={intake.isGeneratingPreview}
                        isStartingReconstruction={intake.isStartingReconstruction}
                        isUpdatingCapture={intake.isUpdatingCapture}
                        minimumCaptureImages={intake.minimumCaptureImages}
                        previewCapability={intake.previewCapability}
                        recommendedCaptureImages={intake.recommendedCaptureImages}
                        reconstructionAvailable={intake.reconstructionAvailable}
                        reconstructionCapability={intake.reconstructionCapability}
                        reconstructionButtonLabel={intake.reconstructionButtonLabel}
                        selectedUpload={intake.selectedUpload}
                        selectedUploadAnalysis={intake.selectedUploadAnalysis}
                        selectedUploadId={intake.selectedUploadId}
                        setSelectedUploadId={intake.setSelectedUploadId}
                        startReconstruction={intake.startReconstruction}
                        statusText={intake.statusText}
                        uploads={intake.uploads}
                    />

                    <LeftPanelActivityLog jobs={intake.jobs} />
                </div>
            ) : null}
        </div>
    );
}
