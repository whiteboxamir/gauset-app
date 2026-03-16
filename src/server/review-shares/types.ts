import type { WorldTruthSnapshot } from "@/server/projects/types";

export const reviewShareStatusValues = ["active", "revoked", "expired"] as const;
export type ReviewShareStatus = (typeof reviewShareStatusValues)[number];

export const reviewShareEventTypeValues = ["created", "copied", "opened", "revoked", "expired", "failed_access"] as const;
export type ReviewShareEventType = (typeof reviewShareEventTypeValues)[number];

export const reviewShareDeliveryModeValues = ["secure_link", "manual"] as const;
export type ReviewShareDeliveryMode = (typeof reviewShareDeliveryModeValues)[number];

export const reviewShareContentModeValues = ["saved_version", "inline_package"] as const;
export type ReviewShareContentMode = (typeof reviewShareContentModeValues)[number];

export const reviewShareInlinePayloadUrlLimit = 12000;

export interface ReviewShareEvent {
    id: string;
    shareId: string;
    actorEmail: string | null;
    eventType: ReviewShareEventType;
    summary: string;
    requestPath: string | null;
    createdAt: string;
}

export interface ReviewShareSummary {
    id: string;
    projectId: string;
    sceneId: string;
    versionId: string | null;
    label: string | null;
    note: string | null;
    deliveryMode: ReviewShareDeliveryMode;
    contentMode: ReviewShareContentMode;
    versionLocked: boolean;
    payloadDigest: string | null;
    status: ReviewShareStatus;
    createdByEmail: string;
    issuedAt: string;
    expiresAt: string;
    lastAccessedAt: string | null;
    revokedAt: string | null;
    accessUrl: string | null;
    manualReviewUrl: string | null;
    worldTruth: WorldTruthSnapshot;
    recentEvents: ReviewShareEvent[];
}

export interface ReviewShareCollectionSummary {
    totalCount: number;
    activeCount: number;
    revokedCount: number;
    expiredCount: number;
}

export interface ProjectReviewSharesResponse {
    shares: ReviewShareSummary[];
    summary: ReviewShareCollectionSummary;
}

const reviewShareStatusLabels: Record<ReviewShareStatus, string> = {
    active: "Active",
    revoked: "Revoked",
    expired: "Expired",
};

const reviewShareDeliveryModeLabels: Record<ReviewShareDeliveryMode, string> = {
    secure_link: "Secure link",
    manual: "Manual handoff",
};

const reviewShareContentModeLabels: Record<ReviewShareContentMode, string> = {
    saved_version: "Version-locked",
    inline_package: "Inline payload",
};

const reviewShareDeliveryModeSummaries: Record<ReviewShareDeliveryMode, string> = {
    secure_link: "Access stays behind a revocable share URL instead of exposing the direct review path.",
    manual: "Operators receive the direct review path, so previously copied links keep working even after the share record is revoked.",
};

const reviewShareContentModeSummaries: Record<ReviewShareContentMode, string> = {
    saved_version: "Review opens against a named saved version so the payload stays locked to durable MVP history.",
    inline_package: "Review opens from a frozen inline payload snapshot, which is explicit but not reopenable as durable saved history.",
};

export function formatReviewShareStatus(value: ReviewShareStatus) {
    return reviewShareStatusLabels[value];
}

export function formatReviewShareDeliveryMode(value: ReviewShareDeliveryMode) {
    return reviewShareDeliveryModeLabels[value];
}

export function describeReviewShareDeliveryMode(value: ReviewShareDeliveryMode) {
    return reviewShareDeliveryModeSummaries[value];
}

export function formatReviewShareContentMode(value: ReviewShareContentMode) {
    return reviewShareContentModeLabels[value];
}

export function describeReviewShareContentMode(value: ReviewShareContentMode) {
    return reviewShareContentModeSummaries[value];
}
