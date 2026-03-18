import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { laneHandoffMutationSchema } from "@/server/contracts/continuity";
import { clearLaneHandoffForSession, upsertLaneHandoffForSession } from "@/server/platform/continuity";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const continuityDomainSchema = z.enum(["workspace", "billing", "team", "support", "projects"]);

export async function PUT(request: NextRequest, context: { params: Promise<{ domain: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = laneHandoffMutationSchema.parse(await request.json());
        const params = await context.params;
        const domain = continuityDomainSchema.parse(params.domain);
        await upsertLaneHandoffForSession({
            session,
            domain,
            mutation: payload,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update lane handoff.",
            },
            { status: 400 },
        );
    }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ domain: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const params = await context.params;
        const domain = continuityDomainSchema.parse(params.domain);
        await clearLaneHandoffForSession({
            session,
            domain,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to clear lane handoff.",
            },
            { status: 400 },
        );
    }
}
