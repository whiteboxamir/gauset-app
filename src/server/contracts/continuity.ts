import { z } from "zod";

import { operationsDomainSchema } from "./operations";

export const continuityHealthValues = ["stable", "drifting", "critical"] as const;

export const continuityHealthSchema = z.enum(continuityHealthValues);

export const continuityUserReferenceSchema = z.object({
    userId: z.string().uuid(),
    label: z.string().min(1),
    role: z.string().min(1).nullable(),
});

export const laneHandoffSummarySchema = z.object({
    handoffId: z.string().uuid().nullable(),
    workspaceId: z.string().uuid().nullable(),
    domain: operationsDomainSchema,
    summary: z.string().min(1).nullable(),
    activeRisks: z.array(z.string().min(1)),
    nextActions: z.array(z.string().min(1)),
    primaryOperator: continuityUserReferenceSchema.nullable(),
    backupOperator: continuityUserReferenceSchema.nullable(),
    reviewByAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    updatedByLabel: z.string().min(1).nullable(),
    health: continuityHealthSchema,
    stale: z.boolean(),
    required: z.boolean(),
    reasons: z.array(z.string().min(1)),
    href: z.string().min(1),
});

export const continuityAlertSchema = z.object({
    id: z.string().min(1),
    domain: operationsDomainSchema,
    severity: continuityHealthSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    href: z.string().min(1),
});

export const continuitySnapshotSchema = z.object({
    generatedAt: z.string().datetime({ offset: true }),
    workspaceId: z.string().uuid().nullable(),
    health: continuityHealthSchema,
    reasons: z.array(z.string().min(1)),
    summary: z.object({
        staleHandoffCount: z.number().int().nonnegative(),
        missingHandoffCount: z.number().int().nonnegative(),
        awayWithUrgentWorkCount: z.number().int().nonnegative(),
        mismatchedCoverageCount: z.number().int().nonnegative(),
        criticalLaneCount: z.number().int().nonnegative(),
    }),
    alerts: z.array(continuityAlertSchema),
    handoffs: z.array(laneHandoffSummarySchema),
});

export const laneHandoffMutationSchema = z.object({
    summary: z.string().trim().max(400).nullable().optional(),
    activeRisks: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    nextActions: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    primaryOperatorUserId: z.string().uuid().nullable().optional(),
    backupOperatorUserId: z.string().uuid().nullable().optional(),
    reviewByAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type ContinuityHealth = z.infer<typeof continuityHealthSchema>;
export type ContinuityUserReference = z.infer<typeof continuityUserReferenceSchema>;
export type LaneHandoffSummary = z.infer<typeof laneHandoffSummarySchema>;
export type ContinuityAlert = z.infer<typeof continuityAlertSchema>;
export type ContinuitySnapshot = z.infer<typeof continuitySnapshotSchema>;
export type LaneHandoffMutation = z.infer<typeof laneHandoffMutationSchema>;
