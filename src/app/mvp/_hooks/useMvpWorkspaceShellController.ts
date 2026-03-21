"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";
import { resolveEnvironmentRenderState } from "@/lib/mvp-product";
import { normalizeWorkspaceSceneGraph } from "@/lib/mvp-workspace";
import { createEmptySceneDocumentWorkspaceGraph, mergeWorkspaceSceneGraphIntoSceneDocument } from "@/lib/scene-graph/document";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types";
import {
    type PersistedWorkspaceSceneGraphV2,
    normalizePersistedSceneGraph,
    serializeSceneDocumentToPersistedSceneGraph,
} from "@/lib/scene-graph/workspaceAdapter";
import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore";
import type { MvpSceneStore } from "@/state/mvpSceneStore";

import { trackMvpEvent } from "../_lib/analytics";
import { MvpActivityEntry, buildChangeSummary, createActivityEntry, createDemoWorldPreset } from "../_lib/clarity";

const LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";
const MVP_WORKSPACE_SHELL_LOCK_VERSION = "2026-03-11";
const HUD_LAYOUT_STORAGE_KEY_PREFIX = `gauset:mvp:hud:${MVP_WORKSPACE_SHELL_LOCK_VERSION}`;
const AUTOSAVE_DEBOUNCE_MS = 1500;
const PROGRAMMATIC_CHANGE_RESET_MS = 80;

type SaveState = "idle" | "saving" | "saved" | "recovered" | "error";
type WorkspaceEntryMode = "launchpad" | "workspace";

interface WorkspaceHudState {
    leftRailCollapsed: boolean;
    rightRailCollapsed: boolean;
    directorHudCompact: boolean;
}

interface SceneVersion {
    version_id: string;
    saved_at: string;
    source?: string;
    summary?: {
        asset_count?: number;
        has_environment?: boolean;
    };
}

interface StoredDraft {
    activeScene: string | null;
    sceneGraph: any;
    sceneDocument?: SceneDocumentV2;
    assetsList: any[];
    updatedAt?: string | null;
}

interface StepStatus {
    busy: boolean;
    label: string;
    detail?: string;
}

interface GenerationTelemetry {
    kind: "preview" | "reconstruction" | "asset" | "generated_image";
    label: string;
    detail?: string;
    inputLabel?: string;
    sceneId?: string;
    assetId?: string;
    sceneGraph?: any;
}

interface UseMvpWorkspaceShellControllerOptions {
    clarityMode?: boolean;
    routeVariant?: "workspace" | "preview";
    sceneStore: MvpSceneStore;
    sceneGraph: PersistedWorkspaceSceneGraphV2;
    getRenderableSceneDocumentSnapshot: () => SceneDocumentV2;
    editorSessionActions: MvpEditorSessionStoreActions;
}

const createSceneId = () => `scene_${Date.now().toString(36)}`;

const hasTextContent = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const shouldKeepEnvironment = (environment: any) => {
    if (!environment || typeof environment !== "object") {
        return false;
    }

    const renderState = resolveEnvironmentRenderState(environment);
    return (
        renderState.hasRenderableOutput ||
        Boolean(renderState.referenceImage) ||
        hasTextContent(environment?.sourceLabel) ||
        hasTextContent(environment?.statusLabel) ||
        hasTextContent(environment?.label) ||
        hasTextContent(environment?.lane) ||
        hasTextContent(environment?.metadata?.truth_label) ||
        hasTextContent(environment?.metadata?.reconstruction_status)
    );
};

const normalizeEnvironmentResourceUrls = (environment: any) => {
    if (!environment || typeof environment !== "object") {
        return environment ?? null;
    }

    const urls = environment.urls && typeof environment.urls === "object" ? environment.urls : null;
    const normalized = {
        ...environment,
        ...(urls
            ? {
                  urls: {
                      ...urls,
                      viewer: typeof urls.viewer === "string" ? toProxyUrl(urls.viewer) : urls.viewer,
                      splats: typeof urls.splats === "string" ? toProxyUrl(urls.splats) : urls.splats,
                      cameras: typeof urls.cameras === "string" ? toProxyUrl(urls.cameras) : urls.cameras,
                      metadata: typeof urls.metadata === "string" ? toProxyUrl(urls.metadata) : urls.metadata,
                      preview_projection:
                          typeof urls.preview_projection === "string" ? toProxyUrl(urls.preview_projection) : urls.preview_projection,
                      holdout_report: typeof urls.holdout_report === "string" ? toProxyUrl(urls.holdout_report) : urls.holdout_report,
                      capture_scorecard:
                          typeof urls.capture_scorecard === "string" ? toProxyUrl(urls.capture_scorecard) : urls.capture_scorecard,
                      benchmark_report:
                          typeof urls.benchmark_report === "string" ? toProxyUrl(urls.benchmark_report) : urls.benchmark_report,
                  },
              }
            : {}),
    };

    return shouldKeepEnvironment(normalized) ? normalized : null;
};

const normalizeAssetEntries = (assets: any[]) =>
    assets.map((asset) =>
        asset && typeof asset === "object"
            ? {
                  ...asset,
                  mesh: typeof asset.mesh === "string" ? toProxyUrl(asset.mesh) : asset.mesh,
                  texture: typeof asset.texture === "string" ? toProxyUrl(asset.texture) : asset.texture,
                  preview: typeof asset.preview === "string" ? toProxyUrl(asset.preview) : asset.preview,
              }
            : asset,
    );

const normalizeSceneGraph = (sceneGraph: any): PersistedWorkspaceSceneGraphV2 => {
    const normalized = normalizePersistedSceneGraph(sceneGraph);
    const workspace = normalizeWorkspaceSceneGraph(normalized);
    return {
        ...workspace,
        environment: normalizeEnvironmentResourceUrls(workspace.environment),
        assets: normalizeAssetEntries(workspace.assets),
        __scene_document_v2: normalized.__scene_document_v2,
    };
};

const hasSceneContent = (sceneGraph: any) => {
    const normalized = normalizeSceneGraph(sceneGraph);
    return (
        normalized.assets.length > 0 ||
        (normalized.environment
            ? resolveEnvironmentRenderState(normalized.environment).hasRenderableOutput ||
              Boolean(resolveEnvironmentRenderState(normalized.environment).referenceImage)
            : false)
    );
};

const formatTimestamp = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
};

const createDefaultHudState = (routeVariant: "workspace" | "preview"): WorkspaceHudState =>
    routeVariant === "preview"
        ? {
              leftRailCollapsed: true,
              rightRailCollapsed: true,
              directorHudCompact: true,
          }
        : {
              leftRailCollapsed: false,
              rightRailCollapsed: false,
              directorHudCompact: false,
          };

const normalizeHudState = (routeVariant: "workspace" | "preview", value: unknown): WorkspaceHudState => {
    const fallback = createDefaultHudState(routeVariant);
    if (!value || typeof value !== "object") {
        return fallback;
    }

    const input = value as Partial<WorkspaceHudState>;
    return {
        leftRailCollapsed: typeof input.leftRailCollapsed === "boolean" ? input.leftRailCollapsed : fallback.leftRailCollapsed,
        rightRailCollapsed: typeof input.rightRailCollapsed === "boolean" ? input.rightRailCollapsed : fallback.rightRailCollapsed,
        directorHudCompact: typeof input.directorHudCompact === "boolean" ? input.directorHudCompact : fallback.directorHudCompact,
    };
};

const hudStorageKey = (routeVariant: "workspace" | "preview") => `${HUD_LAYOUT_STORAGE_KEY_PREFIX}:${routeVariant}`;

export function useMvpWorkspaceShellController({
    clarityMode = false,
    routeVariant = "workspace",
    sceneStore,
    sceneGraph,
    getRenderableSceneDocumentSnapshot,
    editorSessionActions,
}: UseMvpWorkspaceShellControllerOptions) {
    const demoPreset = useMemo(() => createDemoWorldPreset(), []);
    const flowName = clarityMode ? "clarity_preview" : "classic";
    const sceneStoreActions = useMemo(() => sceneStore.getState().actions, [sceneStore]);

    const [entryMode, setEntryMode] = useState<WorkspaceEntryMode>(clarityMode ? "launchpad" : "workspace");
    const [activeScene, setActiveScene] = useState<string | null>(null);
    const [assetsList, setAssetsList] = useState<any[]>([]);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveMessage, setSaveMessage] = useState(
        clarityMode ? "Open the demo world or upload a still to begin." : "Scene is empty.",
    );
    const [saveError, setSaveError] = useState("");
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [versions, setVersions] = useState<SceneVersion[]>([]);
    const [storedDraft, setStoredDraft] = useState<StoredDraft | null>(null);
    const [stepStatus, setStepStatus] = useState<StepStatus | null>(null);
    const [activityLog, setActivityLog] = useState<MvpActivityEntry[]>([]);
    const [currentInputLabel, setCurrentInputLabel] = useState<string | null>(null);
    const [lastOutputInputLabel, setLastOutputInputLabel] = useState<string | null>(null);
    const [lastOutputSceneGraph, setLastOutputSceneGraph] = useState<any | null>(null);
    const [lastOutputLabel, setLastOutputLabel] = useState("No world output yet");
    const [hudState, setHudState] = useState<WorkspaceHudState>(() => createDefaultHudState(routeVariant));

    const hasHydratedRef = useRef(false);
    const hudHydratedRef = useRef(false);
    const lastSavedFingerprintRef = useRef("");
    const versionsRequestRef = useRef(0);
    const saveInFlightRef = useRef<Promise<any> | null>(null);
    const programmaticSceneChangeRef = useRef(false);
    const previousSceneFingerprintRef = useRef("");
    const sessionAnalyticsRef = useRef({
        firstEdit: false,
        firstGenerate: false,
        firstSuccess: false,
    });

    const replaceSceneGraph = useCallback(
        (nextSceneGraph: unknown) => {
            sceneStore.getState().actions.loadSceneGraph(normalizeSceneGraph(nextSceneGraph));
        },
        [sceneStore],
    );

    const setSceneGraph = useCallback<React.Dispatch<React.SetStateAction<any>>>(
        (updater) => {
            if (typeof updater !== "function") {
                replaceSceneGraph(updater);
                return;
            }

            const previousSceneGraph = serializeSceneDocumentToPersistedSceneGraph(getRenderableSceneDocumentSnapshot());
            const nextValue = updater(previousSceneGraph);
            const nextWorkspaceSceneGraph = normalizeWorkspaceSceneGraph(nextValue);
            const mergedDocument = mergeWorkspaceSceneGraphIntoSceneDocument(sceneStore.getState().document, nextWorkspaceSceneGraph);
            sceneStoreActions.loadDocument(mergedDocument);
        },
        [getRenderableSceneDocumentSnapshot, replaceSceneGraph, sceneStore, sceneStoreActions],
    );

    const getSerializedSceneGraphSnapshot = useCallback(
        () => serializeSceneDocumentToPersistedSceneGraph(getRenderableSceneDocumentSnapshot()),
        [getRenderableSceneDocumentSnapshot],
    );

    const replaceSceneEnvironment = useCallback(
        (environment: Record<string, unknown> | null) => {
            sceneStoreActions.setEnvironment(environment);
            return getSerializedSceneGraphSnapshot();
        },
        [getSerializedSceneGraphSnapshot, sceneStoreActions],
    );

    const appendSceneAsset = useCallback(
        (asset: Record<string, unknown>) => {
            sceneStoreActions.appendAsset(asset);
        },
        [sceneStoreActions],
    );

    const duplicateSceneAsset = useCallback(
        (instanceId: string) => {
            sceneStoreActions.duplicateAsset(instanceId);
        },
        [sceneStoreActions],
    );

    const removeSceneAsset = useCallback(
        (instanceId: string) => {
            sceneStoreActions.removeAsset(instanceId);
        },
        [sceneStoreActions],
    );

    const removeScenePin = useCallback(
        (pinId: string) => {
            sceneStoreActions.removePin(pinId);
        },
        [sceneStoreActions],
    );

    const removeSceneView = useCallback(
        (viewId: string) => {
            sceneStoreActions.removeCameraView(viewId);
        },
        [sceneStoreActions],
    );

    const sceneFingerprint = useMemo(
        () => JSON.stringify({ activeScene, sceneGraph: normalizeSceneGraph(sceneGraph), assetsList, currentInputLabel }),
        [activeScene, assetsList, currentInputLabel, sceneGraph],
    );

    const appendActivity = useCallback((label: string, detail: string, tone: MvpActivityEntry["tone"] = "neutral") => {
        setActivityLog((prev) => [createActivityEntry(label, detail, tone), ...prev].slice(0, 8));
    }, []);

    const markProgrammaticSceneChange = useCallback(() => {
        programmaticSceneChangeRef.current = true;
        window.setTimeout(() => {
            programmaticSceneChangeRef.current = false;
        }, PROGRAMMATIC_CHANGE_RESET_MS);
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

    const loadVersions = useCallback(async (sceneId: string) => {
        const requestId = ++versionsRequestRef.current;
        try {
            const response = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions`, {
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`Version history unavailable (${response.status})`);
            }
            const payload = await response.json();
            if (versionsRequestRef.current === requestId) {
                setVersions(Array.isArray(payload.versions) ? payload.versions : []);
            }
        } catch {
            if (versionsRequestRef.current === requestId) {
                setVersions([]);
            }
        }
    }, []);

    const applyWorkspaceSnapshot = useCallback(
        (
            snapshot: {
                activeScene: string | null;
                sceneGraph: any;
                assetsList: any[];
                saveState: SaveState;
                saveMessage: string;
                currentInputLabel?: string | null;
                lastSavedAt?: string | null;
                lastOutputLabel?: string;
                lastOutputAt?: string | null;
            },
            options?: {
                keepAsLastOutput?: boolean;
            },
        ) => {
            const normalizedSceneGraph = normalizeSceneGraph(snapshot.sceneGraph);
            const normalizedAssetsList = normalizeAssetEntries(Array.isArray(snapshot.assetsList) ? snapshot.assetsList : []);
            markProgrammaticSceneChange();
            setActiveScene(snapshot.activeScene);
            setSceneGraph(normalizedSceneGraph);
            setAssetsList(normalizedAssetsList);
            setVersions([]);
            setSaveState(snapshot.saveState);
            setSaveError("");
            setSaveMessage(snapshot.saveMessage);
            setLastSavedAt(snapshot.lastSavedAt ?? null);
            setCurrentInputLabel(snapshot.currentInputLabel ?? null);
            setLastOutputLabel(snapshot.lastOutputLabel ?? "Current workspace");
            setEntryMode("workspace");
            editorSessionActions.resetSession();

            if (options?.keepAsLastOutput) {
                setLastOutputSceneGraph(normalizedSceneGraph);
                setLastOutputInputLabel(snapshot.currentInputLabel ?? null);
                lastSavedFingerprintRef.current = JSON.stringify({
                    activeScene: snapshot.activeScene,
                    sceneGraph: normalizedSceneGraph,
                    assetsList: normalizedAssetsList,
                });
            } else {
                setLastOutputSceneGraph(null);
                setLastOutputInputLabel(null);
                lastSavedFingerprintRef.current = "";
            }
        },
        [editorSessionActions, markProgrammaticSceneChange, setSceneGraph],
    );

    const openDemoWorld = useCallback(() => {
        applyWorkspaceSnapshot(
            {
                activeScene: null,
                sceneGraph: demoPreset.sceneGraph,
                assetsList: demoPreset.assetsList,
                saveState: "recovered",
                saveMessage: "Demo world loaded. Update the director brief or export a version when you are ready.",
                currentInputLabel: demoPreset.inputLabel,
                lastOutputLabel: "Demo world",
                lastOutputAt: new Date().toISOString(),
            },
            { keepAsLastOutput: true },
        );

        setStepStatus(null);
        appendActivity("Demo world opened", "Loaded a sample world so persistence is visible immediately.", "info");
        trackMvpEvent("mvp_demo_open", { flow: flowName });
    }, [appendActivity, applyWorkspaceSnapshot, demoPreset, flowName]);

    const startBlankWorkspace = useCallback(() => {
        applyWorkspaceSnapshot(
            {
                activeScene: null,
                sceneGraph: createEmptySceneDocumentWorkspaceGraph(),
                assetsList: [],
                saveState: "idle",
                saveMessage: "Upload one still to build your first persistent world.",
                currentInputLabel: null,
                lastOutputLabel: "No world output yet",
                lastOutputAt: null,
            },
            { keepAsLastOutput: false },
        );
        setStepStatus(null);
        appendActivity("Workspace ready", "Upload one still or return to the demo world.", "neutral");
    }, [appendActivity, applyWorkspaceSnapshot]);

    const resumeStoredDraft = useCallback(() => {
        if (!storedDraft) {
            startBlankWorkspace();
            return;
        }

        applyWorkspaceSnapshot(
            {
                activeScene: storedDraft.activeScene,
                sceneGraph: storedDraft.sceneGraph,
                assetsList: storedDraft.assetsList,
                saveState: "recovered",
                saveMessage: storedDraft.updatedAt
                    ? `Recovered local draft from ${formatTimestamp(storedDraft.updatedAt)}`
                    : "Recovered local draft.",
                currentInputLabel:
                    typeof storedDraft.sceneGraph?.environment?.sourceLabel === "string"
                        ? storedDraft.sceneGraph.environment.sourceLabel
                        : null,
                lastSavedAt: null,
                lastOutputLabel: "Recovered draft",
                lastOutputAt: storedDraft.updatedAt ?? null,
            },
            { keepAsLastOutput: false },
        );
        appendActivity("Draft resumed", "Recovered the last local /mvp draft.", "info");
    }, [applyWorkspaceSnapshot, appendActivity, startBlankWorkspace, storedDraft]);

    const saveScene = useCallback(
        async (source: "manual" | "autosave" = "manual") => {
            const nextSceneId = activeScene ?? createSceneId();
            const normalizedSceneGraph = normalizeSceneGraph(sceneGraph);

            if (!hasSceneContent(normalizedSceneGraph)) {
                setSaveState("idle");
                setSaveError("");
                setSaveMessage(
                    clarityMode ? "Open the demo world or build your own world before saving." : "Scene is empty.",
                );
                return null;
            }

            setSaveState("saving");
            setSaveError("");
            setSaveMessage(source === "autosave" ? "Autosaving scene..." : "Saving scene...");

            const request = fetch(`${MVP_API_BASE_URL}/scene/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scene_id: nextSceneId,
                    scene_graph: normalizedSceneGraph,
                    source,
                }),
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Scene save failed (${response.status})`);
                    }

                    const payload = await response.json();
                    const savedAt = payload.saved_at ?? new Date().toISOString();
                    setActiveScene(nextSceneId);
                    setSaveState("saved");
                    setSaveMessage(
                        source === "autosave"
                            ? `Autosaved ${formatTimestamp(savedAt)}`
                            : `Saved ${nextSceneId} at ${formatTimestamp(savedAt)}`,
                    );
                    setLastSavedAt(savedAt);
                    lastSavedFingerprintRef.current = JSON.stringify({
                        activeScene: nextSceneId,
                        sceneGraph: normalizedSceneGraph,
                        assetsList,
                    });
                    void loadVersions(nextSceneId);
                    if (source === "manual") {
                        appendActivity("Version saved", "Saved the current world and director state.", "success");
                    }
                    return payload;
                })
                .catch((error) => {
                    const message = error instanceof Error ? error.message : "Scene save failed";
                    setSaveState("error");
                    setSaveError(message);
                    setSaveMessage("Autosave failed.");
                    return null;
                })
                .finally(() => {
                    saveInFlightRef.current = null;
                });

            saveInFlightRef.current = request;
            return request;
        },
        [activeScene, appendActivity, assetsList, clarityMode, loadVersions, sceneGraph],
    );

    const manualSave = useCallback(() => saveScene("manual"), [saveScene]);

    const restoreVersion = useCallback(
        async (versionId: string) => {
            if (!activeScene) return;

            markProgrammaticSceneChange();
            setSaveState("saving");
            setSaveError("");
            setSaveMessage("Restoring version...");

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/versions/${versionId}`, {
                    cache: "no-store",
                });
                if (!response.ok) {
                    throw new Error(`Version restore failed (${response.status})`);
                }

                const payload = await response.json();
                const restoredGraph = normalizeSceneGraph(payload.scene_graph ?? createEmptySceneDocumentWorkspaceGraph());
                setSceneGraph(restoredGraph);
                setCurrentInputLabel(
                    typeof restoredGraph.environment?.sourceLabel === "string" ? restoredGraph.environment.sourceLabel : null,
                );
                setSaveState("recovered");
                setSaveMessage(`Restored version from ${formatTimestamp(payload.saved_at) || "history"}`);
                setLastSavedAt(payload.saved_at ?? null);
                setLastOutputSceneGraph(restoredGraph);
                setLastOutputInputLabel(
                    typeof restoredGraph.environment?.sourceLabel === "string" ? restoredGraph.environment.sourceLabel : null,
                );
                setLastOutputLabel("Restored version");
                lastSavedFingerprintRef.current = "";
                appendActivity("Version restored", "Loaded a saved world state back into the workspace.", "info");
            } catch (error) {
                const message = error instanceof Error ? error.message : "Version restore failed";
                setSaveState("error");
                setSaveError(message);
                setSaveMessage("Version restore failed.");
            }
        },
        [activeScene, appendActivity, markProgrammaticSceneChange, setSceneGraph],
    );

    useEffect(() => {
        hasHydratedRef.current = true;
        try {
            const rawDraft = window.localStorage.getItem(LOCAL_DRAFT_KEY);
            if (!rawDraft) return;
            const draft = JSON.parse(rawDraft) as StoredDraft;
            if (!draft || !draft.sceneGraph) return;

            const restoredGraph = normalizeSceneGraph(draft.sceneGraph);
            const restoredAssetsList = Array.isArray(draft.assetsList) ? normalizeAssetEntries(draft.assetsList) : [];
            const restoredSceneId = typeof draft.activeScene === "string" ? draft.activeScene : null;

            if (!hasSceneContent(restoredGraph) && restoredAssetsList.length === 0) return;

            const nextDraft = {
                activeScene: restoredSceneId,
                sceneGraph: restoredGraph,
                assetsList: restoredAssetsList,
                updatedAt: draft.updatedAt,
            };

            window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(nextDraft));
            setStoredDraft(nextDraft);

            if (!clarityMode) {
                setActiveScene(restoredSceneId);
                setSceneGraph(restoredGraph);
                setAssetsList(restoredAssetsList);
                setCurrentInputLabel(
                    typeof restoredGraph.environment?.sourceLabel === "string" ? restoredGraph.environment.sourceLabel : null,
                );
                setSaveState("recovered");
                setSaveMessage(
                    draft.updatedAt
                        ? `Recovered local draft from ${formatTimestamp(draft.updatedAt)}`
                        : "Recovered local draft.",
                );
                if (restoredSceneId) {
                    void loadVersions(restoredSceneId);
                }
            }
        } catch {
            window.localStorage.removeItem(LOCAL_DRAFT_KEY);
        }
    }, [clarityMode, loadVersions, setSceneGraph]);

    useEffect(() => {
        try {
            const rawHudState = window.localStorage.getItem(hudStorageKey(routeVariant));
            if (!rawHudState) {
                setHudState(createDefaultHudState(routeVariant));
                return;
            }
            setHudState(normalizeHudState(routeVariant, JSON.parse(rawHudState)));
        } catch {
            setHudState(createDefaultHudState(routeVariant));
        } finally {
            hudHydratedRef.current = true;
        }
    }, [routeVariant]);

    useEffect(() => {
        if (!hudHydratedRef.current) {
            return;
        }
        try {
            window.localStorage.setItem(hudStorageKey(routeVariant), JSON.stringify(hudState));
        } catch {
            // Ignore local storage failures so the workspace stays usable.
        }
    }, [hudState, routeVariant]);

    useEffect(() => {
        if (!activeScene) {
            setVersions([]);
            return;
        }
        void loadVersions(activeScene);
    }, [activeScene, loadVersions]);

    useEffect(() => {
        if (!hasHydratedRef.current || entryMode !== "workspace") return;
        const normalizedSceneGraph = normalizeSceneGraph(sceneGraph);
        const normalizedAssetsList = normalizeAssetEntries(assetsList);

        if (!hasSceneContent(normalizedSceneGraph) && normalizedAssetsList.length === 0) {
            window.localStorage.removeItem(LOCAL_DRAFT_KEY);
            setStoredDraft(null);
            return;
        }

        const nextDraft = {
            activeScene,
            sceneGraph: normalizedSceneGraph,
            assetsList: normalizedAssetsList,
            updatedAt: new Date().toISOString(),
        };

        window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(nextDraft));
        setStoredDraft(nextDraft);
    }, [activeScene, assetsList, entryMode, sceneGraph]);

    useEffect(() => {
        if (!hasHydratedRef.current || entryMode !== "workspace") return;
        if (!hasSceneContent(sceneGraph)) return;
        if (sceneFingerprint === lastSavedFingerprintRef.current) return;
        if (saveInFlightRef.current) return;

        const timer = window.setTimeout(() => {
            void saveScene("autosave");
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [entryMode, saveScene, sceneFingerprint, sceneGraph]);

    useEffect(() => {
        trackMvpEvent("mvp_landed", {
            flow: flowName,
            entry_mode: clarityMode ? "launchpad" : "workspace",
        });
    }, [clarityMode, flowName]);

    useEffect(() => {
        const handlePageHide = () => {
            if (sessionAnalyticsRef.current.firstSuccess) return;
            trackMvpEvent("mvp_abandonment", {
                flow: flowName,
                entry_mode: entryMode,
                had_content: hasSceneContent(sceneGraph),
            });
        };

        window.addEventListener("pagehide", handlePageHide);
        return () => {
            window.removeEventListener("pagehide", handlePageHide);
        };
    }, [entryMode, flowName, sceneGraph]);

    const handleInputReady = useCallback(
        (inputLabel: string) => {
            setCurrentInputLabel(inputLabel);
            appendActivity("Reference still ready", `${inputLabel} is ready to build a persistent world.`, "info");
        },
        [appendActivity],
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
            const nextSceneGraph = normalizeSceneGraph(event.sceneGraph ?? sceneGraph);
            const detail = event.detail ?? "The current output is ready.";
            setStepStatus({
                busy: false,
                label: event.label,
                detail,
            });
            setLastOutputSceneGraph(nextSceneGraph);
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
        [appendActivity, currentInputLabel, flowName, sceneGraph],
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
        () => buildChangeSummary(normalizeSceneGraph(sceneGraph), lastOutputSceneGraph, currentInputLabel, lastOutputInputLabel),
        [currentInputLabel, lastOutputInputLabel, lastOutputSceneGraph, sceneGraph],
    );

    useEffect(() => {
        if (!hasHydratedRef.current) {
            previousSceneFingerprintRef.current = sceneFingerprint;
            return;
        }
        if (programmaticSceneChangeRef.current) {
            previousSceneFingerprintRef.current = sceneFingerprint;
            return;
        }
        if (!changeSummary) {
            previousSceneFingerprintRef.current = sceneFingerprint;
            return;
        }
        if (sceneFingerprint === previousSceneFingerprintRef.current) return;

        previousSceneFingerprintRef.current = sceneFingerprint;
        registerFirstEdit(changeSummary.sceneDirection.length > 0 ? "scene direction" : "world state");
    }, [changeSummary, registerFirstEdit, sceneFingerprint]);

    const handleExport = useCallback(() => {
        trackMvpEvent("mvp_export", {
            flow: flowName,
            active_scene: activeScene ?? "",
            last_output_label: lastOutputLabel,
        });
        appendActivity("Scene package exported", "Exported the current world and director package.", "success");
    }, [activeScene, appendActivity, flowName, lastOutputLabel]);

    const toggleLeftRail = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            leftRailCollapsed: !previous.leftRailCollapsed,
        }));
    }, []);

    const toggleRightRail = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            rightRailCollapsed: !previous.rightRailCollapsed,
        }));
    }, []);

    const toggleDirectorHud = useCallback(() => {
        setHudState((previous) => ({
            ...previous,
            directorHudCompact: !previous.directorHudCompact,
        }));
    }, []);

    const returnToLaunchpad = useCallback(() => {
        setEntryMode("launchpad");
    }, []);

    return {
        showLaunchpad: clarityMode && entryMode === "launchpad",
        hasDraft: Boolean(storedDraft),
        draftUpdatedAt: storedDraft?.updatedAt ?? null,
        activeScene,
        assetsList,
        saveState,
        saveMessage,
        saveError,
        lastSavedAt,
        versions,
        stepStatus,
        activityLog,
        lastOutputLabel,
        changeSummary,
        hudState,
        setActiveScene,
        setAssetsList,
        replaceSceneEnvironment,
        markProgrammaticSceneChange,
        handleInputReady,
        handleGenerationStart,
        handleGenerationSuccess,
        handleGenerationError,
        openDemoWorld,
        startBlankWorkspace,
        resumeStoredDraft,
        returnToLaunchpad,
        manualSave,
        restoreVersion,
        handleExport,
        appendSceneAsset,
        duplicateSceneAsset,
        removeSceneAsset,
        removeScenePin,
        removeSceneView,
        toggleLeftRail,
        toggleRightRail,
        toggleDirectorHud,
    };
}
