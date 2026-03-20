import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { acknowledgeNotificationDeliveryForSession, dismissNotificationDeliveryForSession } from "@/server/account/notifications";

const notificationDeliveryMutationSchema = z.object({
    action: z.enum(["acknowledge", "dismiss"]),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ deliveryId: string }> }) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = notificationDeliveryMutationSchema.parse(await request.json());
        const { deliveryId } = await context.params;

        if (payload.action === "acknowledge") {
            await acknowledgeNotificationDeliveryForSession({
                session,
                deliveryId,
            });
        } else {
            await dismissNotificationDeliveryForSession({
                session,
                deliveryId,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update notification delivery.",
            },
            { status: 400 },
        );
    }
}
