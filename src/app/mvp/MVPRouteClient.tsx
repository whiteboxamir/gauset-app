"use client";

import React, { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import LeftPanel from "@/components/Editor/LeftPanel";
import ViewerPanel from "@/components/Editor/ViewerPanel";
import RightPanel from "@/components/Editor/RightPanel";
import { normalizeWorkspaceSceneGraph } from "@/lib/mvp-workspace";
import { createEmptySceneDocumentWorkspaceGraph, mergeWorkspaceSceneGraphIntoSceneDocument } from "@/lib/scene-graph/document";
import { migrateSceneGraphToSceneDocument } from "@/lib/scene-graph/migrate";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types";
import { normalizePersistedSceneGraph, serializeSceneDocumentToPersistedSceneGraph } from "@/lib/scene-graph/workspaceAdapter";
import { createMvpEditorSessionStore } from "@/state/mvpEditorSessionStore";
import { selectRenderableSceneDocument } from "@/state/mvpSceneSelectors";
import type { MvpSceneDraftTransformMap } from "@/state/mvpSceneStore";
import { createMvpSceneStore } from "@/state/mvpSceneStore";

import MVPClarityLaunchpad from "./_components/MVPClarityLaunchpad";
import { useMvpWorkspaceShellController } from "./_hooks/useMvpWorkspaceShellController";

type MvpRouteVariant = "workspace" | "preview";

const leftRailClassName = (collapsed: boolean) =>
    collapsed ? "h-14 w-full lg:h-full lg:w-14" : "h-[24rem] w-full lg:h-full lg:w-80";

const rightRailClassName = (collapsed: boolean) =>
    collapsed ? "h-14 w-full lg:h-full lg:w-14" : "h-[28rem] w-full lg:h-full lg:w-80";

export default function MVPRouteClient({
    clarityMode = false,
    routeVariant = "workspace",
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
}) {
    const sceneStoreRef = useRef(createMvpSceneStore(migrateSceneGraphToSceneDocument(createEmptySceneDocumentWorkspaceGraph())));
    const editorSessionStoreRef = useRef(createMvpEditorSessionStore());
    const sceneStoreActions = useMemo(() => sceneStoreRef.current.getState().actions, []);
    const editorSessionActions = useMemo(() => editorSessionStoreRef.current.getState().actions, []);
    const renderSceneDocumentSnapshotRef = useRef<{
        document: SceneDocumentV2;
        draftTransforms: MvpSceneDraftTransformMap;
        snapshot: SceneDocumentV2;
    }>({
        document: sceneStoreRef.current.getState().document,
        draftTransforms: sceneStoreRef.current.getState().draftTransforms,
        snapshot: sceneStoreRef.current.getState().document,
    });

    const getRenderableSceneDocumentSnapshot = useCallback(() => {
        const state = sceneStoreRef.current.getState();
        const cached = renderSceneDocumentSnapshotRef.current;
        if (cached.document === state.document && cached.draftTransforms === state.draftTransforms) {
            return cached.snapshot;
        }

        const snapshot = selectRenderableSceneDocument(state);
        renderSceneDocumentSnapshotRef.current = {
            document: state.document,
            draftTransforms: state.draftTransforms,
            snapshot,
        };
        return snapshot;
    }, []);

    const sceneDocument = useSyncExternalStore(
        sceneStoreRef.current.subscribe,
        getRenderableSceneDocumentSnapshot,
        getRenderableSceneDocumentSnapshot,
    );
    const sceneGraph = useMemo(() => serializeSceneDocumentToPersistedSceneGraph(sceneDocument), [sceneDocument]);

    const setSceneGraph = useCallback<React.Dispatch<React.SetStateAction<any>>>(
        (updater) => {
            if (typeof updater !== "function") {
                sceneStoreActions.loadSceneGraph(normalizePersistedSceneGraph(updater));
                return;
            }

            const previousSceneGraph = serializeSceneDocumentToPersistedSceneGraph(getRenderableSceneDocumentSnapshot());
            const nextValue = updater(previousSceneGraph);
            const nextSceneGraph = normalizeWorkspaceSceneGraph(nextValue);
            const mergedDocument = mergeWorkspaceSceneGraphIntoSceneDocument(
                sceneStoreRef.current.getState().document,
                nextSceneGraph,
            );
            sceneStoreActions.loadDocument(mergedDocument);
        },
        [getRenderableSceneDocumentSnapshot, sceneStoreActions],
    );

    const workspace = useMvpWorkspaceShellController({
        clarityMode,
        routeVariant,
        sceneStore: sceneStoreRef.current,
        sceneGraph,
        getRenderableSceneDocumentSnapshot,
        editorSessionActions,
    });

    if (workspace.showLaunchpad) {
        return (
            <MVPClarityLaunchpad
                draftUpdatedAt={workspace.draftUpdatedAt}
                hasDraft={workspace.hasDraft}
                onOpenDemoWorld={workspace.openDemoWorld}
                onResumeDraft={workspace.resumeStoredDraft}
                onStartBlank={workspace.startBlankWorkspace}
            />
        );
    }

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-900 font-sans text-white">
            {clarityMode ? (
                <div className="border-b border-neutral-800 bg-neutral-950/95 px-5 py-4 shadow-2xl">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/65">Persistent AI-generated worlds</p>
                            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">Create world, direct scene, export result.</h1>
                            <p className="mt-2 text-sm text-neutral-400">
                                Keep the world state stable, then change only the scene direction for each new output.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={workspace.openDemoWorld}
                                className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200"
                            >
                                Open demo world
                            </button>
                            <button
                                type="button"
                                onClick={workspace.returnToLaunchpad}
                                className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:border-neutral-500"
                                data-testid="mvp-preview-back-to-start"
                            >
                                Back to preview intro
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-neutral-300 md:grid-cols-3">
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">1. Create world</p>
                            <p className="mt-1">Upload one still or use the demo to load persistent world state.</p>
                        </div>
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">2. Direct scene</p>
                            <p className="mt-1">Change only the shot note or placed objects for this scene.</p>
                        </div>
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">3. Export result</p>
                            <p className="mt-1">Save versions, review what changed, and export a package.</p>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                <div
                    className={`z-10 flex shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 shadow-2xl transition-[width,height] duration-200 lg:border-b-0 lg:border-r ${
                        leftRailClassName(workspace.hudState.leftRailCollapsed)
                    }`}
                >
                    {workspace.hudState.leftRailCollapsed ? (
                        <button
                            type="button"
                            onClick={workspace.toggleLeftRail}
                            className="flex h-full w-full items-center justify-between gap-4 px-4 text-center text-white transition-colors hover:bg-neutral-900 lg:flex-col lg:justify-center lg:px-2"
                            aria-label="Show left HUD"
                        >
                            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/65 lg:hidden">Capture HUD</span>
                            <span className="hidden text-[10px] uppercase tracking-[0.3em] text-cyan-200/65 [writing-mode:vertical-rl] rotate-180 lg:inline">Capture HUD</span>
                            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-200">Expand</span>
                        </button>
                    ) : (
                        <>
                            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/65">Workspace HUD</p>
                                    <p className="mt-1 text-sm text-white">Capture and build</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={workspace.toggleLeftRail}
                                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[11px] text-white transition-colors hover:border-neutral-700 hover:text-neutral-100"
                                >
                                    Hide
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <LeftPanel
                                    clarityMode={clarityMode}
                                    setActiveScene={workspace.setActiveScene}
                                    setSceneGraph={setSceneGraph}
                                    setAssetsList={workspace.setAssetsList}
                                    onProgrammaticSceneChange={workspace.markProgrammaticSceneChange}
                                    onInputReady={workspace.handleInputReady}
                                    onGenerationStart={workspace.handleGenerationStart}
                                    onGenerationSuccess={workspace.handleGenerationSuccess}
                                    onGenerationError={workspace.handleGenerationError}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="relative z-0 min-h-[24rem] flex-1 lg:min-h-0">
                    <ViewerPanel
                        clarityMode={clarityMode}
                        routeVariant={routeVariant}
                        leftHudCollapsed={workspace.hudState.leftRailCollapsed}
                        rightHudCollapsed={workspace.hudState.rightRailCollapsed}
                        directorHudCompact={workspace.hudState.directorHudCompact}
                        onToggleLeftHud={workspace.toggleLeftRail}
                        onToggleRightHud={workspace.toggleRightRail}
                        onToggleDirectorHud={workspace.toggleDirectorHud}
                        processingStatus={workspace.stepStatus}
                        sceneGraph={sceneGraph}
                        setSceneGraph={setSceneGraph}
                    />
                </div>

                <div
                    className={`z-10 flex shrink-0 flex-col border-t border-neutral-800 bg-neutral-950 shadow-2xl transition-[width,height] duration-200 lg:border-t-0 lg:border-l ${
                        rightRailClassName(workspace.hudState.rightRailCollapsed)
                    }`}
                >
                    {workspace.hudState.rightRailCollapsed ? (
                        <button
                            type="button"
                            onClick={workspace.toggleRightRail}
                            className="flex h-full w-full items-center justify-between gap-4 px-4 text-center text-white transition-colors hover:bg-neutral-900 lg:flex-col lg:justify-center lg:px-2"
                            aria-label="Show right HUD"
                        >
                            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/65 lg:hidden">Review HUD</span>
                            <span className="hidden text-[10px] uppercase tracking-[0.3em] text-cyan-200/65 [writing-mode:vertical-rl] lg:inline">Review HUD</span>
                            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-200">Expand</span>
                        </button>
                    ) : (
                        <>
                            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/65">Review HUD</p>
                                    <p className="mt-1 text-sm text-white">Handoff and export</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={workspace.toggleRightRail}
                                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[11px] text-white transition-colors hover:border-neutral-700 hover:text-neutral-100"
                                >
                                    Hide
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <RightPanel
                                    clarityMode={clarityMode}
                                    activityLog={workspace.activityLog}
                                    changeSummary={workspace.changeSummary}
                                    lastOutputLabel={workspace.lastOutputLabel}
                                    sceneGraph={sceneGraph}
                                    setSceneGraph={setSceneGraph}
                                    assetsList={workspace.assetsList}
                                    activeScene={workspace.activeScene}
                                    saveState={workspace.saveState}
                                    saveMessage={workspace.saveMessage}
                                    saveError={workspace.saveError}
                                    lastSavedAt={workspace.lastSavedAt}
                                    versions={workspace.versions}
                                    onManualSave={workspace.manualSave}
                                    onRestoreVersion={workspace.restoreVersion}
                                    onExport={workspace.handleExport}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
