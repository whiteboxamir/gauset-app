import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadProjectService, requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { deliveryPostureValues, laneTruthKindValues, worldSourceKindValues } from "@/server/projects/types";

export const runtime = "nodejs";

const worldTruthSchema = z.object({
    sourceKind: z.enum(worldSourceKindValues).optional(),
    sourceLabel: z.string().trim().min(1).max(120).optional(),
    laneKind: z.enum(laneTruthKindValues).optional(),
    laneLabel: z.string().trim().min(1).max(120).optional(),
    deliveryPosture: z.enum(deliveryPostureValues).optional(),
    deliveryLabel: z.string().trim().min(1).max(120).optional(),
    deliverySummary: z.string().trim().min(1).max(280).optional(),
});

const addWorldLinkSchema = z.object({
    sceneId: z.string().trim().min(1).max(160),
    environmentLabel: z.string().trim().max(120).optional(),
    makePrimary: z.boolean().optional(),
    worldTruth: worldTruthSchema.optional(),
});

const recordReopenSchema = z.object({
    sceneId: z.string().trim().min(1).max(160),
    openedFrom: z.string().trim().max(80).optional(),
    versionId: z.string().trim().max(160).optional(),
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

        return NextResponse.json({
            projectId,
            worldLinks: detail.worldLinks,
        });
    } catch (error) {
        return respondWithRouteError(error, "Unable to load project world links.");
    }
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;
        const input = addWorldLinkSchema.parse(await request.json());
        const { addOrRefreshWorldLinkForOwner } = await loadProjectService();

        return NextResponse.json(
            addOrRefreshWorldLinkForOwner({
                ownerEmail: operatorEmail,
                projectId,
                sceneId: input.sceneId,
                environmentLabel: input.environmentLabel,
                makePrimary: input.makePrimary,
                worldTruth: input.worldTruth,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to record project world link.");
    }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;
        const input = recordReopenSchema.parse(await request.json());
        const { recordProjectWorldOpenedForOwner } = await loadProjectService();

        return NextResponse.json(
            recordProjectWorldOpenedForOwner({
                ownerEmail: operatorEmail,
                projectId,
                sceneId: input.sceneId,
                openedFrom: input.openedFrom,
                versionId: input.versionId,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to record project-linked reopen.");
    }
}
