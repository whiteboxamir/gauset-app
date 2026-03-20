import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminApiSession } from "@/server/admin/api";
import { getAdminSupportThreadDetail, updateAdminSupportThread } from "@/server/admin/service";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";
import { supportThreadPriorityValues, supportThreadStatusValues } from "@/types/platform/common";

const updateSupportThreadSchema = z.object({
    status: z.enum(supportThreadStatusValues).optional(),
    priority: z.enum(supportThreadPriorityValues).optional(),
    assignToSelf: z.boolean().optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const { threadId } = await context.params;
    const detail = await getAdminSupportThreadDetail(threadId);
    if (!detail) {
        return NextResponse.json({ message: "Support thread not found." }, { status: 404 });
    }

    return NextResponse.json({ detail });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const { threadId } = await context.params;
        const payload = updateSupportThreadSchema.parse(await request.json());
        const result = await updateAdminSupportThread({
            session,
            threadId,
            status: payload.status,
            priority: payload.priority,
            assignToSelf: payload.assignToSelf,
        });
        await syncPlatformNotificationsAfterStudioMutation({
            studioId: result.studioId,
            actorUserId: session.user.userId,
            actorType: "admin",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update support thread.",
            },
            { status: 400 },
        );
    }
}
