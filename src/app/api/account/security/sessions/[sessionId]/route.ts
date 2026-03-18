import { NextResponse } from "next/server";

import { revokePlatformSessionForSession } from "@/server/account/security";
import { getCurrentAuthSession } from "@/server/auth/session";

export async function DELETE(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { sessionId } = await context.params;
        await revokePlatformSessionForSession({
            session,
            sessionId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to revoke tracked session.",
            },
            { status: 400 },
        );
    }
}
