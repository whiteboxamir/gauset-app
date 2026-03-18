import { restInsert } from "../db/rest.ts";

import { verifyStripeWebhookSignature } from "./stripe.ts";
import {
    type StripeChargeObject,
    type StripeCheckoutSessionObject,
    type StripeInvoiceObject,
    type StripePaymentIntentObject,
    type StripeRefundObject,
    type StripeSubscriptionObject,
    syncCheckoutSessionCompleted,
    syncStripeInvoice,
    syncStripePaymentIntent,
    syncStripeRefund,
    syncStripeRefundsForCharge,
    syncStripeSubscription,
} from "./sync.ts";

interface StripeEvent<T = Record<string, unknown>> {
    id: string;
    type: string;
    data: {
        object: T;
    };
}

export async function handleStripeWebhookRequest({
    rawBody,
    signatureHeader,
}: {
    rawBody: string;
    signatureHeader: string | null;
}) {
    verifyStripeWebhookSignature({
        payload: rawBody,
        signatureHeader,
    });

    const event = JSON.parse(rawBody) as StripeEvent;
    const affectedStudioIds = new Set<string>();
    let handled = false;

    switch (event.type) {
        case "checkout.session.completed":
            {
                handled = true;
                const result = await syncCheckoutSessionCompleted(event.data.object as unknown as StripeCheckoutSessionObject);
                if (result?.studioId) {
                    affectedStudioIds.add(result.studioId);
                }
            }
            break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
            {
                handled = true;
                const result = await syncStripeSubscription(event.data.object as unknown as StripeSubscriptionObject);
                if (result?.studioId) {
                    affectedStudioIds.add(result.studioId);
                }
            }
            break;
        case "invoice.created":
        case "invoice.finalized":
        case "invoice.paid":
        case "invoice.payment_failed":
        case "invoice.updated":
        case "invoice.voided":
        case "invoice.marked_uncollectible":
            {
                handled = true;
                const result = await syncStripeInvoice(event.data.object as unknown as StripeInvoiceObject);
                if (result?.studioId) {
                    affectedStudioIds.add(result.studioId);
                }
            }
            break;
        case "payment_intent.succeeded":
        case "payment_intent.payment_failed":
        case "payment_intent.processing":
        case "payment_intent.canceled":
            {
                handled = true;
                const result = await syncStripePaymentIntent(event.data.object as unknown as StripePaymentIntentObject);
                if (result?.studioId) {
                    affectedStudioIds.add(result.studioId);
                }
            }
            break;
        case "refund.created":
        case "refund.updated":
        case "refund.failed":
        case "charge.refund.updated":
            {
                handled = true;
                const result = await syncStripeRefund(event.data.object as unknown as StripeRefundObject);
                if (result?.studioId) {
                    affectedStudioIds.add(result.studioId);
                }
            }
            break;
        case "charge.refunded":
            {
                handled = true;
                const result = await syncStripeRefundsForCharge(event.data.object as unknown as StripeChargeObject);
                result.studioIds.forEach((studioId) => affectedStudioIds.add(studioId));
            }
            break;
        default:
            break;
    }

    await restInsert("audit_events", {
        actor_user_id: null,
        actor_type: "system",
        studio_id: null,
        target_type: "billing.webhook",
        target_id: event.id,
        event_type: `stripe.${event.type}`,
        summary: handled ? `Processed Stripe webhook ${event.type}.` : `Ignored Stripe webhook ${event.type}.`,
        metadata: {
            handled,
            affectedStudioIds: Array.from(affectedStudioIds),
        },
    }).catch(() => null);

    return {
        event,
        affectedStudioIds: Array.from(affectedStudioIds),
    };
}
