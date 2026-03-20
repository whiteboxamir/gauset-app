import type { AuthSession } from "@/server/contracts/auth";

import { requestBillingCheckoutApprovalForSession } from "@/server/account/governance";
import { restInsert, restSelect } from "@/server/db/rest";

import { BillingContractError } from "./errors";
import { createCheckoutSession } from "./stripe";

interface PlanRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    billing_provider: "stripe" | "manual";
    interval: "month" | "year" | "custom";
    price_cents: number;
    currency: string;
}

interface BillingCustomerRow {
    id: string;
    provider_customer_id: string;
}

interface BillingContactRow {
    email: string;
}

interface CurrentSubscriptionRow {
    status: string;
    plans?: {
        code: string;
    } | null;
}

export async function createCheckoutSessionForPlan({
    session,
    planCode,
    origin,
    successPath,
    cancelPath,
    skipGovernanceApproval = false,
}: {
    session: AuthSession;
    planCode: string;
    origin: string;
    successPath: string;
    cancelPath: string;
    skipGovernanceApproval?: boolean;
}) {
    const activeStudioId = session.activeStudioId;
    if (!activeStudioId) {
        throw new BillingContractError("missing_active_studio", "An active studio is required before checkout.");
    }

    const [plans, billingCustomers, billingContacts, currentSubscriptions] = await Promise.all([
        restSelect<PlanRow[]>("plans", {
            select: "id,code,name,description,billing_provider,interval,price_cents,currency",
            filters: {
                code: `eq.${planCode}`,
                is_active: "eq.true",
                limit: "1",
            },
        }),
        restSelect<BillingCustomerRow[]>("billing_customers", {
            select: "id,provider_customer_id",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                limit: "1",
            },
        }),
        restSelect<BillingContactRow[]>("billing_contacts", {
            select: "email",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                is_default: "eq.true",
                limit: "1",
            },
        }),
        restSelect<CurrentSubscriptionRow[]>("subscriptions", {
            select: "status,plans(code)",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "created_at.desc",
                limit: "1",
            },
        }),
    ]);

    const plan = plans[0];
    if (!plan) {
        throw new BillingContractError("plan_not_found", "Selected plan was not found.");
    }
    if (plan.billing_provider !== "stripe") {
        throw new BillingContractError("manual_plan", "This plan is handled manually and cannot be purchased through Stripe.");
    }
    if (plan.interval === "custom") {
        throw new BillingContractError("manual_plan", "Custom billing plans require manual provisioning.");
    }

    const currentSubscription = currentSubscriptions[0] ?? null;
    const currentPlanCode = currentSubscription?.plans?.code ?? null;
    const currentStatus = currentSubscription?.status ?? null;
    if (
        currentPlanCode === plan.code &&
        currentStatus &&
        ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"].includes(currentStatus)
    ) {
        throw new BillingContractError("plan_already_active", "This studio is already on the selected plan.");
    }

    if (!skipGovernanceApproval) {
        const approvalRequest = await requestBillingCheckoutApprovalForSession({
            session,
            planCode: plan.code,
            origin,
            successPath,
            cancelPath,
        });
        if (approvalRequest) {
            return {
                mode: "requested" as const,
                approvalRequest,
            };
        }
    }

    const billingCustomer = billingCustomers[0] ?? null;
    const customerEmail = billingContacts[0]?.email ?? session.user.email;

    const checkout = await createCheckoutSession({
        mode: "subscription",
        success_url: `${origin}${successPath}`,
        cancel_url: `${origin}${cancelPath}`,
        client_reference_id: activeStudioId,
        allow_promotion_codes: true,
        customer: billingCustomer?.provider_customer_id ?? undefined,
        customer_email: billingCustomer ? undefined : customerEmail,
        metadata: {
            studio_id: activeStudioId,
            plan_code: plan.code,
        },
        subscription_data: {
            metadata: {
                studio_id: activeStudioId,
                plan_code: plan.code,
            },
        },
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: plan.currency.toLowerCase(),
                    unit_amount: plan.price_cents,
                    recurring: {
                        interval: plan.interval,
                    },
                    product_data: {
                        name: plan.name,
                        description: plan.description ?? undefined,
                    },
                },
            },
        ],
    });

    await restInsert("audit_events", {
        actor_user_id: session.user.userId,
        actor_type: "user",
        studio_id: activeStudioId,
        target_type: "billing.checkout_session",
        target_id: checkout.id,
        event_type: "billing.checkout_session.created",
        summary: `Created Stripe checkout session for ${plan.code}.`,
        metadata: {
            planCode: plan.code,
        },
    }).catch(() => null);

    return {
        mode: "checkout" as const,
        id: checkout.id,
        url: checkout.url,
    };
}
