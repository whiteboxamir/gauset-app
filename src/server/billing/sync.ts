import { restSelect, restUpdate, restUpsert } from "../db/rest.ts";

import { recordBillingCreditGrant, recordBillingGrantReversal, recordRefundCredit } from "./ledger.ts";
import {
    listStripeRefunds,
    retrieveStripeInvoice,
    retrieveStripePaymentIntent,
    retrieveStripeSubscription,
} from "./stripe.ts";
import { parseRefundUsageJobIds, restoreRefundLinkedUsageDebits } from "./usage.ts";

export interface StripeCheckoutSessionObject {
    id: string;
    customer: string | null;
    customer_email?: string | null;
    client_reference_id?: string | null;
    metadata?: Record<string, string | undefined> | null;
}

interface StripePriceObject {
    id?: string;
    currency?: string | null;
    unit_amount?: number | null;
    recurring?: {
        interval?: string | null;
    } | null;
}

interface StripeSubscriptionItemObject {
    quantity?: number | null;
    price?: StripePriceObject | null;
}

export interface StripeSubscriptionObject {
    id: string;
    customer: string | null;
    status: string;
    metadata?: Record<string, string | undefined> | null;
    items?: {
        data?: StripeSubscriptionItemObject[];
    };
    current_period_start?: number | null;
    current_period_end?: number | null;
    trial_end?: number | null;
    cancel_at?: number | null;
    canceled_at?: number | null;
}

interface StripeInvoiceStatusTransitions {
    paid_at?: number | null;
    voided_at?: number | null;
}

interface StripeExpandRef {
    id: string;
}

export interface StripeInvoiceObject {
    id: string;
    customer: string | null;
    subscription?: string | null;
    payment_intent?: string | StripeExpandRef | null;
    status?: string | null;
    number?: string | null;
    currency?: string | null;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    amount_paid?: number | null;
    amount_remaining?: number | null;
    hosted_invoice_url?: string | null;
    created?: number | null;
    due_date?: number | null;
    status_transitions?: StripeInvoiceStatusTransitions | null;
    metadata?: Record<string, string | undefined> | null;
}

interface StripeCardObject {
    brand?: string | null;
    last4?: string | null;
}

interface StripePaymentMethodObject {
    id: string;
    type?: string | null;
    card?: StripeCardObject | null;
}

export interface StripeRefundObject {
    id: string;
    payment_intent?: string | null;
    charge?: string | null;
    amount?: number | null;
    currency?: string | null;
    status?: string | null;
    reason?: string | null;
    metadata?: Record<string, string | undefined> | null;
    created?: number | null;
}

export interface StripeChargeObject {
    id: string;
    created?: number | null;
    amount_refunded?: number | null;
    payment_intent?: string | null;
    payment_method_details?: {
        card?: StripeCardObject | null;
    } | null;
    refunds?: {
        data?: StripeRefundObject[];
    } | null;
}

export interface StripePaymentIntentObject {
    id: string;
    customer: string | null;
    invoice?: string | StripeExpandRef | null;
    status?: string | null;
    amount?: number | null;
    currency?: string | null;
    created?: number | null;
    latest_charge?: string | StripeChargeObject | null;
    payment_method?: string | StripePaymentMethodObject | null;
    charges?: {
        data?: StripeChargeObject[];
    };
}

interface BillingCustomerRow {
    id: string;
    studio_id: string;
    provider_customer_id: string;
    default_payment_method_id: string | null;
}

interface PlanRow {
    id: string;
    code: string;
    name: string;
    interval: "month" | "year" | "custom";
    price_cents: number;
    currency: string;
    monthly_credit_limit: number | null;
}

interface SubscriptionRow {
    id: string;
    studio_id: string;
    plan_id: string;
    status: string;
    plans?: PlanRow | null;
}

interface InvoiceRow {
    id: string;
    studio_id: string;
    subscription_id: string | null;
    provider_invoice_id: string;
    invoice_number: string | null;
    status: string;
    amount_paid_cents: number;
    total_cents: number;
    paid_at: string | null;
}

interface PaymentRow {
    id: string;
    studio_id: string;
    invoice_id: string | null;
    provider_payment_intent_id: string | null;
    status: string;
    amount_cents: number;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
    metadata: Record<string, unknown> | null;
}

interface RefundRow {
    id: string;
    studio_id: string | null;
    payment_id: string;
    amount_cents: number;
    status: string;
}

interface CreditLedgerGrantRow {
    id: string;
    studio_id: string;
    amount: number;
}

function isoFromUnix(value?: number | null) {
    return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function normalizeOptionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function normalizeCurrency(value?: string | null) {
    return (normalizeOptionalText(value) ?? "USD").toUpperCase();
}

function extractExpandedId(value?: string | StripeExpandRef | null) {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

function normalizeSubscriptionStatus(status?: string | null) {
    switch (status) {
        case "trialing":
        case "active":
        case "past_due":
        case "canceled":
        case "paused":
        case "unpaid":
            return status;
        case "incomplete":
        case "incomplete_expired":
            return "incomplete";
        default:
            return "incomplete";
    }
}

function normalizeInvoiceStatus(status?: string | null) {
    switch (status) {
        case "draft":
        case "open":
        case "paid":
        case "void":
        case "uncollectible":
            return status;
        case "voided":
            return "void";
        default:
            return "open";
    }
}

function normalizePaymentStatus(status?: string | null) {
    switch (status) {
        case "succeeded":
            return "succeeded";
        case "requires_payment_method":
        case "canceled":
            return "failed";
        case "processing":
        case "requires_action":
        case "requires_capture":
        case "requires_confirmation":
        case "pending":
            return "pending";
        default:
            return "pending";
    }
}

function normalizeRefundStatus(status?: string | null) {
    switch (status) {
        case "pending":
        case "requires_action":
        case "succeeded":
        case "failed":
        case "canceled":
            return status;
        default:
            return "pending";
    }
}

function extractCardFromCharge(charge?: StripeChargeObject | null) {
    const card = charge?.payment_method_details?.card ?? null;
    return {
        brand: normalizeOptionalText(card?.brand),
        last4: normalizeOptionalText(card?.last4),
        chargeId: normalizeOptionalText(charge?.id),
        chargedAt: isoFromUnix(charge?.created),
    };
}

function extractCardFromPaymentMethod(paymentMethod?: StripePaymentMethodObject | null) {
    const card = paymentMethod?.type === "card" || paymentMethod?.card ? paymentMethod.card ?? null : null;
    return {
        brand: normalizeOptionalText(card?.brand),
        last4: normalizeOptionalText(card?.last4),
        paymentMethodId: normalizeOptionalText(paymentMethod?.id),
    };
}

function extractCardDetails(paymentIntent: StripePaymentIntentObject) {
    const latestCharge =
        paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string" ? paymentIntent.latest_charge : null;
    const paymentMethod =
        paymentIntent.payment_method && typeof paymentIntent.payment_method !== "string" ? paymentIntent.payment_method : null;
    const chargeFromList = paymentIntent.charges?.data?.find((charge) => Boolean(charge?.payment_method_details?.card)) ?? null;

    const fromChargeList = extractCardFromCharge(chargeFromList);
    const fromLatestCharge = extractCardFromCharge(latestCharge);
    const fromPaymentMethod = extractCardFromPaymentMethod(paymentMethod);

    return {
        brand: fromChargeList.brand ?? fromLatestCharge.brand ?? fromPaymentMethod.brand ?? null,
        last4: fromChargeList.last4 ?? fromLatestCharge.last4 ?? fromPaymentMethod.last4 ?? null,
        chargeId: fromChargeList.chargeId ?? fromLatestCharge.chargeId ?? normalizeOptionalText(typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : null),
        chargedAt: fromChargeList.chargedAt ?? fromLatestCharge.chargedAt ?? isoFromUnix(paymentIntent.created),
        paymentMethodId:
            fromPaymentMethod.paymentMethodId ??
            normalizeOptionalText(typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : null),
    };
}

function parseIntegerMetadataValue(metadata: Record<string, string | undefined> | null | undefined, keys: string[]) {
    for (const key of keys) {
        const raw = normalizeOptionalText(metadata?.[key]);
        if (!raw) continue;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return 0;
}

async function resolveBillingCustomerByProviderId(providerCustomerId: string | null | undefined) {
    if (!providerCustomerId) return null;
    const rows = await restSelect<BillingCustomerRow[]>("billing_customers", {
        select: "id,studio_id,provider_customer_id,default_payment_method_id",
        filters: {
            provider_customer_id: `eq.${providerCustomerId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolvePlanByCode(planCode: string | null | undefined) {
    if (!planCode) return null;
    const rows = await restSelect<PlanRow[]>("plans", {
        select: "id,code,name,interval,price_cents,currency,monthly_credit_limit",
        filters: {
            code: `eq.${planCode}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolvePlanByPriceSnapshot(price?: StripePriceObject | null) {
    if (!price?.unit_amount || !price?.currency) return null;
    const recurringInterval = price.recurring?.interval;
    if (recurringInterval !== "month" && recurringInterval !== "year") {
        return null;
    }

    const rows = await restSelect<PlanRow[]>("plans", {
        select: "id,code,name,interval,price_cents,currency,monthly_credit_limit",
        filters: {
            price_cents: `eq.${price.unit_amount}`,
            currency: `eq.${normalizeCurrency(price.currency)}`,
            interval: `eq.${recurringInterval}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveSubscriptionByProviderId(providerSubscriptionId: string | null | undefined) {
    if (!providerSubscriptionId) return null;
    const rows = await restSelect<SubscriptionRow[]>("subscriptions", {
        select: "id,studio_id,plan_id,status,plans(id,code,name,interval,price_cents,currency,monthly_credit_limit)",
        filters: {
            provider_subscription_id: `eq.${providerSubscriptionId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveInvoiceByProviderId(providerInvoiceId: string | null | undefined) {
    if (!providerInvoiceId) return null;
    const rows = await restSelect<InvoiceRow[]>("invoices", {
        select: "id,studio_id,subscription_id,provider_invoice_id,invoice_number,status,amount_paid_cents,total_cents,paid_at",
        filters: {
            provider_invoice_id: `eq.${providerInvoiceId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolvePaymentByProviderId(providerPaymentIntentId: string | null | undefined) {
    if (!providerPaymentIntentId) return null;
    const rows = await restSelect<PaymentRow[]>("payments", {
        select: "id,studio_id,invoice_id,provider_payment_intent_id,status,amount_cents,payment_method_brand,payment_method_last4,metadata",
        filters: {
            provider_payment_intent_id: `eq.${providerPaymentIntentId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveInvoiceById(invoiceId: string | null | undefined) {
    if (!invoiceId) return null;
    const rows = await restSelect<InvoiceRow[]>("invoices", {
        select: "id,studio_id,subscription_id,provider_invoice_id,invoice_number,status,amount_paid_cents,total_cents,paid_at",
        filters: {
            id: `eq.${invoiceId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolvePlanById(planId: string | null | undefined) {
    if (!planId) return null;
    const rows = await restSelect<PlanRow[]>("plans", {
        select: "id,code,name,interval,price_cents,currency,monthly_credit_limit",
        filters: {
            id: `eq.${planId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveRefundByProviderId(providerRefundId: string | null | undefined) {
    if (!providerRefundId) return null;
    const rows = await restSelect<RefundRow[]>("refunds", {
        select: "id,studio_id,payment_id,amount_cents,status",
        filters: {
            provider_refund_id: `eq.${providerRefundId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function ensureSubscriptionForInvoice(providerSubscriptionId: string | null | undefined) {
    if (!providerSubscriptionId) return null;
    const existing = await resolveSubscriptionByProviderId(providerSubscriptionId);
    if (existing) {
        return existing;
    }

    const subscription = await retrieveStripeSubscription<StripeSubscriptionObject>(providerSubscriptionId);
    await syncStripeSubscription(subscription);
    return resolveSubscriptionByProviderId(providerSubscriptionId);
}

async function ensureInvoiceForPayment(providerInvoiceId: string | null | undefined) {
    if (!providerInvoiceId) return null;
    const existing = await resolveInvoiceByProviderId(providerInvoiceId);
    if (existing) {
        return existing;
    }

    const invoice = await retrieveStripeInvoice<StripeInvoiceObject>(providerInvoiceId);
    await syncStripeInvoice(invoice);
    return resolveInvoiceByProviderId(providerInvoiceId);
}

async function ensurePaymentForRefund(providerPaymentIntentId: string | null | undefined) {
    if (!providerPaymentIntentId) return null;
    const existing = await resolvePaymentByProviderId(providerPaymentIntentId);
    if (existing) {
        return existing;
    }

    const paymentIntent = await retrieveStripePaymentIntent<StripePaymentIntentObject>(providerPaymentIntentId, {
        expand: ["latest_charge", "payment_method"],
    });
    await syncStripePaymentIntent(paymentIntent);
    return resolvePaymentByProviderId(providerPaymentIntentId);
}

async function maybeGrantInvoiceCredits(invoice: InvoiceRow) {
    if (invoice.status !== "paid" || !invoice.subscription_id) {
        return null;
    }

    const subscriptionRows = await restSelect<SubscriptionRow[]>("subscriptions", {
        select: "id,studio_id,plan_id,status,plans(id,code,name,interval,price_cents,currency,monthly_credit_limit)",
        filters: {
            id: `eq.${invoice.subscription_id}`,
            limit: "1",
        },
    });
    const subscription = subscriptionRows[0] ?? null;
    const plan = subscription?.plans ?? (subscription?.plan_id ? await resolvePlanById(subscription.plan_id) : null);
    if (!subscription || !plan?.monthly_credit_limit || plan.monthly_credit_limit <= 0) {
        return null;
    }

    return recordBillingCreditGrant({
        studioId: invoice.studio_id,
        invoiceId: invoice.id,
        amount: plan.monthly_credit_limit,
        note: `${plan.name} billing grant from invoice ${invoice.invoice_number ?? invoice.provider_invoice_id}.`,
    });
}

async function resolveInvoiceGrantLedgerEntry(invoiceId: string) {
    const rows = await restSelect<CreditLedgerGrantRow[]>("credit_ledger", {
        select: "id,studio_id,amount",
        filters: {
            entry_type: "eq.grant",
            reference_type: "eq.invoice",
            reference_id: `eq.${invoiceId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function syncPaymentRefundStatus(payment: PaymentRow) {
    const refunds = await restSelect<Array<{ amount_cents: number; status: string }>>("refunds", {
        select: "amount_cents,status",
        filters: {
            payment_id: `eq.${payment.id}`,
        },
    });

    const succeededRefundTotal = refunds
        .filter((refund) => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount_cents, 0);
    const nextStatus = succeededRefundTotal >= payment.amount_cents && payment.amount_cents > 0 ? "refunded" : payment.status;
    if (nextStatus === payment.status) {
        return nextStatus;
    }

    await restUpdate(
        "payments",
        {
            status: nextStatus,
        },
        {
            id: `eq.${payment.id}`,
        },
    );

    return nextStatus;
}

async function maybeReverseFullyRefundedInvoiceGrant({
    payment,
    invoice,
    refund,
}: {
    payment: PaymentRow;
    invoice: InvoiceRow | null;
    refund: RefundRow;
}) {
    if (!invoice) {
        return null;
    }

    const refunds = await restSelect<Array<{ amount_cents: number; status: string }>>("refunds", {
        select: "amount_cents,status",
        filters: {
            payment_id: `eq.${payment.id}`,
        },
    });
    const succeededRefundTotal = refunds
        .filter((entry) => entry.status === "succeeded")
        .reduce((total, entry) => total + entry.amount_cents, 0);
    if (payment.amount_cents <= 0 || succeededRefundTotal < payment.amount_cents) {
        return null;
    }

    const grant = await resolveInvoiceGrantLedgerEntry(invoice.id);
    if (!grant || grant.amount <= 0) {
        return null;
    }

    return recordBillingGrantReversal({
        studioId: payment.studio_id,
        invoiceId: invoice.id,
        amount: grant.amount,
        note: `Invoice grant reversed after full Stripe refund ${refund.id} for ${invoice.invoice_number ?? invoice.provider_invoice_id}.`,
    });
}

function resolveRefundCreditAmount(refund: StripeRefundObject) {
    return parseIntegerMetadataValue(refund.metadata, [
        "credit_amount",
        "credit_delta",
        "credit_ledger_amount",
        "usage_credits_restored",
    ]);
}

async function resolvePlanForSubscription(object: StripeSubscriptionObject) {
    const planFromMetadata = await resolvePlanByCode(object.metadata?.plan_code ?? null);
    if (planFromMetadata) {
        return planFromMetadata;
    }
    return resolvePlanByPriceSnapshot(object.items?.data?.[0]?.price ?? null);
}

export async function syncCheckoutSessionCompleted(object: StripeCheckoutSessionObject) {
    const studioId = object.client_reference_id || object.metadata?.studio_id || null;
    if (!studioId || !object.customer) {
        return null;
    }

    await restUpsert(
        "billing_customers",
        {
            studio_id: studioId,
            provider: "stripe",
            provider_customer_id: object.customer,
        },
        { onConflict: "studio_id" },
    );

    return {
        studioId,
    };
}

export async function syncStripeSubscription(object: StripeSubscriptionObject) {
    const billingCustomer = await resolveBillingCustomerByProviderId(object.customer);
    if (!billingCustomer) {
        return null;
    }

    const existingSubscription = await resolveSubscriptionByProviderId(object.id);
    const plan = await resolvePlanForSubscription(object);
    const planId = plan?.id ?? existingSubscription?.plan_id ?? null;
    if (!planId) {
        return {
            studioId: billingCustomer.studio_id,
            subscriptionId: existingSubscription?.id ?? null,
        };
    }

    const rows = await restUpsert<Array<{ id: string }>>(
        "subscriptions",
        {
            studio_id: billingCustomer.studio_id,
            plan_id: planId,
            billing_customer_id: billingCustomer.id,
            provider_subscription_id: object.id,
            status: normalizeSubscriptionStatus(object.status),
            seat_count: object.items?.data?.[0]?.quantity ?? 1,
            current_period_starts_at: isoFromUnix(object.current_period_start),
            current_period_ends_at: isoFromUnix(object.current_period_end),
            trial_ends_at: isoFromUnix(object.trial_end),
            cancel_at: isoFromUnix(object.cancel_at),
            canceled_at: isoFromUnix(object.canceled_at),
            metadata: object.metadata ?? {},
        },
        { onConflict: "provider_subscription_id" },
    );

    return {
        studioId: billingCustomer.studio_id,
        subscriptionId: rows[0]?.id ?? existingSubscription?.id ?? null,
    };
}

export async function syncStripeInvoice(object: StripeInvoiceObject) {
    const billingCustomer = await resolveBillingCustomerByProviderId(object.customer);
    if (!billingCustomer) {
        return null;
    }

    const existingInvoice = await resolveInvoiceByProviderId(object.id);
    const subscription = await ensureSubscriptionForInvoice(object.subscription ?? null);
    const rows = await restUpsert<Array<{ id: string }>>(
        "invoices",
        {
            studio_id: billingCustomer.studio_id,
            subscription_id: subscription?.id ?? existingInvoice?.subscription_id ?? null,
            provider_invoice_id: object.id,
            invoice_number: object.number ?? existingInvoice?.invoice_number ?? null,
            status: normalizeInvoiceStatus(object.status),
            currency: normalizeCurrency(object.currency),
            subtotal_cents: object.subtotal ?? 0,
            tax_cents: object.tax ?? 0,
            total_cents: object.total ?? 0,
            amount_paid_cents: object.amount_paid ?? 0,
            amount_remaining_cents: object.amount_remaining ?? 0,
            hosted_invoice_url: object.hosted_invoice_url ?? null,
            issued_at: isoFromUnix(object.created),
            due_at: isoFromUnix(object.due_date),
            paid_at: isoFromUnix(object.status_transitions?.paid_at),
            voided_at: isoFromUnix(object.status_transitions?.voided_at),
            metadata: object.metadata ?? {},
        },
        { onConflict: "provider_invoice_id" },
    );

    const invoice = (await resolveInvoiceByProviderId(object.id)) ?? existingInvoice;
    if (invoice) {
        await maybeGrantInvoiceCredits(invoice);
    }

    return {
        studioId: billingCustomer.studio_id,
        invoiceId: rows[0]?.id ?? invoice?.id ?? null,
    };
}

export async function syncStripePaymentIntent(object: StripePaymentIntentObject) {
    let billingCustomer = await resolveBillingCustomerByProviderId(object.customer);
    const providerInvoiceId = extractExpandedId(object.invoice);
    const invoice = await ensureInvoiceForPayment(providerInvoiceId);

    if (!billingCustomer && invoice) {
        billingCustomer = {
            id: "",
            studio_id: invoice.studio_id,
            provider_customer_id: object.customer ?? "",
            default_payment_method_id: null,
        };
    }

    if (!billingCustomer) {
        return null;
    }

    const existingPayment = await resolvePaymentByProviderId(object.id);
    let cardDetails = extractCardDetails(object);
    if ((!cardDetails.brand || !cardDetails.last4) && object.id) {
        try {
            const expandedPaymentIntent = await retrieveStripePaymentIntent<StripePaymentIntentObject>(object.id, {
                expand: ["latest_charge", "payment_method"],
            });
            const expandedCardDetails = extractCardDetails(expandedPaymentIntent);
            cardDetails = {
                brand: expandedCardDetails.brand ?? cardDetails.brand,
                last4: expandedCardDetails.last4 ?? cardDetails.last4,
                chargeId: expandedCardDetails.chargeId ?? cardDetails.chargeId,
                chargedAt: expandedCardDetails.chargedAt ?? cardDetails.chargedAt,
                paymentMethodId: expandedCardDetails.paymentMethodId ?? cardDetails.paymentMethodId,
            };
        } catch {
            // Card-brand enrichment is best-effort; the payment row should still land.
        }
    }

    const paidAt =
        normalizePaymentStatus(object.status) === "succeeded"
            ? invoice?.paid_at ?? cardDetails.chargedAt ?? isoFromUnix(object.created)
            : null;
    const metadata = {
        ...(existingPayment?.metadata ?? {}),
        providerChargeId: cardDetails.chargeId ?? (existingPayment?.metadata?.providerChargeId as string | undefined) ?? null,
        paymentMethodId: cardDetails.paymentMethodId ?? (existingPayment?.metadata?.paymentMethodId as string | undefined) ?? null,
    };

    const rows = await restUpsert<Array<{ id: string }>>(
        "payments",
        {
            studio_id: billingCustomer.studio_id,
            invoice_id: invoice?.id ?? existingPayment?.invoice_id ?? null,
            provider_payment_intent_id: object.id,
            status: normalizePaymentStatus(object.status),
            amount_cents: object.amount ?? existingPayment?.amount_cents ?? 0,
            currency: normalizeCurrency(object.currency),
            payment_method_brand: cardDetails.brand ?? existingPayment?.payment_method_brand ?? null,
            payment_method_last4: cardDetails.last4 ?? existingPayment?.payment_method_last4 ?? null,
            paid_at: paidAt,
            metadata,
        },
        { onConflict: "provider_payment_intent_id" },
    );

    return {
        studioId: billingCustomer.studio_id,
        paymentId: rows[0]?.id ?? existingPayment?.id ?? null,
    };
}

export async function syncStripeRefund(object: StripeRefundObject) {
    const payment = await ensurePaymentForRefund(object.payment_intent ?? null);
    if (!payment) {
        return null;
    }

    const invoice = await resolveInvoiceById(payment.invoice_id);
    const existingRefund = await resolveRefundByProviderId(object.id);
    const rows = await restUpsert<Array<{ id: string }>>(
        "refunds",
        {
            studio_id: payment.studio_id,
            invoice_id: invoice?.id ?? null,
            subscription_id: invoice?.subscription_id ?? null,
            payment_id: payment.id,
            provider_refund_id: object.id,
            provider_payment_intent_id: object.payment_intent ?? payment.provider_payment_intent_id ?? null,
            provider_charge_id: object.charge ?? null,
            amount_cents: object.amount ?? existingRefund?.amount_cents ?? 0,
            currency: normalizeCurrency(object.currency),
            status: normalizeRefundStatus(object.status),
            reason: normalizeOptionalText(object.reason),
            refunded_at: isoFromUnix(object.created),
            metadata: object.metadata ?? {},
        },
        { onConflict: "provider_refund_id" },
    );

    await syncPaymentRefundStatus(payment);

    const refund = (await resolveRefundByProviderId(object.id)) ?? existingRefund;
    const normalizedStatus = normalizeRefundStatus(object.status);
    let grantReversalCreated = false;
    let refundRestorationCreated = false;
    if (refund && payment.studio_id && normalizedStatus === "succeeded") {
        const grantReversal = await maybeReverseFullyRefundedInvoiceGrant({
            payment,
            invoice,
            refund,
        });
        grantReversalCreated = grantReversal?.created ?? false;

        const usageJobIds = parseRefundUsageJobIds(object.metadata);
        if (usageJobIds.length > 0) {
            const restoration = await restoreRefundLinkedUsageDebits({
                refundId: refund.id,
                studioId: payment.studio_id,
                usageJobIds,
            });
            refundRestorationCreated = restoration.ledgerCreated;
        } else {
            const refundCreditAmount = resolveRefundCreditAmount(object);
            if (refundCreditAmount > 0) {
                const refundCredit = await recordRefundCredit({
                    studioId: payment.studio_id,
                    refundId: refund.id,
                    amount: refundCreditAmount,
                    note: `Refund credit restored from Stripe refund ${object.id}.`,
                });
                refundRestorationCreated = refundCredit.created;
            }
        }
    }

    return {
        studioId: payment.studio_id,
        refundId: rows[0]?.id ?? refund?.id ?? null,
        grantReversalCreated,
        refundRestorationCreated,
    };
}

export async function syncStripeRefundsForCharge(charge: StripeChargeObject) {
    const refunds = charge.refunds?.data?.length
        ? charge.refunds.data
        : (
              await listStripeRefunds<StripeRefundObject>({
                  charge: charge.id,
                  limit: 100,
              })
          ).data;

    const affectedStudioIds = new Set<string>();
    for (const refund of refunds) {
        const result = await syncStripeRefund({
            ...refund,
            payment_intent: refund.payment_intent ?? charge.payment_intent ?? null,
            charge: refund.charge ?? charge.id,
        });
        if (result?.studioId) {
            affectedStudioIds.add(result.studioId);
        }
    }

    return {
        studioIds: Array.from(affectedStudioIds),
        refundCount: refunds.length,
    };
}
