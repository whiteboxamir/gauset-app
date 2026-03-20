import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert, restSelect, restUpdate } from "@/server/db/rest";
import type { ReviewShareDeliveryMode, ReviewShareEventType, ReviewShareStatus } from "@/types/platform/common";

export interface ReviewShareRow {
    id: string;
    project_id: string | null;
    studio_id: string | null;
    created_by_user_id: string | null;
    scene_id: string | null;
    version_id: string | null;
    status: ReviewShareStatus;
    token_id: string;
    label: string | null;
    note: string | null;
    delivery_mode: ReviewShareDeliveryMode;
    allowed_api_paths: string[] | null;
    storage_prefixes: string[] | null;
    inline_payload: string | null;
    issued_at: string;
    expires_at: string;
    last_accessed_at: string | null;
    revoked_at: string | null;
    revoked_by_user_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface ReviewShareEventRow {
    id: string;
    review_share_id: string;
    project_id: string | null;
    studio_id: string | null;
    actor_user_id: string | null;
    event_type: ReviewShareEventType;
    request_path: string | null;
    summary: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface ReviewShareProfileRow {
    id: string;
    email: string;
    display_name: string | null;
}

const reviewShareSelect =
    "id,project_id,studio_id,created_by_user_id,scene_id,version_id,status,token_id,label,note,delivery_mode,allowed_api_paths,storage_prefixes,inline_payload,issued_at,expires_at,last_accessed_at,revoked_at,revoked_by_user_id,metadata,created_at,updated_at";

const reviewShareEventSelect =
    "id,review_share_id,project_id,studio_id,actor_user_id,event_type,request_path,summary,metadata,created_at";

export async function insertReviewShare(payload: Record<string, unknown>) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is required for persisted review shares.");
    }

    const rows = await restInsert<ReviewShareRow[]>("review_shares", payload);
    return rows[0] ?? null;
}

export async function updateReviewShare(
    shareId: string,
    payload: Record<string, unknown>,
    filters?: Record<string, string>,
) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is required for persisted review shares.");
    }

    const rows = await restUpdate<ReviewShareRow[]>("review_shares", payload, {
        id: `eq.${shareId}`,
        ...(filters ?? {}),
    });
    return rows[0] ?? null;
}

export async function getReviewShareById(shareId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return null as ReviewShareRow | null;
    }

    const rows = await restSelect<ReviewShareRow[]>("review_shares", {
        select: reviewShareSelect,
        filters: {
            id: `eq.${shareId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

export async function getReviewShareByToken(shareId: string, tokenId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return null as ReviewShareRow | null;
    }

    const rows = await restSelect<ReviewShareRow[]>("review_shares", {
        select: reviewShareSelect,
        filters: {
            id: `eq.${shareId}`,
            token_id: `eq.${tokenId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

export async function listProjectReviewShares(projectId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return [] as ReviewShareRow[];
    }

    return restSelect<ReviewShareRow[]>("review_shares", {
        select: reviewShareSelect,
        filters: {
            project_id: `eq.${projectId}`,
            order: "created_at.desc",
            limit: "120",
        },
    });
}

export async function listStudioReviewShares(studioId: string, limit = 120) {
    if (!isPlatformDatabaseConfigured()) {
        return [] as ReviewShareRow[];
    }

    return restSelect<ReviewShareRow[]>("review_shares", {
        select: reviewShareSelect,
        filters: {
            studio_id: `eq.${studioId}`,
            order: "created_at.desc",
            limit: String(limit),
        },
    });
}

export async function insertReviewShareEvent(payload: Record<string, unknown>) {
    if (!isPlatformDatabaseConfigured()) {
        return null as ReviewShareEventRow | null;
    }

    const rows = await restInsert<ReviewShareEventRow[]>("review_share_events", payload);
    return rows[0] ?? null;
}

export async function listReviewShareEvents(shareIds: string[]) {
    if (!isPlatformDatabaseConfigured() || shareIds.length === 0) {
        return [] as ReviewShareEventRow[];
    }

    return restSelect<ReviewShareEventRow[]>("review_share_events", {
        select: reviewShareEventSelect,
        filters: {
            review_share_id: `in.(${shareIds.join(",")})`,
            order: "created_at.desc",
            limit: String(Math.max(shareIds.length * 6, 60)),
        },
    });
}

export async function resolveReviewShareProfiles(userIds: string[]) {
    if (!isPlatformDatabaseConfigured() || userIds.length === 0) {
        return [] as ReviewShareProfileRow[];
    }

    return restSelect<ReviewShareProfileRow[]>("profiles", {
        select: "id,email,display_name",
        filters: {
            id: `in.(${userIds.join(",")})`,
        },
    });
}
