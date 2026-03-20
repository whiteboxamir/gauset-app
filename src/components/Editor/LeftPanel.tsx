"use client";

import { useMvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";
import { useMvpWorkspaceShell } from "@/app/mvp/_state/mvpWorkspaceShellContext";
import { useMvpWorkspaceSession } from "@/app/mvp/_state/mvpWorkspaceSessionContext";
import type { MvpDirectUploadCapabilitySnapshot } from "@/lib/mvp-upload";

import { LeftPanelActivityLog } from "./LeftPanelActivityLog";
import { LeftPanelCaptureWorkspace } from "./LeftPanelCaptureWorkspace";
import { LeftPanelGenerateSection } from "./LeftPanelGenerateSection";
import { LeftPanelImportSection } from "./LeftPanelImportSection";
import { LeftPanelWorkspaceSummary } from "./LeftPanelWorkspaceSummary";
import type { LeftPanelPreviewWorkspaceNavigation } from "./leftPanelShared";

interface LeftPanelProps {
    clarityMode?: boolean;
    previewWorkspaceNavigation?: LeftPanelPreviewWorkspaceNavigation | null;
    initialUploadCapability?: MvpDirectUploadCapabilitySnapshot;
}

export default function LeftPanel({
    clarityMode = false,
    previewWorkspaceNavigation = null,
    initialUploadCapability,
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
        launchProjectId,
        launchIntent,
        launchBrief,
        launchReferences,
        launchProviderId,
        launchSourceKind,
        hasWorldContent,
        hasSavedVersion,
        isAdvancedDensityEnabled,
        journeyStage,
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
        launchProjectId,
        launchIntent,
        launchBrief,
        launchReferences,
        launchProviderId,
        initialUploadCapability,
    });
    const showCondensedOfflineState = intake.backendMode === "offline" && !intake.selectedUpload && (intake.captureSession?.frame_count ?? 0) === 0;
    const showStudioGeneration = isAdvancedDensityEnabled || journeyStage !== "start";
    const allowAssetActions = isAdvancedDensityEnabled;
    const previewButtonLabel = hasWorldContent ? "Refresh world preview" : "Build first world";
    const hasActiveIntake = intake.uploads.length > 0 || (intake.captureSession?.frame_count ?? 0) > 0;

    const captureWorkspace = (
        <LeftPanelCaptureWorkspace
            addSelectedToCaptureSet={intake.addSelectedToCaptureSet}
            allowAssetActions={allowAssetActions}
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
            isUploading={intake.isUploading}
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
            previewButtonLabel={previewButtonLabel}
        />
    );

    const importSection = (
        <LeftPanelImportSection
            backendMode={intake.backendMode}
            backendWritesDisabled={intake.backendWritesDisabled}
            backendWritesDisabledMessage={intake.backendWritesDisabledMessage}
            isUploading={intake.isUploading}
            uploadQueue={intake.uploadQueue}
            uploadQueueSummary={intake.uploadQueueSummary}
            directUploadAvailable={intake.directUploadAvailable}
            directUploadTransport={intake.directUploadTransport}
            directUploadMaximumSizeInBytes={intake.directUploadMaximumSizeInBytes}
            legacyProxyMaximumSizeInBytes={intake.legacyProxyMaximumSizeInBytes}
            reconstructionAvailable={intake.reconstructionAvailable}
            triggerFilePicker={intake.triggerFilePicker}
        />
    );

    const sourcePathIntroSection = (
        <section className="rounded-[22px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">Source path</p>
            <p className="mt-2 text-sm font-medium leading-6 text-white">
                {launchProjectId ? "Choose the first source for this project-bound world." : "Choose one source path before anything else."}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
                Import or capture leads the workflow. Generation stays available below as a secondary option.
            </p>
        </section>
    );

    const advancedSourceSection = (
        <details
            className="rounded-[22px] border border-white/8 bg-white/[0.02]"
            open={launchIntent === "generate" ? true : undefined}
        >
            <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                            {showStudioGeneration ? "Generation, secondary" : "Secondary source option"}
                        </p>
                        <p className="mt-1 text-sm text-white">
                            Keep generated stills available without competing with import or capture.
                        </p>
                    </div>
                    <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                        Reveal
                    </span>
                </div>
            </summary>
            <div className="border-t border-white/8 px-4 py-4">
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
            </div>
        </details>
    );

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
                journeyStage={journeyStage}
                launchProjectId={launchProjectId}
                launchSourceKind={launchSourceKind}
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
                    {sourcePathIntroSection}
                    {hasActiveIntake ? captureWorkspace : null}
                    {importSection}
                    {!hasActiveIntake ? captureWorkspace : null}
                    {hasSavedVersion || isAdvancedDensityEnabled ? <LeftPanelActivityLog jobs={intake.jobs} /> : null}
                    {advancedSourceSection}
                </div>
            ) : null}
        </div>
    );
}
