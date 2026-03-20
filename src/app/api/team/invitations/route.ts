import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { inviteStudioMemberForSession, resendStudioInvitationForSession, revokeStudioInvitationForSession } from "@/server/team/service";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const teamInviteRoleValues = ["member", "finance", "admin"] as const;

const createInvitationSchema = z.object({
    email: z.string().trim().email(),
    role: z.enum(teamInviteRoleValues),
});

const updateInvitationSchema = z.object({
    invitationId: z.string().uuid(),
    action: z.enum(["revoke", "resend"]),
});

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = createInvitationSchema.parse(await request.json());
        const result = await inviteStudioMemberForSession({
            session,
            email: payload.email,
            role: payload.role,
            origin: request.nextUrl.origin,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            ...(result.mode === "requested"
                ? {
                      mode: result.mode,
                      approvalRequest: result.approvalRequest,
                  }
                : {
                      mode: result.mode,
                      invitationId: result.invitationId,
                      deliveryMode: result.deliveryMode,
                      inviteUrl: result.inviteUrl,
                  }),
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to create invitation.",
            },
            { status: 400 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = updateInvitationSchema.parse(await request.json());
        if (payload.action === "revoke") {
            await revokeStudioInvitationForSession({
                session,
                invitationId: payload.invitationId,
            });
            await syncPlatformNotificationsAfterMutation(session);

            return NextResponse.json({ success: true });
        }

        const result = await resendStudioInvitationForSession({
            session,
            invitationId: payload.invitationId,
            origin: request.nextUrl.origin,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update invitation.",
            },
            { status: 400 },
        );
    }
}
