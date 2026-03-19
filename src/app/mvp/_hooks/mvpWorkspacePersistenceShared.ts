"use client";

import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";

import type { WorkspaceEntryMode } from "./mvpWorkspaceSessionShared";

export type SaveRequestSource = "manual" | "autosave";

export function buildPersistenceFingerprint(activeScene: string | null, sceneDocument: SceneDocumentV2) {
    return JSON.stringify({
        activeScene,
        sceneDocument,
    });
}

export function chooseNextSceneSaveId({
    activeScene,
    pendingSceneId,
    generatedSceneId,
}: {
    activeScene: string | null;
    pendingSceneId: string | null;
    generatedSceneId: string;
}) {
    return activeScene ?? pendingSceneId ?? generatedSceneId;
}

export function mergeQueuedSaveSource(current: SaveRequestSource | null, next: SaveRequestSource) {
    if (current === "manual" || next === "manual") {
        return "manual";
    }

    return next;
}

export function resolveStoredDraftSource({
    namespacedDraft,
    legacyDraft,
}: {
    namespacedDraft: string | null;
    legacyDraft: string | null;
}) {
    return {
        rawDraft: namespacedDraft ?? legacyDraft,
        usedLegacyDraft: !namespacedDraft && Boolean(legacyDraft),
    };
}

export function shouldScheduleAutosave({
    hasHydrated,
    entryMode,
    hasContent,
    autosaveUnlocked,
    persistenceFingerprint,
    lastSavedFingerprint,
}: {
    hasHydrated: boolean;
    entryMode: WorkspaceEntryMode;
    hasContent: boolean;
    autosaveUnlocked: boolean;
    persistenceFingerprint: string;
    lastSavedFingerprint: string;
}) {
    return hasHydrated && entryMode === "workspace" && hasContent && autosaveUnlocked && persistenceFingerprint !== lastSavedFingerprint;
}
