import { randomUUID } from "node:crypto";

import type { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";

import type { AuthSession } from "../contracts/auth.ts";
import type { PlatformSessionRecord } from "../contracts/security.ts";

import { isPlatformDatabaseConfigured } from "../db/client.ts";
import { restInsert, restSelect, restUpdate } from "../db/rest.ts";
import { logPlatformAuditEvent } from "../platform/audit.ts";
import { isTrackedPlatformSessionRevoked, resolveRevocableTrackedPlatformSessionIds } from "../platform/security-core.ts";

import { setPlatformSessionCookie } from "./cookies.ts";

export { isTrackedPlatformSessionRevoked, shouldTouchPlatformSession } from "../platform/security-core.ts";

interface PlatformSessionRow {
    session_id: string;
    user_id: string;
    provider: "magic_link" | "google" | "sso" | "admin";
    label: string;
    authenticated_at: string;
    last_seen_at: string;
    revoked_at: string | null;
    revoked_reason: string | null;
    created_at: string;
    updated_at: string;
}

function mapPlatformSessionRow({
    row,
    currentSessionId,
}: {
    row: PlatformSessionRow;
    currentSessionId: string | null;
}): PlatformSessionRecord {
    return {
        sessionId: row.session_id,
        userId: row.user_id,
        provider: row.provider,
        label: row.label,
        authenticatedAt: row.authenticated_at,
        lastSeenAt: row.last_seen_at,
        revokedAt: row.revoked_at,
        revokedReason: row.revoked_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isCurrent: row.session_id === currentSessionId,
        manageable: !row.revoked_at,
        legacy: false,
    };
}

export async function getTrackedPlatformSession(sessionId: string | null, userId?: string | null) {
    if (!isPlatformDatabaseConfigured() || !sessionId) {
        return null;
    }

    const rows = await restSelect<PlatformSessionRow[]>("user_platform_sessions", {
        select: "session_id,user_id,provider,label,authenticated_at,last_seen_at,revoked_at,revoked_reason,created_at,updated_at",
        filters: {
            session_id: `eq.${sessionId}`,
            ...(userId ? { user_id: `eq.${userId}` } : {}),
            limit: "1",
        },
    });

    return rows[0] ?? null;
}

export async function listTrackedPlatformSessionsForUser({
    userId,
    currentSessionId,
}: {
    userId: string;
    currentSessionId: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return [] as PlatformSessionRecord[];
    }

    const rows = await restSelect<PlatformSessionRow[]>("user_platform_sessions", {
        select: "session_id,user_id,provider,label,authenticated_at,last_seen_at,revoked_at,revoked_reason,created_at,updated_at",
        filters: {
            user_id: `eq.${userId}`,
            order: "last_seen_at.desc",
            limit: "32",
        },
    });

    return rows.map((row) => mapPlatformSessionRow({ row, currentSessionId }));
}

export async function createTrackedPlatformSession({
    responseCookies,
    userId,
    provider,
    label,
    authenticatedAt,
}: {
    responseCookies: ResponseCookies;
    userId: string;
    provider: AuthSession["providers"][number];
    label: string;
    authenticatedAt: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return null;
    }

    const sessionId = randomUUID();
    const inserted = await restInsert<PlatformSessionRow[]>("user_platform_sessions", {
        session_id: sessionId,
        user_id: userId,
        provider,
        label,
        authenticated_at: authenticatedAt,
        last_seen_at: authenticatedAt,
    });

    setPlatformSessionCookie(responseCookies, sessionId);
    await logPlatformAuditEvent({
        actorUserId: userId,
        actorType: "user",
        targetType: "platform_session",
        targetId: sessionId,
        eventType: "security.session.started",
        summary: `Started tracked platform session ${label}.`,
        metadata: {
            provider,
        },
    });
    return inserted[0] ?? null;
}

export async function ensureTrackedPlatformSessionForRequest({
    responseCookies,
    currentSessionId,
    userId,
    provider,
    label,
    authenticatedAt,
}: {
    responseCookies: ResponseCookies;
    currentSessionId: string | null;
    userId: string;
    provider: AuthSession["providers"][number];
    label: string;
    authenticatedAt: string;
}) {
    const current = await getTrackedPlatformSession(currentSessionId, userId);
    if (current && current.user_id === userId && !isTrackedPlatformSessionRevoked(current.revoked_at)) {
        setPlatformSessionCookie(responseCookies, current.session_id);
        return current;
    }

    return createTrackedPlatformSession({
        responseCookies,
        userId,
        provider,
        label,
        authenticatedAt,
    });
}

export async function touchTrackedPlatformSession(sessionId: string, userId?: string | null) {
    if (!isPlatformDatabaseConfigured()) {
        return;
    }

    await restUpdate(
        "user_platform_sessions",
        {
            last_seen_at: new Date().toISOString(),
        },
        {
            session_id: `eq.${sessionId}`,
            ...(userId ? { user_id: `eq.${userId}` } : {}),
        },
    );
}

export async function revokeTrackedPlatformSession({
    sessionId,
    reason,
}: {
    sessionId: string;
    reason: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return null;
    }

    const updated = await restUpdate<PlatformSessionRow[]>(
        "user_platform_sessions",
        {
            revoked_at: new Date().toISOString(),
            revoked_reason: reason,
        },
        {
            session_id: `eq.${sessionId}`,
            revoked_at: "is.null",
        },
    );

    if (updated[0]) {
        await logPlatformAuditEvent({
            actorUserId: updated[0].user_id,
            actorType: "user",
            targetType: "platform_session",
            targetId: updated[0].session_id,
            eventType: "security.session.revoked",
            summary: `Revoked tracked platform session ${updated[0].label}.`,
            metadata: {
                reason,
            },
        });
    }

    return updated[0] ?? null;
}

export async function revokeOtherTrackedPlatformSessions({
    userId,
    preserveSessionId,
    reason,
}: {
    userId: string;
    preserveSessionId: string | null;
    reason: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return 0;
    }

    const rows = await restSelect<PlatformSessionRow[]>("user_platform_sessions", {
        select: "session_id,user_id,provider,label,authenticated_at,last_seen_at,revoked_at,revoked_reason,created_at,updated_at",
        filters: {
            user_id: `eq.${userId}`,
            revoked_at: "is.null",
            limit: "32",
        },
    });

    const targetIds = resolveRevocableTrackedPlatformSessionIds(
        rows.map((row) => ({
            sessionId: row.session_id,
            revokedAt: row.revoked_at,
        })),
        preserveSessionId,
    );
    if (targetIds.length === 0) {
        return 0;
    }

    await restUpdate(
        "user_platform_sessions",
        {
            revoked_at: new Date().toISOString(),
            revoked_reason: reason,
        },
        {
            session_id: `in.(${targetIds.join(",")})`,
        },
    );

    return targetIds.length;
}
