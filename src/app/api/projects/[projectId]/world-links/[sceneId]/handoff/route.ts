import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getProjectDetailForSession } from "@/server/projects/service";
import { buildProjectWorldHandoffForSession } from "@/server/world-handoff";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ projectId: string; sceneId: string }> },
) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const { projectId, sceneId } = await context.params;
        const detail = await getProjectDetailForSession(session, projectId);
        if (!detail) {
            return NextResponse.json({ message: "Project not found." }, { status: 404 });
        }

        const worldLink = detail.worldLinks.find((entry) => entry.sceneId === sceneId);
        if (!worldLink) {
            return NextResponse.json({ message: "World link not found for this project." }, { status: 404 });
        }

        const target = request.nextUrl.searchParams.get("target") === "unreal" ? "unreal" : "generic";
        const manifest = await buildProjectWorldHandoffForSession({
            session,
            projectId,
            sceneId,
            fallbackLabel: worldLink.environmentLabel,
            target,
        });

        return NextResponse.json(manifest);
    } catch (error) {
        return NextResponse.json(
            {
                message: error instanceof Error ? error.message : "Unable to emit downstream handoff manifest.",
            },
            { status: 400 },
        );
    }
}
