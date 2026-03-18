import type { AccessReasonSummary, PlatformSessionRecord, SecurityEvent, SecurityOverview } from "@/server/contracts/security";
import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";
import { revokeOtherTrackedPlatformSessions, revokeTrackedPlatformSession, listTrackedPlatformSessionsForUser } from "@/server/auth/platform-sessions";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import { deriveAccessReasonSummaries, partitionActiveTrackedPlatformSessions } from "@/server/platform/security-core";

interface AuditRow {
    id: string;
    actor_type: SecurityEvent["actorType"];
    event_type: string;
    summary: string;
    created_at: string;
}

function getActiveStudio(session: AuthSession) {
    return session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
}

export function getAccessReasonSummariesForSession(session: AuthSession): AccessReasonSummary[] {
    const activeStudio = getActiveStudio(session);

    return deriveAccessReasonSummaries({
        role: activeStudio?.role ?? null,
        hasActiveStudio: Boolean(activeStudio),
        entitlements: {
            canAccessMvp: session.entitlements.canAccessMvp,
            canInviteSeats: session.entitlements.canInviteSeats,
            canUsePrioritySupport: session.entitlements.canUsePrioritySupport,
        },
    });
}

export async function getPlatformSecuritySessionsForSession(session: AuthSession) {
    if (!isPlatformDatabaseConfigured()) {
        return {
            legacySessionDetected: !session.platformSessionTracked,
            currentSession: null as PlatformSessionRecord | null,
            otherSessions: [] as PlatformSessionRecord[],
        };
    }

    const sessions = await listTrackedPlatformSessionsForUser({
        userId: session.user.userId,
        currentSessionId: session.platformSessionId,
    });
    const { currentSession, otherSessions } = partitionActiveTrackedPlatformSessions(sessions);

    return {
        legacySessionDetected: !session.platformSessionTracked,
        currentSession,
        otherSessions,
    };
}

export async function getSecurityOverviewForSession(session: AuthSession): Promise<SecurityOverview> {
    const activeStudio = getActiveStudio(session);
    const accessReasons = getAccessReasonSummariesForSession(session);

    if (!isPlatformDatabaseConfigured()) {
        return {
            email: session.user.email,
            onboardingState: session.user.onboardingState,
            providers: session.providers,
            activeStudioName: activeStudio?.studioName ?? null,
            activeStudioRole: activeStudio?.role ?? null,
            planCode: activeStudio?.planCode ?? null,
            canInviteSeats: session.entitlements.canInviteSeats,
            canAccessMvp: session.entitlements.canAccessMvp,
            canUsePrioritySupport: session.entitlements.canUsePrioritySupport,
            legacySessionDetected: !session.platformSessionTracked,
            currentSession: null,
            otherSessions: [],
            accessReasons,
            recentEvents: [],
        };
    }

    const [sessionInventory, auditRows] = await Promise.all([
        getPlatformSecuritySessionsForSession(session),
        restSelect<AuditRow[]>("audit_events", {
            select: "id,actor_type,event_type,summary,created_at",
            filters: {
                actor_user_id: `eq.${session.user.userId}`,
                order: "created_at.desc",
                limit: "12",
            },
        }),
    ]);

    const providers = Array.from(
        new Set([
            ...session.providers,
            ...(sessionInventory.currentSession ? [sessionInventory.currentSession.provider] : []),
            ...sessionInventory.otherSessions.map((entry) => entry.provider),
        ]),
    );

    return {
        email: session.user.email,
        onboardingState: session.user.onboardingState,
        providers,
        activeStudioName: activeStudio?.studioName ?? null,
        activeStudioRole: activeStudio?.role ?? null,
        planCode: activeStudio?.planCode ?? null,
        canInviteSeats: session.entitlements.canInviteSeats,
        canAccessMvp: session.entitlements.canAccessMvp,
        canUsePrioritySupport: session.entitlements.canUsePrioritySupport,
        legacySessionDetected: sessionInventory.legacySessionDetected,
        currentSession: sessionInventory.currentSession,
        otherSessions: sessionInventory.otherSessions,
        accessReasons,
        recentEvents: auditRows.map((row) => ({
            id: row.id,
            actorType: row.actor_type,
            eventType: row.event_type,
            summary: row.summary,
            createdAt: row.created_at,
        })),
    };
}

export async function revokePlatformSessionForSession({
    session,
    sessionId,
}: {
    session: AuthSession;
    sessionId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    if (!sessionId.trim()) {
        throw new Error("Session id is required.");
    }
    if (session.platformSessionId && session.platformSessionId === sessionId) {
        throw new Error("Use logout to revoke the current tracked session.");
    }

    const userSessions = await listTrackedPlatformSessionsForUser({
        userId: session.user.userId,
        currentSessionId: session.platformSessionId,
    });
    const target = userSessions.find((entry) => entry.sessionId === sessionId) ?? null;
    if (!target) {
        throw new Error("Tracked session not found.");
    }

    await revokeTrackedPlatformSession({
        sessionId,
        reason: "user_revoke",
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "platform_session",
        targetId: sessionId,
        eventType: "security.session.revoked",
        summary: `Revoked tracked session ${target.label}.`,
    });
}

export async function revokeOtherPlatformSessionsForSession(session: AuthSession) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!session.platformSessionId) {
        throw new Error("Current session is not a tracked platform session yet.");
    }

    const revokedCount = await revokeOtherTrackedPlatformSessions({
        userId: session.user.userId,
        preserveSessionId: session.platformSessionId,
        reason: "revoke_others",
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "platform_session",
        targetId: session.platformSessionId,
        eventType: "security.session.revoked_others",
        summary: `Revoked ${revokedCount} other tracked session${revokedCount === 1 ? "" : "s"}.`,
        metadata: {
            revokedCount,
        },
    });

    return revokedCount;
}
