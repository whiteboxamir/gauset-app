import { z } from "zod";

import {
    reviewShareDeliveryModeValues,
    reviewShareEventTypeValues,
    reviewShareStatusValues,
} from "../../types/platform/common.ts";
import { worldTruthSummarySchema, type WorldTruthSummary } from "./world-truth.ts";

const reviewShareTruthFieldSchema = z.object({
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

export const createReviewShareModeValues = ["secure_authenticated", "localhost_fallback"] as const;
export const reviewShareReadinessStateValues = ["ready", "review_only", "blocked"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readReviewIssueVersion(value: unknown) {
    if (!Array.isArray(value)) {
        return "";
    }

    const firstIssue = value[0];
    if (!firstIssue || typeof firstIssue !== "object" || Array.isArray(firstIssue)) {
        return "";
    }

    return readString((firstIssue as Record<string, unknown>).version_id);
}

function resolveReviewShareRequestShapeHints(reviewPackage: unknown) {
    const reviewPackageRecord = asRecord(reviewPackage);
    const sceneDocument = asRecord(reviewPackageRecord?.sceneDocument) ?? asRecord(reviewPackageRecord?.scene_document);
    const reviewRecord = asRecord(reviewPackageRecord?.review) ?? asRecord(sceneDocument?.review);

    const sceneIdFromReview = readString(reviewRecord?.scene_id);
    const versionIdFromReview = readString(reviewRecord?.version_id) || readReviewIssueVersion(reviewRecord?.issues);
    const sceneIdFromPayload = readString(reviewPackageRecord?.sceneId) || readString(reviewPackageRecord?.scene_id);
    const versionIdFromPayload = readString(reviewPackageRecord?.versionId) || readString(reviewPackageRecord?.version_id);
    return {
        sceneId: sceneIdFromPayload,
        versionId: versionIdFromPayload || versionIdFromReview,
        reviewSceneId: sceneIdFromReview,
        reviewVersionId: versionIdFromReview,
    };
}

export const createReviewShareRequestSchema = z
    .object({
        sceneId: z.string().min(1).nullable().optional(),
        versionId: z.string().min(1).nullable().optional(),
        payload: z.string().min(1).max(500_000).optional(),
        reviewPackage: z.unknown().optional(),
        sceneDocument: z.unknown().optional(),
        sceneGraph: z.unknown().optional(),
        assetsList: z.array(z.unknown()).optional(),
        expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
        projectId: z.string().uuid().optional(),
        label: z.string().min(1).max(120).optional(),
        note: z.string().max(280).optional(),
        deliveryMode: z.enum(reviewShareDeliveryModeValues).optional(),
    })
    .superRefine((value, ctx) => {
        const hints = resolveReviewShareRequestShapeHints(value.reviewPackage);
        const sceneId = readString(value.sceneId) || hints.sceneId || hints.reviewSceneId || readString(value.sceneId);
        const versionId =
            readString(value.versionId) ||
            hints.versionId ||
            hints.reviewVersionId;
        const hasSavedVersion = Boolean(sceneId && versionId);
        const hasPayload = Boolean(value.payload);
        const hasSceneDocument =
            Boolean(asRecord(value.sceneDocument)) ||
            Boolean(asRecord(value.reviewPackage)?.sceneDocument) ||
            Boolean(asRecord(value.reviewPackage)?.scene_document);

        if (versionId && !sceneId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "sceneId is required when versionId is provided.",
                path: ["sceneId"],
            });
        }

        if (!hasSavedVersion && !hasPayload && !hasSceneDocument) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Provide sceneDocument, payload, or a sceneId/versionId pair.",
                path: ["payload"],
            });
        }
    });

export const createReviewShareResponseSchema = z.object({
    shareMode: z.enum(createReviewShareModeValues),
    shareUrl: z.string().url(),
    shareToken: z.string().min(1).nullable(),
    expiresAt: z.string().datetime({ offset: true }),
});

export const reviewShareEventSchema = z.object({
    id: z.string().uuid(),
    shareId: z.string().uuid(),
    actorUserId: z.string().uuid().nullable(),
    eventType: z.enum(reviewShareEventTypeValues),
    summary: z.string().min(1),
    requestPath: z.string().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
});

export const reviewShareSummarySchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    studioId: z.string().uuid().nullable(),
    createdByUserId: z.string().uuid().nullable(),
    createdByLabel: z.string().min(1),
    sceneId: z.string().min(1).nullable(),
    versionId: z.string().min(1).nullable(),
    status: z.enum(reviewShareStatusValues),
    tokenId: z.string().min(1),
    label: z.string().min(1).nullable(),
    note: z.string().min(1).nullable(),
    deliveryMode: z.enum(reviewShareDeliveryModeValues),
    contentMode: z.enum(["saved_version", "inline_package"]),
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    lastAccessedAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    sharePath: z.string().min(1).nullable().optional(),
    recentEvents: z.array(reviewShareEventSchema),
    truthSummary: worldTruthSummarySchema.nullable().optional(),
    ...reviewShareTruthFieldSchema.shape,
});

export const reviewShareCollectionSummarySchema = z.object({
    totalCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    revokedCount: z.number().int().nonnegative(),
    expiredCount: z.number().int().nonnegative(),
});

export const projectReviewSharesResponseSchema = z.object({
    shares: z.array(reviewShareSummarySchema),
    summary: reviewShareCollectionSummarySchema,
});

export const reviewShareReadinessSchema = z.object({
    state: z.enum(reviewShareReadinessStateValues),
    canCreate: z.boolean(),
    sceneId: z.string().min(1),
    versionId: z.string().min(1),
    summary: z.string().min(1),
    detail: z.string().min(1),
    blockers: z.array(z.string().min(1)),
    truthSummary: worldTruthSummarySchema.nullable(),
});

export type CreateReviewShareRequest = z.infer<typeof createReviewShareRequestSchema>;
export type CreateReviewShareResponse = z.infer<typeof createReviewShareResponseSchema>;
export type ReviewShareEvent = z.infer<typeof reviewShareEventSchema>;
export type ReviewShareSummary = z.infer<typeof reviewShareSummarySchema>;
export type ReviewShareCollectionSummary = z.infer<typeof reviewShareCollectionSummarySchema>;
export type ProjectReviewSharesResponse = z.infer<typeof projectReviewSharesResponseSchema>;
export type ReviewShareReadiness = z.infer<typeof reviewShareReadinessSchema>;
export type ReviewShareTruthSummary = WorldTruthSummary;
