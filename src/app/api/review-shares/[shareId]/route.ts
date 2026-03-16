import { NextRequest, NextResponse } from "next/server";

import { respondWithRouteError } from "@/server/projects/http";
import { resolveReviewShareAccess } from "@/server/review-shares/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
    try {
        const { shareId } = await context.params;
        const redirectUrl = resolveReviewShareAccess({
            shareId,
            token: request.nextUrl.searchParams.get("token"),
            origin: request.nextUrl.origin,
            requestPath: request.nextUrl.pathname,
        });

        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        return respondWithRouteError(error, "Unable to open review share.");
    }
}
