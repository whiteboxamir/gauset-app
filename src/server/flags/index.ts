export const featureFlagKeys = [
    "design_partner_dashboard",
    "billing_center",
    "team_management",
    "admin_console",
    "support_inbox",
    "mvp_access",
    "priority_support",
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];

export interface FeatureFlagDefinition {
    key: FeatureFlagKey;
    title: string;
    description: string;
    defaultEnabled: boolean;
    owner: "platform" | "billing" | "support" | "product";
    stage: "foundation" | "beta" | "internal";
}

export const featureFlagCatalog: Record<FeatureFlagKey, FeatureFlagDefinition> = {
    design_partner_dashboard: {
        key: "design_partner_dashboard",
        title: "Design Partner Dashboard",
        description: "Enables the premium dashboard shell and design-partner widgets.",
        defaultEnabled: false,
        owner: "platform",
        stage: "foundation",
    },
    billing_center: {
        key: "billing_center",
        title: "Billing Center",
        description: "Enables invoices, payments, plans, and Stripe customer access.",
        defaultEnabled: false,
        owner: "billing",
        stage: "foundation",
    },
    team_management: {
        key: "team_management",
        title: "Team Management",
        description: "Enables studio memberships, invites, and seat administration.",
        defaultEnabled: false,
        owner: "platform",
        stage: "beta",
    },
    admin_console: {
        key: "admin_console",
        title: "Admin Console",
        description: "Enables internal account, billing, and support operations tooling.",
        defaultEnabled: false,
        owner: "platform",
        stage: "internal",
    },
    support_inbox: {
        key: "support_inbox",
        title: "Support Inbox",
        description: "Enables user-facing support threads and internal support triage.",
        defaultEnabled: false,
        owner: "support",
        stage: "beta",
    },
    mvp_access: {
        key: "mvp_access",
        title: "MVP Access",
        description: "Enables entitlement-gated entry into the `/mvp` workspace.",
        defaultEnabled: false,
        owner: "product",
        stage: "beta",
    },
    priority_support: {
        key: "priority_support",
        title: "Priority Support",
        description: "Marks design partners and higher plans for faster support handling.",
        defaultEnabled: false,
        owner: "support",
        stage: "beta",
    },
};

export function isKnownFeatureFlag(key: string): key is FeatureFlagKey {
    return key in featureFlagCatalog;
}

export function getFeatureFlagDefinition(key: FeatureFlagKey) {
    return featureFlagCatalog[key];
}
