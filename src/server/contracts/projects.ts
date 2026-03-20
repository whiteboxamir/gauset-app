import { z } from "zod";

import { releaseReadinessSnapshotSchema } from "./release-readiness.ts";
import { worldTruthSummarySchema } from "./world-truth.ts";
import { projectMembershipRoleValues, projectStatusValues } from "../../types/platform/common.ts";

const worldTruthFieldSchema = z.object({
    sourceKind: z.string().min(1).nullable().optional(),
    ingestRecordId: z.string().min(1).nullable().optional(),
    handoffManifestId: z.string().min(1).nullable().optional(),
    latestVersionId: z.string().min(1).nullable().optional(),
    lane: z.string().min(1).nullable().optional(),
    productionReadiness: z.string().min(1).nullable().optional(),
    reviewApprovalState: z.string().min(1).nullable().optional(),
    versionLocked: z.boolean().optional(),
    blockers: z.array(z.string().min(1)).optional(),
    deliveryStatus: z.string().min(1).nullable().optional(),
    downstreamTargetSystem: z.string().min(1).nullable().optional(),
    downstreamTargetProfile: z.string().min(1).nullable().optional(),
    downstreamTargetSummary: z.string().min(1).nullable().optional(),
});

export const projectCardSchema = z.object({
    projectId: z.string().uuid(),
    studioId: z.string().uuid().nullable(),
    studioName: z.string().min(1).nullable(),
    ownerUserId: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().min(1).nullable(),
    status: z.enum(projectStatusValues),
    coverImageUrl: z.string().url().nullable(),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
    lastWorldOpenedAt: z.string().datetime({ offset: true }).nullable(),
    membershipRole: z.enum(projectMembershipRoleValues),
    worldCount: z.number().int().nonnegative(),
    primarySceneId: z.string().min(1).nullable(),
    primaryEnvironmentLabel: z.string().min(1).nullable(),
});

export const projectWorldLinkSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    sceneId: z.string().min(1),
    environmentLabel: z.string().min(1).nullable(),
    isPrimary: z.boolean(),
    ownershipStatus: z.enum(["active", "released", "superseded"]).optional(),
    ownershipClaimedAt: z.string().datetime({ offset: true }).optional(),
    createdAt: z.string().datetime({ offset: true }),
    truthSummary: worldTruthSummarySchema.nullable().optional(),
    ...worldTruthFieldSchema.shape,
});

export const projectActivityEventSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    actorUserId: z.string().uuid().nullable(),
    actorType: z.enum(["user", "system", "admin"]),
    eventType: z.string().min(1),
    summary: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
});

export const projectDetailSchema = z.object({
    project: projectCardSchema,
    worldLinks: z.array(projectWorldLinkSchema),
    activity: z.array(projectActivityEventSchema),
});

export const projectReadinessCardSchema = projectCardSchema.extend({
    releaseReadiness: releaseReadinessSnapshotSchema,
});

export const projectReadinessDetailSchema = projectDetailSchema.extend({
    releaseReadiness: releaseReadinessSnapshotSchema,
});

export type ProjectCard = z.infer<typeof projectCardSchema>;
export type ProjectWorldLink = z.infer<typeof projectWorldLinkSchema>;
export type ProjectActivityEvent = z.infer<typeof projectActivityEventSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type ProjectReadinessCard = z.infer<typeof projectReadinessCardSchema>;
export type ProjectReadinessDetail = z.infer<typeof projectReadinessDetailSchema>;
