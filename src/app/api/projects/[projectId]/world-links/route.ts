import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { addWorldLinkToProjectForSession, getProjectDetailForSession, markProjectWorldOpened } from "@/server/projects/service";

const worldLinkSchema = z.object({
    sceneId: z.string().min(1),
    environmentLabel: z.string().max(120).optional(),
    makePrimary: z.boolean().optional(),
    markOpened: z.boolean().optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const { projectId } = await context.params;
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ worldLinks: detail.worldLinks });
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const { projectId } = await context.params;
        const payload = worldLinkSchema.parse(await request.json());

        if (payload.markOpened) {
            await markProjectWorldOpened({
                session,
                projectId,
                sceneId: payload.sceneId,
            });
            await syncPlatformNotificationsAfterMutation(session);
            return NextResponse.json({ success: true });
        }

        await addWorldLinkToProjectForSession({
            session,
            projectId,
            sceneId: payload.sceneId,
            environmentLabel: payload.environmentLabel,
            makePrimary: payload.makePrimary,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update project worlds.",
            },
            { status: 400 },
        );
    }
}
