export const studioRoleValues = ["owner", "admin", "member", "finance"] as const;
export type StudioRole = (typeof studioRoleValues)[number];

export const studioMembershipStatusValues = ["active", "invited", "suspended"] as const;
export type StudioMembershipStatus = (typeof studioMembershipStatusValues)[number];

export const inviteStatusValues = ["pending", "accepted", "revoked", "expired"] as const;
export type InviteStatus = (typeof inviteStatusValues)[number];

export const planIntervalValues = ["month", "year", "custom"] as const;
export type PlanInterval = (typeof planIntervalValues)[number];

export const subscriptionStatusValues = [
    "trialing",
    "active",
    "past_due",
    "canceled",
    "paused",
    "incomplete",
    "unpaid",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const invoiceStatusValues = ["draft", "open", "paid", "void", "uncollectible"] as const;
export type InvoiceStatus = (typeof invoiceStatusValues)[number];

export const paymentStatusValues = ["pending", "succeeded", "failed", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const refundStatusValues = ["pending", "requires_action", "succeeded", "failed", "canceled"] as const;
export type RefundStatus = (typeof refundStatusValues)[number];

export const creditEntryTypeValues = ["grant", "usage", "adjustment", "refund", "expiration", "reversal"] as const;
export type CreditEntryType = (typeof creditEntryTypeValues)[number];

export const projectStatusValues = ["draft", "active", "archived"] as const;
export type ProjectStatus = (typeof projectStatusValues)[number];

export const projectMembershipRoleValues = ["owner", "editor", "reviewer", "finance", "viewer"] as const;
export type ProjectMembershipRole = (typeof projectMembershipRoleValues)[number];

export const reviewShareStatusValues = ["active", "revoked", "expired"] as const;
export type ReviewShareStatus = (typeof reviewShareStatusValues)[number];

export const reviewShareEventTypeValues = ["created", "copied", "opened", "accessed", "revoked", "expired", "failed_access"] as const;
export type ReviewShareEventType = (typeof reviewShareEventTypeValues)[number];

export const reviewShareDeliveryModeValues = ["secure_link", "manual"] as const;
export type ReviewShareDeliveryMode = (typeof reviewShareDeliveryModeValues)[number];

export const supportThreadStatusValues = ["open", "pending", "resolved", "closed"] as const;
export type SupportThreadStatus = (typeof supportThreadStatusValues)[number];

export const supportThreadPriorityValues = ["low", "normal", "high", "urgent"] as const;
export type SupportThreadPriority = (typeof supportThreadPriorityValues)[number];

export const featureFlagScopeValues = ["global", "studio", "user"] as const;
export type FeatureFlagScope = (typeof featureFlagScopeValues)[number];

export interface TimestampedRecord {
    createdAt: string;
    updatedAt: string;
}

export interface EntityReference {
    id: string;
    label: string;
}
