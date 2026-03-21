import { NextRequest, NextResponse } from "next/server";

import { authorizeProxyRequest } from "@/server/mvp/proxyAccess";
import {
    issueBrowserDirectUploadGrant,
    parseBrowserDirectUploadGrantRequest,
    resolveDirectUploadCapability,
} from "@/server/mvp/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(message: string, status = 400) {
    return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
    const bodyBuffer = await request.arrayBuffer();
    const accessResult = await authorizeProxyRequest({
        request,
        pathname: "upload-ticket",
        bodyBuffer,
    });
    if (accessResult instanceof Response) {
        return accessResult;
    }

    let rawPayload: unknown;
    try {
        rawPayload = JSON.parse(Buffer.from(bodyBuffer).toString("utf8"));
    } catch {
        return toErrorResponse("Invalid upload grant request body.");
    }

    const { error, payload } = parseBrowserDirectUploadGrantRequest(rawPayload);
    if (error || !payload) {
        return toErrorResponse(error || "Invalid upload grant request.");
    }

    const capability = resolveDirectUploadCapability();
    if (!(capability.available && capability.transport === "backend" && capability.directUploadUrl)) {
        return toErrorResponse("Direct backend upload is unavailable on this deployment.", 409);
    }

    try {
        return NextResponse.json(
            issueBrowserDirectUploadGrant({
                ...payload,
                uploadUrl: capability.directUploadUrl,
            }),
        );
    } catch (error) {
        return toErrorResponse(error instanceof Error ? error.message : "Direct backend upload is unavailable on this deployment.", 503);
    }
}
