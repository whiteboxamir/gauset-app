import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { listProjectReadinessCardsForSession } from "@/server/projects/readiness";
import { createProjectForSession } from "@/server/projects/service";

const createProjectSchema = z.object({
    name: z.string().min(1),
    description: z.string().max(500).optional(),
    sceneId: z.string().optional(),
    environmentLabel: z.string().max(120).optional(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const projects = await listProjectReadinessCardsForSession(session);
    return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = createProjectSchema.parse(await request.json());
        const projectId = await createProjectForSession({
            session,
            name: payload.name,
            description: payload.description,
            sceneId: payload.sceneId,
            environmentLabel: payload.environmentLabel,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true, projectId });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to create project.",
            },
            { status: 400 },
        );
    }
}
