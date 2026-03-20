import type { AuthSession } from "@/server/contracts/auth";
import type { DownstreamHandoffManifest } from "@/server/contracts/downstream-handoff";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import { buildDownstreamHandoffManifest, deriveWorldIngestRecord } from "@/lib/world-workflow";
import { buildUpstreamRequestHeaders, buildUpstreamUrl, resolveBackendBaseUrlForOrigin, resolveBackendWorkerToken } from "@/server/mvp/proxyBackend";

interface SceneVersionListResponse {
    versions?: Array<{
        version_id?: string;
    }>;
}

interface SceneVersionPayload {
    saved_at?: string | null;
    scene_document?: unknown;
    scene_graph?: unknown;
    sceneGraph?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function resolveServerAppOrigin(env: NodeJS.ProcessEnv = process.env) {
    const explicitHost =
        env.NEXT_PUBLIC_GAUSET_APP_HOST?.trim() ||
        env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
        env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
        env.VERCEL_URL?.trim() ||
        "";
    if (explicitHost) {
        return explicitHost.startsWith("http://") || explicitHost.startsWith("https://") ? explicitHost : `https://${explicitHost}`;
    }

    const port = env.PORT?.trim() || "3000";
    return `http://127.0.0.1:${port}`;
}

async function fetchJsonFromMvpBackend<T>({
    pathname,
    session,
}: {
    pathname: string;
    session: AuthSession;
}) {
    const backendBaseUrl = resolveBackendBaseUrlForOrigin({
        origin: resolveServerAppOrigin(),
    });
    if (!backendBaseUrl) {
        return null as T | null;
    }

    const response = await fetch(
        buildUpstreamUrl({
            backendBaseUrl,
            pathname,
            searchParams: new URLSearchParams(),
        }),
        {
            headers: buildUpstreamRequestHeaders({
                requestHeaders: new Headers(),
                workerToken: resolveBackendWorkerToken(),
                studioId: session.activeStudioId ?? null,
                userId: session.user.userId,
            }),
            cache: "no-store",
        },
    );
    if (!response.ok) {
        return null as T | null;
    }

    return (await response.json()) as T;
}

function resolveSceneDocument(payload: SceneVersionPayload) {
    const sceneDocument = asRecord(payload.scene_document);
    if (sceneDocument?.version === 2) {
        return sceneDocument as unknown as SceneDocumentV2;
    }

    const embeddedDocument = asRecord(asRecord(payload.scene_graph)?.__scene_document_v2) ?? asRecord(asRecord(payload.sceneGraph)?.__scene_document_v2);
    if (embeddedDocument?.version === 2) {
        return embeddedDocument as unknown as SceneDocumentV2;
    }

    return null;
}

export async function buildProjectWorldHandoffForSession({
    session,
    projectId,
    sceneId,
    fallbackLabel,
    target,
}: {
    session: AuthSession;
    projectId: string;
    sceneId: string;
    fallbackLabel?: string | null;
    target: "generic" | "unreal";
}): Promise<DownstreamHandoffManifest> {
    const versionsPayload = await fetchJsonFromMvpBackend<SceneVersionListResponse>({
        pathname: `scene/${encodeURIComponent(sceneId)}/versions`,
        session,
    });
    const latestVersionId =
        versionsPayload?.versions?.find((entry) => typeof entry?.version_id === "string" && entry.version_id.trim())?.version_id?.trim() ?? null;
    if (!latestVersionId) {
        throw new Error("A saved version is required before emitting downstream handoff.");
    }

    const versionPayload = await fetchJsonFromMvpBackend<SceneVersionPayload>({
        pathname: `scene/${encodeURIComponent(sceneId)}/versions/${encodeURIComponent(latestVersionId)}`,
        session,
    });
    if (!versionPayload) {
        throw new Error("Saved scene payload could not be loaded for downstream handoff.");
    }

    const sceneDocument = resolveSceneDocument(versionPayload);
    if (!sceneDocument) {
        throw new Error("Saved scene payload did not contain a canonical SceneDocumentV2.");
    }

    const sceneGraph = asRecord(versionPayload.scene_graph) ?? asRecord(versionPayload.sceneGraph);
    const ingestRecord = deriveWorldIngestRecord({
        sceneId,
        versionId: latestVersionId,
        projectId,
        sceneDocument,
        sceneGraph,
        fallbackLabel,
    });

    return buildDownstreamHandoffManifest({
        projectId,
        sceneId,
        versionId: latestVersionId,
        sceneDocument,
        sceneGraph,
        ingestRecord,
        checkedBy: session.user.displayName ?? session.user.email,
        targetSystem: target === "unreal" ? "unreal_engine" : "generic_downstream",
        targetProfile: target === "unreal" ? "unreal_scene_package/v1" : "generic_scene_package/v1",
    });
}
