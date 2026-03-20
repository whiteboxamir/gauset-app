import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAuthSession } from "@/server/auth/session";
import { getNotificationSubscriptionsForSession, updateNotificationSubscriptionForSession } from "@/server/account/notifications";
import { notificationDomainSchema } from "@/server/contracts/notifications";

const notificationSubscriptionMutationSchema = z.object({
    domain: notificationDomainSchema,
    following: z.boolean(),
});

export async function GET() {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    const subscriptions = await getNotificationSubscriptionsForSession(session);
    return NextResponse.json({ subscriptions });
}

export async function PATCH(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = notificationSubscriptionMutationSchema.parse(await request.json());
        await updateNotificationSubscriptionForSession({
            session,
            domain: payload.domain,
            following: payload.following,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Unable to update lane subscription.",
            },
            { status: 400 },
        );
    }
}
