import { NextResponse } from "next/server";

import { revokeOtherPlatformSessionsForSession } from "@/server/account/security";
import { getCurrentAuthSession } from "@/server/auth/session";

export async function POST() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const revokedCount = await revokeOtherPlatformSessionsForSession(session);
        return NextResponse.json({
            success: true,
            revokedCount,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to revoke other tracked sessions.",
            },
            { status: 400 },
        );
    }
}
