import { NextRequest } from "next/server";
import { z } from "zod";

import { getInvitationPreview } from "@/server/auth/invitations";
import { buildAuthCallbackUrl, sanitizeNextPath } from "@/server/auth/redirects";
import { authFailure, authSuccess, createAuthRouteError } from "@/server/auth/response";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { sendEmailOtp } from "@/server/auth/supabase";

const acceptInviteSchema = z.object({
    invitationToken: z.string().min(1),
    next: z.string().optional(),
});

export async function POST(request: NextRequest) {
    try {
        const payload = acceptInviteSchema.parse(await request.json());
        const surfaceStatus = getAuthSurfaceStatus();
        if (!surfaceStatus.operational) {
            throw createAuthRouteError({
                code: surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable",
                status: 503,
                message: surfaceStatus.message,
            });
        }

        const invitation = await getInvitationPreview(payload.invitationToken);
        if (!invitation) {
            throw createAuthRouteError({
                code: "invite_not_found",
                status: 404,
                message: "Invite not found. Ask the studio owner to resend the invite from the platform shell.",
            });
        }
        if (invitation.status !== "pending" || invitation.expired) {
            throw createAuthRouteError({
                code: "invite_inactive",
                status: 410,
                message: "This invite is no longer active. Ask the studio owner to issue a fresh invite.",
                data: {
                    email: invitation.email.toLowerCase(),
                },
            });
        }

        const next = sanitizeNextPath(payload.next);
        const redirectTo = buildAuthCallbackUrl({
            origin: request.nextUrl.origin,
            nextPath: next,
            invitationToken: payload.invitationToken,
        });

        await sendEmailOtp({
            email: invitation.email.toLowerCase(),
            createUser: true,
            redirectTo,
        });

        return authSuccess({
            message: `Access link sent to ${invitation.email}.`,
            data: {
                email: invitation.email.toLowerCase(),
                nextStep: "accept_invite",
            },
        });
    } catch (error) {
        return authFailure(error, {
            message: "Unable to accept invite.",
            code: "session_unavailable",
        });
    }
}
