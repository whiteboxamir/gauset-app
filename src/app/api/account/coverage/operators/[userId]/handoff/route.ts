import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { handoffSuggestedCoverageForOperatorForSession } from "@/server/platform/coordination";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

export async function PATCH(_request: Request, context: { params: Promise<{ userId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { userId } = await context.params;
        const result = await handoffSuggestedCoverageForOperatorForSession({
            session,
            ownerUserId: userId,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            appliedCount: result.appliedCount,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to hand off coverage items.",
            },
            { status: 400 },
        );
    }
}
