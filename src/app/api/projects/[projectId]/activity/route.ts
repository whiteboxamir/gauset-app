import { NextRequest, NextResponse } from "next/server";

import { loadProjectService, requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;
        const { getProjectDetailForOwner } = await loadProjectService();
        const detail = getProjectDetailForOwner(operatorEmail, projectId);

        if (!detail) {
            throw new Error("Project not found.");
        }

        return NextResponse.json({
            projectId,
            activity: detail.activity,
        });
    } catch (error) {
        return respondWithRouteError(error, "Unable to load project activity.");
    }
}
