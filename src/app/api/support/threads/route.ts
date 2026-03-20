import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { createSupportThreadForSession, listSupportThreadsForSession } from "@/server/support/service";
import { supportThreadPriorityValues } from "@/types/platform/common";

const createThreadSchema = z.object({
    subject: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).max(5000),
    priority: z.enum(supportThreadPriorityValues),
    projectId: z.string().uuid().optional().nullable(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const threads = await listSupportThreadsForSession(session);
    return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = createThreadSchema.parse(await request.json());
        const threadId = await createSupportThreadForSession({
            session,
            subject: payload.subject,
            body: payload.body,
            priority: payload.priority,
            projectId: payload.projectId,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true, threadId });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to create support thread.",
            },
            { status: 400 },
        );
    }
}
