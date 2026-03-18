import type {
    CreditEntryType,
    FeatureFlagScope,
    InviteStatus,
    InvoiceStatus,
    PaymentStatus,
    PlanInterval,
    ProjectMembershipRole,
    ProjectStatus,
    StudioMembershipStatus,
    StudioRole,
    SubscriptionStatus,
    SupportThreadPriority,
    SupportThreadStatus,
} from "@/types/platform/common";

export type PlatformId = string;

export type PlatformTableName =
    | "profiles"
    | "studios"
    | "studio_governance_policies"
    | "studio_coordination_items"
    | "studio_operator_coverage"
    | "studio_memberships"
    | "studio_invitations"
    | "studio_approval_requests"
    | "studio_access_reviews"
    | "studio_access_review_entries"
    | "billing_contacts"
    | "billing_customers"
    | "plans"
    | "subscriptions"
    | "invoices"
    | "payments"
    | "refunds"
    | "usage_events"
    | "credit_ledger"
    | "projects"
    | "project_memberships"
    | "project_world_links"
    | "project_activity_events"
    | "support_threads"
    | "support_messages"
    | "feature_flags"
    | "audit_events";

export interface PlatformDatabaseConfig {
    supabaseUrl: string | null;
    supabaseAnonKey: string | null;
    supabaseServiceRoleKey: string | null;
    databaseUrl: string | null;
    adminDatabaseUrl: string | null;
}

export interface PlatformStatusCatalog {
    studioRole: StudioRole;
    studioMembershipStatus: StudioMembershipStatus;
    inviteStatus: InviteStatus;
    planInterval: PlanInterval;
    subscriptionStatus: SubscriptionStatus;
    invoiceStatus: InvoiceStatus;
    paymentStatus: PaymentStatus;
    creditEntryType: CreditEntryType;
    projectStatus: ProjectStatus;
    projectMembershipRole: ProjectMembershipRole;
    supportThreadStatus: SupportThreadStatus;
    supportThreadPriority: SupportThreadPriority;
    featureFlagScope: FeatureFlagScope;
}
