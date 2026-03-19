"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";
import { createEmptySceneDocumentV2, replaceEnvironmentOnSceneDocument, sceneDocumentToWorkspaceEnvironment } from "@/lib/scene-graph/document.ts";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore.ts";

import { createDemoWorldPreset } from "../_lib/clarity";
import { defaultEnvironmentUrls, fetchEnvironmentMetadata } from "./mvpWorkspaceIntakeShared";
import {
    buildPersistenceFingerprint,
    chooseNextSceneSaveId,
    mergeQueuedSaveSource,
    resolveStoredDraftSource,
    shouldScheduleAutosave,
} from "./mvpWorkspacePersistenceShared";
import {
    AUTOSAVE_DEBOUNCE_MS,
    LEGACY_LOCAL_DRAFT_KEY,
    buildLocalDraftSessionKey,
    buildLocalDraftStorageKey,
    createDraftSessionId,
    createSceneId,
    formatTimestamp,
    hasSceneContent,
    normalizeAssetEntries,
    normalizeStoredSceneSnapshot,
    serializeSceneDocumentToCompatibilityGraph,
    type SaveState,
    type SceneVersion,
    type StoredDraft,
    type WorkspaceEntryMode,
    type WorkspaceOrigin,
    type WorkspaceRouteVariant,
} from "./mvpWorkspaceSessionShared";

interface UseMvpWorkspacePersistenceControllerOptions {
    clarityMode?: boolean;
    routeVariant: WorkspaceRouteVariant;
    launchSceneId?: string | null;
    startInWorkspace?: boolean;
    demoPreset: ReturnType<typeof createDemoWorldPreset>;
    sceneDocument: SceneDocumentV2;
    setSceneDocument: (sceneDocument: SceneDocumentV2) => void;
    getSceneDocumentSnapshot: () => SceneDocumentV2;
    editorSessionActions: Pick<MvpEditorSessionStoreActions, "resetSession">;
    markProgrammaticSceneChange: () => void;
}

interface PersistedSceneVersionPayload {
    saved_at?: string | null;
    scene_document?: SceneDocumentV2;
    scene_graph?: unknown;
}

interface AuthSessionResponsePayload {
    session?: {
        user?: {
            userId?: string | null;
        } | null;
        activeStudioId?: string | null;
    } | null;
}

function normalizePersistedVersionSnapshot(payload: PersistedSceneVersionPayload) {
    return normalizeStoredSceneSnapshot({
        sceneDocument: payload.scene_document,
        sceneGraph: payload.scene_graph,
    });
}

function createStoredDraftRecord({
    activeScene,
    sceneDocument,
    assetsList,
    updatedAt,
}: {
    activeScene: string | null;
    sceneDocument: SceneDocumentV2;
    assetsList: unknown[];
    updatedAt?: string | null;
}): StoredDraft {
    return {
        activeScene,
        sceneDocument,
        sceneGraph: serializeSceneDocumentToCompatibilityGraph(sceneDocument),
        assetsList,
        updatedAt,
    };
}

function resolveEnvironmentSourceLabel(sceneDocument: SceneDocumentV2) {
    const environment = sceneDocumentToWorkspaceEnvironment(sceneDocument);
    return typeof (environment as Record<string, any> | null | undefined)?.sourceLabel === "string"
        ? ((environment as Record<string, any>).sourceLabel as string)
        : null;
}

function resolveDraftStorageKey(routeVariant: WorkspaceRouteVariant) {
    const sessionStorageKey = buildLocalDraftSessionKey(routeVariant);
    return fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
    })
        .then(async (response) => {
            if (!response.ok) {
                return null;
            }
            return (await response.json()) as AuthSessionResponsePayload;
        })
        .catch(() => null)
        .then((payload) => {
            const userId = payload?.session?.user?.userId ?? null;
            const studioId = payload?.session?.activeStudioId ?? null;
            if (userId) {
                return buildLocalDraftStorageKey({
                    routeVariant,
                    userId,
                    studioId,
                });
            }

            const existingSessionId = window.sessionStorage.getItem(sessionStorageKey);
            const sessionId = existingSessionId ?? createDraftSessionId();
            if (!existingSessionId) {
                window.sessionStorage.setItem(sessionStorageKey, sessionId);
            }

            return buildLocalDraftStorageKey({
                routeVariant,
                sessionId,
            });
        });
}

export function useMvpWorkspacePersistenceController({
    clarityMode = false,
    routeVariant,
    launchSceneId = null,
    startInWorkspace = false,
    demoPreset,
    sceneDocument,
    setSceneDocument,
    getSceneDocumentSnapshot,
    editorSessionActions,
    markProgrammaticSceneChange,
}: UseMvpWorkspacePersistenceControllerOptions) {
    const [entryMode, setEntryMode] = useState<WorkspaceEntryMode>(clarityMode && !startInWorkspace ? "launchpad" : "workspace");
    const [activeScene, setActiveScene] = useState<string | null>(null);
    const [assetsList, setAssetsList] = useState<any[]>([]);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveMessage, setSaveMessage] = useState(
        clarityMode ? "Open the demo world or choose one source to begin the world record." : "Scene is empty.",
    );
    const [saveError, setSaveError] = useState("");
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [autosaveUnlocked, setAutosaveUnlocked] = useState(false);
    const [versions, setVersions] = useState<SceneVersion[]>([]);
    const [storedDraft, setStoredDraft] = useState<StoredDraft | null>(null);
    const [workspaceOrigin, setWorkspaceOrigin] = useState<WorkspaceOrigin>("blank");
    const [workspaceOriginDetail, setWorkspaceOriginDetail] = useState(
        clarityMode ? "Choose a world entry path to start this workspace." : "Workspace is ready for a first world.",
    );
    const [currentInputLabel, setCurrentInputLabel] = useState<string | null>(null);
    const [lastOutputInputLabel, setLastOutputInputLabel] = useState<string | null>(null);
    const [lastOutputSceneDocument, setLastOutputSceneDocument] = useState<SceneDocumentV2 | null>(null);
    const [lastOutputLabel, setLastOutputLabel] = useState("No world output yet");
    const [draftStorageKey, setDraftStorageKey] = useState<string | null>(null);

    const hasHydratedRef = useRef(false);
    const lastStartInWorkspaceRef = useRef(startInWorkspace);
    const lastSavedFingerprintRef = useRef("");
    const versionsRequestRef = useRef(0);
    const saveInFlightRef = useRef<Promise<any> | null>(null);
    const saveQueuedSourceRef = useRef<"manual" | "autosave" | null>(null);
    const saveRequestRef = useRef<((source?: "manual" | "autosave") => Promise<any>) | null>(null);
    const autosaveTimerRef = useRef<number | null>(null);
    const activeSceneRef = useRef<string | null>(null);
    const pendingSceneIdRef = useRef<string | null>(null);

    const persistenceFingerprint = useMemo(
        () => buildPersistenceFingerprint(activeScene, sceneDocument),
        [activeScene, sceneDocument],
    );

    const clearAutosaveTimer = useCallback(() => {
        if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearAutosaveTimer, [clearAutosaveTimer]);

    useEffect(() => {
        const previousStartInWorkspace = lastStartInWorkspaceRef.current;
        if (clarityMode && startInWorkspace !== previousStartInWorkspace) {
            setEntryMode(startInWorkspace ? "workspace" : "launchpad");
        }
        lastStartInWorkspaceRef.current = startInWorkspace;
    }, [clarityMode, startInWorkspace]);

    useEffect(() => {
        activeSceneRef.current = activeScene;
        if (activeScene) {
            pendingSceneIdRef.current = activeScene;
            return;
        }
        if (!saveInFlightRef.current) {
            pendingSceneIdRef.current = null;
        }
    }, [activeScene]);

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
            const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
            if (versionsRequestRef.current === requestId) {
                setVersions(nextVersions);
                if (sceneId === activeSceneRef.current && nextVersions.length > 0) {
                    setAutosaveUnlocked(true);
                }
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
                sceneGraph?: unknown;
                sceneDocument?: SceneDocumentV2;
                assetsList: any[];
                saveState: SaveState;
                saveMessage: string;
                currentInputLabel?: string | null;
                lastSavedAt?: string | null;
                lastOutputLabel?: string;
            },
            options?: {
                keepAsLastOutput?: boolean;
                origin?: WorkspaceOrigin;
                originDetail?: string;
            },
        ) => {
            const normalizedSceneSnapshot = normalizeStoredSceneSnapshot({
                sceneDocument: snapshot.sceneDocument,
                sceneGraph: snapshot.sceneGraph,
            });
            const normalizedAssetsList = normalizeAssetEntries(Array.isArray(snapshot.assetsList) ? snapshot.assetsList : []);
            clearAutosaveTimer();
            markProgrammaticSceneChange();
            activeSceneRef.current = snapshot.activeScene;
            setActiveScene(snapshot.activeScene);
            pendingSceneIdRef.current = snapshot.activeScene;
            setSceneDocument(normalizedSceneSnapshot.sceneDocument);
            setAssetsList(normalizedAssetsList);
            setVersions([]);
            setSaveState(snapshot.saveState);
            setSaveError("");
            setSaveMessage(snapshot.saveMessage);
            setLastSavedAt(snapshot.lastSavedAt ?? null);
            setAutosaveUnlocked(Boolean(snapshot.activeScene && snapshot.lastSavedAt));
            setCurrentInputLabel(snapshot.currentInputLabel ?? null);
            setLastOutputLabel(snapshot.lastOutputLabel ?? "Current workspace");
            setWorkspaceOrigin(options?.origin ?? "blank");
            setWorkspaceOriginDetail(options?.originDetail ?? snapshot.saveMessage);
            setEntryMode("workspace");
            editorSessionActions.resetSession();

            if (options?.keepAsLastOutput) {
                setLastOutputSceneDocument(normalizedSceneSnapshot.sceneDocument);
                setLastOutputInputLabel(snapshot.currentInputLabel ?? null);
                lastSavedFingerprintRef.current = buildPersistenceFingerprint(snapshot.activeScene, normalizedSceneSnapshot.sceneDocument);
            } else {
                setLastOutputSceneDocument(null);
                setLastOutputInputLabel(null);
                lastSavedFingerprintRef.current = "";
            }
        },
        [clearAutosaveTimer, editorSessionActions, markProgrammaticSceneChange, setSceneDocument],
    );

    const openDemoWorld = useCallback(() => {
        applyWorkspaceSnapshot(
            {
                activeScene: null,
                sceneDocument: demoPreset.sceneDocument,
                assetsList: demoPreset.assetsList,
                saveState: "recovered",
                saveMessage: "Demo world loaded. Save a version when you are ready to anchor the world record.",
                currentInputLabel: demoPreset.inputLabel,
                lastOutputLabel: "Demo world",
            },
            {
                keepAsLastOutput: true,
                origin: "demo",
                originDetail: "Loaded the demo world so persistent state is visible before you import anything.",
            },
        );
    }, [applyWorkspaceSnapshot, demoPreset]);

    const startBlankWorkspace = useCallback(() => {
        applyWorkspaceSnapshot(
            {
                activeScene: null,
                sceneDocument: createEmptySceneDocumentV2(),
                assetsList: [],
                saveState: "idle",
                saveMessage: "Upload one still to build your first persistent world record.",
                currentInputLabel: null,
                lastOutputLabel: "No world output yet",
            },
            {
                keepAsLastOutput: false,
                origin: "blank",
                originDetail: "Blank workspace ready. Import one still or reopen a linked world.",
            },
        );
    }, [applyWorkspaceSnapshot]);

    const resumeStoredDraft = useCallback(() => {
        if (!storedDraft) {
            startBlankWorkspace();
            return false;
        }

        const normalizedDraft = normalizeStoredSceneSnapshot(storedDraft);
        applyWorkspaceSnapshot(
            {
                activeScene: storedDraft.activeScene,
                sceneDocument: normalizedDraft.sceneDocument,
                assetsList: storedDraft.assetsList,
                saveState: "recovered",
                saveMessage: storedDraft.updatedAt
                    ? `Recovered local world draft from ${formatTimestamp(storedDraft.updatedAt)}`
                    : "Recovered local world draft.",
                currentInputLabel: resolveEnvironmentSourceLabel(normalizedDraft.sceneDocument),
                lastSavedAt: null,
                lastOutputLabel: "Recovered draft",
            },
            {
                keepAsLastOutput: false,
                origin: "draft",
                originDetail: storedDraft?.updatedAt
                    ? `Recovered the browser-stored draft from ${formatTimestamp(storedDraft.updatedAt)}.`
                    : "Recovered the browser-stored draft for this workspace.",
            },
        );
        return true;
    }, [applyWorkspaceSnapshot, startBlankWorkspace, storedDraft]);

    const saveScene = useCallback(
        async (source: "manual" | "autosave" = "manual") => {
            const existingSceneId = activeSceneRef.current ?? pendingSceneIdRef.current;
            const nextSceneId = chooseNextSceneSaveId({
                activeScene: activeSceneRef.current,
                pendingSceneId: pendingSceneIdRef.current,
                generatedSceneId: createSceneId(),
            });
            const nextSceneDocument = getSceneDocumentSnapshot();
            const compatibilitySceneGraph = serializeSceneDocumentToCompatibilityGraph(nextSceneDocument);

            if (!existingSceneId) {
                pendingSceneIdRef.current = nextSceneId;
            }

            if (!hasSceneContent(nextSceneDocument)) {
                if (!saveInFlightRef.current) {
                    pendingSceneIdRef.current = activeSceneRef.current;
                }
                setSaveState("idle");
                setSaveError("");
                setSaveMessage(
                    clarityMode ? "Open the demo world or build your own world before saving." : "Scene is empty.",
                );
                return null;
            }

            setSaveState("saving");
            setSaveError("");
            setSaveMessage(source === "autosave" ? "Autosaving world record..." : "Saving world record...");

            const request = fetch(`${MVP_API_BASE_URL}/scene/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scene_id: nextSceneId,
                    scene_document: nextSceneDocument,
                    scene_graph: compatibilitySceneGraph,
                    source,
                }),
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Scene save failed (${response.status})`);
                    }

                    const payload = await response.json();
                    const savedAt = payload.saved_at ?? new Date().toISOString();
                    pendingSceneIdRef.current = nextSceneId;
                    activeSceneRef.current = nextSceneId;
                    setActiveScene(nextSceneId);
                    setSaveState("saved");
                    setSaveMessage(
                        source === "autosave"
                            ? `Autosaved ${formatTimestamp(savedAt)}`
                            : `Saved world ${nextSceneId} at ${formatTimestamp(savedAt)}`,
                    );
                    setLastSavedAt(savedAt);
                    if (source === "manual") {
                        setAutosaveUnlocked(true);
                    }
                    lastSavedFingerprintRef.current = buildPersistenceFingerprint(nextSceneId, nextSceneDocument);
                    void loadVersions(nextSceneId);
                    return payload;
                })
                .catch((error) => {
                    const message = error instanceof Error ? error.message : "Scene save failed";
                    setSaveState("error");
                    setSaveError(message);
                    setSaveMessage(source === "autosave" ? "World autosave failed." : "World save failed.");
                    return null;
                })
                .finally(() => {
                    saveInFlightRef.current = null;
                    const queuedSource = saveQueuedSourceRef.current;
                    saveQueuedSourceRef.current = null;
                    if (!queuedSource || !saveRequestRef.current) {
                        return;
                    }

                    const queuedFingerprint = buildPersistenceFingerprint(
                        activeSceneRef.current ?? pendingSceneIdRef.current,
                        getSceneDocumentSnapshot(),
                    );
                    if (queuedFingerprint !== lastSavedFingerprintRef.current) {
                        void saveRequestRef.current(queuedSource);
                    }
                });

            saveInFlightRef.current = request;
            return request;
        },
        [clarityMode, getSceneDocumentSnapshot, loadVersions],
    );

    const requestSave = useCallback(
        async (source: "manual" | "autosave" = "manual") => {
            clearAutosaveTimer();
            if (saveInFlightRef.current) {
                saveQueuedSourceRef.current = mergeQueuedSaveSource(saveQueuedSourceRef.current, source);
                return saveInFlightRef.current;
            }

            return saveScene(source);
        },
        [clearAutosaveTimer, saveScene],
    );

    useEffect(() => {
        saveRequestRef.current = requestSave;
        return () => {
            if (saveRequestRef.current === requestSave) {
                saveRequestRef.current = null;
            }
        };
    }, [requestSave]);

    const manualSave = useCallback(() => requestSave("manual"), [requestSave]);

    const restoreVersion = useCallback(
        async (versionId: string) => {
            if (!activeScene) return false;

            clearAutosaveTimer();
            markProgrammaticSceneChange();
            setSaveState("saving");
            setSaveError("");
            setSaveMessage("Restoring saved world...");

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/versions/${versionId}`, {
                    cache: "no-store",
                });
                if (!response.ok) {
                    throw new Error(`Version restore failed (${response.status})`);
                }

                const payload = (await response.json()) as PersistedSceneVersionPayload;
                const restoredSceneSnapshot = normalizePersistedVersionSnapshot(payload);
                setSceneDocument(restoredSceneSnapshot.sceneDocument);
                setCurrentInputLabel(resolveEnvironmentSourceLabel(restoredSceneSnapshot.sceneDocument));
                setSaveState("recovered");
                setSaveMessage(`Restored version from ${formatTimestamp(payload.saved_at) || "history"}`);
                setLastSavedAt(payload.saved_at ?? null);
                setLastOutputSceneDocument(restoredSceneSnapshot.sceneDocument);
                setLastOutputInputLabel(resolveEnvironmentSourceLabel(restoredSceneSnapshot.sceneDocument));
                setLastOutputLabel("Restored version");
                pendingSceneIdRef.current = activeScene;
                lastSavedFingerprintRef.current = buildPersistenceFingerprint(activeScene, restoredSceneSnapshot.sceneDocument);
                return true;
            } catch (error) {
                const message = error instanceof Error ? error.message : "Version restore failed";
                setSaveState("error");
                setSaveError(message);
                setSaveMessage("Saved world restore failed.");
                return false;
            }
        },
        [activeScene, clearAutosaveTimer, markProgrammaticSceneChange, setSceneDocument],
    );

    const openLinkedScene = useCallback(
        async (sceneId: string) => {
            const normalizedSceneId = sceneId.trim();
            if (!normalizedSceneId) {
                return { status: "error" as const, message: "Missing linked world scene ID." };
            }

            setSaveState("saving");
            setSaveError("");
            setSaveMessage(`Opening saved world ${normalizedSceneId}...`);

            try {
                const versionsResponse = await fetch(`${MVP_API_BASE_URL}/scene/${normalizedSceneId}/versions`, {
                    cache: "no-store",
                });
                if (!versionsResponse.ok) {
                    throw new Error(`Linked world lookup failed (${versionsResponse.status})`);
                }

                const versionsPayload = await versionsResponse.json();
                const availableVersions = Array.isArray(versionsPayload.versions) ? versionsPayload.versions : [];
                const latestVersion = availableVersions[0];

                if (latestVersion?.version_id) {
                    const versionResponse = await fetch(
                        `${MVP_API_BASE_URL}/scene/${normalizedSceneId}/versions/${latestVersion.version_id}`,
                        {
                            cache: "no-store",
                        },
                    );
                    if (!versionResponse.ok) {
                        throw new Error(`Linked world restore failed (${versionResponse.status})`);
                    }

                    const versionPayload = (await versionResponse.json()) as PersistedSceneVersionPayload;
                    const restoredSceneSnapshot = normalizePersistedVersionSnapshot(versionPayload);
                    applyWorkspaceSnapshot(
                        {
                            activeScene: normalizedSceneId,
                            sceneDocument: restoredSceneSnapshot.sceneDocument,
                            assetsList: [],
                            saveState: "recovered",
                            saveMessage: `Opened saved world from ${formatTimestamp(versionPayload.saved_at) || "saved history"}.`,
                            currentInputLabel: resolveEnvironmentSourceLabel(restoredSceneSnapshot.sceneDocument),
                            lastSavedAt: versionPayload.saved_at ?? null,
                            lastOutputLabel: "Saved world",
                        },
                        {
                            keepAsLastOutput: true,
                            origin: "linked_version",
                            originDetail: "Opened from saved project history, so versions and review anchors remain attached to the linked scene.",
                        },
                    );
                    setVersions(availableVersions);
                    return { status: "version" as const };
                }

                const defaultUrls = defaultEnvironmentUrls(normalizedSceneId);
                const proxiedUrls = {
                    viewer: toProxyUrl(defaultUrls.viewer),
                    splats: toProxyUrl(defaultUrls.splats),
                    cameras: toProxyUrl(defaultUrls.cameras),
                    metadata: toProxyUrl(defaultUrls.metadata),
                    preview_projection: toProxyUrl(defaultUrls.preview_projection),
                };
                const metadata = await fetchEnvironmentMetadata(proxiedUrls.metadata);
                const sourceLabel =
                    (typeof metadata?.input_image === "string" && metadata.input_image) ||
                    (typeof metadata?.reference_image === "string" && metadata.reference_image) ||
                    `Linked world ${normalizedSceneId}`;
                const linkedEnvironmentDocument = replaceEnvironmentOnSceneDocument(createEmptySceneDocumentV2(), {
                    id: normalizedSceneId,
                    lane: metadata?.lane ?? "preview",
                    sourceLabel,
                    urls: proxiedUrls,
                    files: null,
                    metadata,
                });
                applyWorkspaceSnapshot(
                        {
                            activeScene: normalizedSceneId,
                            sceneDocument: linkedEnvironmentDocument,
                            assetsList: [],
                            saveState: "recovered",
                            saveMessage: metadata
                                ? `Opened saved world ${normalizedSceneId} from stored environment artifacts.`
                                : `Opened saved world ${normalizedSceneId}, but no saved version history exists yet.`,
                            currentInputLabel: sourceLabel,
                            lastSavedAt: null,
                            lastOutputLabel: "Saved world",
                        },
                    {
                        keepAsLastOutput: true,
                        origin: "linked_environment",
                        originDetail: "Opened from stored world artifacts because saved project versions were not found yet.",
                    },
                );
                setVersions([]);
                return { status: "environment" as const };
            } catch (error) {
                const message = error instanceof Error ? error.message : "Linked world could not be opened.";
                setSaveState("error");
                setSaveError(message);
                setSaveMessage("Saved world could not be opened.");
                return { status: "error" as const, message };
            }
        },
        [applyWorkspaceSnapshot],
    );

    useEffect(() => {
        let cancelled = false;
        hasHydratedRef.current = false;
        setStoredDraft(null);
        setDraftStorageKey(null);

        void resolveDraftStorageKey(routeVariant).then((nextDraftStorageKey) => {
            if (cancelled) {
                return;
            }
            setDraftStorageKey(nextDraftStorageKey);
        });

        return () => {
            cancelled = true;
        };
    }, [routeVariant]);

    useEffect(() => {
        hasHydratedRef.current = false;
        if (!draftStorageKey) {
            return;
        }

        try {
            const namespacedDraft = window.localStorage.getItem(draftStorageKey);
            const { rawDraft, usedLegacyDraft } = resolveStoredDraftSource({
                namespacedDraft,
                legacyDraft: window.localStorage.getItem(LEGACY_LOCAL_DRAFT_KEY),
            });

            if (!rawDraft) {
                hasHydratedRef.current = true;
                return;
            }

            const draft = JSON.parse(rawDraft) as StoredDraft;
            if (!draft || (!draft.sceneGraph && !draft.sceneDocument)) {
                if (usedLegacyDraft) {
                    window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY);
                } else {
                    window.localStorage.removeItem(draftStorageKey);
                }
                hasHydratedRef.current = true;
                return;
            }

            const restoredSceneSnapshot = normalizeStoredSceneSnapshot(draft);
            const restoredAssetsList = Array.isArray(draft.assetsList) ? normalizeAssetEntries(draft.assetsList) : [];
            const restoredSceneId = typeof draft.activeScene === "string" ? draft.activeScene : null;

            if (!hasSceneContent(restoredSceneSnapshot.sceneDocument) && restoredAssetsList.length === 0) {
                if (usedLegacyDraft) {
                    window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY);
                } else {
                    window.localStorage.removeItem(draftStorageKey);
                }
                hasHydratedRef.current = true;
                return;
            }

            const nextDraft = createStoredDraftRecord({
                activeScene: restoredSceneId,
                sceneDocument: restoredSceneSnapshot.sceneDocument,
                assetsList: restoredAssetsList,
                updatedAt: draft.updatedAt,
            });

            window.localStorage.setItem(draftStorageKey, JSON.stringify(nextDraft));
            if (usedLegacyDraft) {
                window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY);
            }
            setStoredDraft(nextDraft);

            if (!clarityMode && !launchSceneId) {
                setActiveScene(restoredSceneId);
                pendingSceneIdRef.current = restoredSceneId;
                setSceneDocument(restoredSceneSnapshot.sceneDocument);
                setAssetsList(restoredAssetsList);
                setCurrentInputLabel(resolveEnvironmentSourceLabel(restoredSceneSnapshot.sceneDocument));
                setSaveState("recovered");
                setWorkspaceOrigin("draft");
                setWorkspaceOriginDetail(
                    draft.updatedAt ? `Recovered the browser-stored draft from ${formatTimestamp(draft.updatedAt)}.` : "Recovered the browser-stored draft.",
                );
                setSaveMessage(
                    draft.updatedAt
                        ? `Recovered local world draft from ${formatTimestamp(draft.updatedAt)}`
                        : "Recovered local world draft.",
                );
                if (restoredSceneId) {
                    void loadVersions(restoredSceneId);
                }
            }
        } catch {
            window.localStorage.removeItem(draftStorageKey);
            window.localStorage.removeItem(LEGACY_LOCAL_DRAFT_KEY);
        } finally {
            hasHydratedRef.current = true;
        }
    }, [clarityMode, draftStorageKey, launchSceneId, loadVersions, setSceneDocument]);

    useEffect(() => {
        if (!activeScene) {
            setVersions([]);
            return;
        }
        void loadVersions(activeScene);
    }, [activeScene, loadVersions]);

    useEffect(() => {
        if (!hasHydratedRef.current || entryMode !== "workspace" || !draftStorageKey) return;
        const normalizedAssetsList = normalizeAssetEntries(assetsList);

        if (!hasSceneContent(sceneDocument) && normalizedAssetsList.length === 0) {
            window.localStorage.removeItem(draftStorageKey);
            setStoredDraft(null);
            return;
        }

        const nextDraft = createStoredDraftRecord({
            activeScene,
            sceneDocument,
            assetsList: normalizedAssetsList,
            updatedAt: new Date().toISOString(),
        });

        window.localStorage.setItem(draftStorageKey, JSON.stringify(nextDraft));
        setStoredDraft(nextDraft);
    }, [activeScene, assetsList, draftStorageKey, entryMode, sceneDocument]);

    useEffect(() => {
        if (
            !shouldScheduleAutosave({
                hasHydrated: hasHydratedRef.current,
                entryMode,
                hasContent: hasSceneContent(sceneDocument),
                autosaveUnlocked,
                persistenceFingerprint,
                lastSavedFingerprint: lastSavedFingerprintRef.current,
            })
        ) {
            return;
        }
        clearAutosaveTimer();

        autosaveTimerRef.current = window.setTimeout(() => {
            const latestSceneDocument = getSceneDocumentSnapshot();
            if (!hasSceneContent(latestSceneDocument)) {
                return;
            }

            const latestFingerprint = buildPersistenceFingerprint(
                activeSceneRef.current ?? pendingSceneIdRef.current,
                latestSceneDocument,
            );
            if (latestFingerprint === lastSavedFingerprintRef.current) {
                return;
            }

            void requestSave("autosave");
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => {
            clearAutosaveTimer();
        };
    }, [autosaveUnlocked, clearAutosaveTimer, entryMode, getSceneDocumentSnapshot, persistenceFingerprint, requestSave, sceneDocument]);

    const returnToLaunchpad = useCallback(() => {
        setEntryMode("launchpad");
    }, []);

    return {
        showLaunchpad: clarityMode && entryMode === "launchpad",
        hasDraft: Boolean(storedDraft),
        draftUpdatedAt: storedDraft?.updatedAt ?? null,
        draftSceneId: storedDraft?.activeScene ?? null,
        entryMode,
        activeScene,
        assetsList,
        saveState,
        saveMessage,
        saveError,
        lastSavedAt,
        versions,
        workspaceOrigin,
        workspaceOriginDetail,
        currentInputLabel,
        setCurrentInputLabel,
        lastOutputInputLabel,
        setLastOutputInputLabel,
        lastOutputSceneDocument,
        setLastOutputSceneDocument,
        lastOutputLabel,
        setLastOutputLabel,
        setActiveScene,
        setAssetsList,
        openDemoWorld,
        startBlankWorkspace,
        openLinkedScene,
        resumeStoredDraft,
        returnToLaunchpad,
        manualSave,
        restoreVersion,
    };
}
