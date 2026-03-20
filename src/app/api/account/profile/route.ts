import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getAccountSettingsSnapshotForSession, updateProfileForSession } from "@/server/account/service";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const updateProfileSchema = z.object({
    displayName: z.string().max(120).optional().nullable(),
    jobTitle: z.string().max(120).optional().nullable(),
    timezone: z.string().max(120).optional().nullable(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getAccountSettingsSnapshotForSession(session);
    return NextResponse.json({
        profile: snapshot.profile,
        activeStudio: snapshot.activeStudio,
    });
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = updateProfileSchema.parse(await request.json());
        await updateProfileForSession({
            session,
            displayName: payload.displayName,
            jobTitle: payload.jobTitle,
            timezone: payload.timezone,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update profile.",
            },
            { status: 400 },
        );
    }
}
