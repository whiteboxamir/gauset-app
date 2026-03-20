import type {
    CreditEntryType,
    InvoiceStatus,
    PaymentStatus,
    PlanInterval,
    SubscriptionStatus,
} from "./common";

export interface BillingPlanSummary {
    id: string;
    code: string;
    name: string;
    description: string | null;
    billingProvider: "stripe" | "manual";
    interval: PlanInterval;
    priceCents: number;
    currency: string;
    seatLimit: number | null;
    worldLimit: number | null;
    monthlyCreditLimit: number | null;
    isDesignPartner: boolean;
}

export interface SubscriptionSummary {
    id: string;
    status: SubscriptionStatus;
    plan: BillingPlanSummary;
    seatCount: number;
    currentPeriodStartsAt: string | null;
    currentPeriodEndsAt: string | null;
    trialEndsAt: string | null;
    cancelAt: string | null;
    canceledAt: string | null;
}

export interface InvoiceSummary {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    currency: string;
    totalCents: number;
    amountPaidCents: number;
    amountRemainingCents: number;
    hostedInvoiceUrl: string | null;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
}

export interface PaymentSummary {
    id: string;
    status: PaymentStatus;
    amountCents: number;
    currency: string;
    paymentMethodBrand: string | null;
    paymentMethodLast4: string | null;
    paidAt: string | null;
}

export interface CreditLedgerEntry {
    id: string;
    entryType: CreditEntryType;
    amount: number;
    balanceAfter: number | null;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
    createdAt: string;
}

export interface EntitlementSnapshot {
    canAccessMvp: boolean;
    canInviteSeats: boolean;
    canUseAdminConsole: boolean;
    canUsePrioritySupport: boolean;
    seatLimit: number | null;
    seatsUsed: number;
    projectLimit: number | null;
    worldLimit: number | null;
    storageBytesLimit: number | null;
    monthlyCreditsIncluded: number | null;
    monthlyCreditsRemaining: number | null;
}

export interface BillingSummary {
    plan: BillingPlanSummary | null;
    subscription: SubscriptionSummary | null;
    latestInvoice: InvoiceSummary | null;
    recentInvoices: InvoiceSummary[];
    recentPayments: PaymentSummary[];
    creditLedger: CreditLedgerEntry[];
    entitlements: EntitlementSnapshot;
}

export interface BillingOverview {
    summary: BillingSummary;
    availablePlans: BillingPlanSummary[];
    portalReady: boolean;
    stripeConfigured: boolean;
}
