import { z } from "zod";

import { coverageHealthSchema, coverageSnapshotSchema, coverageOperatorSummarySchema } from "@/server/contracts/coverage";
import { operationsDomainSchema, operationsSnapshotSchema, operationsSeveritySchema } from "@/server/contracts/operations";
import { studioRoleValues } from "@/types/platform/common";

export const coordinationItemStatusValues = ["open", "in_progress", "snoozed", "resolved"] as const;
export const coordinationAttentionStateValues = ["stable", "unowned", "overloaded"] as const;
export const coordinationEntityTypeValues = ["workspace", "subscription", "invoice", "invitation", "support_thread", "project"] as const;

export const coordinationItemStatusSchema = z.enum(coordinationItemStatusValues);
export const coordinationAttentionStateSchema = z.enum(coordinationAttentionStateValues);
export const coordinationEntityTypeSchema = z.enum(coordinationEntityTypeValues);

export const coordinationUserReferenceSchema = z.object({
    userId: z.string().uuid(),
    label: z.string().min(1),
    role: z.enum(studioRoleValues).nullable(),
    active: z.boolean(),
});

export const coordinationViewerSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(studioRoleValues).nullable(),
    canManageAssignments: z.boolean(),
});

export const coordinationOperatorSchema = coverageOperatorSummarySchema;

export const coordinatedOperationalItemSchema = z.object({
    itemKey: z.string().min(1),
    severity: operationsSeveritySchema,
    domain: operationsDomainSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    remediation: z.string().min(1),
    href: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    ageLabel: z.string().min(1),
    freshnessLabel: z.string().min(1),
    entityType: coordinationEntityTypeSchema.nullable(),
    entityId: z.string().min(1).nullable(),
    entityLabel: z.string().min(1).nullable(),
    status: coordinationItemStatusSchema,
    isLive: z.boolean(),
    assignee: coordinationUserReferenceSchema.nullable(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable(),
    resolutionNote: z.string().min(1).nullable(),
    resolvedAt: z.string().datetime({ offset: true }).nullable(),
    resolvedBy: coordinationUserReferenceSchema.nullable(),
    coordinationCreatedAt: z.string().datetime({ offset: true }).nullable(),
    coordinationUpdatedAt: z.string().datetime({ offset: true }).nullable(),
});

export const coordinationWorkloadSchema = z.object({
    attentionState: coordinationAttentionStateSchema,
    coverageHealth: coverageHealthSchema,
    activeItemCount: z.number().int().nonnegative(),
    unownedItemCount: z.number().int().nonnegative(),
    unownedUrgentItemCount: z.number().int().nonnegative(),
    unavailableOwnerItemCount: z.number().int().nonnegative(),
    snoozedItemCount: z.number().int().nonnegative(),
    inProgressItemCount: z.number().int().nonnegative(),
    recentlyResolvedCount: z.number().int().nonnegative(),
    overloadedOperatorCount: z.number().int().nonnegative(),
    staleInProgressCount: z.number().int().nonnegative(),
    undercoveredLaneCount: z.number().int().nonnegative(),
    maxSnoozeHours: z.number().int().positive(),
});

export const coordinationSnapshotSchema = z.object({
    generatedAt: z.string().datetime({ offset: true }),
    workspaceId: z.string().uuid().nullable(),
    viewer: coordinationViewerSchema,
    operators: z.array(coordinationOperatorSchema),
    workload: coordinationWorkloadSchema,
    operations: operationsSnapshotSchema,
    coverage: coverageSnapshotSchema,
    actionCenter: z.object({
        urgent: z.array(coordinatedOperationalItemSchema),
        watch: z.array(coordinatedOperationalItemSchema),
        resolved: z.array(coordinatedOperationalItemSchema),
    }),
});

export const coordinationMutationSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("update"),
        status: coordinationItemStatusSchema.optional(),
        assigneeUserId: z.string().uuid().nullable().optional(),
        snoozeHours: z.number().int().positive().max(2160).optional(),
        resolutionNote: z.string().trim().max(500).nullable().optional(),
    }),
    z.object({
        action: z.literal("claim"),
    }),
    z.object({
        action: z.literal("assign"),
        assigneeUserId: z.string().uuid().nullable(),
    }),
    z.object({
        action: z.literal("snooze"),
        snoozeHours: z.number().int().positive().max(2160),
    }),
    z.object({
        action: z.literal("unsnooze"),
    }),
    z.object({
        action: z.literal("resolve"),
        resolutionNote: z.string().trim().max(500).nullable().optional(),
    }),
    z.object({
        action: z.literal("reopen"),
    }),
]);

export type CoordinationItemStatus = z.infer<typeof coordinationItemStatusSchema>;
export type CoordinationAttentionState = z.infer<typeof coordinationAttentionStateSchema>;
export type CoordinationEntityType = z.infer<typeof coordinationEntityTypeSchema>;
export type CoordinationUserReference = z.infer<typeof coordinationUserReferenceSchema>;
export type CoordinationViewer = z.infer<typeof coordinationViewerSchema>;
export type CoordinationOperator = z.infer<typeof coordinationOperatorSchema>;
export type CoordinatedOperationalItem = z.infer<typeof coordinatedOperationalItemSchema>;
export type CoordinationWorkload = z.infer<typeof coordinationWorkloadSchema>;
export type CoordinationSnapshot = z.infer<typeof coordinationSnapshotSchema>;
export type CoordinationMutation = z.infer<typeof coordinationMutationSchema>;
