import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { getProjectReadinessDetailForSession } from "@/server/projects/readiness";
import { updateProjectForSession } from "@/server/projects/service";

const updateProjectSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().max(500).nullable().optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const { projectId } = await context.params;
    const detail = await getProjectReadinessDetailForSession(session, projectId);
    if (!detail) {
        return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const { projectId } = await context.params;
        const payload = updateProjectSchema.parse(await request.json());
        await updateProjectForSession({
            session,
            projectId,
            name: payload.name,
            description: payload.description,
            status: payload.status,
        });
        await syncPlatformNotificationsAfterMutation(session);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update project.",
            },
            { status: 400 },
        );
    }
}
