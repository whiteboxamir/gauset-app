import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { applySuggestedAssigneeForSession } from "@/server/platform/coordination";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

export async function PATCH(_request: Request, context: { params: Promise<{ itemKey: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { itemKey } = await context.params;
        await applySuggestedAssigneeForSession({
            session,
            itemKey,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to rebalance coordination item.",
            },
            { status: 400 },
        );
    }
}
