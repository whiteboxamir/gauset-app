import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminApiSession } from "@/server/admin/api";
import { replyToSupportThreadAsAdmin } from "@/server/admin/service";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";

const createAdminSupportMessageSchema = z.object({
    body: z.string().trim().min(1).max(5000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const { threadId } = await context.params;
        const payload = createAdminSupportMessageSchema.parse(await request.json());
        const result = await replyToSupportThreadAsAdmin({
            session,
            threadId,
            body: payload.body,
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
                message: error instanceof Error ? error.message : "Unable to send admin support reply.",
            },
            { status: 400 },
        );
    }
}
