import { NextRequest } from "next/server";
import { z } from "zod";

import { hasLaunchAccessForEmail } from "@/server/auth/invitations";
import { buildAuthCallbackUrl, sanitizeNextPath } from "@/server/auth/redirects";
import { authFailure, authSuccess, createAuthRouteError } from "@/server/auth/response";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { sendEmailOtp } from "@/server/auth/supabase";

const loginSchema = z.object({
    email: z.string().email(),
    next: z.string().optional(),
    invitationToken: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const payload = loginSchema.parse(await request.json());
        const next = sanitizeNextPath(payload.next);
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
                message: "That account is restricted and cannot open a new session from this surface.",
            });
        }

        if (!access.allowed) {
            throw createAuthRouteError({
                code: "launch_access_required",
                status: 403,
                message: "That email does not have design-partner access yet. Request early access on gauset.com before logging in here.",
                data: {
                    email: normalizedEmail,
                    nextStep: "request_access",
                },
            });
        }

        if (!access.hasEstablishedAccess) {
            throw createAuthRouteError({
                code: "registration_required",
                status: 409,
                message: access.hasActiveInvitation
                    ? "That email is invited, but the account is not active yet. Open the invite flow or register once with the invited address before logging in."
                    : "That email is approved, but the account has not been created yet. Register once with this approved address before logging in.",
                data: {
                    email: normalizedEmail,
                    nextStep: "register",
                    suggestedPath: access.hasActiveInvitation
                        ? `/auth/register?email=${encodeURIComponent(normalizedEmail)}&next=${encodeURIComponent(next)}${
                              payload.invitationToken ? `&invite_token=${encodeURIComponent(payload.invitationToken)}` : ""
                          }`
                        : `/auth/register?email=${encodeURIComponent(normalizedEmail)}&next=${encodeURIComponent(next)}`,
                },
            });
        }

        const redirectTo = buildAuthCallbackUrl({
            origin: request.nextUrl.origin,
            nextPath: next,
            invitationToken: payload.invitationToken,
        });

        await sendEmailOtp({
            email: normalizedEmail,
            createUser: false,
            redirectTo,
        });

        return authSuccess({
            message: "Access link sent. Check your inbox to continue.",
            data: {
                email: normalizedEmail,
                nextStep: "login",
            },
        });
    } catch (error) {
        return authFailure(error, {
            message: "Unable to send access link.",
            code: "session_unavailable",
        });
    }
}
