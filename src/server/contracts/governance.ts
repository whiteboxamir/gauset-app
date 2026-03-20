import { z } from "zod";

export const governanceStatusValues = ["aligned", "attention", "blocked"] as const;
export const governanceSeverityValues = ["watch", "urgent"] as const;
export const governanceDomainValues = ["workspace", "billing", "team", "support", "projects"] as const;
export const approvalRequestStatusValues = ["pending", "approved", "rejected", "executed", "canceled"] as const;
export const approvalRequestTypeValues = ["admin_invitation", "membership_role_change", "billing_checkout", "policy_change"] as const;
export const accessReviewStatusValues = ["none", "open", "completed"] as const;
export const accessReviewSubjectTypeValues = ["membership", "invitation"] as const;
export const accessReviewDecisionValues = ["keep", "revoke", "escalate", "defer"] as const;

export const governanceStatusSchema = z.enum(governanceStatusValues);
export const governanceSeveritySchema = z.enum(governanceSeverityValues);
export const governanceDomainSchema = z.enum(governanceDomainValues);
export const approvalRequestStatusSchema = z.enum(approvalRequestStatusValues);
export const approvalRequestTypeSchema = z.enum(approvalRequestTypeValues);
export const accessReviewStatusSchema = z.enum(accessReviewStatusValues);
export const accessReviewSubjectTypeSchema = z.enum(accessReviewSubjectTypeValues);
export const accessReviewDecisionSchema = z.enum(accessReviewDecisionValues);

export const governancePolicySchema = z.object({
    staleInviteHours: z.number().int().min(24).max(2160),
    staleSupportHours: z.number().int().min(12).max(720),
    staleProjectHours: z.number().int().min(24).max(2880),
    staleHandoffHours: z.number().int().min(1).max(720),
    maxSnoozeHours: z.number().int().min(24).max(2160),
    maxActiveItemsPerAvailableOperator: z.number().int().min(1).max(24),
    maxUrgentItemsPerAvailableOperator: z.number().int().min(1).max(12),
    urgentOwnershipDriftHours: z.number().int().min(1).max(168),
    requireAdminInviteApproval: z.boolean(),
    requireElevatedRoleChangeApproval: z.boolean(),
    requireSensitiveBillingApproval: z.boolean(),
    requirePolicyChangeApproval: z.boolean(),
    requireHandoffForAwayWithUrgentWork: z.boolean(),
});

export const governanceAttentionItemSchema = z.object({
    id: z.string().min(1),
    domain: governanceDomainSchema,
    severity: governanceSeveritySchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    remediation: z.string().min(1),
    href: z.string().min(1),
    freshnessLabel: z.string().min(1),
});

export const governanceApprovalRequestSchema = z.object({
    requestId: z.string().uuid(),
    requestKey: z.string().min(1),
    requestType: approvalRequestTypeSchema,
    status: approvalRequestStatusSchema,
    summary: z.string().min(1),
    detail: z.string().nullable(),
    href: z.string().min(1),
    requestedAt: z.string().datetime({ offset: true }),
    requestedByUserId: z.string().uuid().nullable(),
    requestedByLabel: z.string().min(1),
    decidedAt: z.string().datetime({ offset: true }).nullable(),
    decidedByUserId: z.string().uuid().nullable(),
    decidedByLabel: z.string().nullable(),
    decisionNote: z.string().nullable(),
    canApprove: z.boolean(),
    canReject: z.boolean(),
    canCancel: z.boolean(),
});

export const governanceAccessReviewEntrySchema = z.object({
    entryId: z.string().uuid(),
    subjectType: accessReviewSubjectTypeSchema,
    subjectId: z.string().uuid(),
    label: z.string().min(1),
    secondaryLabel: z.string().nullable(),
    elevated: z.boolean(),
    stale: z.boolean(),
    decision: accessReviewDecisionSchema.nullable(),
    note: z.string().nullable(),
});

export const governanceAccessReviewSnapshotSchema = z.object({
    reviewId: z.string().uuid().nullable(),
    status: accessReviewStatusSchema,
    openedAt: z.string().datetime({ offset: true }).nullable(),
    openedByLabel: z.string().nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    completedByLabel: z.string().nullable(),
    dueLabel: z.string().min(1),
    undecidedCount: z.number().int().nonnegative(),
    entries: z.array(governanceAccessReviewEntrySchema),
});

export const governanceSnapshotSchema = z.object({
    policy: governancePolicySchema,
    overallStatus: governanceStatusSchema,
    pendingApprovalCount: z.number().int().nonnegative(),
    exceptionCount: z.number().int().nonnegative(),
    items: z.array(governanceAttentionItemSchema),
    pendingRequests: z.array(governanceApprovalRequestSchema),
    recentRequests: z.array(governanceApprovalRequestSchema),
    accessReview: governanceAccessReviewSnapshotSchema,
});

export type GovernanceStatus = z.infer<typeof governanceStatusSchema>;
export type GovernanceSeverity = z.infer<typeof governanceSeveritySchema>;
export type GovernanceDomain = z.infer<typeof governanceDomainSchema>;
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;
export type ApprovalRequestType = z.infer<typeof approvalRequestTypeSchema>;
export type AccessReviewStatus = z.infer<typeof accessReviewStatusSchema>;
export type AccessReviewSubjectType = z.infer<typeof accessReviewSubjectTypeSchema>;
export type AccessReviewDecision = z.infer<typeof accessReviewDecisionSchema>;
export type GovernancePolicy = z.infer<typeof governancePolicySchema>;
export type GovernanceAttentionItem = z.infer<typeof governanceAttentionItemSchema>;
export type GovernanceApprovalRequest = z.infer<typeof governanceApprovalRequestSchema>;
export type GovernanceAccessReviewEntry = z.infer<typeof governanceAccessReviewEntrySchema>;
export type GovernanceAccessReviewSnapshot = z.infer<typeof governanceAccessReviewSnapshotSchema>;
export type GovernanceSnapshot = z.infer<typeof governanceSnapshotSchema>;
