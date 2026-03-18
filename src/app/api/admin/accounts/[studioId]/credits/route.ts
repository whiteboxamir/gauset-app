import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminApiSession } from "@/server/admin/api";
import { grantStudioCredits } from "@/server/admin/service";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";

const grantCreditsSchema = z.object({
    amount: z.number().int(),
    note: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ studioId: string }> }) {
    const { session, response } = await getAdminApiSession();
    if (response || !session) {
        return response;
    }

    try {
        const { studioId } = await context.params;
        const payload = grantCreditsSchema.parse(await request.json());
        const result = await grantStudioCredits({
            session,
            studioId,
            amount: payload.amount,
            note: payload.note,
        });
        await syncPlatformNotificationsAfterStudioMutation({
            studioId,
            actorUserId: session.user.userId,
            actorType: "admin",
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to adjust credits.",
            },
            { status: 400 },
        );
    }
}
