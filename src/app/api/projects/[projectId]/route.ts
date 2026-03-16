import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadProjectService, requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { projectStatusValues } from "@/server/projects/types";

export const runtime = "nodejs";

const updateProjectSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(280).optional(),
    status: z.enum(projectStatusValues).optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;
        const { getProjectDetailForOwner } = await loadProjectService();
        const detail = getProjectDetailForOwner(operatorEmail, projectId);

        if (!detail) {
            throw new Error("Project not found.");
        }

        return NextResponse.json(detail);
    } catch (error) {
        return respondWithRouteError(error, "Unable to load project.");
    }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;
        const input = updateProjectSchema.parse(await request.json());
        const { updateProjectForOwner } = await loadProjectService();

        return NextResponse.json(
            updateProjectForOwner({
                ownerEmail: operatorEmail,
                projectId,
                name: input.name,
                description: input.description,
                status: input.status,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to update project.");
    }
}
