import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";
import { getReviewShareErrorStatus, revokeReviewShareForSession } from "@/server/review-shares/service";

export async function POST(_request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const { shareId } = await context.params;
        await revokeReviewShareForSession({
            session,
            shareId,
        });
        await syncPlatformNotificationsAfterMutation(session);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to revoke review share.",
            },
            { status: getReviewShareErrorStatus(error) },
        );
    }
}
