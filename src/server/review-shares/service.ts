import { randomUUID } from "node:crypto";

import type { ProjectReviewSharesResponse, ReviewShareCollectionSummary, ReviewShareContentMode, ReviewShareDeliveryMode, ReviewShareEvent, ReviewShareStatus, ReviewShareSummary } from "@/server/review-shares/types";
import { reviewShareInlinePayloadUrlLimit } from "@/server/review-shares/types";
import type { ProjectWorldLink } from "@/server/projects/types";

import { appendProjectActivity, getOwnedWorldLinkForProject } from "@/server/projects/service";
import { cleanText, ensureProjectStorage, normalizeEmail, normalizeSceneId, nowIso } from "@/server/projects/storage";
import { createWorldTruthSnapshot } from "@/server/projects/types";
import { createPayloadDigest, createReviewShareToken, reviewShareTokenMatches } from "@/server/review-shares/shareToken";

interface ReviewShareRow {
    id: string;
    project_id: string;
    scene_id: string;
    version_id: string | null;
    label: string | null;
    note: string | null;
    delivery_mode: ReviewShareDeliveryMode;
    content_mode: ReviewShareContentMode;
    version_locked: number;
    payload: string | null;
    payload_digest: string | null;
    share_token: string | null;
    status: ReviewShareStatus;
    created_by_email: string;
    source_kind: ProjectWorldLink["worldTruth"]["sourceKind"];
    source_label: string | null;
    lane_kind: ProjectWorldLink["worldTruth"]["laneKind"];
    lane_label: string | null;
    delivery_posture: ProjectWorldLink["worldTruth"]["deliveryPosture"];
    delivery_label: string | null;
    delivery_summary: string | null;
    created_at: string;
    updated_at: string;
    expires_at: string;
    last_accessed_at: string | null;
    revoked_at: string | null;
    revoked_by_email: string | null;
}

interface ReviewShareEventRow {
    id: string;
    review_share_id: string;
    actor_email: string | null;
    event_type: ReviewShareEvent["eventType"];
    summary: string;
    request_path: string | null;
    created_at: string;
}

function database() {
    return ensureProjectStorage();
}

function directReviewPathForShare(share: ReviewShareRow) {
    if (share.content_mode === "saved_version") {
        if (!share.version_id) {
            throw new Error("Version-locked review shares require a versionId.");
        }
        return `/mvp/review?scene=${encodeURIComponent(share.scene_id)}&version=${encodeURIComponent(share.version_id)}`;
    }

    if (!share.payload) {
        throw new Error("Inline review shares require a payload.");
    }

    return `/mvp/review?payload=${encodeURIComponent(share.payload)}`;
}

function createAbsoluteUrl(origin: string, path: string) {
    return new URL(path, origin).toString();
}

function listEventRowsForShareIds(shareIds: string[]) {
    if (shareIds.length === 0) {
        return [] as ReviewShareEventRow[];
    }

    const placeholders = shareIds.map(() => "?").join(",");
    return database()
        .prepare(
            `
                SELECT
                    id,
                    review_share_id,
                    actor_email,
                    event_type,
                    summary,
                    request_path,
                    created_at
                FROM review_share_events
                WHERE review_share_id IN (${placeholders})
                ORDER BY created_at DESC
            `,
        )
        .all(...shareIds) as ReviewShareEventRow[];
}

function mapEventRow(row: ReviewShareEventRow): ReviewShareEvent {
    return {
        id: row.id,
        shareId: row.review_share_id,
        actorEmail: row.actor_email,
        eventType: row.event_type,
        summary: row.summary,
        requestPath: row.request_path,
        createdAt: row.created_at,
    };
}

function mapSummary(row: ReviewShareRow, origin: string, events: ReviewShareEventRow[]): ReviewShareSummary {
    const isActive = row.status === "active";
    const directReviewUrl = row.delivery_mode === "manual" && isActive ? createAbsoluteUrl(origin, directReviewPathForShare(row)) : null;
    const secureAccessUrl =
        row.delivery_mode === "secure_link" && isActive && row.share_token
            ? createAbsoluteUrl(origin, `/api/review-shares/${row.id}?token=${encodeURIComponent(row.share_token)}`)
            : null;

    return {
        id: row.id,
        projectId: row.project_id,
        sceneId: row.scene_id,
        versionId: row.version_id,
        label: row.label,
        note: row.note,
        deliveryMode: row.delivery_mode,
        contentMode: row.content_mode,
        versionLocked: row.version_locked === 1,
        payloadDigest: row.payload_digest,
        status: row.status,
        createdByEmail: row.created_by_email,
        issuedAt: row.created_at,
        expiresAt: row.expires_at,
        lastAccessedAt: row.last_accessed_at,
        revokedAt: row.revoked_at,
        accessUrl: secureAccessUrl,
        manualReviewUrl: directReviewUrl,
        worldTruth: createWorldTruthSnapshot({
            sourceKind: row.source_kind,
            sourceLabel: row.source_label,
            laneKind: row.lane_kind,
            laneLabel: row.lane_label,
            deliveryPosture: row.delivery_posture,
            deliveryLabel: row.delivery_label,
            deliverySummary: row.delivery_summary,
        }),
        recentEvents: events.filter((event) => event.review_share_id === row.id).slice(0, 5).map(mapEventRow),
    };
}

function getShareRowById(shareId: string) {
    return (
        database()
            .prepare(
                `
                    SELECT
                        id,
                        project_id,
                        scene_id,
                        version_id,
                        label,
                        note,
                        delivery_mode,
                        content_mode,
                        version_locked,
                        payload,
                        payload_digest,
                        share_token,
                        status,
                        created_by_email,
                        source_kind,
                        source_label,
                        lane_kind,
                        lane_label,
                        delivery_posture,
                        delivery_label,
                        delivery_summary,
                        created_at,
                        updated_at,
                        expires_at,
                        last_accessed_at,
                        revoked_at,
                        revoked_by_email
                    FROM review_shares
                    WHERE id = ?
                `,
            )
            .get(shareId) as ReviewShareRow | undefined
    ) ?? null;
}

function getShareRowForOwner(shareId: string, ownerEmail: string) {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);
    return (
        database()
            .prepare(
                `
                    SELECT rs.*
                    FROM review_shares rs
                    INNER JOIN projects p ON p.id = rs.project_id
                    WHERE rs.id = ? AND p.owner_email = ?
                `,
            )
            .get(shareId, normalizedOwnerEmail) as ReviewShareRow | undefined
    ) ?? null;
}

function listShareRowsForOwner(ownerEmail: string, projectId?: string | null) {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);

    if (projectId) {
        return database()
            .prepare(
                `
                    SELECT rs.*
                    FROM review_shares rs
                    INNER JOIN projects p ON p.id = rs.project_id
                    WHERE p.owner_email = ? AND rs.project_id = ?
                    ORDER BY rs.created_at DESC
                `,
            )
            .all(normalizedOwnerEmail, projectId) as ReviewShareRow[];
    }

    return database()
        .prepare(
            `
                SELECT rs.*
                FROM review_shares rs
                INNER JOIN projects p ON p.id = rs.project_id
                WHERE p.owner_email = ?
                ORDER BY rs.created_at DESC
            `,
        )
        .all(normalizedOwnerEmail) as ReviewShareRow[];
}

function logReviewShareEvent({
    shareId,
    actorEmail,
    eventType,
    summary,
    requestPath,
    createdAt,
}: {
    shareId: string;
    actorEmail?: string | null;
    eventType: ReviewShareEvent["eventType"];
    summary: string;
    requestPath?: string | null;
    createdAt?: string;
}) {
    const timestamp = createdAt ?? nowIso();
    database()
        .prepare(
            `
                INSERT INTO review_share_events (
                    id,
                    review_share_id,
                    actor_email,
                    event_type,
                    summary,
                    request_path,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(randomUUID(), shareId, actorEmail ? normalizeEmail(actorEmail) : null, eventType, summary, requestPath ?? null, timestamp);
}

function summarizeCollection(rows: ReviewShareRow[]): ReviewShareCollectionSummary {
    return rows.reduce<ReviewShareCollectionSummary>(
        (summary, row) => {
            summary.totalCount += 1;
            if (row.status === "active") {
                summary.activeCount += 1;
            } else if (row.status === "revoked") {
                summary.revokedCount += 1;
            } else if (row.status === "expired") {
                summary.expiredCount += 1;
            }
            return summary;
        },
        {
            totalCount: 0,
            activeCount: 0,
            revokedCount: 0,
            expiredCount: 0,
        },
    );
}

function maybeExpireShare(row: ReviewShareRow | null) {
    if (!row) {
        return null;
    }

    if (row.status !== "active") {
        return row;
    }

    if (Date.parse(row.expires_at) > Date.now()) {
        return row;
    }

    const timestamp = nowIso();
    database()
        .prepare("UPDATE review_shares SET status = 'expired', updated_at = ? WHERE id = ?")
        .run(timestamp, row.id);
    logReviewShareEvent({
        shareId: row.id,
        eventType: "expired",
        summary: `Review share ${row.label ?? row.id} expired.`,
        createdAt: timestamp,
    });

    const nextRow = getShareRowById(row.id);
    if (!nextRow) {
        throw new Error("Expired share could not be reloaded.");
    }
    return nextRow;
}

function assertShareCreationInput({
    sceneId,
    contentMode,
    versionId,
    payload,
}: {
    sceneId: string;
    contentMode: ReviewShareContentMode;
    versionId?: string | null;
    payload?: string | null;
}) {
    if (!normalizeSceneId(sceneId)) {
        throw new Error("sceneId is required.");
    }

    if (contentMode === "saved_version") {
        if (!cleanText(versionId)) {
            throw new Error("Version-locked review shares require a versionId.");
        }
        if (cleanText(payload)) {
            throw new Error("Version-locked review shares must not include an inline payload.");
        }
        return;
    }

    const normalizedPayload = cleanText(payload);
    if (!normalizedPayload) {
        throw new Error("Inline review shares require an encoded payload.");
    }
    if (encodeURIComponent(normalizedPayload).length > reviewShareInlinePayloadUrlLimit) {
        throw new Error("Inline review payload is too large for a durable share URL on this freeze baseline. Use a version-locked share instead.");
    }
    if (cleanText(versionId)) {
        throw new Error("Inline review shares cannot also claim a saved version lock.");
    }
}

export function listReviewSharesForOwner({
    ownerEmail,
    origin,
    projectId,
}: {
    ownerEmail: string;
    origin: string;
    projectId?: string | null;
}): ProjectReviewSharesResponse {
    const rows = listShareRowsForOwner(ownerEmail, projectId);
    const refreshedRows = rows.map(maybeExpireShare).filter((row): row is ReviewShareRow => Boolean(row));
    const events = listEventRowsForShareIds(refreshedRows.map((row) => row.id));

    return {
        shares: refreshedRows.map((row) => mapSummary(row, origin, events)),
        summary: summarizeCollection(refreshedRows),
    };
}

export function createReviewShareForOwner({
    ownerEmail,
    origin,
    projectId,
    sceneId,
    contentMode,
    versionId,
    payload,
    label,
    note,
    deliveryMode,
    expiresInHours,
}: {
    ownerEmail: string;
    origin: string;
    projectId: string;
    sceneId: string;
    contentMode: ReviewShareContentMode;
    versionId?: string | null;
    payload?: string | null;
    label?: string | null;
    note?: string | null;
    deliveryMode: ReviewShareDeliveryMode;
    expiresInHours?: number;
}) {
    assertShareCreationInput({
        sceneId,
        contentMode,
        versionId,
        payload,
    });

    const worldLink = getOwnedWorldLinkForProject(ownerEmail, projectId, sceneId);
    if (!worldLink) {
        throw new Error("Review shares can only be created for scenes already linked to this project.");
    }

    const timestamp = nowIso();
    const safeExpiresInHours = Math.min(Math.max(expiresInHours ?? 72, 1), 24 * 30);
    const expiresAt = new Date(Date.now() + safeExpiresInHours * 60 * 60 * 1000).toISOString();
    const shareId = randomUUID();
    const shareToken = deliveryMode === "secure_link" ? createReviewShareToken() : null;
    const normalizedPayload = cleanText(payload);
    const normalizedVersionId = cleanText(versionId);
    const normalizedLabel =
        cleanText(label) ??
        (contentMode === "saved_version" && normalizedVersionId
            ? `${sceneId} · ${normalizedVersionId}`
            : `${sceneId} inline snapshot`);
    const normalizedNote = cleanText(note);

    database()
        .prepare(
            `
                INSERT INTO review_shares (
                    id,
                    project_id,
                    scene_id,
                    version_id,
                    label,
                    note,
                    delivery_mode,
                    content_mode,
                    version_locked,
                    payload,
                    payload_digest,
                    share_token,
                    status,
                    created_by_email,
                    source_kind,
                    source_label,
                    lane_kind,
                    lane_label,
                    delivery_posture,
                    delivery_label,
                    delivery_summary,
                    created_at,
                    updated_at,
                    expires_at,
                    last_accessed_at,
                    revoked_at,
                    revoked_by_email
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
            `,
        )
        .run(
            shareId,
            projectId,
            normalizeSceneId(sceneId),
            normalizedVersionId,
            normalizedLabel,
            normalizedNote,
            deliveryMode,
            contentMode,
            contentMode === "saved_version" ? 1 : 0,
            normalizedPayload,
            normalizedPayload ? createPayloadDigest(normalizedPayload) : null,
            shareToken,
            normalizeEmail(ownerEmail),
            worldLink.worldTruth.sourceKind,
            worldLink.worldTruth.sourceLabel,
            worldLink.worldTruth.laneKind,
            worldLink.worldTruth.laneLabel,
            worldLink.worldTruth.deliveryPosture,
            worldLink.worldTruth.deliveryLabel,
            worldLink.worldTruth.deliverySummary,
            timestamp,
            timestamp,
            expiresAt,
        );

    logReviewShareEvent({
        shareId,
        actorEmail: ownerEmail,
        eventType: "created",
        summary:
            contentMode === "saved_version"
                ? `Created version-locked review share ${normalizedLabel}.`
                : `Created inline payload review share ${normalizedLabel}.`,
        createdAt: timestamp,
    });

    appendProjectActivity({
        projectId,
        actorEmail: ownerEmail,
        eventType: "project.review_share_created",
        summary:
            contentMode === "saved_version"
                ? `Published version-locked review share ${normalizedLabel} for ${sceneId}${normalizedVersionId ? ` (${normalizedVersionId})` : ""}.`
                : `Published inline payload review share ${normalizedLabel} for ${sceneId}.`,
        metadata: {
            shareId,
            sceneId,
            versionId: normalizedVersionId,
            contentMode,
            deliveryMode,
            expiresAt,
        },
        createdAt: timestamp,
    });

    const row = getShareRowById(shareId);
    if (!row) {
        throw new Error("Review share was created but could not be reloaded.");
    }

    return mapSummary(row, origin, listEventRowsForShareIds([shareId]));
}

export function copyReviewShareForOwner({
    ownerEmail,
    origin,
    shareId,
}: {
    ownerEmail: string;
    origin: string;
    shareId: string;
}) {
    const row = maybeExpireShare(getShareRowForOwner(shareId, ownerEmail) ?? null);
    if (!row) {
        throw new Error("Review share not found or access denied.");
    }
    if (row.status !== "active") {
        throw new Error("Only active review shares can be copied.");
    }

    const timestamp = nowIso();
    logReviewShareEvent({
        shareId,
        actorEmail: ownerEmail,
        eventType: "copied",
        summary: `Copied review share ${row.label ?? row.id}.`,
        createdAt: timestamp,
    });

    const nextRow = getShareRowById(shareId);
    if (!nextRow) {
        throw new Error("Review share copy was recorded but the share could not be reloaded.");
    }

    return mapSummary(nextRow, origin, listEventRowsForShareIds([shareId]));
}

export function revokeReviewShareForOwner({
    ownerEmail,
    origin,
    shareId,
}: {
    ownerEmail: string;
    origin: string;
    shareId: string;
}) {
    const row = maybeExpireShare(getShareRowForOwner(shareId, ownerEmail) ?? null);
    if (!row) {
        throw new Error("Review share not found or access denied.");
    }
    if (row.status !== "active") {
        throw new Error("Only active review shares can be revoked.");
    }

    const timestamp = nowIso();
    database()
        .prepare(
            `
                UPDATE review_shares
                SET
                    status = 'revoked',
                    revoked_at = ?,
                    revoked_by_email = ?,
                    updated_at = ?
                WHERE id = ?
            `,
        )
        .run(timestamp, normalizeEmail(ownerEmail), timestamp, shareId);

    logReviewShareEvent({
        shareId,
        actorEmail: ownerEmail,
        eventType: "revoked",
        summary:
            row.delivery_mode === "manual"
                ? `Revoked review share ${row.label ?? row.id}. Existing manually copied review URLs may still work.`
                : `Revoked review share ${row.label ?? row.id}.`,
        createdAt: timestamp,
    });

    appendProjectActivity({
        projectId: row.project_id,
        actorEmail: ownerEmail,
        eventType: "project.review_share_revoked",
        summary:
            row.delivery_mode === "manual"
                ? `Revoked manual review share ${row.label ?? row.id}. Previously copied direct review URLs remain explicit and cannot be pulled back.`
                : `Revoked secure review share ${row.label ?? row.id}.`,
        metadata: {
            shareId,
            sceneId: row.scene_id,
            versionId: row.version_id,
            deliveryMode: row.delivery_mode,
        },
        createdAt: timestamp,
    });

    const nextRow = getShareRowById(shareId);
    if (!nextRow) {
        throw new Error("Review share revoke completed but the share could not be reloaded.");
    }

    return mapSummary(nextRow, origin, listEventRowsForShareIds([shareId]));
}

export function resolveReviewShareAccess({
    shareId,
    token,
    origin,
    requestPath,
}: {
    shareId: string;
    token?: string | null;
    origin: string;
    requestPath?: string | null;
}) {
    const row = maybeExpireShare(getShareRowById(shareId) ?? null);
    if (!row) {
        throw new Error("Review share not found.");
    }
    if (row.status === "revoked") {
        throw new Error("Review share has been revoked.");
    }
    if (row.status === "expired") {
        throw new Error("Review share has expired.");
    }
    if (row.delivery_mode === "manual") {
        throw new Error("Manual review shares do not expose a revocable access route. Use the direct review URL that was issued at creation time.");
    }
    if (!reviewShareTokenMatches(row.share_token, token)) {
        logReviewShareEvent({
            shareId: row.id,
            eventType: "failed_access",
            summary: `Rejected review share access for ${row.label ?? row.id}.`,
            requestPath,
        });
        throw new Error("Review share token is invalid.");
    }

    const timestamp = nowIso();
    database()
        .prepare(
            `
                UPDATE review_shares
                SET
                    last_accessed_at = ?,
                    updated_at = ?
                WHERE id = ?
            `,
        )
        .run(timestamp, timestamp, shareId);

    logReviewShareEvent({
        shareId,
        eventType: "opened",
        summary: `Opened review share ${row.label ?? row.id}.`,
        requestPath,
        createdAt: timestamp,
    });

    return createAbsoluteUrl(origin, directReviewPathForShare(row));
}
