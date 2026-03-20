import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getGovernanceSnapshotForSession, updateGovernancePolicyForSession } from "@/server/account/governance";
import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const policyPatchSchema = z
    .object({
        staleInviteHours: z.number().int().min(24).max(2160).optional(),
        staleSupportHours: z.number().int().min(12).max(720).optional(),
        staleProjectHours: z.number().int().min(24).max(2880).optional(),
        staleHandoffHours: z.number().int().min(1).max(720).optional(),
        maxSnoozeHours: z.number().int().min(24).max(2160).optional(),
        maxActiveItemsPerAvailableOperator: z.number().int().min(1).max(24).optional(),
        maxUrgentItemsPerAvailableOperator: z.number().int().min(1).max(12).optional(),
        urgentOwnershipDriftHours: z.number().int().min(1).max(168).optional(),
        requireAdminInviteApproval: z.boolean().optional(),
        requireElevatedRoleChangeApproval: z.boolean().optional(),
        requireSensitiveBillingApproval: z.boolean().optional(),
        requirePolicyChangeApproval: z.boolean().optional(),
        requireHandoffForAwayWithUrgentWork: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one governance field is required.",
    });

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const snapshot = await getGovernanceSnapshotForSession(session);
    return NextResponse.json({
        policy: snapshot.policy,
    });
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = policyPatchSchema.parse(await request.json());
        const result = await updateGovernancePolicyForSession({
            session,
            patch: payload,
        });
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({
            success: true,
            mode: result.mode,
            policy: result.mode === "updated" ? result.policy : null,
            approvalRequest: result.mode === "requested" ? result.approvalRequest : null,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update governance policy.",
            },
            { status: 400 },
        );
    }
}
