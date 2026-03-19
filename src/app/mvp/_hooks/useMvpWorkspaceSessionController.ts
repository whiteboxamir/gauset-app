"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore.ts";
import { patchSceneContinuityOnSceneDocument } from "@/lib/scene-graph/document.ts";
import { createRenderableSceneDocumentSnapshotGetter } from "@/state/mvpRenderableSceneDocument.ts";
import type { MvpSceneStore } from "@/state/mvpSceneStore.ts";

import { trackMvpEvent } from "../_lib/analytics";
import { createDemoWorldPreset } from "../_lib/clarity";
import {
    PROGRAMMATIC_CHANGE_RESET_MS,
    hasSceneContent,
    type GenerationTelemetry,
    type SceneVersion,
    type StepStatus,
    type WorkspaceHudState,
    type WorkspaceLaunchSourceKind,
    type WorkspaceRouteVariant,
} from "./mvpWorkspaceSessionShared";
import { useMvpWorkspaceHudController } from "./useMvpWorkspaceHudController";
import { useMvpWorkspacePersistenceController } from "./useMvpWorkspacePersistenceController";
import { useMvpWorkspaceTelemetryController } from "./useMvpWorkspaceTelemetryController";

interface UseMvpWorkspaceSessionControllerOptions {
    clarityMode?: boolean;
    routeVariant?: WorkspaceRouteVariant;
    launchSceneId?: string | null;
    launchProjectId?: string | null;
    launchEntryMode?: "workspace" | null;
    launchIntent?: "generate" | "capture" | "import" | null;
    launchBrief?: string | null;
    launchReferences?: string | null;
    launchProviderId?: string | null;
    launchSourceKind?: WorkspaceLaunchSourceKind | null;
    sceneStore: MvpSceneStore;
    editorSessionActions: MvpEditorSessionStoreActions;
}

function hasSeededLaunchContinuity(worldBible?: string | null, lookDevelopment?: string | null) {
    return Boolean(worldBible?.trim() || lookDevelopment?.trim());
}

export function useMvpWorkspaceSessionController({
    clarityMode = false,
    routeVariant = "workspace",
    launchSceneId = null,
    launchProjectId = null,
    launchEntryMode = null,
    launchIntent = null,
    launchBrief = null,
    launchReferences = null,
    launchProviderId = null,
    launchSourceKind = null,
    sceneStore,
    editorSessionActions,
}: UseMvpWorkspaceSessionControllerOptions) {
    const demoPreset = useMemo(() => createDemoWorldPreset(), []);
    const flowName = clarityMode ? "clarity_preview" : "classic";
    const router = useRouter();
    const getRenderableSceneDocumentSnapshot = useMemo(() => createRenderableSceneDocumentSnapshotGetter(sceneStore), [sceneStore]);
    const renderableSceneDocument = useSyncExternalStore(
        sceneStore.subscribe,
        getRenderableSceneDocumentSnapshot,
        getRenderableSceneDocumentSnapshot,
    );

    const programmaticSceneChangeRef = useRef(false);
    const handledLaunchSceneIdRef = useRef<string | null>(null);
    const linkedProjectSceneIdsRef = useRef<Set<string>>(new Set());
    const canonicalizedPreviewSceneIdsRef = useRef<Set<string>>(new Set());
    const seededLaunchContinuityRef = useRef(false);
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
    const startInWorkspace = (routeVariant === "workspace" && Boolean(launchSceneId)) || launchEntryMode === "workspace";

    const workspacePersistence = useMvpWorkspacePersistenceController({
        clarityMode,
        routeVariant,
        launchSceneId,
        startInWorkspace,
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
        launchProjectId,
        launchSourceKind,
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
    const hasWorldContent = useMemo(() => hasSceneContent(renderableSceneDocument), [renderableSceneDocument]);
    const hasSavedVersion = useMemo(
        () => Boolean(workspacePersistence.activeScene && (workspacePersistence.versions.length > 0 || workspacePersistence.lastSavedAt)),
        [workspacePersistence.activeScene, workspacePersistence.lastSavedAt, workspacePersistence.versions.length],
    );
    const canUseAdvancedDensity = hasSavedVersion;
    const isAdvancedDensityEnabled = canUseAdvancedDensity && workspaceHud.hudState.advancedMode;
    const journeyStage: "start" | "unsaved" | "saved" = !hasWorldContent ? "start" : hasSavedVersion ? "saved" : "unsaved";

    const toggleAdvancedDensity = useCallback(() => {
        if (!canUseAdvancedDensity) {
            return;
        }
        workspaceHud.toggleAdvancedMode();
    }, [canUseAdvancedDensity, workspaceHud]);

    useEffect(() => {
        if (seededLaunchContinuityRef.current) {
            return;
        }
        if (!hasSeededLaunchContinuity(launchBrief, launchReferences)) {
            seededLaunchContinuityRef.current = true;
            return;
        }
        if (hasSeededLaunchContinuity(renderableSceneDocument.continuity.worldBible, renderableSceneDocument.continuity.lookDevelopment)) {
            seededLaunchContinuityRef.current = true;
            return;
        }

        seededLaunchContinuityRef.current = true;
        replaceSceneDocument(
            patchSceneContinuityOnSceneDocument(renderableSceneDocument, {
                worldBible: renderableSceneDocument.continuity.worldBible || launchBrief || "",
                lookDevelopment: renderableSceneDocument.continuity.lookDevelopment || launchReferences || "",
            }),
        );
    }, [launchBrief, launchReferences, renderableSceneDocument, replaceSceneDocument]);

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

    useEffect(() => {
        if (routeVariant !== "preview" || !launchProjectId || !workspacePersistence.activeScene || !hasSavedVersion) {
            return;
        }

        const canonicalKey = `${launchProjectId}:${workspacePersistence.activeScene}`;
        if (canonicalizedPreviewSceneIdsRef.current.has(canonicalKey)) {
            return;
        }

        canonicalizedPreviewSceneIdsRef.current.add(canonicalKey);
        const searchParams = new URLSearchParams({
            project: launchProjectId,
            scene: workspacePersistence.activeScene,
        });
        router.replace(`/mvp?${searchParams.toString()}`);
    }, [hasSavedVersion, launchProjectId, routeVariant, router, workspacePersistence.activeScene]);

    useEffect(() => {
        if (!launchProjectId || !workspacePersistence.activeScene || !hasSavedVersion) {
            return;
        }

        const autoLinkKey = `${launchProjectId}:${workspacePersistence.activeScene}`;
        if (linkedProjectSceneIdsRef.current.has(autoLinkKey)) {
            return;
        }

        linkedProjectSceneIdsRef.current.add(autoLinkKey);
        void (async () => {
            try {
                const response = await fetch(`/api/projects/${launchProjectId}/world-links`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        sceneId: workspacePersistence.activeScene,
                        environmentLabel: workspacePersistence.currentInputLabel ?? undefined,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Project link failed (${response.status})`);
                }

                workspaceTelemetry.appendActivity(
                    "Project world linked",
                    `Attached saved world ${workspacePersistence.activeScene} back to project ${launchProjectId}.`,
                    "success",
                );
            } catch (error) {
                linkedProjectSceneIdsRef.current.delete(autoLinkKey);
                workspaceTelemetry.appendActivity(
                    "Project link unavailable",
                    error instanceof Error ? error.message : "Project world linking failed.",
                    "warning",
                );
            }
        })();
    }, [hasSavedVersion, launchProjectId, routeVariant, workspacePersistence.activeScene, workspacePersistence.currentInputLabel]);

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
            trackMvpEvent("mvp_first_world_saved", {
                flow: flowName,
                launch_project_id: launchProjectId ?? "",
                launch_source_kind: launchSourceKind ?? "",
                active_scene: workspacePersistence.activeScene ?? "",
            });
        }
        return payload;
    }, [flowName, launchProjectId, launchSourceKind, workspacePersistence, workspaceTelemetry]);

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
        launchProjectId,
        launchIntent,
        launchBrief,
        launchReferences,
        launchProviderId,
        launchSourceKind,
        linkedLaunchStatus,
        linkedLaunchMessage,
        workspaceOrigin: workspacePersistence.workspaceOrigin,
        workspaceOriginDetail: workspacePersistence.workspaceOriginDetail,
        stepStatus: workspaceTelemetry.stepStatus,
        activityLog: workspaceTelemetry.activityLog,
        lastOutputLabel: workspacePersistence.lastOutputLabel,
        changeSummary: workspaceTelemetry.changeSummary,
        hudState: workspaceHud.hudState,
        hasWorldContent,
        hasSavedVersion,
        canUseAdvancedDensity,
        isAdvancedDensityEnabled,
        journeyStage,
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
        toggleAdvancedDensity,
    };
}

export type MvpWorkspaceSessionController = ReturnType<typeof useMvpWorkspaceSessionController>;
export type { GenerationTelemetry, SceneVersion, StepStatus, WorkspaceHudState };
