"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";

import { trackMvpEvent } from "../_lib/analytics";
import { MvpActivityEntry, buildChangeSummary, createActivityEntry } from "../_lib/clarity";
import { hasSceneContent, type GenerationTelemetry, type StepStatus, type WorkspaceEntryMode, type WorkspaceLaunchSourceKind } from "./mvpWorkspaceSessionShared";

interface UseMvpWorkspaceTelemetryControllerOptions {
    clarityMode?: boolean;
    activeScene: string | null;
    assetsList: any[];
    entryMode: WorkspaceEntryMode;
    sceneDocument: SceneDocumentV2;
    launchProjectId?: string | null;
    launchSourceKind?: WorkspaceLaunchSourceKind | null;
    getSceneDocumentSnapshot: () => SceneDocumentV2;
    currentInputLabel: string | null;
    setCurrentInputLabel: Dispatch<SetStateAction<string | null>>;
    lastOutputInputLabel: string | null;
    setLastOutputInputLabel: Dispatch<SetStateAction<string | null>>;
    lastOutputSceneDocument: SceneDocumentV2 | null;
    setLastOutputSceneDocument: Dispatch<SetStateAction<SceneDocumentV2 | null>>;
    lastOutputLabel: string;
    setLastOutputLabel: Dispatch<SetStateAction<string>>;
    programmaticSceneChangeRef: MutableRefObject<boolean>;
}

export function useMvpWorkspaceTelemetryController({
    clarityMode = false,
    activeScene,
    assetsList,
    entryMode,
    sceneDocument,
    launchProjectId = null,
    launchSourceKind = null,
    getSceneDocumentSnapshot,
    currentInputLabel,
    setCurrentInputLabel,
    lastOutputInputLabel,
    setLastOutputInputLabel,
    lastOutputSceneDocument,
    setLastOutputSceneDocument,
    lastOutputLabel,
    setLastOutputLabel,
    programmaticSceneChangeRef,
}: UseMvpWorkspaceTelemetryControllerOptions) {
    const flowName = clarityMode ? "clarity_preview" : "classic";
    const [stepStatus, setStepStatus] = useState<StepStatus | null>(null);
    const [activityLog, setActivityLog] = useState<MvpActivityEntry[]>([]);

    const previousSceneFingerprintRef = useRef("");
    const firstWorldTrackedRef = useRef(false);
    const sessionAnalyticsRef = useRef({
        firstEdit: false,
        firstGenerate: false,
        firstSuccess: false,
    });

    const sceneFingerprint = useMemo(
        () => JSON.stringify({ activeScene, sceneDocument, assetsList, currentInputLabel }),
        [activeScene, assetsList, currentInputLabel, sceneDocument],
    );

    const appendActivity = useCallback((label: string, detail: string, tone: MvpActivityEntry["tone"] = "neutral") => {
        setActivityLog((prev) => [createActivityEntry(label, detail, tone), ...prev].slice(0, 8));
    }, []);

    const clearStepStatus = useCallback(() => {
        setStepStatus(null);
    }, []);

    const registerFirstEdit = useCallback(
        (surface: string) => {
            if (sessionAnalyticsRef.current.firstEdit) return;
            sessionAnalyticsRef.current.firstEdit = true;
            trackMvpEvent("mvp_first_edit", {
                flow: flowName,
                surface,
            });
            appendActivity("First edit", `Changed ${surface} after the current output loaded.`, "info");
        },
        [appendActivity, flowName],
    );

    useEffect(() => {
        trackMvpEvent("mvp_landed", {
            flow: flowName,
            entry_mode: entryMode,
            launch_project_id: launchProjectId ?? "",
            launch_source_kind: launchSourceKind ?? "",
        });
    }, [entryMode, flowName, launchProjectId, launchSourceKind]);

    useEffect(() => {
        if (firstWorldTrackedRef.current || !hasSceneContent(sceneDocument)) {
            return;
        }
        firstWorldTrackedRef.current = true;
        trackMvpEvent("mvp_first_world_loaded", {
            flow: flowName,
            launch_project_id: launchProjectId ?? "",
            launch_source_kind: launchSourceKind ?? "",
            active_scene: activeScene ?? "",
        });
    }, [activeScene, flowName, launchProjectId, launchSourceKind, sceneDocument]);

    useEffect(() => {
        const handlePageHide = () => {
            if (sessionAnalyticsRef.current.firstSuccess) return;
            trackMvpEvent("mvp_abandonment", {
                flow: flowName,
                entry_mode: entryMode,
                had_content: hasSceneContent(sceneDocument),
            });
        };

        window.addEventListener("pagehide", handlePageHide);
        return () => {
            window.removeEventListener("pagehide", handlePageHide);
        };
    }, [entryMode, flowName, sceneDocument]);

    const handleInputReady = useCallback(
        (inputLabel: string) => {
            setCurrentInputLabel(inputLabel);
            appendActivity("Reference still ready", `${inputLabel} is ready to build a persistent world.`, "info");
        },
        [appendActivity, setCurrentInputLabel],
    );

    const handleGenerationStart = useCallback(
        (event: GenerationTelemetry) => {
            setStepStatus({
                busy: true,
                label: event.label,
                detail: event.detail,
            });
            appendActivity(event.label, event.detail ?? "Generation started.", "info");

            if (!sessionAnalyticsRef.current.firstGenerate) {
                sessionAnalyticsRef.current.firstGenerate = true;
                trackMvpEvent("mvp_first_generate", {
                    flow: flowName,
                    kind: event.kind,
                    input_label: event.inputLabel ?? currentInputLabel ?? "",
                });
            }
        },
        [appendActivity, currentInputLabel, flowName],
    );

    const handleGenerationSuccess = useCallback(
        (event: GenerationTelemetry) => {
            const nextSceneDocument = getSceneDocumentSnapshot();
            const detail = event.detail ?? "The current output is ready.";
            setStepStatus({
                busy: false,
                label: event.label,
                detail,
            });
            setLastOutputSceneDocument(nextSceneDocument);
            setLastOutputLabel(event.label);
            setLastOutputInputLabel(event.inputLabel ?? currentInputLabel ?? null);
            appendActivity(event.label, detail, "success");

            if (!sessionAnalyticsRef.current.firstSuccess) {
                sessionAnalyticsRef.current.firstSuccess = true;
                trackMvpEvent("mvp_first_success", {
                    flow: flowName,
                    kind: event.kind,
                    input_label: event.inputLabel ?? currentInputLabel ?? "",
                });
            }
        },
        [appendActivity, currentInputLabel, flowName, getSceneDocumentSnapshot, setLastOutputInputLabel, setLastOutputLabel, setLastOutputSceneDocument],
    );

    const handleGenerationError = useCallback(
        (event: Pick<GenerationTelemetry, "label" | "detail">) => {
            setStepStatus({
                busy: false,
                label: event.label,
                detail: event.detail,
            });
            appendActivity(event.label, event.detail ?? "Generation failed.", "warning");
        },
        [appendActivity],
    );

    useEffect(() => {
        if (!stepStatus || stepStatus.busy) return;
        const timer = window.setTimeout(() => setStepStatus(null), 4000);
        return () => window.clearTimeout(timer);
    }, [stepStatus]);

    const changeSummary = useMemo(
        () => buildChangeSummary(sceneDocument, lastOutputSceneDocument, currentInputLabel, lastOutputInputLabel),
        [currentInputLabel, lastOutputInputLabel, lastOutputSceneDocument, sceneDocument],
    );

    useEffect(() => {
        if (programmaticSceneChangeRef.current) {
            previousSceneFingerprintRef.current = sceneFingerprint;
            return;
        }
        if (!changeSummary) {
            previousSceneFingerprintRef.current = sceneFingerprint;
            return;
        }
        if (sceneFingerprint === previousSceneFingerprintRef.current) return;

        if (previousSceneFingerprintRef.current) {
            registerFirstEdit(changeSummary.sceneDirection.length > 0 ? "scene direction" : "world state");
        }
        previousSceneFingerprintRef.current = sceneFingerprint;
    }, [changeSummary, programmaticSceneChangeRef, registerFirstEdit, sceneFingerprint]);

    const handleExport = useCallback(() => {
        trackMvpEvent("mvp_export", {
            flow: flowName,
            active_scene: activeScene ?? "",
            last_output_label: lastOutputLabel,
        });
        appendActivity("Scene package exported", "Exported the current world and director package.", "success");
    }, [activeScene, appendActivity, flowName, lastOutputLabel]);

    return {
        stepStatus,
        activityLog,
        changeSummary,
        appendActivity,
        clearStepStatus,
        handleInputReady,
        handleGenerationStart,
        handleGenerationSuccess,
        handleGenerationError,
        handleExport,
    };
}
