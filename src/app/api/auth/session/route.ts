import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { clearAuthCookies, setAuthCookies } from "@/server/auth/cookies";
import { isSameOriginMutation } from "@/server/auth/mutations";
import { activateLaunchAccessForUser, hasLaunchAccessForEmail } from "@/server/auth/invitations";
import { createTrackedPlatformSession, revokeTrackedPlatformSession } from "@/server/auth/platform-sessions";
import { authFailure, authSuccess, createAuthRouteError } from "@/server/auth/response";
import { getCurrentAuthSession } from "@/server/auth/session";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { getUserForAccessToken } from "@/server/auth/supabase";
import { authProviderSchema } from "@/server/contracts/auth";
import { inferPlatformSessionLabel } from "@/server/platform/security-core";

const sessionUpdateSchema = z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).optional(),
    provider: authProviderSchema.optional(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    return NextResponse.json({ session });
}

export async function PUT(request: NextRequest) {
    if (!isSameOriginMutation(request)) {
        return NextResponse.json({ message: "Cross-site session establishment requests are rejected." }, { status: 403 });
    }

    try {
        const surfaceStatus = getAuthSurfaceStatus();
        if (!surfaceStatus.operational) {
            throw createAuthRouteError({
                code: surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable",
                status: 503,
                message: surfaceStatus.message,
            });
        }

        const payload = sessionUpdateSchema.parse(await request.json());
        const user = await getUserForAccessToken(payload.accessToken);
        const normalizedEmail = user.email?.trim().toLowerCase();
        if (!normalizedEmail) {
            throw createAuthRouteError({
                code: "session_missing_email",
                status: 400,
                message: "Authenticated account is missing an email address.",
            });
        }

        const access = await hasLaunchAccessForEmail(normalizedEmail);
        if (access.isRestricted) {
            throw createAuthRouteError({
                code: "account_restricted",
                status: 403,
                message: "That account is restricted and cannot establish a platform session.",
                data: {
                    email: normalizedEmail,
                },
            });
        }

        if (!access.allowed) {
            throw createAuthRouteError({
                code: "launch_access_required",
                status: 403,
                message: "That email does not have access yet. Request early access on gauset.com or use the invited address.",
                data: {
                    email: normalizedEmail,
                    nextStep: "request_access",
                },
            });
        }
        if (access.shouldActivateProfile) {
            await activateLaunchAccessForUser(user.id);
        }

        const authenticatedAt = new Date().toISOString();

        const response = authSuccess({
            message: "Platform session established.",
            data: {
                email: normalizedEmail,
                nextStep: "login",
            },
        });
        setAuthCookies(response.cookies, {
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken ?? null,
            authenticatedAt,
        });
        await createTrackedPlatformSession({
            responseCookies: response.cookies,
            userId: user.id,
            provider: payload.provider ?? "magic_link",
            label: inferPlatformSessionLabel(request.headers.get("user-agent")),
            authenticatedAt,
        });
        return response;
    } catch (error) {
        const response = authFailure(error, {
            message: "Unable to establish session.",
            code: "session_unavailable",
        });
        clearAuthCookies(response.cookies);
        return response;
    }
}

export async function DELETE(request: NextRequest) {
    if (!isSameOriginMutation(request)) {
        return NextResponse.json({ message: "Cross-site session logout requests are rejected." }, { status: 403 });
    }

    const platformSessionId = request.cookies.get("gauset-platform-session")?.value ?? null;
    if (platformSessionId) {
        await revokeTrackedPlatformSession({
            sessionId: platformSessionId,
            reason: "logout",
        });
    }
    const response = authSuccess({
        message: "Platform session cleared.",
    });
    clearAuthCookies(response.cookies);
    return response;
}
