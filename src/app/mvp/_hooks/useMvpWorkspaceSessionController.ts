"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore.ts";
import { createRenderableSceneDocumentSnapshotGetter } from "@/state/mvpRenderableSceneDocument.ts";
import type { MvpSceneStore } from "@/state/mvpSceneStore.ts";

import { trackMvpEvent } from "../_lib/analytics";
import { createDemoWorldPreset } from "../_lib/clarity";
import {
    PROGRAMMATIC_CHANGE_RESET_MS,
    type GenerationTelemetry,
    type SceneVersion,
    type StepStatus,
    type WorkspaceHudState,
    type WorkspaceRouteVariant,
} from "./mvpWorkspaceSessionShared";
import { useMvpWorkspaceHudController } from "./useMvpWorkspaceHudController";
import { useMvpWorkspacePersistenceController } from "./useMvpWorkspacePersistenceController";
import { useMvpWorkspaceTelemetryController } from "./useMvpWorkspaceTelemetryController";

interface UseMvpWorkspaceSessionControllerOptions {
    clarityMode?: boolean;
    routeVariant?: WorkspaceRouteVariant;
    launchSceneId?: string | null;
    sceneStore: MvpSceneStore;
    editorSessionActions: MvpEditorSessionStoreActions;
}

export function useMvpWorkspaceSessionController({
    clarityMode = false,
    routeVariant = "workspace",
    launchSceneId = null,
    sceneStore,
    editorSessionActions,
}: UseMvpWorkspaceSessionControllerOptions) {
    const demoPreset = useMemo(() => createDemoWorldPreset(), []);
    const flowName = clarityMode ? "clarity_preview" : "classic";
    const getRenderableSceneDocumentSnapshot = useMemo(() => createRenderableSceneDocumentSnapshotGetter(sceneStore), [sceneStore]);
    const renderableSceneDocument = useSyncExternalStore(
        sceneStore.subscribe,
        getRenderableSceneDocumentSnapshot,
        getRenderableSceneDocumentSnapshot,
    );

    const programmaticSceneChangeRef = useRef(false);
    const handledLaunchSceneIdRef = useRef<string | null>(null);
    const [linkedLaunchStatus, setLinkedLaunchStatus] = useState<"idle" | "opening" | "opened" | "unavailable">(
        routeVariant === "workspace" && launchSceneId ? "opening" : "idle",
    );
    const [linkedLaunchMessage, setLinkedLaunchMessage] = useState(
        routeVariant === "workspace" && launchSceneId ? `Opening linked world ${launchSceneId} from the project layer.` : "",
    );

    const markProgrammaticSceneChange = useCallback(() => {
        programmaticSceneChangeRef.current = true;
        window.setTimeout(() => {
            programmaticSceneChangeRef.current = false;
        }, PROGRAMMATIC_CHANGE_RESET_MS);
    }, []);

    const replaceSceneDocument = useCallback(
        (nextSceneDocument: typeof renderableSceneDocument) => {
            sceneStore.getState().actions.loadDocument(nextSceneDocument);
        },
        [sceneStore],
    );

    const workspacePersistence = useMvpWorkspacePersistenceController({
        clarityMode,
        routeVariant,
        launchSceneId,
        demoPreset,
        sceneDocument: renderableSceneDocument,
        setSceneDocument: replaceSceneDocument,
        getSceneDocumentSnapshot: getRenderableSceneDocumentSnapshot,
        editorSessionActions,
        markProgrammaticSceneChange,
    });
    const workspaceHud = useMvpWorkspaceHudController({ routeVariant });
    const workspaceTelemetry = useMvpWorkspaceTelemetryController({
        clarityMode,
        activeScene: workspacePersistence.activeScene,
        assetsList: workspacePersistence.assetsList,
        entryMode: workspacePersistence.entryMode,
        sceneDocument: renderableSceneDocument,
        getSceneDocumentSnapshot: getRenderableSceneDocumentSnapshot,
        currentInputLabel: workspacePersistence.currentInputLabel,
        setCurrentInputLabel: workspacePersistence.setCurrentInputLabel,
        lastOutputInputLabel: workspacePersistence.lastOutputInputLabel,
        setLastOutputInputLabel: workspacePersistence.setLastOutputInputLabel,
        lastOutputSceneDocument: workspacePersistence.lastOutputSceneDocument,
        setLastOutputSceneDocument: workspacePersistence.setLastOutputSceneDocument,
        lastOutputLabel: workspacePersistence.lastOutputLabel,
        setLastOutputLabel: workspacePersistence.setLastOutputLabel,
        programmaticSceneChangeRef,
    });

    useEffect(() => {
        if (routeVariant !== "workspace" || !launchSceneId) {
            return;
        }
        if (handledLaunchSceneIdRef.current === launchSceneId) {
            return;
        }

        handledLaunchSceneIdRef.current = launchSceneId;
        let cancelled = false;
        setLinkedLaunchStatus("opening");
        setLinkedLaunchMessage(`Opening linked world ${launchSceneId} from the project layer.`);

        void (async () => {
            const result = await workspacePersistence.openLinkedScene(launchSceneId);
            if (cancelled) {
                return;
            }

            workspaceTelemetry.clearStepStatus();
            if (result.status === "version") {
                setLinkedLaunchStatus("opened");
                setLinkedLaunchMessage(`Opened ${launchSceneId} from saved project history.`);
                workspaceTelemetry.appendActivity("Linked world opened", `Loaded ${launchSceneId} from saved project history.`, "info");
                return;
            }
            if (result.status === "environment") {
                setLinkedLaunchStatus("opened");
                setLinkedLaunchMessage(`Opened ${launchSceneId} from stored world artifacts.`);
                workspaceTelemetry.appendActivity("Linked world opened", `Loaded ${launchSceneId} from stored world artifacts.`, "info");
                return;
            }
            if (result.status === "error") {
                setLinkedLaunchStatus("unavailable");
                setLinkedLaunchMessage(result.message ?? `Could not open ${launchSceneId} from the project layer.`);
                workspaceTelemetry.appendActivity(
                    "Linked world unavailable",
                    result.message ?? `Could not open ${launchSceneId} from the project layer.`,
                    "warning",
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        launchSceneId,
        routeVariant,
        workspacePersistence,
        workspaceTelemetry,
    ]);

    useEffect(() => {
        if (routeVariant !== "workspace" || !launchSceneId) {
            setLinkedLaunchStatus("idle");
            setLinkedLaunchMessage("");
        }
    }, [launchSceneId, routeVariant]);

    const openDemoWorld = useCallback(() => {
        workspacePersistence.openDemoWorld();
        workspaceTelemetry.clearStepStatus();
        workspaceTelemetry.appendActivity("Demo world opened", "Loaded a sample world so persistence is visible immediately.", "info");
        trackMvpEvent("mvp_demo_open", { flow: flowName });
    }, [flowName, workspacePersistence, workspaceTelemetry]);

    const startBlankWorkspace = useCallback(() => {
        workspacePersistence.startBlankWorkspace();
        workspaceTelemetry.clearStepStatus();
        workspaceTelemetry.appendActivity("Workspace ready", "Upload one still or return to the demo world.", "neutral");
    }, [workspacePersistence, workspaceTelemetry]);

    const resumeStoredDraft = useCallback(() => {
        const resumed = workspacePersistence.resumeStoredDraft();
        workspaceTelemetry.clearStepStatus();
        if (resumed) {
            workspaceTelemetry.appendActivity("Draft resumed", "Recovered the last local /mvp draft.", "info");
            return;
        }
        workspaceTelemetry.appendActivity("Workspace ready", "Upload one still or return to the demo world.", "neutral");
    }, [workspacePersistence, workspaceTelemetry]);

    const manualSave = useCallback(async () => {
        const payload = await workspacePersistence.manualSave();
        if (payload) {
            workspaceTelemetry.appendActivity("Version saved", "Saved the current world and director state.", "success");
        }
        return payload;
    }, [workspacePersistence, workspaceTelemetry]);

    const restoreVersion = useCallback(
        async (versionId: string) => {
            const restored = await workspacePersistence.restoreVersion(versionId);
            if (restored) {
                workspaceTelemetry.appendActivity("Version restored", "Loaded a saved world state back into the workspace.", "info");
            }
            return restored;
        },
        [workspacePersistence, workspaceTelemetry],
    );

    return {
        showLaunchpad: workspacePersistence.showLaunchpad,
        hasDraft: workspacePersistence.hasDraft,
        draftUpdatedAt: workspacePersistence.draftUpdatedAt,
        draftSceneId: workspacePersistence.draftSceneId,
        activeScene: workspacePersistence.activeScene,
        assetsList: workspacePersistence.assetsList,
        saveState: workspacePersistence.saveState,
        saveMessage: workspacePersistence.saveMessage,
        saveError: workspacePersistence.saveError,
        lastSavedAt: workspacePersistence.lastSavedAt,
        versions: workspacePersistence.versions,
        launchSceneId,
        linkedLaunchStatus,
        linkedLaunchMessage,
        workspaceOrigin: workspacePersistence.workspaceOrigin,
        workspaceOriginDetail: workspacePersistence.workspaceOriginDetail,
        stepStatus: workspaceTelemetry.stepStatus,
        activityLog: workspaceTelemetry.activityLog,
        lastOutputLabel: workspacePersistence.lastOutputLabel,
        changeSummary: workspaceTelemetry.changeSummary,
        hudState: workspaceHud.hudState,
        setActiveScene: workspacePersistence.setActiveScene,
        setAssetsList: workspacePersistence.setAssetsList,
        markProgrammaticSceneChange,
        handleInputReady: workspaceTelemetry.handleInputReady,
        handleGenerationStart: workspaceTelemetry.handleGenerationStart,
        handleGenerationSuccess: workspaceTelemetry.handleGenerationSuccess,
        handleGenerationError: workspaceTelemetry.handleGenerationError,
        openDemoWorld,
        startBlankWorkspace,
        openLinkedScene: workspacePersistence.openLinkedScene,
        resumeStoredDraft,
        returnToLaunchpad: workspacePersistence.returnToLaunchpad,
        manualSave,
        restoreVersion,
        handleExport: workspaceTelemetry.handleExport,
        toggleLeftRail: workspaceHud.toggleLeftRail,
        toggleRightRail: workspaceHud.toggleRightRail,
        toggleDirectorHud: workspaceHud.toggleDirectorHud,
    };
}

export type MvpWorkspaceSessionController = ReturnType<typeof useMvpWorkspaceSessionController>;
export type { GenerationTelemetry, SceneVersion, StepStatus, WorkspaceHudState };
