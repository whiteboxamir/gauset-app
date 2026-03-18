import { NextRequest, NextResponse } from "next/server";

import { handleStripeWebhookRequest } from "@/server/billing/webhooks";
import { settleStripeWebhookSideEffects } from "@/server/billing/webhook-side-effects";
import { syncPlatformNotificationsAfterStudioMutation } from "@/server/platform/notification-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const result = await handleStripeWebhookRequest({
            rawBody,
            signatureHeader: request.headers.get("stripe-signature"),
        });
        const sideEffects = await settleStripeWebhookSideEffects({
            affectedStudioIds: result.affectedStudioIds,
            syncStudioMutation: syncPlatformNotificationsAfterStudioMutation,
        });
        if (sideEffects.failedStudioIds.length > 0) {
            console.error("Stripe webhook notification sync failed for studios:", sideEffects.failedStudioIds);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        return NextResponse.json(
            {
                received: false,
                message: error instanceof Error ? error.message : "Unable to process Stripe webhook.",
            },
            { status: 400 },
        );
    }
}
