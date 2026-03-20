import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getProjectReviewSharesForSession } from "@/server/review-shares/service";

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const { projectId } = await context.params;
    const shares = await getProjectReviewSharesForSession(session, projectId);
    if (!shares) {
        return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(shares);
}
