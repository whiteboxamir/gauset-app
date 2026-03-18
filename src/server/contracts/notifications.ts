import { z } from "zod";

export const notificationDomainValues = ["workspace", "billing", "team", "support", "projects", "governance", "coverage"] as const;
export const notificationSeverityValues = ["info", "warning", "urgent"] as const;
export const notificationDeliveryStateValues = ["pending", "delivered", "acknowledged", "dismissed"] as const;
export const notificationDigestCadenceValues = ["daily", "weekly"] as const;

export const notificationDomainSchema = z.enum(notificationDomainValues);
export const notificationSeveritySchema = z.enum(notificationSeverityValues);
export const notificationDeliveryStateSchema = z.enum(notificationDeliveryStateValues);
export const notificationDigestCadenceSchema = z.enum(notificationDigestCadenceValues);

export const notificationPreferencesSchema = z.object({
    inAppEnabled: z.boolean(),
    digestEnabled: z.boolean(),
    digestCadence: notificationDigestCadenceSchema,
    digestHourUtc: z.number().int().min(0).max(23),
    digestWeekday: z.number().int().min(0).max(6),
});

export const notificationSubscriptionSchema = z.object({
    subscriptionId: z.string().min(1),
    studioId: z.string().uuid().nullable(),
    userId: z.string().uuid(),
    domain: notificationDomainSchema,
    following: z.boolean(),
    inherited: z.boolean(),
    audienceLabel: z.string().min(1),
    reason: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
});

export const notificationSignalSchema = z.object({
    signalId: z.string().uuid(),
    signalKey: z.string().min(1),
    studioId: z.string().uuid(),
    domain: notificationDomainSchema,
    severity: notificationSeveritySchema,
    sourceType: z.string().min(1),
    sourceId: z.string().min(1).nullable(),
    title: z.string().min(1),
    body: z.string().min(1),
    href: z.string().min(1),
    audienceLabel: z.string().min(1),
    why: z.string().min(1),
    resolvedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
});

export const notificationDeliverySchema = z.object({
    deliveryId: z.string().uuid(),
    userId: z.string().uuid(),
    state: notificationDeliveryStateSchema,
    stateChangedAt: z.string().datetime({ offset: true }),
    deliveredAt: z.string().datetime({ offset: true }).nullable(),
    acknowledgedAt: z.string().datetime({ offset: true }).nullable(),
    dismissedAt: z.string().datetime({ offset: true }).nullable(),
    deliveryReason: z.string().min(1),
    isUnread: z.boolean(),
    isDigestCandidate: z.boolean(),
    signal: notificationSignalSchema,
});

export const notificationDigestSummarySchema = z.object({
    cadence: notificationDigestCadenceSchema,
    scheduledForLabel: z.string().min(1),
    items: z.array(notificationDeliverySchema),
    domainCounts: z.array(
        z.object({
            domain: notificationDomainSchema,
            count: z.number().int().nonnegative(),
            urgentCount: z.number().int().nonnegative(),
        }),
    ),
});

export const notificationShellSummarySchema = z.object({
    workspaceId: z.string().uuid().nullable(),
    generatedAt: z.string().datetime({ offset: true }),
    syncedAt: z.string().datetime({ offset: true }).nullable(),
    stale: z.boolean(),
    unreadCount: z.number().int().nonnegative(),
    items: z.array(notificationDeliverySchema),
});

export const notificationFeedSnapshotSchema = z.object({
    workspaceId: z.string().uuid().nullable(),
    generatedAt: z.string().datetime({ offset: true }),
    unreadCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    acknowledgedCount: z.number().int().nonnegative(),
    dismissedCount: z.number().int().nonnegative(),
    subscriptions: z.array(notificationSubscriptionSchema),
    items: z.array(notificationDeliverySchema),
    digest: notificationDigestSummarySchema,
});

export type NotificationDomain = z.infer<typeof notificationDomainSchema>;
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export type NotificationDeliveryState = z.infer<typeof notificationDeliveryStateSchema>;
export type NotificationDigestCadence = z.infer<typeof notificationDigestCadenceSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationSubscription = z.infer<typeof notificationSubscriptionSchema>;
export type NotificationSignal = z.infer<typeof notificationSignalSchema>;
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;
export type NotificationDigestSummary = z.infer<typeof notificationDigestSummarySchema>;
export type NotificationShellSummary = z.infer<typeof notificationShellSummarySchema>;
export type NotificationFeedSnapshot = z.infer<typeof notificationFeedSnapshotSchema>;
