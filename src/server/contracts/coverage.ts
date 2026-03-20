import { z } from "zod";

import { operationsDomainSchema, operationsSeveritySchema } from "@/server/contracts/operations";
import { studioRoleValues } from "@/types/platform/common";

export const operatorCoverageStatusValues = ["available", "focused", "away", "backup"] as const;
export const operatorCapacityStateValues = ["balanced", "limited", "overloaded", "unavailable"] as const;
export const coverageHealthValues = ["stable", "undercovered", "overloaded"] as const;
export const coverageLaneStatusValues = ["covered", "undercovered"] as const;

export const operatorCoverageStatusSchema = z.enum(operatorCoverageStatusValues);
export const operatorCapacityStateSchema = z.enum(operatorCapacityStateValues);
export const coverageHealthSchema = z.enum(coverageHealthValues);
export const coverageLaneStatusSchema = z.enum(coverageLaneStatusValues);

export const coveragePolicySummarySchema = z.object({
    maxActiveItemsPerAvailableOperator: z.number().int().positive(),
    maxUrgentItemsPerAvailableOperator: z.number().int().positive(),
    urgentOwnershipDriftHours: z.number().int().positive(),
});

export const coverageAssigneeSuggestionSchema = z.object({
    userId: z.string().uuid(),
    label: z.string().min(1),
    role: z.enum(studioRoleValues).nullable(),
    status: operatorCoverageStatusSchema,
    reason: z.string().min(1),
});

export const coverageOperatorSummarySchema = z.object({
    userId: z.string().uuid(),
    label: z.string().min(1),
    email: z.string().email(),
    role: z.enum(studioRoleValues).nullable(),
    active: z.boolean(),
    isCurrentUser: z.boolean(),
    coverageStatus: operatorCoverageStatusSchema,
    capacityState: operatorCapacityStateSchema,
    effectiveUntil: z.string().datetime({ offset: true }).nullable(),
    note: z.string().min(1).nullable(),
    primaryDomains: z.array(operationsDomainSchema),
    maxActiveItems: z.number().int().nonnegative(),
    maxUrgentItems: z.number().int().nonnegative(),
    maxActiveItemsOverride: z.number().int().positive().nullable(),
    maxUrgentItemsOverride: z.number().int().positive().nullable(),
    activeAssignmentCount: z.number().int().nonnegative(),
    openAssignmentCount: z.number().int().nonnegative(),
    inProgressAssignmentCount: z.number().int().nonnegative(),
    snoozedAssignmentCount: z.number().int().nonnegative(),
    resolvedAssignmentCount: z.number().int().nonnegative(),
    urgentAssignmentCount: z.number().int().nonnegative(),
    staleInProgressCount: z.number().int().nonnegative(),
    unavailableOwnedItemCount: z.number().int().nonnegative(),
    loadPercent: z.number().nonnegative(),
    urgentLoadPercent: z.number().nonnegative(),
    canTakeNewWork: z.boolean(),
    canTakeUrgentWork: z.boolean(),
});

export const coverageLaneSummarySchema = z.object({
    domain: operationsDomainSchema,
    label: z.string().min(1),
    status: coverageLaneStatusSchema,
    coveredOperatorCount: z.number().int().nonnegative(),
    availableOperatorCount: z.number().int().nonnegative(),
    focusedOperatorCount: z.number().int().nonnegative(),
    backupOperatorCount: z.number().int().nonnegative(),
    activeItemCount: z.number().int().nonnegative(),
    urgentItemCount: z.number().int().nonnegative(),
    unownedUrgentItemCount: z.number().int().nonnegative(),
    unavailableOwnerItemCount: z.number().int().nonnegative(),
    staleInProgressCount: z.number().int().nonnegative(),
    gapReason: z.string().min(1).nullable(),
});

export const coverageAttentionItemSchema = z.object({
    itemKey: z.string().min(1),
    title: z.string().min(1),
    href: z.string().min(1),
    domain: operationsDomainSchema,
    severity: operationsSeveritySchema,
    ownerUserId: z.string().uuid().nullable(),
    ownerLabel: z.string().min(1).nullable(),
    ownerStatus: operatorCoverageStatusSchema.nullable(),
    ownerCapacityState: operatorCapacityStateSchema.nullable(),
    laneStatus: coverageLaneStatusSchema,
    staleInProgress: z.boolean(),
    reason: z.string().min(1),
    suggestedAssignee: coverageAssigneeSuggestionSchema.nullable(),
});

export const coverageSnapshotSchema = z.object({
    generatedAt: z.string().datetime({ offset: true }),
    workspaceId: z.string().uuid().nullable(),
    health: coverageHealthSchema,
    policy: coveragePolicySummarySchema,
    summary: z.object({
        availableOperatorCount: z.number().int().nonnegative(),
        focusedOperatorCount: z.number().int().nonnegative(),
        awayOperatorCount: z.number().int().nonnegative(),
        backupOperatorCount: z.number().int().nonnegative(),
        overloadedOperatorCount: z.number().int().nonnegative(),
        undercoveredLaneCount: z.number().int().nonnegative(),
        unownedUrgentItemCount: z.number().int().nonnegative(),
        unavailableOwnerItemCount: z.number().int().nonnegative(),
        staleInProgressCount: z.number().int().nonnegative(),
        rebalanceCandidateCount: z.number().int().nonnegative(),
        reasons: z.array(z.string().min(1)),
    }),
    operators: z.array(coverageOperatorSummarySchema),
    lanes: z.array(coverageLaneSummarySchema),
    unownedUrgentItems: z.array(coverageAttentionItemSchema),
    unavailableOwnerItems: z.array(coverageAttentionItemSchema),
    staleInProgressItems: z.array(coverageAttentionItemSchema),
    rebalanceCandidates: z.array(coverageAttentionItemSchema),
});

export const coverageOperatorMutationSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("set"),
        status: operatorCoverageStatusSchema,
        effectiveUntil: z.string().datetime({ offset: true }).nullable().optional(),
        note: z.string().trim().max(280).nullable().optional(),
        primaryDomains: z.array(operationsDomainSchema).max(5).optional(),
        maxActiveItemsOverride: z.number().int().positive().max(48).nullable().optional(),
        maxUrgentItemsOverride: z.number().int().positive().max(24).nullable().optional(),
    }),
    z.object({
        action: z.literal("clear"),
    }),
    z.object({
        action: z.literal("expire"),
    }),
]);

export type OperatorCoverageStatus = z.infer<typeof operatorCoverageStatusSchema>;
export type OperatorCapacityState = z.infer<typeof operatorCapacityStateSchema>;
export type CoverageHealth = z.infer<typeof coverageHealthSchema>;
export type CoverageLaneStatus = z.infer<typeof coverageLaneStatusSchema>;
export type CoveragePolicySummary = z.infer<typeof coveragePolicySummarySchema>;
export type CoverageAssigneeSuggestion = z.infer<typeof coverageAssigneeSuggestionSchema>;
export type CoverageOperatorSummary = z.infer<typeof coverageOperatorSummarySchema>;
export type CoverageLaneSummary = z.infer<typeof coverageLaneSummarySchema>;
export type CoverageAttentionItem = z.infer<typeof coverageAttentionItemSchema>;
export type CoverageSnapshot = z.infer<typeof coverageSnapshotSchema>;
export type CoverageOperatorMutation = z.infer<typeof coverageOperatorMutationSchema>;
