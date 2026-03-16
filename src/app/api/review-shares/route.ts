import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadReviewShareService, requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { reviewShareContentModeValues, reviewShareDeliveryModeValues } from "@/server/review-shares/types";

export const runtime = "nodejs";

const createReviewShareSchema = z
    .object({
        projectId: z.string().trim().min(1).max(160),
        sceneId: z.string().trim().min(1).max(160),
        contentMode: z.enum(reviewShareContentModeValues),
        versionId: z.string().trim().max(160).optional(),
        payload: z.string().trim().max(500_000).optional(),
        label: z.string().trim().max(120).optional(),
        note: z.string().trim().max(280).optional(),
        deliveryMode: z.enum(reviewShareDeliveryModeValues).optional(),
        expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
    })
    .superRefine((value, ctx) => {
        if (value.contentMode === "saved_version" && !value.versionId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["versionId"],
                message: "versionId is required for version-locked shares.",
            });
        }

        if (value.contentMode === "saved_version" && value.payload) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["payload"],
                message: "Version-locked shares cannot include an inline payload.",
            });
        }

        if (value.contentMode === "inline_package" && !value.payload) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["payload"],
                message: "payload is required for inline shares.",
            });
        }

        if (value.contentMode === "inline_package" && value.versionId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["versionId"],
                message: "Inline shares cannot claim a saved version lock.",
            });
        }
    });

export async function GET(request: NextRequest) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const projectId = request.nextUrl.searchParams.get("projectId");
        const { listReviewSharesForOwner } = await loadReviewShareService();

        return NextResponse.json(
            listReviewSharesForOwner({
                ownerEmail: operatorEmail,
                origin: request.nextUrl.origin,
                projectId,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to load review shares.");
    }
}

export async function POST(request: NextRequest) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const input = createReviewShareSchema.parse(await request.json());
        const { createReviewShareForOwner } = await loadReviewShareService();

        return NextResponse.json(
            createReviewShareForOwner({
                ownerEmail: operatorEmail,
                origin: request.nextUrl.origin,
                projectId: input.projectId,
                sceneId: input.sceneId,
                contentMode: input.contentMode,
                versionId: input.versionId,
                payload: input.payload,
                label: input.label,
                note: input.note,
                deliveryMode: input.deliveryMode ?? "secure_link",
                expiresInHours: input.expiresInHours,
            }),
            { status: 201 },
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to create review share.");
    }
}
