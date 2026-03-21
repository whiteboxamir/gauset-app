import { toProxyUrl } from "../mvp-api.ts";
import { resolveEnvironmentRenderState } from "../mvp-product.ts";
import type { PersistedSceneGraphV1 } from "../mvp-workspace.ts";
import { normalizeWorkspaceSceneGraph, type WorkspaceSceneGraph } from "../mvp-workspace.ts";
import { sceneDocumentToWorkspaceSceneGraph } from "./document.ts";
import { migrateSceneGraphToSceneDocument } from "./migrate.ts";
import type { SceneDocumentV2 } from "./types.ts";

export const SCENE_DOCUMENT_V2_FIELD = "__scene_document_v2";

export type PersistedWorkspaceSceneGraphV2 = PersistedSceneGraphV1 & {
    [SCENE_DOCUMENT_V2_FIELD]?: SceneDocumentV2;
};

const hasTextContent = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const shouldKeepEnvironment = (environment: unknown) => {
    if (!environment || typeof environment !== "object") {
        return false;
    }

    const renderState = resolveEnvironmentRenderState(environment);
    return (
        renderState.hasRenderableOutput ||
        Boolean(renderState.referenceImage) ||
        hasTextContent((environment as Record<string, unknown>).sourceLabel) ||
        hasTextContent((environment as Record<string, unknown>).statusLabel) ||
        hasTextContent((environment as Record<string, unknown>).label) ||
        hasTextContent((environment as Record<string, unknown>).lane) ||
        hasTextContent((environment as Record<string, unknown>).preview_projection) ||
        hasTextContent(((environment as { metadata?: Record<string, unknown> }).metadata ?? {}).truth_label) ||
        hasTextContent(((environment as { metadata?: Record<string, unknown> }).metadata ?? {}).reconstruction_status)
    );
};

const normalizeEnvironmentResourceUrls = (environment: unknown) => {
    if (!environment || typeof environment !== "object") {
        return environment ?? null;
    }

    const environmentRecord = environment as Record<string, unknown>;
    const urls = environmentRecord.urls && typeof environmentRecord.urls === "object" ? (environmentRecord.urls as Record<string, unknown>) : null;
    const normalized = {
        ...environmentRecord,
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

export const normalizeAssetEntries = (assets: unknown[]) =>
    assets.map((asset) =>
        asset && typeof asset === "object"
            ? {
                  ...asset,
                  mesh:
                      typeof (asset as Record<string, unknown>).mesh === "string"
                          ? toProxyUrl((asset as Record<string, string>).mesh)
                          : (asset as Record<string, unknown>).mesh,
                  texture:
                      typeof (asset as Record<string, unknown>).texture === "string"
                          ? toProxyUrl((asset as Record<string, string>).texture)
                          : (asset as Record<string, unknown>).texture,
                  preview:
                      typeof (asset as Record<string, unknown>).preview === "string"
                          ? toProxyUrl((asset as Record<string, string>).preview)
                          : (asset as Record<string, unknown>).preview,
              }
            : asset,
    );

export function normalizeWorkspaceSceneGraphResources<T extends WorkspaceSceneGraph>(sceneGraph: T): T {
    const workspace = normalizeWorkspaceSceneGraph(sceneGraph);
    return {
        ...sceneGraph,
        ...workspace,
        environment: normalizeEnvironmentResourceUrls(workspace.environment),
        assets: normalizeAssetEntries(workspace.assets),
    } as T;
}

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

export function serializeSceneDocumentToNormalizedPersistedSceneGraph(document: SceneDocumentV2): PersistedWorkspaceSceneGraphV2 {
    return normalizeWorkspaceSceneGraphResources(serializeSceneDocumentToPersistedSceneGraph(document));
}

export function normalizePersistedSceneGraph(sceneGraph: unknown): PersistedWorkspaceSceneGraphV2 {
    const embeddedDocument = extractSceneDocumentV2(sceneGraph);
    if (embeddedDocument) {
        return serializeSceneDocumentToPersistedSceneGraph(embeddedDocument);
    }

    const normalized = normalizeWorkspaceSceneGraph(sceneGraph);
    const document = migrateSceneGraphToSceneDocument(normalized);
    return serializeSceneDocumentToPersistedSceneGraph(document);
}
