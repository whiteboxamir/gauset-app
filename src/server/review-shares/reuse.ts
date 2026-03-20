import { normalizeStringList } from "./shareToken.ts";

import type { ReviewShareRow } from "./repository";

export const REVIEW_SHARE_DUPLICATE_WINDOW_MS = 20_000;

export interface ReviewShareReuseCandidate {
    projectId: string | null;
    studioId: string | null;
    createdByUserId: string;
    sceneId: string | null;
    versionId: string | null;
    label: string | null;
    note: string | null;
    deliveryMode: ReviewShareRow["delivery_mode"];
    inlinePayload: string | null;
    allowedApiPaths: string[];
    storagePrefixes: string[];
}

function normalizeNullableText(value: string | null | undefined) {
    return value?.trim() || null;
}

function buildScopeFingerprint({
    inlinePayload,
    allowedApiPaths,
    storagePrefixes,
}: {
    inlinePayload: string | null;
    allowedApiPaths: string[] | null | undefined;
    storagePrefixes: string[] | null | undefined;
}) {
    return JSON.stringify({
        inlinePayload: inlinePayload ?? null,
        allowedApiPaths: normalizeStringList(allowedApiPaths),
        storagePrefixes: normalizeStringList(storagePrefixes),
    });
}

export function findReusableActiveReviewShare({
    rows,
    candidate,
    now = Date.now(),
}: {
    rows: ReviewShareRow[];
    candidate: ReviewShareReuseCandidate;
    now?: number;
}) {
    const candidateScopeFingerprint = buildScopeFingerprint(candidate);

    return (
        rows
            .filter((row) => {
                const createdAt = Date.parse(row.created_at);
                const expiresAt = Date.parse(row.expires_at);
                if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
                    return false;
                }

                return (
                    row.status === "active" &&
                    row.created_by_user_id === candidate.createdByUserId &&
                    row.project_id === candidate.projectId &&
                    row.studio_id === candidate.studioId &&
                    row.scene_id === candidate.sceneId &&
                    row.version_id === candidate.versionId &&
                    normalizeNullableText(row.label) === candidate.label &&
                    normalizeNullableText(row.note) === candidate.note &&
                    row.delivery_mode === candidate.deliveryMode &&
                    createdAt >= now - REVIEW_SHARE_DUPLICATE_WINDOW_MS &&
                    expiresAt > now &&
                    buildScopeFingerprint({
                        inlinePayload: row.inline_payload,
                        allowedApiPaths: row.allowed_api_paths,
                        storagePrefixes: row.storage_prefixes,
                    }) === candidateScopeFingerprint
                );
            })
            .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null
    );
}
