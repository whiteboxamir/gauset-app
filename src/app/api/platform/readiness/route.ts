import { NextRequest, NextResponse } from "next/server";

import { canExposePlatformReadiness, getPlatformActivationReadiness } from "@/server/platform/activation-readiness";

export async function GET(request: NextRequest) {
    if (!canExposePlatformReadiness()) {
        return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const includeConnectivity = request.nextUrl.searchParams.get("includeConnectivity") === "1";
    const readiness = await getPlatformActivationReadiness({ includeConnectivity });

    return NextResponse.json(readiness, {
        status: readiness.status === "blocked" ? 503 : 200,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}
