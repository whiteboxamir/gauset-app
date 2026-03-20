import { NextRequest } from "next/server";
import { z } from "zod";

import { finalizeStudioInvitationForSession } from "@/server/account/workspaces";
import { PLATFORM_SESSION_COOKIE } from "@/server/auth/cookies";
import { ensureTrackedPlatformSessionForRequest } from "@/server/auth/platform-sessions";
import { authFailure, authSuccess, createAuthRouteError } from "@/server/auth/response";
import { getCurrentAuthSession } from "@/server/auth/session";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { inferPlatformSessionLabel } from "@/server/platform/security-core";

const finalizeInviteSchema = z.object({
    invitationToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
    try {
        const surfaceStatus = getAuthSurfaceStatus();
        if (!surfaceStatus.operational) {
            throw createAuthRouteError({
                code: surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable",
                status: 503,
                message: surfaceStatus.message,
            });
        }

        const session = await getCurrentAuthSession();
        if (!session) {
            throw createAuthRouteError({
                code: "auth_required",
                status: 401,
                message: "Authentication required before a studio invite can be finalized.",
            });
        }

        const payload = finalizeInviteSchema.parse(await request.json());
        const finalized = await finalizeStudioInvitationForSession({
            session,
            invitationToken: payload.invitationToken,
        });

        const response = authSuccess({
            message: `Studio access mounted for ${finalized.activeStudio.name}.`,
            data: {
                studioId: finalized.activeStudio.studioId,
                studioName: finalized.activeStudio.name,
                role: finalized.activeStudio.role,
            },
        });
        await ensureTrackedPlatformSessionForRequest({
            responseCookies: response.cookies,
            currentSessionId: request.cookies.get(PLATFORM_SESSION_COOKIE)?.value ?? null,
            userId: session.user.userId,
            provider: session.providers[0] ?? "magic_link",
            label: inferPlatformSessionLabel(request.headers.get("user-agent")),
            authenticatedAt: new Date().toISOString(),
        });
        await syncPlatformNotificationsAfterMutation({
            ...session,
            activeStudioId: finalized.activeStudio.studioId,
            studios: session.studios.some((studio) => studio.studioId === finalized.activeStudio.studioId)
                ? session.studios
                : [
                      ...session.studios,
                      {
                          studioId: finalized.activeStudio.studioId,
                          studioName: finalized.activeStudio.name,
                          role: finalized.activeStudio.role,
                          planCode: null,
                      },
                  ],
        });

        return response;
    } catch (error) {
        return authFailure(error, {
            message: "Unable to finalize invite.",
            code: "session_unavailable",
        });
    }
}
