import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createStudioForSession, getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const createStudioSchema = z.object({
    name: z.string().trim().min(1).max(120),
    billingEmail: z.string().email().optional().nullable().or(z.literal("")),
    supportEmail: z.string().email().optional().nullable().or(z.literal("")),
    accentColor: z.string().max(40).optional().nullable(),
    websiteUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = createStudioSchema.parse(await request.json());
        const activeStudio = await createStudioForSession({
            session,
            name: payload.name,
            billingEmail: payload.billingEmail || null,
            supportEmail: payload.supportEmail || null,
            accentColor: payload.accentColor || null,
            websiteUrl: payload.websiteUrl || null,
        });
        const workspaceState = await getStudioWorkspaceStateForSession({
            ...session,
            activeStudioId: activeStudio.studioId,
            studios: [
                ...session.studios,
                {
                    studioId: activeStudio.studioId,
                    studioName: activeStudio.name,
                    role: activeStudio.role,
                    planCode: null,
                },
            ],
        });
        await syncPlatformNotificationsAfterMutation({
            ...session,
            activeStudioId: activeStudio.studioId,
            studios: [
                ...session.studios,
                {
                    studioId: activeStudio.studioId,
                    studioName: activeStudio.name,
                    role: activeStudio.role,
                    planCode: null,
                },
            ],
        });

        return NextResponse.json({
            success: true,
            activeStudio,
            accessibleStudios: workspaceState.accessibleStudios,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to create studio.",
            },
            { status: 400 },
        );
    }
}
