"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeftPanel from "@/components/Editor/LeftPanel";
import ViewerPanel from "@/components/Editor/ViewerPanel";
import RightPanel from "@/components/Editor/RightPanel";
import { MVP_API_BASE_URL } from "@/lib/mvp-api";
const LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";
const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "recovered" | "error";

interface SceneVersion {
    version_id: string;
    saved_at: string;
    source?: string;
    summary?: {
        asset_count?: number;
        has_environment?: boolean;
    };
}

const createSceneId = () => `scene_${Date.now().toString(36)}`;

const hasSceneContent = (sceneGraph: any) => {
    const assetCount = Array.isArray(sceneGraph?.assets) ? sceneGraph.assets.length : 0;
    return Boolean(sceneGraph?.environment) || assetCount > 0;
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

export default function MVPPage() {
    const [activeScene, setActiveScene] = useState<string | null>(null);
    const [sceneGraph, setSceneGraph] = useState<any>({ environment: null, assets: [] });
    const [assetsList, setAssetsList] = useState<any[]>([]);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveMessage, setSaveMessage] = useState("Scene is empty.");
    const [saveError, setSaveError] = useState("");
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [versions, setVersions] = useState<SceneVersion[]>([]);

    const hasHydratedRef = useRef(false);
    const lastSavedFingerprintRef = useRef("");

    const sceneFingerprint = useMemo(
        () => JSON.stringify({ activeScene, sceneGraph, assetsList }),
        [activeScene, sceneGraph, assetsList],
    );

    const loadVersions = useCallback(async (sceneId: string) => {
        try {
            const response = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions`, {
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`Version history unavailable (${response.status})`);
            }
            const payload = await response.json();
            setVersions(Array.isArray(payload.versions) ? payload.versions : []);
        } catch {
            setVersions([]);
        }
    }, []);

    const saveScene = useCallback(
        async (source: "manual" | "autosave" = "manual") => {
            const nextSceneId = activeScene ?? createSceneId();
            const normalizedSceneGraph = {
                environment: sceneGraph?.environment ?? null,
                assets: Array.isArray(sceneGraph?.assets) ? sceneGraph.assets : [],
            };

            if (!hasSceneContent(normalizedSceneGraph)) {
                setSaveState("idle");
                setSaveError("");
                setSaveMessage("Scene is empty.");
                return null;
            }

            setSaveState("saving");
            setSaveError("");
            setSaveMessage(source === "autosave" ? "Autosaving scene..." : "Saving scene...");

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scene_id: nextSceneId,
                        scene_graph: normalizedSceneGraph,
                        source,
                    }),
                });

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
                return payload;
            } catch (error) {
                const message = error instanceof Error ? error.message : "Scene save failed";
                setSaveState("error");
                setSaveError(message);
                setSaveMessage("Autosave failed.");
                return null;
            }
        },
        [activeScene, assetsList, loadVersions, sceneGraph],
    );

    const restoreVersion = useCallback(
        async (versionId: string) => {
            if (!activeScene) return;

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
                const restoredGraph = payload.scene_graph ?? { environment: null, assets: [] };
                setSceneGraph({
                    environment: restoredGraph.environment ?? null,
                    assets: Array.isArray(restoredGraph.assets) ? restoredGraph.assets : [],
                });
                setSaveState("recovered");
                setSaveMessage(`Restored version from ${formatTimestamp(payload.saved_at) || "history"}`);
                setLastSavedAt(payload.saved_at ?? null);
                lastSavedFingerprintRef.current = "";
            } catch (error) {
                const message = error instanceof Error ? error.message : "Version restore failed";
                setSaveState("error");
                setSaveError(message);
                setSaveMessage("Version restore failed.");
            }
        },
        [activeScene],
    );

    useEffect(() => {
        hasHydratedRef.current = true;
        try {
            const rawDraft = window.localStorage.getItem(LOCAL_DRAFT_KEY);
            if (!rawDraft) return;
            const draft = JSON.parse(rawDraft);
            if (!draft || !draft.sceneGraph) return;

            const restoredGraph = {
                environment: draft.sceneGraph.environment ?? null,
                assets: Array.isArray(draft.sceneGraph.assets) ? draft.sceneGraph.assets : [],
            };
            const restoredAssetsList = Array.isArray(draft.assetsList) ? draft.assetsList : [];
            const restoredSceneId = typeof draft.activeScene === "string" ? draft.activeScene : null;

            if (!hasSceneContent(restoredGraph) && restoredAssetsList.length === 0) return;

            setActiveScene(restoredSceneId);
            setSceneGraph(restoredGraph);
            setAssetsList(restoredAssetsList);
            setSaveState("recovered");
            setSaveMessage(
                draft.updatedAt
                    ? `Recovered local draft from ${formatTimestamp(draft.updatedAt)}`
                    : "Recovered local draft.",
            );
            if (restoredSceneId) {
                void loadVersions(restoredSceneId);
            }
        } catch {
            window.localStorage.removeItem(LOCAL_DRAFT_KEY);
        }
    }, [loadVersions]);

    useEffect(() => {
        if (!activeScene) {
            setVersions([]);
            return;
        }
        void loadVersions(activeScene);
    }, [activeScene, loadVersions]);

    useEffect(() => {
        if (!hasHydratedRef.current) return;
        window.localStorage.setItem(
            LOCAL_DRAFT_KEY,
            JSON.stringify({
                activeScene,
                sceneGraph,
                assetsList,
                updatedAt: new Date().toISOString(),
            }),
        );
    }, [activeScene, assetsList, sceneGraph]);

    useEffect(() => {
        if (!hasHydratedRef.current) return;
        if (!hasSceneContent(sceneGraph)) return;
        if (sceneFingerprint === lastSavedFingerprintRef.current) return;

        const timer = window.setTimeout(() => {
            void saveScene("autosave");
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [saveScene, sceneFingerprint, sceneGraph]);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-neutral-900 text-white font-sans">
            <div className="w-80 h-full border-r border-neutral-800 bg-neutral-950 flex flex-col z-10 shadow-2xl">
                <LeftPanel
                    setActiveScene={setActiveScene}
                    setSceneGraph={setSceneGraph}
                    setAssetsList={setAssetsList}
                />
            </div>

            <div className="flex-1 h-full relative z-0">
                <ViewerPanel sceneGraph={sceneGraph} setSceneGraph={setSceneGraph} />
            </div>

            <div className="w-80 h-full border-l border-neutral-800 bg-neutral-950 flex flex-col z-10 shadow-2xl">
                <RightPanel
                    sceneGraph={sceneGraph}
                    setSceneGraph={setSceneGraph}
                    assetsList={assetsList}
                    activeScene={activeScene}
                    saveState={saveState}
                    saveMessage={saveMessage}
                    saveError={saveError}
                    lastSavedAt={lastSavedAt}
                    versions={versions}
                    onManualSave={() => saveScene("manual")}
                    onRestoreVersion={restoreVersion}
                />
            </div>
        </div>
    );
}
