import { NextRequest, NextResponse } from "next/server";

import { requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { listReviewSharesForOwner } from "@/server/review-shares/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { projectId } = await context.params;

        return NextResponse.json(
            listReviewSharesForOwner({
                ownerEmail: operatorEmail,
                origin: request.nextUrl.origin,
                projectId,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to load project review shares.");
    }
}
