import { NextRequest, NextResponse } from "next/server";

import { coordinationMutationSchema } from "@/server/contracts/coordination";
import { getCurrentAuthSession } from "@/server/auth/session";
import {
    assignCoordinationItemForSession,
    claimCoordinationItemForSession,
    reopenCoordinationItemForSession,
    resolveCoordinationItemForSession,
    snoozeCoordinationItemForSession,
    unsnoozeCoordinationItemForSession,
    updateCoordinationItemForSession,
} from "@/server/platform/coordination";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

export async function PATCH(request: NextRequest, context: { params: Promise<{ itemKey: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { itemKey } = await context.params;
        const mutation = coordinationMutationSchema.parse(await request.json());

        switch (mutation.action) {
            case "update":
                await updateCoordinationItemForSession({
                    session,
                    itemKey,
                    mutation,
                });
                break;
            case "claim":
                await claimCoordinationItemForSession({
                    session,
                    itemKey,
                });
                break;
            case "assign":
                await assignCoordinationItemForSession({
                    session,
                    itemKey,
                    assigneeUserId: mutation.assigneeUserId,
                });
                break;
            case "snooze":
                await snoozeCoordinationItemForSession({
                    session,
                    itemKey,
                    snoozeHours: mutation.snoozeHours,
                });
                break;
            case "unsnooze":
                await unsnoozeCoordinationItemForSession({
                    session,
                    itemKey,
                });
                break;
            case "resolve":
                await resolveCoordinationItemForSession({
                    session,
                    itemKey,
                    resolutionNote: mutation.resolutionNote,
                });
                break;
            case "reopen":
                await reopenCoordinationItemForSession({
                    session,
                    itemKey,
                });
                break;
            default:
                throw new Error("Unsupported coordination action.");
        }
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update coordination item.",
            },
            { status: 400 },
        );
    }
}
