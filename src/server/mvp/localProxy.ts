import type { NextRequest } from "next/server";

import { buildWorkerProxyHeaders, resolveBackendBaseUrl } from "@/server/mvp/localConfig";

const HOP_BY_HOP_HEADERS = new Set([
    "accept-encoding",
    "connection",
    "content-encoding",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function toBackendUrl(pathname: string, request: NextRequest) {
    const backendBaseUrl = resolveBackendBaseUrl();
    if (!backendBaseUrl) {
        return null;
    }

    const upstreamUrl = new URL(`${backendBaseUrl}/${pathname.replace(/^\/+/, "")}`);
    request.nextUrl.searchParams.forEach((value, key) => {
        upstreamUrl.searchParams.set(key, value);
    });
    return upstreamUrl;
}

export function buildUnavailableResponse(pathname: string) {
    if (pathname.startsWith("storage/")) {
        return new Response("Local Gauset backend is unavailable.", { status: 503 });
    }

    return Response.json(
        {
            code: "BACKEND_UNAVAILABLE",
            message: "The restored MVP app could not find the local Gaussian backend.",
        },
        { status: 503 },
    );
}

export async function proxyToBackend(request: NextRequest, pathname: string) {
    const upstreamUrl = toBackendUrl(pathname, request);
    if (!upstreamUrl) {
        return buildUnavailableResponse(pathname);
    }

    try {
        const upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers: buildWorkerProxyHeaders(request.headers),
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
            cache: "no-store",
            signal: request.signal,
            duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
        } as RequestInit & { duplex?: "half" });

        const responseHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
            if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });

        return new Response(request.method === "HEAD" ? null : upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        if (pathname.startsWith("storage/")) {
            return new Response(error instanceof Error ? error.message : "Unknown upstream error", { status: 502 });
        }

        return Response.json(
            {
                code: "BACKEND_PROXY_ERROR",
                message: "The restored MVP app could not reach the local Gaussian backend.",
                detail: error instanceof Error ? error.message : "Unknown upstream error",
            },
            { status: 502 },
        );
    }
}
