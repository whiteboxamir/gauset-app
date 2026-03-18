import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getGovernanceSnapshotForSession, updateApprovalRequestForSession } from "@/server/account/governance";
import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const approvalActionSchema = z.object({
    requestId: z.string().uuid(),
    action: z.enum(["approve", "reject", "cancel"]),
    decisionNote: z.string().max(500).optional().nullable(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getGovernanceSnapshotForSession(session);
    return NextResponse.json({
        pendingRequests: snapshot.pendingRequests,
        recentRequests: snapshot.recentRequests,
    });
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = approvalActionSchema.parse(await request.json());
        const result = await updateApprovalRequestForSession({
            session,
            requestId: payload.requestId,
            action: payload.action,
            decisionNote: payload.decisionNote,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            redirectUrl: result.redirectUrl,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update approval request.",
            },
            { status: 400 },
        );
    }
}
