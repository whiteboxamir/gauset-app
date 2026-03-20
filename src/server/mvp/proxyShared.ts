import type { AuthSession } from "../contracts/auth.ts";
import { extractSceneIdFromProxyPath } from "./proxyScene.ts";

export const HOP_BY_HOP_HEADERS = new Set([
    "accept-encoding",
    "connection",
    "content-encoding",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
]);

export interface ProxyAccessContext {
    isAdmin: boolean;
    requestSceneId: string | null;
    requestSourceLabel: string | null;
    session: AuthSession | null;
}

export function buildStorageProxyHeaders(status: "backend-unavailable" | "backend-proxy-error" | "access-denied") {
    const headers = new Headers();
    headers.set("cache-control", "no-store, max-age=0");
    headers.set("retry-after", "1");
    headers.set("x-gauset-proxy-status", status);
    return headers;
}

export function buildUnavailableResponse(pathname: string) {
    const isStorageRequest = pathname.startsWith("storage/");
    if (isStorageRequest) {
        return new Response("Local Gauset backend is unavailable.", {
            status: 503,
            headers: buildStorageProxyHeaders("backend-unavailable"),
        });
    }

    return Response.json(
        {
            code: "BACKEND_UNAVAILABLE",
            message:
                "The local Gauset backend is not connected. Start the FastAPI server locally or configure GAUSET_BACKEND_URL for this deployment.",
            checklist: [
                "Run the Python backend locally on port 8000, or set GAUSET_BACKEND_URL in the hosting environment.",
                "Verify /api/mvp/health returns a healthy response.",
                "Confirm the backend cloned ML-Sharp and TripoSR and can write to uploads/assets/scenes.",
            ],
        },
        { status: 503 },
    );
}

export function buildAccessDeniedResponse({
    pathname,
    status,
    code,
    message,
    redirectTo,
}: {
    pathname: string;
    status: 401 | 403 | 500 | 503;
    code: string;
    message: string;
    redirectTo?: string;
}) {
    if (pathname.startsWith("storage/")) {
        const headers = buildStorageProxyHeaders("access-denied");
        if (redirectTo) {
            headers.set("x-gauset-redirect-to", redirectTo);
        }
        return new Response(message, {
            status,
            headers,
        });
    }

    return Response.json(
        {
            code,
            message,
            redirectTo: redirectTo ?? null,
        },
        { status },
    );
}

export function buildBackendProxyErrorResponse(pathname: string, message: string) {
    const isStorageRequest = pathname.startsWith("storage/");
    if (isStorageRequest) {
        return new Response(message, {
            status: 502,
            headers: buildStorageProxyHeaders("backend-proxy-error"),
        });
    }

    return Response.json(
        {
            code: "BACKEND_PROXY_ERROR",
            message:
                "The Gauset frontend reached its proxy route, but the local backend could not be contacted from the server.",
            detail: message,
        },
        { status: 502 },
    );
}

export function isPublicProxyPath(pathname: string, method: string) {
    if (method === "OPTIONS") {
        return true;
    }
    return pathname === "health" || pathname.startsWith("health/");
}

export function isJsonContentType(value: string | null) {
    return value?.toLowerCase().includes("application/json") ?? false;
}

export function parseJsonBody(contentType: string | null, bodyBuffer?: ArrayBuffer) {
    if (!bodyBuffer || bodyBuffer.byteLength === 0) {
        return null as Record<string, unknown> | null;
    }
    if (!isJsonContentType(contentType)) {
        return null as Record<string, unknown> | null;
    }

    try {
        const parsed = JSON.parse(new TextDecoder().decode(bodyBuffer));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null as Record<string, unknown> | null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null as Record<string, unknown> | null;
    }
}

export function extractSceneIdFromRequestPayload(pathname: string, payload: Record<string, unknown> | null) {
    const sceneIdFromPath = extractSceneIdFromProxyPath(pathname);
    if (sceneIdFromPath) {
        return sceneIdFromPath;
    }

    if (typeof payload?.scene_id === "string" && payload.scene_id.trim()) {
        return payload.scene_id.trim();
    }

    return null;
}

export function extractSourceLabelFromRequestPayload(payload: Record<string, unknown> | null) {
    if (!payload) {
        return null;
    }

    const directCandidates = [payload.sourceLabel, payload.environmentLabel, payload.inputLabel, payload.label];
    for (const candidate of directCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    const sceneGraph = payload.scene_graph;
    if (!sceneGraph || typeof sceneGraph !== "object") {
        return null;
    }

    const environment = (sceneGraph as { environment?: unknown }).environment;
    if (!environment || typeof environment !== "object") {
        return null;
    }

    const environmentRecord = environment as Record<string, unknown>;
    const nestedCandidates = [environmentRecord.sourceLabel, environmentRecord.label];
    for (const candidate of nestedCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    return null;
}

export async function extractJsonResponsePayload(upstream: Response) {
    if (!upstream.ok || upstream.status === 204 || !isJsonContentType(upstream.headers.get("content-type"))) {
        return null as Record<string, unknown> | null;
    }

    try {
        const payload = await upstream.clone().json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return null as Record<string, unknown> | null;
        }
        return payload as Record<string, unknown>;
    } catch {
        return null as Record<string, unknown> | null;
    }
}
