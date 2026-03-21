import { NextRequest } from "next/server";

import { buildWorkerProxyHeaders, resolveBackendBaseUrl } from "@/server/mvp/localConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const backendBaseUrl = resolveBackendBaseUrl();
    const upstreamUrl = new URL(`${backendBaseUrl}/upload`);
    request.nextUrl.searchParams.forEach((value, key) => {
        upstreamUrl.searchParams.set(key, value);
    });

    try {
        const upstream = await fetch(upstreamUrl, {
            method: "POST",
            headers: buildWorkerProxyHeaders(request.headers),
            body: request.body,
            cache: "no-store",
            signal: request.signal,
            duplex: "half",
        } as RequestInit & { duplex: "half" });

        const responseHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
            const normalized = key.toLowerCase();
            if (normalized === "connection" || normalized === "content-length" || normalized === "transfer-encoding") {
                return;
            }
            responseHeaders.set(key, value);
        });

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        return Response.json(
            {
                code: "BACKEND_PROXY_ERROR",
                message: "The restored MVP upload bridge could not reach the local Gaussian backend.",
                detail: error instanceof Error ? error.message : "Unknown upstream error",
            },
            { status: 502 },
        );
    }
}
