import { NextRequest } from "next/server";
import { z } from "zod";

import { hasLaunchAccessForEmail } from "@/server/auth/invitations";
import { buildAuthCallbackUrl, sanitizeNextPath } from "@/server/auth/redirects";
import { authFailure, authSuccess, createAuthRouteError } from "@/server/auth/response";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { sendEmailOtp } from "@/server/auth/supabase";

const registerSchema = z.object({
    email: z.string().email(),
    displayName: z.string().trim().max(120).optional(),
    next: z.string().optional(),
    invitationToken: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const payload = registerSchema.parse(await request.json());
        const normalizedEmail = payload.email.toLowerCase();
        const surfaceStatus = getAuthSurfaceStatus();
        if (!surfaceStatus.operational) {
            throw createAuthRouteError({
                code: surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable",
                status: 503,
                message: surfaceStatus.message,
            });
        }

        const access = await hasLaunchAccessForEmail(normalizedEmail);

        if (access.isRestricted) {
            throw createAuthRouteError({
                code: "account_restricted",
                status: 403,
                message: "That account is restricted and cannot be reactivated from this surface.",
                data: {
                    email: normalizedEmail,
                },
            });
        }

        if (!access.allowed) {
            throw createAuthRouteError({
                code: "launch_access_required",
                status: 403,
                message: "Account creation is limited to approved or invited emails. Request early access on gauset.com before registering here.",
                data: {
                    email: normalizedEmail,
                    nextStep: "request_access",
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
            email: normalizedEmail,
            createUser: true,
            redirectTo,
            data: {
                full_name: payload.displayName?.trim() || undefined,
            },
        });

        return authSuccess({
            message: access.hasActiveInvitation
                ? "Invite confirmed. Check your inbox to finish creating your account."
                : "Access confirmed. Check your inbox to finish creating your account.",
            data: {
                email: normalizedEmail,
                nextStep: access.hasActiveInvitation ? "accept_invite" : "register",
            },
        });
    } catch (error) {
        return authFailure(error, {
            message: "Unable to send registration link.",
            code: "session_unavailable",
        });
    }
}
