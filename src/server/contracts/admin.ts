import { z } from "zod";

import { featureFlagScopeValues, invoiceStatusValues, paymentStatusValues, subscriptionStatusValues, supportThreadPriorityValues, supportThreadStatusValues } from "@/types/platform/common";

export const adminAccountSummarySchema = z.object({
    studioId: z.string().uuid(),
    studioName: z.string().min(1),
    planCode: z.string().min(1).nullable(),
    subscriptionStatus: z.enum(subscriptionStatusValues).nullable(),
    seatsUsed: z.number().int().nonnegative(),
    seatsLimit: z.number().int().positive().nullable(),
    pendingInvitations: z.number().int().nonnegative(),
    openSupportThreads: z.number().int().nonnegative(),
    delinquentInvoiceCount: z.number().int().nonnegative(),
    latestInvoiceStatus: z.enum(invoiceStatusValues).nullable(),
    latestPaymentStatus: z.enum(paymentStatusValues).nullable(),
    prioritySupportEnabled: z.boolean(),
    mvpAccessEnabled: z.boolean(),
    creditBalance: z.number().int().nullable(),
});

export const adminBillingAlertSchema = z.object({
    studioId: z.string().uuid(),
    studioName: z.string().min(1),
    invoiceId: z.string().uuid(),
    invoiceStatus: z.enum(invoiceStatusValues),
    amountRemainingCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    dueAt: z.string().datetime({ offset: true }).nullable(),
});

export const adminSupportQueueItemSchema = z.object({
    threadId: z.string().uuid(),
    studioId: z.string().uuid(),
    studioName: z.string().min(1),
    projectId: z.string().uuid().nullable(),
    projectName: z.string().min(1).nullable(),
    subject: z.string().min(1),
    status: z.enum(supportThreadStatusValues),
    priority: z.enum(supportThreadPriorityValues),
    assignedAdminUserId: z.string().uuid().nullable(),
    latestMessageAt: z.string().datetime({ offset: true }).nullable(),
    latestMessagePreview: z.string().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    messageCount: z.number().int().nonnegative(),
});

export const adminFeatureFlagAssignmentSchema = z.object({
    assignmentId: z.string().uuid(),
    flagKey: z.string().min(1),
    scopeType: z.enum(featureFlagScopeValues),
    studioId: z.string().uuid().nullable(),
    studioName: z.string().min(1).nullable(),
    userId: z.string().uuid().nullable(),
    userEmail: z.string().email().nullable(),
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime({ offset: true }),
});

export const adminAccountFlagAssignmentSchema = z.object({
    assignmentId: z.string().uuid(),
    flagKey: z.string().min(1),
    studioId: z.string().uuid().nullable(),
    studioName: z.string().min(1).nullable(),
    userId: z.string().uuid().nullable(),
    userEmail: z.string().email().nullable(),
    flagValue: z.unknown(),
    reason: z.string().min(1).nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
});

export const adminNoteSchema = z.object({
    noteId: z.string().uuid(),
    studioId: z.string().uuid().nullable(),
    userId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
    authorUserId: z.string().uuid(),
    authorEmail: z.string().email().nullable(),
    body: z.string().min(1),
    visibility: z.enum(["internal", "finance"]),
    createdAt: z.string().datetime({ offset: true }),
});

export const adminStudioDetailSchema = z.object({
    account: adminAccountSummarySchema.nullable(),
    recentInvoices: z.array(
        z.object({
            invoiceId: z.string().uuid(),
            status: z.enum(invoiceStatusValues),
            currency: z.string().length(3),
            totalCents: z.number().int(),
            amountRemainingCents: z.number().int(),
            dueAt: z.string().datetime({ offset: true }).nullable(),
            paidAt: z.string().datetime({ offset: true }).nullable(),
        }),
    ),
    recentPayments: z.array(
        z.object({
            paymentId: z.string().uuid(),
            status: z.enum(paymentStatusValues),
            currency: z.string().length(3),
            amountCents: z.number().int(),
            paidAt: z.string().datetime({ offset: true }).nullable(),
        }),
    ),
    supportThreads: z.array(adminSupportQueueItemSchema),
    featureFlags: z.array(adminFeatureFlagAssignmentSchema),
    accountFlags: z.array(adminAccountFlagAssignmentSchema),
    notes: z.array(adminNoteSchema),
    recentAuditEvents: z.array(
        z.object({
            eventId: z.string().uuid(),
            eventType: z.string().min(1),
            summary: z.string().min(1),
            createdAt: z.string().datetime({ offset: true }),
        }),
    ),
});

export const adminOperationsSnapshotSchema = z.object({
    accounts: z.array(adminAccountSummarySchema),
    billingAlerts: z.array(adminBillingAlertSchema),
    supportQueue: z.array(adminSupportQueueItemSchema),
});

export type AdminAccountSummary = z.infer<typeof adminAccountSummarySchema>;
export type AdminBillingAlert = z.infer<typeof adminBillingAlertSchema>;
export type AdminSupportQueueItem = z.infer<typeof adminSupportQueueItemSchema>;
export type AdminFeatureFlagAssignment = z.infer<typeof adminFeatureFlagAssignmentSchema>;
export type AdminAccountFlagAssignment = z.infer<typeof adminAccountFlagAssignmentSchema>;
export type AdminNote = z.infer<typeof adminNoteSchema>;
export type AdminStudioDetail = z.infer<typeof adminStudioDetailSchema>;
export type AdminOperationsSnapshot = z.infer<typeof adminOperationsSnapshotSchema>;
