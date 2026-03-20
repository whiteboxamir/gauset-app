import { NextRequest, NextResponse } from "next/server";

import { clearAuthCookies } from "@/server/auth/cookies";
import { isSameOriginMutation } from "@/server/auth/mutations";
import { revokeTrackedPlatformSession } from "@/server/auth/platform-sessions";

export async function POST(request: NextRequest) {
    if (!isSameOriginMutation(request)) {
        return NextResponse.json({ message: "Cross-site logout requests are rejected." }, { status: 403 });
    }

    const platformSessionId = request.cookies.get("gauset-platform-session")?.value ?? null;
    if (platformSessionId) {
        await revokeTrackedPlatformSession({
            sessionId: platformSessionId,
            reason: "logout",
        });
    }

    const response = NextResponse.json({
        ok: true,
        redirectTo: "/auth/login",
    });
    clearAuthCookies(response.cookies);
    return response;
}

export async function GET() {
    return NextResponse.json({ message: "Use POST to log out." }, { status: 405, headers: { Allow: "POST" } });
}
