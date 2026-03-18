import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { updateStudioWorkspaceForSession } from "@/server/account/service";
import { getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const updateStudioSchema = z.object({
    name: z.string().max(120).optional().nullable(),
    billingEmail: z.string().email().optional().nullable().or(z.literal("")),
    supportEmail: z.string().email().optional().nullable().or(z.literal("")),
    accentColor: z.string().max(40).optional().nullable(),
    websiteUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getStudioWorkspaceStateForSession(session);
    return NextResponse.json({
        activeStudio: snapshot.activeStudio,
        accessibleStudios: snapshot.accessibleStudios,
    });
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = updateStudioSchema.parse(await request.json());
        await updateStudioWorkspaceForSession({
            session,
            name: payload.name,
            billingEmail: payload.billingEmail || null,
            supportEmail: payload.supportEmail || null,
            accentColor: payload.accentColor,
            websiteUrl: payload.websiteUrl || null,
        });
        await syncPlatformNotificationsAfterMutation(session);

        const snapshot = await getStudioWorkspaceStateForSession(session);
        return NextResponse.json({ success: true, activeStudio: snapshot.activeStudio });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update studio settings.",
            },
            { status: 400 },
        );
    }
}
