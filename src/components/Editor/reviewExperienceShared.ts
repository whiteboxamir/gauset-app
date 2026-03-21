"use client";

import { applyReviewShareToken, decodeReviewPackage, normalizeReviewPackage, type ReviewPackage } from "@/lib/mvp-review";
import { createEmptySceneDocumentV2 } from "@/lib/scene-graph/document.ts";
import { deriveWorldTruthSummary } from "@/lib/world-truth.ts";
import type { SceneReviewRecord } from "@/lib/mvp-workspace";

export interface ReviewComment {
    comment_id: string;
    author: string;
    body: string;
    anchor?: string | null;
    created_at: string;
}

export interface ReviewExperienceQuery {
    sceneId: string | null;
    versionId: string | null;
    payload: string | null;
    shareToken: string | null;
}

export const EMPTY_REVIEW_SCENE_DOCUMENT = createEmptySceneDocumentV2();

export function formatReviewTimestamp(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
}

export function decodeInlineReviewPackagePayload(payload: string, shareToken?: string | null) {
    return applyReviewShareToken(decodeReviewPackage(payload), shareToken);
}

export function buildReviewPackageFromSavedVersion({
    sceneId,
    versionId,
    versionPayload,
    previousPackage,
    previousReview,
    shareToken,
}: {
    sceneId: string;
    versionId: string;
    versionPayload: Record<string, unknown>;
    previousPackage: ReviewPackage | null;
    previousReview: SceneReviewRecord | null;
    shareToken?: string | null;
}): ReviewPackage {
    const versionRecord = versionPayload as { saved_at?: string };

    return applyReviewShareToken(
        normalizeReviewPackage({
            sceneId,
            versionId,
            sceneDocument:
                versionPayload.scene_document ?? versionPayload.scene_graph ?? previousPackage?.sceneDocument ?? previousPackage?.sceneGraph ?? EMPTY_REVIEW_SCENE_DOCUMENT,
            assetsList: previousPackage?.assetsList ?? [],
            review: previousPackage?.review ?? previousReview ?? undefined,
            exportedAt: versionRecord.saved_at ?? previousPackage?.exportedAt ?? new Date().toISOString(),
            truthSummary: deriveWorldTruthSummary({
                sceneId,
                versionId,
                sceneDocument: versionPayload.scene_document ?? previousPackage?.sceneDocument,
                sceneGraph: versionPayload.scene_graph ?? previousPackage?.sceneGraph,
            }),
        }),
        shareToken,
    );
}
