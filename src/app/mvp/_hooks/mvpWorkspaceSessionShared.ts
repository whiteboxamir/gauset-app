"use client";

import { resolveEnvironmentRenderState } from "@/lib/mvp-product";
import { sceneDocumentToWorkspaceAssets, sceneDocumentToWorkspaceEnvironment } from "@/lib/scene-graph/document.ts";
import type { PersistedSceneGraphV1, WorkspaceSceneGraph } from "@/lib/mvp-workspace";
import { migrateSceneGraphToSceneDocument } from "@/lib/scene-graph/migrate.ts";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import {
    normalizePersistedSceneGraph,
    normalizeWorkspaceSceneGraphResources,
    serializeSceneDocumentToNormalizedPersistedSceneGraph,
} from "@/lib/scene-graph/workspaceAdapter.ts";

export { normalizeAssetEntries } from "@/lib/scene-graph/workspaceAdapter.ts";

export const LEGACY_LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";
export const LOCAL_DRAFT_KEY_PREFIX = "gauset:mvp:draft:v2";
export const LOCAL_DRAFT_SESSION_KEY_PREFIX = "gauset:mvp:draft-session:v1";
export const MVP_WORKSPACE_SHELL_LOCK_VERSION = "2026-03-11";
export const HUD_LAYOUT_STORAGE_KEY_PREFIX = `gauset:mvp:hud:${MVP_WORKSPACE_SHELL_LOCK_VERSION}`;
export const AUTOSAVE_DEBOUNCE_MS = 1500;
export const PROGRAMMATIC_CHANGE_RESET_MS = 80;

export type SaveState = "idle" | "saving" | "saved" | "recovered" | "error";
export type WorkspaceEntryMode = "launchpad" | "workspace";
export type WorkspaceRouteVariant = "workspace" | "preview";
export type WorkspaceOrigin = "blank" | "demo" | "draft" | "linked_version" | "linked_environment";
export type WorkspaceLaunchSourceKind =
    | "upload"
    | "provider_generated_still"
    | "capture_session"
    | "demo_world"
    | "linked_scene_version"
    | "external_world_package"
    | "third_party_world_model_output";
export type CompatibilityPersistedSceneGraph = PersistedSceneGraphV1 & { __scene_document_v2?: SceneDocumentV2 };

export interface WorkspaceHudState {
    leftRailCollapsed: boolean;
    rightRailCollapsed: boolean;
    directorHudCompact: boolean;
    advancedMode: boolean;
}

export interface SceneVersion {
    version_id: string;
    saved_at: string;
    source?: string;
    comment_count?: number;
    summary?: {
        asset_count?: number;
        has_environment?: boolean;
    };
}

export interface StoredDraft {
    activeScene: string | null;
    sceneDocument?: SceneDocumentV2;
    // Legacy-only envelope for draft migration. New drafts stay document-first.
    sceneGraph?: CompatibilityPersistedSceneGraph;
    assetsList: unknown[];
    updatedAt?: string | null;
}

export interface StepStatus {
    busy: boolean;
    label: string;
    detail?: string;
}

export interface GenerationTelemetry {
    kind: "preview" | "reconstruction" | "asset" | "generated_image";
    label: string;
    detail?: string;
    inputLabel?: string;
    sceneId?: string;
    assetId?: string;
}

function createStorageSafeId(prefix: string) {
    const entropy =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID().replace(/-/g, "")
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}${entropy}`;
}

function normalizeDraftKeyPart(value: string | null | undefined, fallback: string) {
    const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
    return normalized && normalized.length > 0 ? normalized : fallback;
}

export interface DraftStorageNamespace {
    routeVariant: WorkspaceRouteVariant;
    userId?: string | null;
    studioId?: string | null;
    sessionId?: string | null;
}

export const createSceneId = () => createStorageSafeId("scene_");
export const createDraftSessionId = () => createStorageSafeId("session_");

export const buildLocalDraftStorageKey = ({
    routeVariant,
    userId,
    studioId,
    sessionId,
}: DraftStorageNamespace) => {
    const studioScope = `studio_${normalizeDraftKeyPart(studioId, "none")}`;
    const userScope = userId
        ? `user_${normalizeDraftKeyPart(userId, "anonymous")}`
        : `session_${normalizeDraftKeyPart(sessionId, "anonymous")}`;
    return `${LOCAL_DRAFT_KEY_PREFIX}:${routeVariant}:${studioScope}:${userScope}`;
};

export const buildLocalDraftSessionKey = (routeVariant: WorkspaceRouteVariant) =>
    `${LOCAL_DRAFT_SESSION_KEY_PREFIX}:${routeVariant}`;

function normalizeCompatibilityWorkspaceGraphResources<T extends WorkspaceSceneGraph>(sceneGraph: T): T {
    return normalizeWorkspaceSceneGraphResources(sceneGraph);
}

export const normalizeCompatibilitySceneGraph = (sceneGraph: unknown): CompatibilityPersistedSceneGraph => {
    const normalized = normalizePersistedSceneGraph(sceneGraph);
    return normalizeCompatibilityWorkspaceGraphResources(normalized);
};

export const serializeSceneDocumentToCompatibilityGraph = (sceneDocument: SceneDocumentV2): CompatibilityPersistedSceneGraph =>
    serializeSceneDocumentToNormalizedPersistedSceneGraph(sceneDocument);

export const normalizeSceneDocument = (sceneDocumentOrGraph: unknown): SceneDocumentV2 => {
    if (sceneDocumentOrGraph && typeof sceneDocumentOrGraph === "object" && (sceneDocumentOrGraph as { version?: unknown }).version === 2) {
        return migrateSceneGraphToSceneDocument(serializeSceneDocumentToCompatibilityGraph(sceneDocumentOrGraph as SceneDocumentV2));
    }

    return migrateSceneGraphToSceneDocument(normalizeCompatibilitySceneGraph(sceneDocumentOrGraph));
};

export function normalizeStoredSceneSnapshot(snapshot: {
    sceneDocument?: SceneDocumentV2;
    sceneGraph?: unknown;
}) {
    const sceneDocument = normalizeSceneDocument(snapshot.sceneDocument ?? snapshot.sceneGraph);
    return {
        sceneDocument,
        sceneGraph: serializeSceneDocumentToCompatibilityGraph(sceneDocument),
    };
}

function hasSceneDocumentContent(sceneDocument: SceneDocumentV2) {
    const environment = sceneDocumentToWorkspaceEnvironment(sceneDocument);
    const assets = sceneDocumentToWorkspaceAssets(sceneDocument);
    return (
        assets.length > 0 ||
        (environment
            ? resolveEnvironmentRenderState(environment).hasRenderableOutput ||
              Boolean(resolveEnvironmentRenderState(environment).referenceImage)
            : false)
    );
}

export const hasSceneContent = (sceneDocumentOrGraph: unknown) => {
    if (
        sceneDocumentOrGraph &&
        typeof sceneDocumentOrGraph === "object" &&
        (sceneDocumentOrGraph as { version?: unknown }).version === 2
    ) {
        return hasSceneDocumentContent(sceneDocumentOrGraph as SceneDocumentV2);
    }

    return hasSceneDocumentContent(normalizeSceneDocument(sceneDocumentOrGraph));
};

export const formatTimestamp = (value?: string | null) => {
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

export const createDefaultHudState = (routeVariant: WorkspaceRouteVariant): WorkspaceHudState =>
    routeVariant === "preview"
        ? {
              leftRailCollapsed: false,
              rightRailCollapsed: true,
              directorHudCompact: true,
              advancedMode: false,
          }
        : {
              leftRailCollapsed: false,
              rightRailCollapsed: false,
              directorHudCompact: false,
              advancedMode: false,
          };

export const normalizeHudState = (routeVariant: WorkspaceRouteVariant, value: unknown): WorkspaceHudState => {
    const fallback = createDefaultHudState(routeVariant);
    if (!value || typeof value !== "object") {
        return fallback;
    }

    const input = value as Partial<WorkspaceHudState>;
    return {
        leftRailCollapsed: typeof input.leftRailCollapsed === "boolean" ? input.leftRailCollapsed : fallback.leftRailCollapsed,
        rightRailCollapsed: typeof input.rightRailCollapsed === "boolean" ? input.rightRailCollapsed : fallback.rightRailCollapsed,
        directorHudCompact: typeof input.directorHudCompact === "boolean" ? input.directorHudCompact : fallback.directorHudCompact,
        advancedMode: typeof input.advancedMode === "boolean" ? input.advancedMode : fallback.advancedMode,
    };
};

export const hudStorageKey = (routeVariant: WorkspaceRouteVariant) => `${HUD_LAYOUT_STORAGE_KEY_PREFIX}:${routeVariant}`;
