import { z } from "zod";

import { projectStatusValues } from "@/types/platform/common";

export const operationsSeverityValues = ["urgent", "watch", "resolved"] as const;
export const operationsStatusValues = ["stable", "watch", "urgent"] as const;
export const operationsDomainValues = ["workspace", "billing", "team", "support", "projects"] as const;

export const operationsSeveritySchema = z.enum(operationsSeverityValues);
export const operationsStatusSchema = z.enum(operationsStatusValues);
export const operationsDomainSchema = z.enum(operationsDomainValues);

export const operationalAttentionItemSchema = z.object({
    id: z.string().min(1),
    severity: operationsSeveritySchema,
    domain: operationsDomainSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    remediation: z.string().min(1),
    href: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    ageLabel: z.string().min(1),
    freshnessLabel: z.string().min(1),
});

export const operationalDomainSummarySchema = z.object({
    domain: operationsDomainSchema,
    label: z.string().min(1),
    status: operationsStatusSchema,
    openCount: z.number().int().nonnegative(),
});

export const projectOperationalRiskSchema = z.object({
    projectId: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    status: z.enum(projectStatusValues),
    href: z.string().min(1),
    riskLevel: operationsStatusSchema,
    reasons: z.array(z.string().min(1)),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
    lastActivityLabel: z.string().min(1),
    hasWorldLink: z.boolean(),
    activeReviewShareCount: z.number().int().nonnegative(),
    totalReviewShareCount: z.number().int().nonnegative(),
});

export const operationsSnapshotSchema = z.object({
    overallStatus: operationsStatusSchema,
    urgentCount: z.number().int().nonnegative(),
    watchCount: z.number().int().nonnegative(),
    resolvedCount: z.number().int().nonnegative(),
    domains: z.array(operationalDomainSummarySchema),
    actionCenter: z.object({
        urgent: z.array(operationalAttentionItemSchema),
        watch: z.array(operationalAttentionItemSchema),
        resolved: z.array(operationalAttentionItemSchema),
    }),
    projectRisks: z.array(projectOperationalRiskSchema),
});

export type OperationsSeverity = z.infer<typeof operationsSeveritySchema>;
export type OperationsStatus = z.infer<typeof operationsStatusSchema>;
export type OperationsDomain = z.infer<typeof operationsDomainSchema>;
export type OperationalAttentionItem = z.infer<typeof operationalAttentionItemSchema>;
export type OperationalDomainSummary = z.infer<typeof operationalDomainSummarySchema>;
export type ProjectOperationalRisk = z.infer<typeof projectOperationalRiskSchema>;
export type OperationsSnapshot = z.infer<typeof operationsSnapshotSchema>;
