import { NextRequest, NextResponse } from "next/server";

import { loadReviewShareService, requireOperatorEmail, respondWithRouteError } from "@/server/projects/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
    try {
        const operatorEmail = requireOperatorEmail(request);
        const { shareId } = await context.params;
        const { revokeReviewShareForOwner } = await loadReviewShareService();

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
