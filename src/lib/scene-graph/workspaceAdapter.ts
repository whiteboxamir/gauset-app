import type { WorkspaceSceneGraph } from "../mvp-workspace";
import { normalizeWorkspaceSceneGraph } from "../mvp-workspace";
import { sceneDocumentToWorkspaceSceneGraph } from "./document";
import { migrateSceneGraphToSceneDocument } from "./migrate";
import type { SceneDocumentV2 } from "./types";

export const SCENE_DOCUMENT_V2_FIELD = "__scene_document_v2";

export type PersistedWorkspaceSceneGraphV2 = WorkspaceSceneGraph & {
    [SCENE_DOCUMENT_V2_FIELD]?: SceneDocumentV2;
    [key: string]: unknown;
};

export function extractSceneDocumentV2(sceneGraph: unknown): SceneDocumentV2 | null {
    if (!sceneGraph || typeof sceneGraph !== "object") {
        return null;
    }

    const raw = sceneGraph as Record<string, unknown>;
    const embedded = raw[SCENE_DOCUMENT_V2_FIELD];
    if (embedded && typeof embedded === "object" && (embedded as { version?: unknown }).version === 2) {
        return structuredClone(embedded as SceneDocumentV2);
    }

    if ((raw as { version?: unknown }).version === 2) {
        return structuredClone(raw as unknown as SceneDocumentV2);
    }

    return null;
}

export function serializeSceneDocumentToPersistedSceneGraph(document: SceneDocumentV2): PersistedWorkspaceSceneGraphV2 {
    return {
        ...sceneDocumentToWorkspaceSceneGraph(document),
        [SCENE_DOCUMENT_V2_FIELD]: structuredClone(document),
    };
}

export const serializeSceneDocumentToNormalizedPersistedSceneGraph = serializeSceneDocumentToPersistedSceneGraph;

export function normalizePersistedSceneGraph(sceneGraph: unknown): PersistedWorkspaceSceneGraphV2 {
    const embeddedDocument = extractSceneDocumentV2(sceneGraph);
    if (embeddedDocument) {
        return serializeSceneDocumentToPersistedSceneGraph(embeddedDocument);
    }

    const normalized = normalizeWorkspaceSceneGraph(sceneGraph);
    const document = migrateSceneGraphToSceneDocument(normalized);
    return serializeSceneDocumentToPersistedSceneGraph(document);
}
