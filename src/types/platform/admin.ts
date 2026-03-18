import type { FeatureFlagScope, InvoiceStatus, PaymentStatus, SubscriptionStatus, SupportThreadPriority, SupportThreadStatus } from "./common";

export interface AdminAccountSummary {
    studioId: string;
    studioName: string;
    planCode: string | null;
    subscriptionStatus: SubscriptionStatus | null;
    seatsUsed: number;
    seatsLimit: number | null;
    pendingInvitations: number;
    openSupportThreads: number;
    delinquentInvoiceCount: number;
    latestInvoiceStatus: InvoiceStatus | null;
    latestPaymentStatus: PaymentStatus | null;
    prioritySupportEnabled: boolean;
    mvpAccessEnabled: boolean;
    creditBalance: number | null;
}

export interface AdminBillingAlert {
    studioId: string;
    studioName: string;
    invoiceId: string;
    invoiceStatus: InvoiceStatus;
    amountRemainingCents: number;
    currency: string;
    dueAt: string | null;
}

export interface AdminSupportQueueItem {
    threadId: string;
    studioId: string;
    studioName: string;
    projectId: string | null;
    projectName: string | null;
    subject: string;
    status: SupportThreadStatus;
    priority: SupportThreadPriority;
    assignedAdminUserId: string | null;
    latestMessageAt: string | null;
    latestMessagePreview: string | null;
    createdAt: string;
    messageCount: number;
}

export interface AdminFeatureFlagAssignment {
    assignmentId: string;
    flagKey: string;
    scopeType: FeatureFlagScope;
    studioId: string | null;
    studioName: string | null;
    userId: string | null;
    userEmail: string | null;
    enabled: boolean;
    config: Record<string, unknown>;
    createdAt: string;
}

export interface AdminAccountFlagAssignment {
    assignmentId: string;
    flagKey: string;
    studioId: string | null;
    studioName: string | null;
    userId: string | null;
    userEmail: string | null;
    flagValue: unknown;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
}

export interface AdminNote {
    noteId: string;
    studioId: string | null;
    userId: string | null;
    projectId: string | null;
    authorUserId: string;
    authorEmail: string | null;
    body: string;
    visibility: "internal" | "finance";
    createdAt: string;
}

export interface AdminStudioDetail {
    account: AdminAccountSummary | null;
    recentInvoices: Array<{
        invoiceId: string;
        status: InvoiceStatus;
        currency: string;
        totalCents: number;
        amountRemainingCents: number;
        dueAt: string | null;
        paidAt: string | null;
    }>;
    recentPayments: Array<{
        paymentId: string;
        status: PaymentStatus;
        currency: string;
        amountCents: number;
        paidAt: string | null;
    }>;
    supportThreads: AdminSupportQueueItem[];
    featureFlags: AdminFeatureFlagAssignment[];
    accountFlags: AdminAccountFlagAssignment[];
    notes: AdminNote[];
    recentAuditEvents: Array<{
        eventId: string;
        eventType: string;
        summary: string;
        createdAt: string;
    }>;
}

export interface AdminOperationsSnapshot {
    accounts: AdminAccountSummary[];
    billingAlerts: AdminBillingAlert[];
    supportQueue: AdminSupportQueueItem[];
}
