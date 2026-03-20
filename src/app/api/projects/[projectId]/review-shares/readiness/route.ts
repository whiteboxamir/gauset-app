import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getProjectReviewShareReadinessForSession, getReviewShareErrorStatus } from "@/server/review-shares/service";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const sceneId = request.nextUrl.searchParams.get("sceneId")?.trim() ?? "";
    const versionId = request.nextUrl.searchParams.get("versionId")?.trim() ?? "";
    if (!sceneId || !versionId) {
        return NextResponse.json({ message: "sceneId and versionId are required." }, { status: 400 });
    }

    try {
        const { projectId } = await context.params;
        const readiness = await getProjectReviewShareReadinessForSession({
            session,
            projectId,
            sceneId,
            versionId,
        });
        if (!readiness) {
            return NextResponse.json({ message: "Project not found." }, { status: 404 });
        }

        return NextResponse.json(readiness);
    } catch (error) {
        return NextResponse.json(
            {
                message: error instanceof Error ? error.message : "Unable to inspect review-share readiness.",
            },
            { status: getReviewShareErrorStatus(error) },
        );
    }
}
