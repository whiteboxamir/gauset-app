import { NextRequest, NextResponse } from "next/server";

import {
    buildProxyResponseHeaders,
    buildUpstreamRequestHeaders,
    buildUpstreamUrl,
    resolveBackendBaseUrlForOrigin,
    resolveBackendWorkerToken,
} from "@/server/mvp/proxyBackend";
import { authorizeProxyRequest } from "@/server/mvp/proxyAccess";
import { buildBackendProxyErrorResponse, buildUnavailableResponse, type ProxyAccessContext } from "@/server/mvp/proxyShared";
import { importDirectUploadIntoBackend, parseCompleteDirectUploadPayload } from "@/server/mvp/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadCompletionRequest = {
    blobUrl?: string;
    pathname?: string;
    filename?: string;
    contentType?: string;
    size?: number;
};

function parseRequestPayload(bodyBuffer: ArrayBuffer) {
    try {
        const payload = JSON.parse(Buffer.from(bodyBuffer).toString("utf8")) as UploadCompletionRequest;
        return payload && typeof payload === "object" ? payload : null;
    } catch {
        return null;
    }
}

async function proxyLegacyUpload({
    request,
    backendBaseUrl,
    accessContext,
}: {
    request: NextRequest;
    backendBaseUrl: string;
    accessContext: ProxyAccessContext;
}) {
    const headers = buildUpstreamRequestHeaders({
        requestHeaders: request.headers,
        workerToken: resolveBackendWorkerToken(),
        studioId: accessContext.session?.activeStudioId ?? null,
        userId: accessContext.session?.user.userId ?? null,
    });
    const upstreamUrl = buildUpstreamUrl({
        backendBaseUrl,
        pathname: "upload",
        searchParams: request.nextUrl.searchParams,
    });

    const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: request.body,
        cache: "no-store",
        signal: request.signal,
        duplex: "half",
    } as RequestInit & { duplex: "half" });

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: buildProxyResponseHeaders(upstream.headers),
    });
}

async function completeDirectUpload({
    request,
    accessContext,
    bodyBuffer,
}: {
    request: NextRequest;
    accessContext: ProxyAccessContext;
    bodyBuffer: ArrayBuffer;
}) {
    const { error, payload } = parseCompleteDirectUploadPayload(parseRequestPayload(bodyBuffer));
    if (error || !payload) {
        return NextResponse.json({ message: error || "Invalid upload completion payload." }, { status: 400 });
    }

    return importDirectUploadIntoBackend({
        request,
        accessContext,
        payload,
    });
}

export async function POST(request: NextRequest) {
    const backendBaseUrl = resolveBackendBaseUrlForOrigin({
        origin: request.nextUrl.origin,
    });
    if (!backendBaseUrl) {
        return buildUnavailableResponse("upload");
    }

    const contentType = request.headers.get("content-type") ?? "";
    const isJsonRequest = contentType.toLowerCase().includes("application/json");
    const bodyBuffer = isJsonRequest ? await request.arrayBuffer() : undefined;
    const accessResult = await authorizeProxyRequest({
        request,
        pathname: isJsonRequest ? "upload/ingest" : "upload",
        bodyBuffer,
    });
    if (accessResult instanceof Response) {
        return accessResult;
    }

    try {
        if (bodyBuffer) {
            return completeDirectUpload({
                request,
                accessContext: accessResult,
                bodyBuffer,
            });
        }

        return proxyLegacyUpload({
            request,
            backendBaseUrl,
            accessContext: accessResult,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown upstream error";
        return buildBackendProxyErrorResponse("upload", message);
    }
}
