import { z } from "zod";

import {
    creditEntryTypeValues,
    invoiceStatusValues,
    paymentStatusValues,
    planIntervalValues,
    refundStatusValues,
    subscriptionStatusValues,
} from "@/types/platform/common";

export const billingPlanSchema = z.object({
    id: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1).nullable(),
    billingProvider: z.enum(["stripe", "manual"]),
    interval: z.enum(planIntervalValues),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    seatLimit: z.number().int().positive().nullable(),
    worldLimit: z.number().int().positive().nullable(),
    monthlyCreditLimit: z.number().int().nonnegative().nullable(),
    isDesignPartner: z.boolean(),
});

export const subscriptionSummarySchema = z.object({
    id: z.string().uuid(),
    status: z.enum(subscriptionStatusValues),
    plan: billingPlanSchema,
    seatCount: z.number().int().nonnegative(),
    currentPeriodStartsAt: z.string().datetime({ offset: true }).nullable(),
    currentPeriodEndsAt: z.string().datetime({ offset: true }).nullable(),
    trialEndsAt: z.string().datetime({ offset: true }).nullable(),
    cancelAt: z.string().datetime({ offset: true }).nullable(),
    canceledAt: z.string().datetime({ offset: true }).nullable(),
});

export const invoiceSummarySchema = z.object({
    id: z.string().uuid(),
    number: z.string().min(1).nullable(),
    status: z.enum(invoiceStatusValues),
    currency: z.string().length(3),
    totalCents: z.number().int(),
    amountPaidCents: z.number().int(),
    amountRemainingCents: z.number().int(),
    hostedInvoiceUrl: z.string().url().nullable(),
    issuedAt: z.string().datetime({ offset: true }).nullable(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    paidAt: z.string().datetime({ offset: true }).nullable(),
});

export const paymentSummarySchema = z.object({
    id: z.string().uuid(),
    status: z.enum(paymentStatusValues),
    amountCents: z.number().int(),
    currency: z.string().length(3),
    paymentMethodBrand: z.string().min(1).nullable(),
    paymentMethodLast4: z.string().length(4).nullable(),
    paidAt: z.string().datetime({ offset: true }).nullable(),
});

export const refundSummarySchema = z.object({
    id: z.string().uuid(),
    paymentId: z.string().uuid(),
    invoiceId: z.string().uuid().nullable(),
    subscriptionId: z.string().uuid().nullable(),
    providerRefundId: z.string().min(1).nullable(),
    status: z.enum(refundStatusValues),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    reason: z.string().min(1).nullable(),
    refundedAt: z.string().datetime({ offset: true }).nullable(),
});

export const creditLedgerEntrySchema = z.object({
    id: z.string().uuid(),
    entryType: z.enum(creditEntryTypeValues),
    amount: z.number().int(),
    balanceAfter: z.number().int().nullable(),
    referenceType: z.string().min(1).nullable(),
    referenceId: z.string().uuid().nullable(),
    note: z.string().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
});

export const entitlementSummarySchema = z.object({
    canAccessMvp: z.boolean(),
    canInviteSeats: z.boolean(),
    canUseAdminConsole: z.boolean(),
    canUsePrioritySupport: z.boolean(),
    seatLimit: z.number().int().positive().nullable(),
    seatsUsed: z.number().int().nonnegative(),
    projectLimit: z.number().int().positive().nullable(),
    worldLimit: z.number().int().positive().nullable(),
    storageBytesLimit: z.number().int().positive().nullable(),
    monthlyCreditsIncluded: z.number().int().nonnegative().nullable(),
    monthlyCreditsRemaining: z.number().int().nonnegative().nullable(),
});

export const billingSummarySchema = z.object({
    plan: billingPlanSchema.nullable(),
    subscription: subscriptionSummarySchema.nullable(),
    latestInvoice: invoiceSummarySchema.nullable(),
    recentInvoices: z.array(invoiceSummarySchema),
    recentPayments: z.array(paymentSummarySchema),
    recentRefunds: z.array(refundSummarySchema),
    creditLedger: z.array(creditLedgerEntrySchema),
    entitlements: entitlementSummarySchema,
});

export const billingOverviewSchema = z.object({
    summary: billingSummarySchema,
    availablePlans: z.array(billingPlanSchema),
    portalReady: z.boolean(),
    stripeConfigured: z.boolean(),
});

export type BillingPlanSummary = z.infer<typeof billingPlanSchema>;
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;
export type RefundSummary = z.infer<typeof refundSummarySchema>;
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;
export type EntitlementSummary = z.infer<typeof entitlementSummarySchema>;
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export type BillingOverview = z.infer<typeof billingOverviewSchema>;
