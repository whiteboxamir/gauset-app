import type {
    BillingOverview,
    BillingPlanSummary,
    BillingSummary,
    CreditLedgerEntry,
    InvoiceSummary,
    PaymentSummary,
    RefundSummary,
    SubscriptionSummary,
} from "@/server/contracts/billing";
import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";

import { getBillingConfig, isStripeConfigured } from "./config";
import { mergeBillingSurfacePlans } from "./surface";

interface PlanRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    billing_provider: "stripe" | "manual";
    interval: "month" | "year" | "custom";
    price_cents: number;
    currency: string;
    seat_limit: number | null;
    world_limit: number | null;
    monthly_credit_limit: number | null;
    is_public: boolean;
    is_active: boolean;
    features: Record<string, unknown> | null;
}

interface SubscriptionRow {
    id: string;
    status: SubscriptionSummary["status"];
    seat_count: number;
    current_period_starts_at: string | null;
    current_period_ends_at: string | null;
    trial_ends_at: string | null;
    cancel_at: string | null;
    canceled_at: string | null;
    plans?: PlanRow | null;
}

interface InvoiceRow {
    id: string;
    invoice_number: string | null;
    status: InvoiceSummary["status"];
    currency: string;
    total_cents: number;
    amount_paid_cents: number;
    amount_remaining_cents: number;
    hosted_invoice_url: string | null;
    issued_at: string | null;
    due_at: string | null;
    paid_at: string | null;
}

interface PaymentRow {
    id: string;
    status: PaymentSummary["status"];
    amount_cents: number;
    currency: string;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
    paid_at: string | null;
}

interface RefundRow {
    id: string;
    payment_id: string;
    invoice_id: string | null;
    subscription_id: string | null;
    provider_refund_id: string | null;
    status: RefundSummary["status"];
    amount_cents: number;
    currency: string;
    reason: string | null;
    refunded_at: string | null;
}

interface CreditLedgerRow {
    id: string;
    entry_type: CreditLedgerEntry["entryType"];
    amount: number;
    balance_after: number | null;
    reference_type: string | null;
    reference_id: string | null;
    note: string | null;
    created_at: string;
}

interface BillingCustomerRow {
    id: string;
    provider_customer_id: string;
}

interface MembershipRow {
    id: string;
}

function mapPlan(row: PlanRow): BillingPlanSummary {
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        billingProvider: row.billing_provider,
        interval: row.interval,
        priceCents: row.price_cents,
        currency: row.currency,
        seatLimit: row.seat_limit,
        worldLimit: row.world_limit,
        monthlyCreditLimit: row.monthly_credit_limit,
        isDesignPartner: row.code === "design_partner_beta",
    };
}

function mapSubscription(row: SubscriptionRow | null): SubscriptionSummary | null {
    if (!row || !row.plans) return null;
    return {
        id: row.id,
        status: row.status,
        plan: mapPlan(row.plans),
        seatCount: row.seat_count,
        currentPeriodStartsAt: row.current_period_starts_at,
        currentPeriodEndsAt: row.current_period_ends_at,
        trialEndsAt: row.trial_ends_at,
        cancelAt: row.cancel_at,
        canceledAt: row.canceled_at,
    };
}

function mapInvoices(rows: InvoiceRow[]): InvoiceSummary[] {
    return rows.map((row) => ({
        id: row.id,
        number: row.invoice_number,
        status: row.status,
        currency: row.currency,
        totalCents: row.total_cents,
        amountPaidCents: row.amount_paid_cents,
        amountRemainingCents: row.amount_remaining_cents,
        hostedInvoiceUrl: row.hosted_invoice_url,
        issuedAt: row.issued_at,
        dueAt: row.due_at,
        paidAt: row.paid_at,
    }));
}

function mapPayments(rows: PaymentRow[]): PaymentSummary[] {
    return rows.map((row) => ({
        id: row.id,
        status: row.status,
        amountCents: row.amount_cents,
        currency: row.currency,
        paymentMethodBrand: row.payment_method_brand,
        paymentMethodLast4: row.payment_method_last4,
        paidAt: row.paid_at,
    }));
}

function mapRefunds(rows: RefundRow[]): RefundSummary[] {
    return rows.map((row) => ({
        id: row.id,
        paymentId: row.payment_id,
        invoiceId: row.invoice_id,
        subscriptionId: row.subscription_id,
        providerRefundId: row.provider_refund_id,
        status: row.status,
        amountCents: row.amount_cents,
        currency: row.currency,
        reason: row.reason,
        refundedAt: row.refunded_at,
    }));
}

function mapCredits(rows: CreditLedgerRow[]): CreditLedgerEntry[] {
    return rows.map((row) => ({
        id: row.id,
        entryType: row.entry_type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        note: row.note,
        createdAt: row.created_at,
    }));
}

function createEmptySummary(): BillingSummary {
    return {
        plan: null,
        subscription: null,
        latestInvoice: null,
        recentInvoices: [],
        recentPayments: [],
        recentRefunds: [],
        creditLedger: [],
        entitlements: {
            canAccessMvp: false,
            canInviteSeats: false,
            canUseAdminConsole: false,
            canUsePrioritySupport: false,
            seatLimit: null,
            seatsUsed: 0,
            projectLimit: null,
            worldLimit: null,
            storageBytesLimit: null,
            monthlyCreditsIncluded: null,
            monthlyCreditsRemaining: null,
        },
    };
}

function deriveMonthlyCreditsRemaining(creditLedger: CreditLedgerEntry[], monthlyCreditLimit: number | null) {
    const latestBalance = creditLedger.find((entry) => entry.balanceAfter !== null)?.balanceAfter ?? null;
    if (latestBalance !== null) {
        return Math.max(0, latestBalance);
    }
    return monthlyCreditLimit;
}

export async function getBillingOverviewForSession(session: AuthSession): Promise<BillingOverview> {
    const stripeConfigured = isStripeConfigured();
    const activeStudioId = session.activeStudioId;
    const config = getBillingConfig();

    if (!activeStudioId || !isPlatformDatabaseConfigured()) {
        return {
            summary: createEmptySummary(),
            availablePlans: [],
            portalReady: false,
            stripeConfigured,
        };
    }

    const [subscriptions, invoices, payments, refunds, credits, publicPlans, designPartnerPlans, billingCustomers, memberships] = await Promise.all([
        restSelect<SubscriptionRow[]>("subscriptions", {
            select:
                "id,status,seat_count,current_period_starts_at,current_period_ends_at,trial_ends_at,cancel_at,canceled_at,plans(id,code,name,description,billing_provider,interval,price_cents,currency,seat_limit,world_limit,monthly_credit_limit,is_public,is_active,features)",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "created_at.desc",
                limit: "1",
            },
        }),
        restSelect<InvoiceRow[]>("invoices", {
            select: "id,invoice_number,status,currency,total_cents,amount_paid_cents,amount_remaining_cents,hosted_invoice_url,issued_at,due_at,paid_at",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "issued_at.desc.nullslast",
                limit: "6",
            },
        }),
        restSelect<PaymentRow[]>("payments", {
            select: "id,status,amount_cents,currency,payment_method_brand,payment_method_last4,paid_at",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "paid_at.desc.nullslast",
                limit: "6",
            },
        }),
        restSelect<RefundRow[]>("refunds", {
            select: "id,payment_id,invoice_id,subscription_id,provider_refund_id,status,amount_cents,currency,reason,refunded_at",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "refunded_at.desc.nullslast",
                limit: "6",
            },
        }),
        restSelect<CreditLedgerRow[]>("credit_ledger", {
            select: "id,entry_type,amount,balance_after,reference_type,reference_id,note,created_at",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                order: "created_at.desc",
                limit: "12",
            },
        }),
        restSelect<PlanRow[]>("plans", {
            select: "id,code,name,description,billing_provider,interval,price_cents,currency,seat_limit,world_limit,monthly_credit_limit,is_public,is_active,features",
            filters: {
                is_public: "eq.true",
                is_active: "eq.true",
                order: "price_cents.asc",
            },
        }),
        restSelect<PlanRow[]>("plans", {
            select: "id,code,name,description,billing_provider,interval,price_cents,currency,seat_limit,world_limit,monthly_credit_limit,is_public,is_active,features",
            filters: {
                code: "eq.design_partner_beta",
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
        restSelect<MembershipRow[]>("studio_memberships", {
            select: "id",
            filters: {
                studio_id: `eq.${activeStudioId}`,
                status: "eq.active",
            },
        }),
    ]);

    const subscription = mapSubscription(subscriptions[0] ?? null);
    const recentInvoices = mapInvoices(invoices);
    const recentPayments = mapPayments(payments);
    const recentRefunds = mapRefunds(refunds);
    const creditLedger = mapCredits(credits);
    const plan = subscription?.plan ?? null;
    const features = (subscriptions[0]?.plans?.features ?? {}) as Record<string, unknown>;
    const seatsUsed = memberships.length;
    const monthlyCreditsRemaining = deriveMonthlyCreditsRemaining(creditLedger, plan?.monthlyCreditLimit ?? null);
    const availablePlans = mergeBillingSurfacePlans(publicPlans.map(mapPlan), [
        designPartnerPlans[0] ? mapPlan(designPartnerPlans[0]) : null,
        plan,
    ]);

    return {
        summary: {
            plan,
            subscription,
            latestInvoice: recentInvoices[0] ?? null,
            recentInvoices,
            recentPayments,
            recentRefunds,
            creditLedger,
            entitlements: {
                canAccessMvp: Boolean(features.mvpAccess),
                canInviteSeats: session.studios.some(
                    (studio) => studio.studioId === activeStudioId && (studio.role === "owner" || studio.role === "admin"),
                ),
                canUseAdminConsole: Boolean(features.adminConsole),
                canUsePrioritySupport: Boolean(features.prioritySupport),
                seatLimit: plan?.seatLimit ?? null,
                seatsUsed,
                projectLimit: null,
                worldLimit: plan?.worldLimit ?? null,
                storageBytesLimit: null,
                monthlyCreditsIncluded: plan?.monthlyCreditLimit ?? null,
                monthlyCreditsRemaining,
            },
        },
        availablePlans,
        portalReady: Boolean(billingCustomers[0]?.provider_customer_id) && stripeConfigured,
        stripeConfigured: Boolean(config.stripeSecretKey),
    };
}
