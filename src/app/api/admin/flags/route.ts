import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminApiSession } from "@/server/admin/api";
import { listAdminFlagAssignments, listKnownAdminFeatureFlags, setFeatureFlagAssignment } from "@/server/admin/service";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";
import { featureFlagScopeValues } from "@/types/platform/common";

const updateFeatureFlagSchema = z.object({
    flagKey: z.string().min(1),
    scopeType: z.enum(featureFlagScopeValues),
    enabled: z.boolean(),
    studioId: z.string().uuid().optional().nullable(),
    userId: z.string().uuid().optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
    const { response } = await getAdminApiSession();
    if (response) {
        return response;
    }

    const assignments = await listAdminFlagAssignments();
    return NextResponse.json({
        catalog: listKnownAdminFeatureFlags(),
        featureFlags: assignments.featureFlags,
        accountFlags: assignments.accountFlags,
    });
}

export async function POST(request: NextRequest) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const payload = updateFeatureFlagSchema.parse(await request.json());
        await setFeatureFlagAssignment({
            session,
            flagKey: payload.flagKey,
            scopeType: payload.scopeType,
            enabled: payload.enabled,
            studioId: payload.studioId,
            userId: payload.userId,
            config: payload.config,
        });
        await syncPlatformNotificationsAfterStudioMutation({
            studioId: payload.scopeType === "studio" ? (payload.studioId ?? null) : null,
            actorUserId: session.user.userId,
            actorType: "admin",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update feature flag.",
            },
            { status: 400 },
        );
    }
}
