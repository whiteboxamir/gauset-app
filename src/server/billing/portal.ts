import type { AuthSession } from "@/server/contracts/auth";

import { restInsert, restSelect } from "@/server/db/rest";

import { BillingContractError } from "./errors";
import { createBillingPortalSession } from "./stripe";

interface BillingCustomerRow {
    provider_customer_id: string;
}

export async function createPortalSessionForStudio({
    session,
    origin,
    returnPath,
}: {
    session: AuthSession;
    origin: string;
    returnPath: string;
}) {
    const activeStudioId = session.activeStudioId;
    if (!activeStudioId) {
        throw new BillingContractError("missing_active_studio", "An active studio is required before opening the billing portal.");
    }

    const billingCustomers = await restSelect<BillingCustomerRow[]>("billing_customers", {
        select: "provider_customer_id",
        filters: {
            studio_id: `eq.${activeStudioId}`,
            limit: "1",
        },
    });

    const billingCustomer = billingCustomers[0];
    if (!billingCustomer) {
        throw new BillingContractError(
            "billing_customer_missing",
            "No Stripe customer is attached to this studio yet.",
        );
    }

    const portal = await createBillingPortalSession({
        customer: billingCustomer.provider_customer_id,
        return_url: `${origin}${returnPath}`,
    });

    await restInsert("audit_events", {
        actor_user_id: session.user.userId,
        actor_type: "user",
        studio_id: activeStudioId,
        target_type: "billing.portal_session",
        target_id: portal.id,
        event_type: "billing.portal_session.created",
        summary: "Opened Stripe billing portal session.",
        metadata: {},
    }).catch(() => null);

    return portal;
}
