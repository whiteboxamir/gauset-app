import type { NextRequest } from "next/server";

import { type BackendUsageJobPayload, syncUsageEventFromJobPayload } from "@/server/billing/usage";
import {
    buildProxyResponseHeaders,
    buildUpstreamRequestHeaders,
    buildUpstreamUrl,
    resolveBackendBaseUrlForOrigin,
    resolveBackendWorkerToken,
} from "@/server/mvp/proxyBackend";
import { authorizeProxyRequest, ensureProxyResponseSceneAccess } from "@/server/mvp/proxyAccess";
import { buildBackendProxyErrorResponse, buildUnavailableResponse, extractJsonResponsePayload } from "@/server/mvp/proxyShared";

function shouldBufferRequestBody(method: string, contentType: string | null) {
    if (method === "GET" || method === "HEAD") {
        return false;
    }

    if (!contentType) {
        return false;
    }

    const normalized = contentType.toLowerCase();
    return normalized.includes("application/json") || normalized.includes("+json");
}

function shouldSyncUsageDebit(pathname: string, method: string) {
    return method === "GET" && /^jobs\/[^/]+$/.test(pathname);
}

async function maybeSyncUsageDebitFromProxyResponse({
    pathname,
    method,
    upstream,
    studioId,
    userId,
}: {
    pathname: string;
    method: string;
    upstream: Response;
    studioId?: string | null;
    userId?: string | null;
}) {
    if (!shouldSyncUsageDebit(pathname, method) || !studioId || !userId) {
        return;
    }

    const payload = (await extractJsonResponsePayload(upstream)) as BackendUsageJobPayload | null;
    if (!payload) {
        return;
    }

    await syncUsageEventFromJobPayload({
        job: payload,
        studioId,
        userId,
    });
}

export async function proxyMvpRequest(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    const pathname = path.join("/");
    const backendBaseUrl = resolveBackendBaseUrlForOrigin({
        origin: request.nextUrl.origin,
    });
    if (!backendBaseUrl) {
        return buildUnavailableResponse(pathname);
    }

    let bodyBuffer: ArrayBuffer | undefined;
    if (shouldBufferRequestBody(request.method, request.headers.get("content-type"))) {
        bodyBuffer = await request.arrayBuffer();
    }

    const accessResult = await authorizeProxyRequest({
        request,
        pathname,
        bodyBuffer,
    });
    if (accessResult instanceof Response) {
        return accessResult;
    }

    const upstreamUrl = buildUpstreamUrl({
        backendBaseUrl,
        pathname,
        searchParams: request.nextUrl.searchParams,
    });
    const headers = buildUpstreamRequestHeaders({
        requestHeaders: request.headers,
        workerToken: resolveBackendWorkerToken(),
        studioId: accessResult.session?.activeStudioId ?? null,
        userId: accessResult.session?.user.userId ?? null,
    });

    try {
        const upstreamRequestInit: RequestInit & { duplex?: "half" } = {
            method: request.method,
            headers,
            cache: "no-store",
            signal: request.signal,
        };

        if (bodyBuffer) {
            upstreamRequestInit.body = bodyBuffer;
        } else if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
            upstreamRequestInit.body = request.body;
            upstreamRequestInit.duplex = "half";
        }

        const upstream = await fetch(upstreamUrl, upstreamRequestInit);

        const accessFailure = await ensureProxyResponseSceneAccess({
            pathname,
            upstream,
            accessContext: accessResult,
        });
        if (accessFailure) {
            return accessFailure;
        }

        try {
            await maybeSyncUsageDebitFromProxyResponse({
                pathname,
                method: request.method,
                upstream,
                studioId: accessResult.session?.activeStudioId ?? null,
                userId: accessResult.session?.user.userId ?? null,
            });
        } catch (error) {
            console.error("[billing] failed to synchronize MVP usage debit", error);
        }

        return new Response(request.method === "HEAD" ? null : upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: buildProxyResponseHeaders(upstream.headers),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown upstream error";
        return buildBackendProxyErrorResponse(pathname, message);
    }
}
