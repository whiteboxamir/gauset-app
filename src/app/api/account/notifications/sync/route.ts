import { NextResponse } from "next/server";

import { syncNotificationShellSummaryForSession } from "@/server/account/notifications";
import { getCurrentAuthSession } from "@/server/auth/session";

export async function POST() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const result = await syncNotificationShellSummaryForSession(session);
        return NextResponse.json({
            success: true,
            changed: result.changed,
            summary: result.summary,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to sync notification shell summary.",
            },
            { status: 400 },
        );
    }
}
