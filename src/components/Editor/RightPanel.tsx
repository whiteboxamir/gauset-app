"use client";

import React, { useCallback, useMemo } from "react";

import { useMvpWorkspaceReviewController } from "@/app/mvp/_hooks/useMvpWorkspaceReviewController";
import { useMvpWorkspaceShell } from "@/app/mvp/_state/mvpWorkspaceShellContext";
import { useMvpWorkspaceSession } from "@/app/mvp/_state/mvpWorkspaceSessionContext";
import { createId } from "@/lib/mvp-workspace";
import { useMvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStoreContext.tsx";
import { useSceneSelectedNodeIds, useSceneSelectedPinId, useSceneSelectedViewId } from "@/state/mvpSceneEditorSelectors.ts";
import { useMvpSceneStoreActions, useRenderableSceneDocumentFromContext } from "@/state/mvpSceneStoreContext.tsx";
import {
    useSceneAssetsSlice,
    useSceneCameraViewsSlice,
    useSceneDirectorBriefSlice,
    useSceneEnvironmentSlice,
    useScenePinsSlice,
    useSceneViewerSlice,
} from "@/state/mvpSceneWorkspaceSelectors.ts";

import { RightPanelHeader } from "./RightPanelHeader";
import { RightPanelContinuityRecordSection } from "./RightPanelContinuityRecordSection";
import { RightPanelLocalAssetsSection } from "./RightPanelLocalAssetsSection";
import { RightPanelNodeInspectorSection } from "./RightPanelNodeInspectorSection";
import { RightPanelReviewIssuesSection } from "./RightPanelReviewIssuesSection";
import { RightPanelReviewSection } from "./RightPanelReviewSection";
import { RightPanelSceneGraphSection } from "./RightPanelSceneGraphSection";
import { RightPanelSceneTreeSection } from "./RightPanelSceneTreeSection";
import { RightPanelVersionHistorySection } from "./RightPanelVersionHistorySection";
import { RightPanelWorkspaceOverviewSection } from "./RightPanelWorkspaceOverviewSection";
import { buildLibraryAssetCounts, resolveNextLocalAsset } from "./rightPanelShared";

interface RightPanelProps {
    clarityMode?: boolean;
}

export default function RightPanel({ clarityMode = false }: RightPanelProps) {
    const {
        appendSceneAsset: onAddAsset,
        duplicateSceneAsset: onDuplicateAsset,
        removeSceneAsset: onDeleteAsset,
        removeScenePin: onDeletePin,
        removeSceneView: onDeleteView,
    } = useMvpWorkspaceShell();
    const {
        activityLog,
        changeSummary,
        lastOutputLabel,
        assetsList,
        activeScene,
        draftSceneId,
        launchSceneId,
        linkedLaunchMessage,
        linkedLaunchStatus,
        saveState,
        saveMessage,
        saveError,
        lastSavedAt,
        versions,
        workspaceOrigin,
        workspaceOriginDetail,
        journeyStage,
        hasSavedVersion,
        isAdvancedDensityEnabled,
        canUseAdvancedDensity,
        manualSave: onManualSave,
        restoreVersion: onRestoreVersion,
        handleExport: onExport,
    } = useMvpWorkspaceSession();
    const sceneStoreActions = useMvpSceneStoreActions();
    const editorSessionActions = useMvpEditorSessionStoreActions();
    const sceneDocument = useRenderableSceneDocumentFromContext();
    const environment = useSceneEnvironmentSlice();
    const assets = useSceneAssetsSlice();
    const cameraViews = useSceneCameraViewsSlice();
    const directorBrief = useSceneDirectorBriefSlice();
    const pins = useScenePinsSlice();
    const viewer = useSceneViewerSlice();
    const selectedNodeIds = useSceneSelectedNodeIds();
    const selectedPinId = useSceneSelectedPinId();
    const selectedViewId = useSceneSelectedViewId();
    const libraryAssetCounts = useMemo(() => buildLibraryAssetCounts(assets), [assets]);
    const nextLocalAsset = useMemo(() => resolveNextLocalAsset(assetsList, libraryAssetCounts), [assetsList, libraryAssetCounts]);
    const {
        selectedVersion,
        shareStatus,
        isCreatingReviewLink,
        canCopyReviewLink,
        reviewData,
        reviewStatus,
        reviewError,
        isSavingReview,
        legacyComments,
        versionCommentDraft,
        commentStatus,
        commentError,
        isSavingComment,
        issueDraft,
        selectedAnchorLabel,
        selectedCommentAnchor,
        visibleIssues,
        canAddIssue,
        canSubmitComment,
        selectVersion,
        copyReviewLink,
        exportScenePackage,
        saveReview,
        updateReviewField,
        updateApprovalNote,
        setVersionCommentDraftField,
        setIssueDraftField,
        submitVersionComment,
        addIssue,
        deleteIssue,
        updateIssueStatus,
        issueCountForVersion,
        commentCountForVersion,
        focusWorkspace,
        focusView,
        focusPin,
        focusIssue,
    } = useMvpWorkspaceReviewController({
        activeScene,
        assetsList,
        sceneDocument,
        cameraViews,
        pins,
        viewer,
        versions,
        lastSavedAt,
        selectedPinId,
        selectedViewId,
        sceneStoreActions,
        editorSessionActions,
        onExport,
    });

    const deletePin = useCallback(
        (pinId: string) => {
            onDeletePin(pinId);
            if (selectedPinId === pinId) {
                sceneStoreActions.selectPin(null);
            }
        },
        [onDeletePin, sceneStoreActions, selectedPinId],
    );

    const deleteView = useCallback(
        (viewId: string) => {
            onDeleteView(viewId);
            if (selectedViewId === viewId) {
                sceneStoreActions.selectView(null);
            }
        },
        [onDeleteView, sceneStoreActions, selectedViewId],
    );

    const duplicateSceneAsset = useCallback(
        (instanceId: string) => {
            onDuplicateAsset(instanceId);
        },
        [onDuplicateAsset],
    );

    const deleteSceneAsset = useCallback(
        (instanceId: string) => {
            onDeleteAsset(instanceId);
        },
        [onDeleteAsset],
    );

    const addAssetToScene = useCallback(
        (asset: any) => {
            onAddAsset({
                ...asset,
                instanceId: createId("inst"),
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
            });
        },
        [onAddAsset],
    );

    const handleDragStart = useCallback((event: React.DragEvent, asset: any) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("asset", JSON.stringify(asset));
    }, []);

    const stageNextLocalAsset = useCallback(() => {
        if (!nextLocalAsset) return;
        addAssetToScene(nextLocalAsset);
    }, [addAssetToScene, nextLocalAsset]);

    const handleRestoreVersion = useCallback(
        async (versionId: string) => {
            selectVersion(versionId);
            await onRestoreVersion(versionId);
        },
        [onRestoreVersion, selectVersion],
    );
    const patchContinuity = useCallback(
        (patch: Partial<typeof sceneDocument.continuity>) => {
            sceneStoreActions.patchContinuity(patch);
        },
        [sceneDocument.continuity, sceneStoreActions],
    );

    return (
        <div className="flex h-full flex-col overflow-y-auto bg-transparent">
            <RightPanelHeader
                activeScene={activeScene}
                canUseAdvancedDensity={canUseAdvancedDensity}
                clarityMode={clarityMode}
                hasSavedVersion={hasSavedVersion}
                isAdvancedDensityEnabled={isAdvancedDensityEnabled}
                journeyStage={journeyStage}
                onManualSave={onManualSave}
                saveState={saveState}
            />

            <RightPanelWorkspaceOverviewSection
                activityLog={activityLog}
                activeScene={activeScene}
                changeSummary={changeSummary}
                lastOutputLabel={lastOutputLabel}
                lastSavedAt={lastSavedAt}
                canCopyReviewLink={canCopyReviewLink}
                isCreatingReviewLink={isCreatingReviewLink}
                onCopyReviewLink={copyReviewLink}
                onExportScenePackage={exportScenePackage}
                onRestoreVersion={handleRestoreVersion}
                saveError={saveError}
                saveMessage={saveMessage}
                saveState={saveState}
                sceneDocument={sceneDocument}
                draftSceneId={draftSceneId}
                environment={environment}
                directorBrief={directorBrief}
                launchSceneId={launchSceneId}
                linkedLaunchMessage={linkedLaunchMessage}
                linkedLaunchStatus={linkedLaunchStatus}
                reviewData={reviewData}
                selectedVersion={selectedVersion}
                shareStatus={shareStatus}
                versions={versions}
                viewCount={cameraViews.length}
                noteCount={pins.length}
                workspaceOrigin={workspaceOrigin}
                workspaceOriginDetail={workspaceOriginDetail}
                journeyStage={journeyStage}
                isAdvancedDensityEnabled={isAdvancedDensityEnabled}
            />

            <RightPanelContinuityRecordSection
                continuity={sceneDocument.continuity}
                journeyStage={journeyStage}
                onPatchContinuity={patchContinuity}
            />

            {activeScene && hasSavedVersion ? (
                <div className="space-y-3 border-b border-neutral-800/80 p-4">
                    <RightPanelReviewSection
                        activeScene={activeScene}
                        isSavingReview={isSavingReview}
                        reviewData={reviewData}
                        reviewError={reviewError}
                        reviewStatus={reviewStatus}
                        saveReview={saveReview}
                        updateApprovalNote={updateApprovalNote}
                        updateReviewField={updateReviewField}
                    />

                    <RightPanelVersionHistorySection
                        activeScene={activeScene}
                        canSubmitComment={canSubmitComment}
                        commentCountForVersion={commentCountForVersion}
                        commentError={commentError}
                        commentStatus={commentStatus}
                        isSavingComment={isSavingComment}
                        issueCountForVersion={issueCountForVersion}
                        legacyComments={legacyComments}
                        onRestoreVersion={handleRestoreVersion}
                        setVersionCommentDraftField={setVersionCommentDraftField}
                        selectVersion={selectVersion}
                        selectedCommentAnchor={selectedCommentAnchor}
                        selectedVersion={selectedVersion}
                        submitVersionComment={submitVersionComment}
                        versionCommentDraft={versionCommentDraft}
                        versions={versions}
                    />

                    <RightPanelReviewIssuesSection
                        addIssue={addIssue}
                        canAddIssue={canAddIssue}
                        deleteIssue={deleteIssue}
                        focusIssue={focusIssue}
                        issueDraft={issueDraft}
                        reviewData={reviewData}
                        selectedAnchorLabel={selectedAnchorLabel}
                        selectedVersion={selectedVersion}
                        setIssueDraftField={setIssueDraftField}
                        updateIssueStatus={updateIssueStatus}
                        visibleIssues={visibleIssues}
                    />
                </div>
            ) : null}

            {activeScene && isAdvancedDensityEnabled ? (
                <div className="px-4 pb-4 pt-3">
                    <details className="group rounded-[1.05rem] border border-white/8 bg-white/[0.02]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-white marker:content-none">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Technical inspection</p>
                                <p className="mt-1 text-[11px] leading-5 text-neutral-400">
                                    Scene graph, node inspection, and local asset staging stay available here without competing with handoff.
                                </p>
                            </div>
                            <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400 transition-colors group-open:text-white">
                                Reveal
                            </span>
                        </summary>

                        <div className="space-y-4 border-t border-white/8 px-3 py-4">
                            <RightPanelSceneTreeSection
                                sceneDocument={sceneDocument}
                                selectedNodeIds={selectedNodeIds}
                                sceneStoreActions={sceneStoreActions}
                            />

                            <RightPanelNodeInspectorSection
                                sceneDocument={sceneDocument}
                                selectedNodeIds={selectedNodeIds}
                                sceneStoreActions={sceneStoreActions}
                            />

                            <RightPanelSceneGraphSection
                                environment={environment}
                                assets={assets}
                                cameraViews={cameraViews}
                                pins={pins}
                                nextLocalAsset={nextLocalAsset}
                                onFocusWorkspace={focusWorkspace}
                                onStageNextLocalAsset={stageNextLocalAsset}
                                onFocusView={focusView}
                                onDeleteView={deleteView}
                                onFocusPin={focusPin}
                                onDeletePin={deletePin}
                                onDuplicateSceneAsset={duplicateSceneAsset}
                                onDeleteSceneAsset={deleteSceneAsset}
                            />

                            <RightPanelLocalAssetsSection
                                assetsList={assetsList}
                                sceneAssetCount={assets.length}
                                nextLocalAsset={nextLocalAsset}
                                libraryAssetCounts={libraryAssetCounts}
                                onHandleDragStart={handleDragStart}
                                onAddAssetToScene={addAssetToScene}
                            />
                        </div>
                    </details>
                </div>
            ) : null}
        </div>
    );
}
