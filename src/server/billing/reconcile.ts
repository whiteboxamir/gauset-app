import { restSelect } from "../db/rest.ts";

import { listStripeInvoices, listStripePaymentIntents, listStripeRefunds, listStripeSubscriptions } from "./stripe.ts";
import {
    type StripeInvoiceObject,
    type StripePaymentIntentObject,
    type StripeRefundObject,
    type StripeSubscriptionObject,
    syncStripeInvoice,
    syncStripePaymentIntent,
    syncStripeRefund,
    syncStripeSubscription,
} from "./sync.ts";
import { reconcileUsageEventsForStudios } from "./usage.ts";

interface BillingCustomerRow {
    provider_customer_id: string;
}

interface StripeListResponse<T> {
    data: T[];
    has_more?: boolean;
}

export interface ReconcileStripeCustomerBillingOptions {
    customerId: string;
    createdGte?: number | null;
    skipUsageBackfill?: boolean;
}

export interface ReconcileStripeCustomerBillingResult {
    customerId: string;
    studioIds: string[];
    processed: {
        subscriptions: number;
        invoices: number;
        payments: number;
        refunds: number;
        usageEvents: number;
        usageDebits: number;
        grantReversals: number;
        refundRestorations: number;
        preMetadataJobsSkipped: number;
    };
    skipped: {
        usageBackfillReason: string | null;
    };
}

export interface ReconcileStripeBillingOptions {
    studioId?: string | null;
    customerId?: string | null;
    includeAllCustomers?: boolean;
    createdGte?: number | null;
    skipUsageBackfill?: boolean;
}

export interface ReconcileStripeBillingResult {
    customerIds: string[];
    runs: ReconcileStripeCustomerBillingResult[];
    processed: {
        subscriptions: number;
        invoices: number;
        payments: number;
        refunds: number;
        usageEvents: number;
        usageDebits: number;
        grantReversals: number;
        refundRestorations: number;
        preMetadataJobsSkipped: number;
    };
    studioIds: string[];
    skipped: {
        usageBackfillReasons: string[];
    };
}

function dedupe(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function listAllStripeObjects<T>({
    query = {},
    loadPage,
}: {
    query?: Record<string, unknown>;
    loadPage: (query: Record<string, unknown>) => Promise<StripeListResponse<T>>;
}) {
    const allItems: T[] = [];
    let startingAfter: string | null = null;

    while (true) {
        const page = await loadPage({
            ...query,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
            limit: 100,
        });

        const items = Array.isArray(page.data) ? page.data : [];
        allItems.push(...items);
        if (!page.has_more || items.length === 0) {
            break;
        }

        const lastItem = items[items.length - 1] as { id?: string };
        startingAfter = typeof lastItem?.id === "string" ? lastItem.id : null;
        if (!startingAfter) {
            break;
        }
    }

    return allItems;
}

function buildCreatedFilter(createdGte?: number | null) {
    return typeof createdGte === "number" && Number.isFinite(createdGte)
        ? {
              created: {
                  gte: createdGte,
              },
          }
        : {};
}

async function resolveCustomerIds({
    studioId,
    customerId,
    includeAllCustomers,
}: {
    studioId?: string | null;
    customerId?: string | null;
    includeAllCustomers?: boolean;
}) {
    if (customerId) {
        return [customerId];
    }

    if (studioId) {
        const rows = await restSelect<BillingCustomerRow[]>("billing_customers", {
            select: "provider_customer_id",
            filters: {
                studio_id: `eq.${studioId}`,
                limit: "1",
            },
        });
        const providerCustomerId = rows[0]?.provider_customer_id ?? null;
        if (!providerCustomerId) {
            throw new Error(`No Stripe billing customer is recorded for studio ${studioId}.`);
        }
        return [providerCustomerId];
    }

    if (!includeAllCustomers) {
        throw new Error("Provide a Stripe customer id, studio id, or opt in to syncing all recorded billing customers.");
    }

    const rows = await restSelect<BillingCustomerRow[]>("billing_customers", {
        select: "provider_customer_id",
    });
    return dedupe(rows.map((row) => row.provider_customer_id));
}

export async function reconcileStripeCustomerBilling({
    customerId,
    createdGte = null,
    skipUsageBackfill = false,
}: ReconcileStripeCustomerBillingOptions): Promise<ReconcileStripeCustomerBillingResult> {
    const baseQuery = {
        customer: customerId,
        ...buildCreatedFilter(createdGte),
    };

    const subscriptions = await listAllStripeObjects<StripeSubscriptionObject>({
        query: {
            ...baseQuery,
            status: "all",
        },
        loadPage: (query) => listStripeSubscriptions<StripeSubscriptionObject>(query),
    });
    const invoices = await listAllStripeObjects<StripeInvoiceObject>({
        query: baseQuery,
        loadPage: (query) => listStripeInvoices<StripeInvoiceObject>(query),
    });
    const payments = await listAllStripeObjects<StripePaymentIntentObject>({
        query: baseQuery,
        loadPage: (query) => listStripePaymentIntents<StripePaymentIntentObject>(query),
    });

    const affectedStudioIds = new Set<string>();
    for (const subscription of subscriptions) {
        const result = await syncStripeSubscription(subscription);
        if (result?.studioId) {
            affectedStudioIds.add(result.studioId);
        }
    }

    for (const invoice of invoices) {
        const result = await syncStripeInvoice(invoice);
        if (result?.studioId) {
            affectedStudioIds.add(result.studioId);
        }
    }

    for (const payment of payments) {
        const result = await syncStripePaymentIntent(payment);
        if (result?.studioId) {
            affectedStudioIds.add(result.studioId);
        }
    }

    const usageBackfill = skipUsageBackfill
        ? {
              backendJobsFetched: 0,
              usageEventsSynced: 0,
              usageDebitsCreated: 0,
              preMetadataJobsSkipped: 0,
              skippedReason: "skipped by caller",
          }
        : await reconcileUsageEventsForStudios({
              studioIds: Array.from(affectedStudioIds),
              createdGte,
          });

    const refunds: StripeRefundObject[] = [];
    let grantReversals = 0;
    let refundRestorations = 0;
    for (const payment of payments) {
        const paymentRefunds = await listAllStripeObjects<StripeRefundObject>({
            query: {
                payment_intent: payment.id,
                ...buildCreatedFilter(createdGte),
            },
            loadPage: (query) => listStripeRefunds<StripeRefundObject>(query),
        });
        refunds.push(...paymentRefunds);
    }

    for (const refund of refunds) {
        const result = await syncStripeRefund(refund);
        if (result?.studioId) {
            affectedStudioIds.add(result.studioId);
        }
        if (result?.grantReversalCreated) {
            grantReversals += 1;
        }
        if (result?.refundRestorationCreated) {
            refundRestorations += 1;
        }
    }

    return {
        customerId,
        studioIds: Array.from(affectedStudioIds),
        processed: {
            subscriptions: subscriptions.length,
            invoices: invoices.length,
            payments: payments.length,
            refunds: refunds.length,
            usageEvents: usageBackfill.usageEventsSynced,
            usageDebits: usageBackfill.usageDebitsCreated,
            grantReversals,
            refundRestorations,
            preMetadataJobsSkipped: usageBackfill.preMetadataJobsSkipped,
        },
        skipped: {
            usageBackfillReason: usageBackfill.skippedReason,
        },
    };
}

export async function reconcileStripeBilling({
    studioId = null,
    customerId = null,
    includeAllCustomers = false,
    createdGte = null,
    skipUsageBackfill = false,
}: ReconcileStripeBillingOptions): Promise<ReconcileStripeBillingResult> {
    const customerIds = await resolveCustomerIds({
        studioId,
        customerId,
        includeAllCustomers,
    });

    const runs: ReconcileStripeCustomerBillingResult[] = [];
    const aggregateStudioIds = new Set<string>();
    const processed = {
        subscriptions: 0,
        invoices: 0,
        payments: 0,
        refunds: 0,
        usageEvents: 0,
        usageDebits: 0,
        grantReversals: 0,
        refundRestorations: 0,
        preMetadataJobsSkipped: 0,
    };
    const usageBackfillReasons = new Set<string>();

    for (const providerCustomerId of customerIds) {
        const run = await reconcileStripeCustomerBilling({
            customerId: providerCustomerId,
            createdGte,
            skipUsageBackfill,
        });
        runs.push(run);
        run.studioIds.forEach((id) => aggregateStudioIds.add(id));
        processed.subscriptions += run.processed.subscriptions;
        processed.invoices += run.processed.invoices;
        processed.payments += run.processed.payments;
        processed.refunds += run.processed.refunds;
        processed.usageEvents += run.processed.usageEvents;
        processed.usageDebits += run.processed.usageDebits;
        processed.grantReversals += run.processed.grantReversals;
        processed.refundRestorations += run.processed.refundRestorations;
        processed.preMetadataJobsSkipped += run.processed.preMetadataJobsSkipped;
        if (run.skipped.usageBackfillReason) {
            usageBackfillReasons.add(run.skipped.usageBackfillReason);
        }
    }

    return {
        customerIds,
        runs,
        processed,
        studioIds: Array.from(aggregateStudioIds),
        skipped: {
            usageBackfillReasons: Array.from(usageBackfillReasons),
        },
    };
}
