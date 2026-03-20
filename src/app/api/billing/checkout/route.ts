import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createCheckoutSessionForPlan } from "@/server/billing/checkout";
import { describeBillingError } from "@/server/billing/errors";
import { getCurrentAuthSession } from "@/server/auth/session";
import { sanitizeNextPath } from "@/server/auth/redirects";

const checkoutSchema = z.object({
    planCode: z.string().min(1),
    successPath: z.string().optional(),
    cancelPath: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const session = await getCurrentAuthSession();
    if (!session) {
        return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    try {
        const payload = checkoutSchema.parse(await request.json());
        const checkout = await createCheckoutSessionForPlan({
            session,
            planCode: payload.planCode,
            origin: request.nextUrl.origin,
            successPath: sanitizeNextPath(payload.successPath, "/app/billing?checkout=success"),
            cancelPath: sanitizeNextPath(payload.cancelPath, "/app/billing?checkout=canceled"),
        });

        if (checkout.mode === "requested") {
            return NextResponse.json({
                mode: "requested",
                approvalRequired: true,
                approvalRequest: checkout.approvalRequest,
                syncState: "blocked_by_governance",
            });
        }

        return NextResponse.json({
            mode: "checkout",
            url: checkout.url,
            id: checkout.id,
            syncState: "pending_stripe_webhook",
        });
    } catch (error) {
        const failure = describeBillingError(error, "Unable to create checkout session.");
        return NextResponse.json(
            {
                code: failure.code,
                message: failure.message,
            },
            { status: failure.status },
        );
    }
}
