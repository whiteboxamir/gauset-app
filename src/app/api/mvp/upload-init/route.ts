import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

import {
    hasAllowedDirectUploadExtension,
    isAllowedDirectUploadContentType,
    MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES,
    MVP_DIRECT_UPLOAD_MAX_BYTES,
} from "@/lib/mvp-upload";
import { authorizeProxyRequest } from "@/server/mvp/proxyAccess";
import { resolveDirectUploadCapability } from "@/server/mvp/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientUploadPayload = {
    contentType?: string;
    filename?: string;
    size?: number;
};

function parseClientUploadPayload(value: string | null): ClientUploadPayload {
    if (!value) {
        return {};
    }

    try {
        const parsed = JSON.parse(value) as ClientUploadPayload;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function toErrorResponse(error: unknown, status = 400) {
    return NextResponse.json(
        {
            message: error instanceof Error ? error.message : "Client upload could not be started.",
        },
        { status },
    );
}

export async function GET() {
    return NextResponse.json(resolveDirectUploadCapability());
}

export async function POST(request: NextRequest) {
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
        return NextResponse.json(
            {
                message: "Direct durable uploads are unavailable on this deployment.",
            },
            { status: 503 },
        );
    }

    const bodyBuffer = await request.arrayBuffer();
    const accessResult = await authorizeProxyRequest({
        request,
        pathname: "upload-init",
        bodyBuffer,
    });
    if (accessResult instanceof Response) {
        return accessResult;
    }

    let body: HandleUploadBody;
    try {
        body = JSON.parse(Buffer.from(bodyBuffer).toString("utf8")) as HandleUploadBody;
    } catch {
        return toErrorResponse("Invalid direct upload request body.");
    }

    try {
        const payload = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                const parsedPayload = parseClientUploadPayload(clientPayload);
                const contentType = typeof parsedPayload.contentType === "string" ? parsedPayload.contentType : null;
                const size = typeof parsedPayload.size === "number" ? parsedPayload.size : null;

                if (!pathname.startsWith("mvp/source-stills/")) {
                    throw new Error("Direct upload path is not allowed.");
                }

                if (!hasAllowedDirectUploadExtension(pathname)) {
                    throw new Error("Only PNG, JPG, and WEBP stills are supported.");
                }

                if (contentType && !isAllowedDirectUploadContentType(contentType)) {
                    throw new Error("Only PNG, JPG, and WEBP stills are supported.");
                }

                if (typeof size === "number" && size > MVP_DIRECT_UPLOAD_MAX_BYTES) {
                    throw new Error("This still is larger than the supported 64 MB upload limit.");
                }

                return {
                    allowedContentTypes: [...MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES],
                    maximumSizeInBytes: MVP_DIRECT_UPLOAD_MAX_BYTES,
                    addRandomSuffix: true,
                    allowOverwrite: false,
                };
            },
        });

        return NextResponse.json(payload);
    } catch (error) {
        return toErrorResponse(error);
    }
}
