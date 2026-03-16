import { NextRequest, NextResponse } from "next/server";

import { requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";
import { revokeReviewShareForOwner } from "@/server/review-shares/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { shareId } = await context.params;

        return NextResponse.json(
            revokeReviewShareForOwner({
                ownerEmail: operatorEmail,
                origin: request.nextUrl.origin,
                shareId,
            }),
        );
    } catch (error) {
        return respondWithRouteError(error, "Unable to revoke review share.");
    }
}
