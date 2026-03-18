import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
    completeAccessReviewForSession,
    recordAccessReviewDecisionForSession,
    startAccessReviewForSession,
} from "@/server/account/governance";
import { getCurrentAuthSession } from "@/server/auth/session";
import { syncPlatformNotificationsAfterMutation } from "@/server/platform/notification-sync";

const accessReviewPatchSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("decide"),
        reviewId: z.string().uuid(),
        entryId: z.string().uuid(),
        decision: z.enum(["keep", "revoke", "escalate", "defer"]),
        note: z.string().max(500).optional().nullable(),
    }),
    z.object({
        action: z.literal("complete"),
        reviewId: z.string().uuid(),
    }),
]);

export async function POST() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const reviewId = await startAccessReviewForSession(session);
        await syncPlatformNotificationsAfterMutation(session);
        return NextResponse.json({
            success: true,
            reviewId,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to start access review.",
            },
            { status: 400 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = accessReviewPatchSchema.parse(await request.json());
        if (payload.action === "decide") {
            await recordAccessReviewDecisionForSession({
                session,
                reviewId: payload.reviewId,
                entryId: payload.entryId,
                decision: payload.decision,
                note: payload.note,
            });
        } else {
            await completeAccessReviewForSession({
                session,
                reviewId: payload.reviewId,
            });
        }
        await syncPlatformNotificationsAfterMutation(session);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update access review.",
            },
            { status: 400 },
        );
    }
}
