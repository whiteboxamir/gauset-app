import { NextRequest, NextResponse } from "next/server";

import {
    issueBrowserUploadGrant,
    parseBrowserUploadGrantRequest,
    resolveDirectUploadCapability,
} from "@/server/mvp/localConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(message: string, status = 400) {
    return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
    let rawPayload: unknown;
    try {
        rawPayload = await request.json();
    } catch {
        return toErrorResponse("Invalid upload grant request body.");
    }

    const { error, payload } = parseBrowserUploadGrantRequest(rawPayload);
    if (error || !payload) {
        return toErrorResponse(error || "Invalid upload grant request.");
    }

    const capability = resolveDirectUploadCapability();
    if (!(capability.available && capability.transport === "backend" && capability.directUploadUrl)) {
        return toErrorResponse("Direct backend upload is unavailable in this local restore.", 409);
    }

    try {
        return NextResponse.json(
            issueBrowserUploadGrant({
                ...payload,
                uploadUrl: capability.directUploadUrl,
            }),
        );
    } catch (error) {
        return toErrorResponse(error instanceof Error ? error.message : "Direct backend upload is unavailable in this local restore.", 503);
    }
}
