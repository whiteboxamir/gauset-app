import { NextRequest, NextResponse } from "next/server";

import { proxyToBackend } from "@/server/mvp/localProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_PROVIDER_CATALOG = {
    enabled: false,
    summary: {
        enabled: false,
        available: false,
        image_provider_count: 0,
        available_image_provider_count: 0,
        video_provider_count: 0,
    },
    providers: [],
};

export async function GET(request: NextRequest) {
    const response = await proxyToBackend(request, "providers");

    if (response.status !== 404) {
        return response;
    }

    return NextResponse.json(EMPTY_PROVIDER_CATALOG);
}
