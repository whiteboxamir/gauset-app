export const coordinationItemKeys = {
    workspaceBillingContact: () => "workspace:billing-contact",
    workspaceSupportContact: () => "workspace:support-contact",
    billingNoSubscription: () => "billing:subscription:none",
    billingSubscription: (subscriptionId: string) => `billing:subscription:${subscriptionId}`,
    billingInvoice: (invoiceId: string) => `billing:invoice:${invoiceId}`,
    teamOperatorCoverage: () => "team:operator-coverage",
    teamStaleInvites: () => "team:stale-invites",
    supportThread: (threadId: string) => `support:thread:${threadId}`,
    projectRisk: (projectId: string) => `projects:project:${projectId}`,
} as const;
