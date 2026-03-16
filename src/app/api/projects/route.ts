import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureSceneOwnershipForOwner } from "@/server/projects/ownership";
import { requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { createProjectForOwner, listProjectsForOwner } from "@/server/projects/service";
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

const createProjectSchema = z
    .object({
        mode: z.enum(["create", "ensure_ownership"]).optional(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(280).optional(),
        sceneId: z.string().trim().min(1).max(160).optional(),
        environmentLabel: z.string().trim().max(120).optional(),
        worldTruth: worldTruthSchema.optional(),
    })
    .superRefine((value, ctx) => {
        if ((value.mode ?? "create") === "create" && !value.name) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["name"],
                message: "name is required when creating a project.",
            });
        }

        if ((value.mode ?? "create") === "ensure_ownership" && !value.sceneId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["sceneId"],
                message: "sceneId is required when ensuring ownership.",
            });
        }
    });

export async function GET(request: NextRequest) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        return NextResponse.json({
            projects: listProjectsForOwner(operatorEmail),
        });
    } catch (error) {
        return respondWithRouteError(error, "Unable to list projects.");
    }
}

export async function POST(request: NextRequest) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const input = createProjectSchema.parse(await request.json());

        if ((input.mode ?? "create") === "ensure_ownership") {
            return NextResponse.json(
                ensureSceneOwnershipForOwner({
                    ownerEmail: operatorEmail,
                    sceneId: input.sceneId!,
                    sourceLabel: input.worldTruth?.sourceLabel ?? input.name ?? null,
                    environmentLabel: input.environmentLabel,
                    worldTruth: input.worldTruth,
                }),
                { status: 201 },
            );
        }

        return NextResponse.json(
            createProjectForOwner({
                ownerEmail: operatorEmail,
                name: input.name!,
                description: input.description,
                initialWorld: input.sceneId
                    ? {
                          sceneId: input.sceneId,
                          environmentLabel: input.environmentLabel,
                          worldTruth: input.worldTruth,
                          makePrimary: true,
                      }
                    : undefined,
            }),
            { status: 201 },
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to create project.");
    }
}
