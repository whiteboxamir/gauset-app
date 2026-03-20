import { NextRequest, NextResponse } from "next/server";

import { sanitizeNextPath } from "@/server/auth/redirects";
import { createAuthRouteError } from "@/server/auth/response";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { buildGoogleAuthorizeUrl } from "@/server/auth/supabase";

export async function GET(request: NextRequest) {
    const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

    try {
        const surfaceStatus = getAuthSurfaceStatus();
        if (!surfaceStatus.operational) {
            throw createAuthRouteError({
                code: surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable",
                status: 503,
                message: surfaceStatus.message,
            });
        }

        const redirectTo = `${request.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}&provider=google`;
        return NextResponse.redirect(buildGoogleAuthorizeUrl(redirectTo));
    } catch (error) {
        const url = new URL("/auth/login", request.url);
        url.searchParams.set("error", error instanceof Error ? error.message : "Google auth unavailable.");
        url.searchParams.set("next", next);
        return NextResponse.redirect(url);
    }
}
