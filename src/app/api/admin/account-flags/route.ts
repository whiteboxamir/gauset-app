import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminApiSession } from "@/server/admin/api";
import { listAdminFlagAssignments, setAccountFlagAssignment } from "@/server/admin/service";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";

const updateAccountFlagSchema = z.object({
    flagKey: z.string().min(1),
    studioId: z.string().uuid().optional().nullable(),
    userId: z.string().uuid().optional().nullable(),
    flagValue: z.unknown(),
    reason: z.string().max(500).optional().nullable(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export async function GET() {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const assignments = await listAdminFlagAssignments();
    return NextResponse.json({ accountFlags: assignments.accountFlags });
}

export async function POST(request: NextRequest) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const payload = updateAccountFlagSchema.parse(await request.json());
        await setAccountFlagAssignment({
            session,
            flagKey: payload.flagKey,
            studioId: payload.studioId,
            userId: payload.userId,
            flagValue: payload.flagValue,
            reason: payload.reason,
            expiresAt: payload.expiresAt,
        });
        await syncPlatformNotificationsAfterStudioMutation({
            studioId: payload.studioId ?? null,
            actorUserId: session.user.userId,
            actorType: "admin",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update account flag.",
            },
            { status: 400 },
        );
    }
}
