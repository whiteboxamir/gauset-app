import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getNotificationCenterForSession, updateNotificationPreferencesForSession } from "@/server/account/notifications";
import { notificationPreferencesSchema } from "@/server/contracts/notifications";

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getNotificationCenterForSession(session);
    return NextResponse.json(snapshot);
}

export async function PUT(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = notificationPreferencesSchema.parse(await request.json());
        await updateNotificationPreferencesForSession(session, payload);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update notification preferences.",
            },
            { status: 400 },
        );
    }
}
