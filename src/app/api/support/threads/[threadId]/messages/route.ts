import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { replyToSupportThreadForSession } from "@/server/support/service";

const createSupportMessageSchema = z.object({
    body: z.string().trim().min(1).max(5000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { threadId } = await context.params;
        const payload = createSupportMessageSchema.parse(await request.json());
        await replyToSupportThreadForSession({
            session,
            threadId,
            body: payload.body,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to send support reply.",
            },
            { status: 400 },
        );
    }
}
