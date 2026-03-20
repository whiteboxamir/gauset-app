import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { updateStudioMemberForSession } from "@/server/team/service";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const teamManageableRoleValues = ["member", "finance", "admin"] as const;
const manageableMembershipStatusValues = ["active", "suspended"] as const;

const updateMemberSchema = z.object({
    role: z.enum(teamManageableRoleValues).optional(),
    status: z.enum(manageableMembershipStatusValues).optional(),
    seatKind: z.enum(["paid", "observer", "internal"]).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const { membershipId } = await context.params;
        const payload = updateMemberSchema.parse(await request.json());
        const result = await updateStudioMemberForSession({
            session,
            membershipId,
            role: payload.role,
            status: payload.status,
            seatKind: payload.seatKind,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            mode: result.mode,
            approvalRequest: result.mode === "requested" ? result.approvalRequest : null,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update team member.",
            },
            { status: 400 },
        );
    }
}
