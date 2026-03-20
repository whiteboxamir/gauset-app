import type {
    NotificationDelivery,
    NotificationFeedSnapshot,
    NotificationPreferences,
    NotificationShellSummary,
    NotificationSubscription,
} from "@/server/contracts/notifications";
import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import {
    buildNotificationFeedCounts,
    buildDigestDomainCounts,
    buildDigestScheduleLabel,
    deriveNotificationAudience,
    isNotificationShellSnapshotFresh,
    sortNotificationFeedItems,
} from "@/server/platform/notifications-core";

import { synchronizeNotificationDeliveriesForSession, synchronizeNotificationSignalsForSession } from "./notifications-signals";
import {
    buildInheritedSubscriptions,
    createDefaultNotificationPreferences,
    createEmptyNotificationFeedSnapshot,
    createEmptyNotificationShellSummary,
    ensureNotificationPreferences,
    mapNotificationDelivery,
    markPendingDeliveriesDelivered,
    resolveActiveStudioMemberships,
    resolveNotificationInboxSnapshot,
    resolveNotificationInboxSnapshots,
    resolveNotificationFeedRows,
    resolveNotificationFeedRowsByIds,
    resolveNotificationSubscriptions,
    upsertNotificationInboxSnapshot,
    type StudioMembershipRow,
} from "./notifications-store";

const notificationShellPreviewLimit = 3;
const studioScopedNotificationSyncUserId = "00000000-0000-0000-0000-000000000000";
const studioScopedNotificationSyncEntitlements: AuthSession["entitlements"] = {
    canAccessMvp: false,
    canInviteSeats: false,
    canUseAdminConsole: false,
    canUsePrioritySupport: false,
    seatLimit: null,
    seatsUsed: 0,
    projectLimit: null,
    worldLimit: null,
    storageBytesLimit: null,
    monthlyCreditsIncluded: null,
    monthlyCreditsRemaining: null,
};

function createStudioScopedNotificationSyncSession(studioId: string): AuthSession {
    return {
        user: {
            userId: studioScopedNotificationSyncUserId,
            email: "platform-notifications@gauset.local",
            displayName: "Platform notifications",
            avatarUrl: null,
            onboardingState: "active",
        },
        studios: [
            {
                studioId,
                studioName: "Studio",
                role: "owner",
                planCode: null,
            },
        ],
        activeStudioId: studioId,
        providers: ["admin"],
        platformSessionId: null,
        platformSessionTracked: false,
        entitlements: studioScopedNotificationSyncEntitlements,
    };
}

function getAudienceDecision(domain: NotificationSubscription["domain"], role: StudioMembershipRow["role"] | null) {
    return deriveNotificationAudience({
        domain,
        role,
        active: true,
        canUsePrioritySupport: role === "owner" || role === "admin",
        canInviteSeats: role === "owner" || role === "admin",
    });
}

function buildNotificationShellSummary({
    workspaceId,
    unreadCount,
    items,
    generatedAt,
    syncedAt,
    stale,
}: {
    workspaceId: string | null;
    unreadCount: number;
    items: NotificationDelivery[];
    generatedAt: string;
    syncedAt: string | null;
    stale: boolean;
}): NotificationShellSummary {
    return {
        workspaceId,
        generatedAt,
        syncedAt,
        stale,
        unreadCount,
        items,
    };
}

function filterNotificationItemsForStudio(items: NotificationDelivery[], studioId: string) {
    return items.filter((item) => item.signal.studioId === studioId);
}

async function upsertNotificationInboxSnapshotsFromItems({
    userId,
    items,
    studioIds,
    syncedAt,
}: {
    userId: string;
    items: NotificationDelivery[];
    studioIds: string[];
    syncedAt?: string | null;
}) {
    const targetStudioIds = Array.from(new Set(studioIds.filter(Boolean)));
    if (targetStudioIds.length === 0) {
        return;
    }

    const refreshedAt = new Date().toISOString();
    const existingSnapshots =
        syncedAt === undefined ? await resolveNotificationInboxSnapshots(userId, targetStudioIds) : [];
    const existingSyncedAtByStudio = new Map(existingSnapshots.map((snapshot) => [snapshot.studio_id, snapshot.synced_at]));

    await Promise.all(
        targetStudioIds.map((studioId) => {
            const studioItems = filterNotificationItemsForStudio(items, studioId);
            const counts = buildNotificationFeedCounts(studioItems.map((item) => item.state));

            return upsertNotificationInboxSnapshot({
                studioId,
                userId,
                unreadCount: counts.unreadCount,
                previewDeliveryIds: studioItems.slice(0, notificationShellPreviewLimit).map((item) => item.deliveryId),
                syncedAt: syncedAt === undefined ? existingSyncedAtByStudio.get(studioId) ?? null : syncedAt,
                refreshedAt,
            });
        }),
    );
}

export async function synchronizeNotificationReadModelForSession(session: AuthSession): Promise<NotificationDelivery[]> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return [];
    }

    const signals = await synchronizeNotificationSignalsForSession(session);
    await synchronizeNotificationDeliveriesForSession({
        session,
        signals,
    });

    const rows = await resolveNotificationFeedRows(session.user.userId);
    const pendingIds = rows.filter((row) => row.state === "pending").map((row) => row.id);
    if (pendingIds.length > 0) {
        await markPendingDeliveriesDelivered(pendingIds);
    }

    const latestRows = pendingIds.length > 0 ? await resolveNotificationFeedRows(session.user.userId) : rows;
    return sortNotificationFeedItems(
        latestRows
            .map(mapNotificationDelivery)
            .filter((item): item is NonNullable<ReturnType<typeof mapNotificationDelivery>> => Boolean(item)),
    );
}

export async function refreshNotificationInboxSnapshotsForUser({
    userId,
    studioIds,
    syncedAt,
    items,
}: {
    userId: string;
    studioIds?: string[];
    syncedAt?: string | null;
    items?: NotificationDelivery[];
}) {
    if (!isPlatformDatabaseConfigured()) {
        return;
    }

    const resolvedItems =
        items ??
        sortNotificationFeedItems(
            (await resolveNotificationFeedRows(userId))
                .map(mapNotificationDelivery)
                .filter((item): item is NonNullable<ReturnType<typeof mapNotificationDelivery>> => Boolean(item)),
        );
    const targetStudioIds =
        studioIds && studioIds.length > 0
            ? Array.from(new Set(studioIds.filter(Boolean)))
            : Array.from(new Set(resolvedItems.map((item) => item.signal.studioId)));

    await upsertNotificationInboxSnapshotsFromItems({
        userId,
        items: resolvedItems,
        studioIds: targetStudioIds,
        syncedAt,
    });
}

export async function getNotificationShellSummaryForSession(session: AuthSession): Promise<NotificationShellSummary> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return createEmptyNotificationShellSummary(session.activeStudioId);
    }

    const snapshot = await resolveNotificationInboxSnapshot(session.activeStudioId, session.user.userId);
    if (snapshot) {
        const previewIds = snapshot.preview_delivery_ids ?? [];
        const previewRows = previewIds.length > 0 ? await resolveNotificationFeedRowsByIds(session.user.userId, previewIds) : [];
        const previewRowsById = new Map(previewRows.map((row) => [row.id, row]));
        const previewItems = previewIds.flatMap((deliveryId) => {
            const item = previewRowsById.get(deliveryId) ? mapNotificationDelivery(previewRowsById.get(deliveryId)!) : null;
            return item ? [item] : [];
        });

        return buildNotificationShellSummary({
            workspaceId: session.activeStudioId,
            unreadCount: snapshot.unread_count,
            items: previewItems,
            generatedAt: snapshot.refreshed_at,
            syncedAt: snapshot.synced_at,
            stale: !isNotificationShellSnapshotFresh(snapshot.synced_at),
        });
    }

    return buildNotificationShellSummary({
        workspaceId: session.activeStudioId,
        unreadCount: 0,
        items: [],
        generatedAt: new Date().toISOString(),
        syncedAt: null,
        stale: true,
    });
}

export async function syncNotificationShellSummaryForSession(session: AuthSession): Promise<{
    changed: boolean;
    summary: NotificationShellSummary;
}> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return {
            changed: false,
            summary: createEmptyNotificationShellSummary(session.activeStudioId),
        };
    }

    const previousSnapshot = await resolveNotificationInboxSnapshot(session.activeStudioId, session.user.userId);
    const items = await synchronizeNotificationReadModelForSession(session);
    const studioItems = filterNotificationItemsForStudio(items, session.activeStudioId);
    const counts = buildNotificationFeedCounts(studioItems.map((item) => item.state));
    const snapshotTimestamp = new Date().toISOString();
    const previewDeliveryIds = studioItems.slice(0, notificationShellPreviewLimit).map((item) => item.deliveryId);
    const previousPreviewDeliveryIds = previousSnapshot?.preview_delivery_ids ?? [];

    await upsertNotificationInboxSnapshotsFromItems({
        userId: session.user.userId,
        items,
        studioIds: [session.activeStudioId],
        syncedAt: snapshotTimestamp,
    });

    return {
        changed:
            !previousSnapshot ||
            previousSnapshot.unread_count !== counts.unreadCount ||
            previousPreviewDeliveryIds.join(",") !== previewDeliveryIds.join(","),
        summary: buildNotificationShellSummary({
            workspaceId: session.activeStudioId,
            unreadCount: counts.unreadCount,
            items: studioItems.slice(0, notificationShellPreviewLimit),
            generatedAt: snapshotTimestamp,
            syncedAt: snapshotTimestamp,
            stale: false,
        }),
    };
}

async function syncNotificationStudioState({
    session,
    studioId,
    actorUserId,
    actorType = "system",
}: {
    session: AuthSession;
    studioId: string;
    actorUserId?: string | null;
    actorType?: "user" | "admin" | "system";
}) {
    if (!isPlatformDatabaseConfigured()) {
        return;
    }

    const signals = await synchronizeNotificationSignalsForSession(session, {
        actorUserId,
        actorType,
    });
    await synchronizeNotificationDeliveriesForSession({
        session,
        signals,
    });

    const memberships = await resolveActiveStudioMemberships(studioId);
    const syncedAt = new Date().toISOString();

    await Promise.all(
        memberships.map((membership) =>
            refreshNotificationInboxSnapshotsForUser({
                userId: membership.user_id,
                studioIds: [studioId],
                syncedAt,
            }),
        ),
    );
}

export async function syncNotificationStudioStateForSession(session: AuthSession) {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return;
    }

    await syncNotificationStudioState({
        session,
        studioId: session.activeStudioId,
        actorUserId: session.user.userId,
        actorType: "system",
    });
}

export async function syncNotificationStudioStateForStudio({
    studioId,
    actorUserId = null,
    actorType = "system",
}: {
    studioId: string;
    actorUserId?: string | null;
    actorType?: "user" | "admin" | "system";
}) {
    if (!isPlatformDatabaseConfigured() || !studioId) {
        return;
    }

    await syncNotificationStudioState({
        session: createStudioScopedNotificationSyncSession(studioId),
        studioId,
        actorUserId,
        actorType,
    });
}

export async function getNotificationCenterForSession(session: AuthSession): Promise<{
    preferences: NotificationPreferences;
    feed: NotificationFeedSnapshot;
}> {
    const preferences = isPlatformDatabaseConfigured()
        ? await ensureNotificationPreferences(session.user.userId)
        : createDefaultNotificationPreferences();

    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return {
            preferences,
            feed: createEmptyNotificationFeedSnapshot(session.activeStudioId, preferences),
        };
    }

    const [items, memberships] = await Promise.all([
        synchronizeNotificationReadModelForSession(session),
        resolveActiveStudioMemberships(session.activeStudioId),
    ]);

    const subscriptionRows = await resolveNotificationSubscriptions(session.activeStudioId, [session.user.userId]);
    const currentMembership = memberships.find((membership) => membership.user_id === session.user.userId) ?? null;
    const subscriptions = buildInheritedSubscriptions({
        studioId: session.activeStudioId,
        userId: session.user.userId,
        role: currentMembership?.role ?? null,
        rows: subscriptionRows,
        getAudienceDecision,
    });

    const counts = buildNotificationFeedCounts(items.map((item) => item.state));
    const snapshotTimestamp = new Date().toISOString();
    await upsertNotificationInboxSnapshotsFromItems({
        userId: session.user.userId,
        items,
        studioIds: [session.activeStudioId],
        syncedAt: snapshotTimestamp,
    });

    return {
        preferences,
        feed: {
            workspaceId: session.activeStudioId,
            generatedAt: snapshotTimestamp,
            ...counts,
            subscriptions,
            items,
            digest: {
                cadence: preferences.digestCadence,
                scheduledForLabel: buildDigestScheduleLabel(preferences),
                items: preferences.digestEnabled ? items.filter((item) => item.state !== "dismissed").slice(0, 12) : [],
                domainCounts: preferences.digestEnabled
                    ? buildDigestDomainCounts(
                          items.slice(0, 24).map((item) => ({
                              state: item.state,
                              signal: {
                                  domain: item.signal.domain,
                                  severity: item.signal.severity,
                                  resolvedAt: item.signal.resolvedAt,
                              },
                          })),
                      )
                    : [],
            },
        },
    };
}

export async function getNotificationPreferencesForSession(session: AuthSession): Promise<NotificationPreferences> {
    if (!isPlatformDatabaseConfigured()) {
        return createDefaultNotificationPreferences();
    }

    return ensureNotificationPreferences(session.user.userId);
}

export async function getNotificationSubscriptionsForSession(session: AuthSession): Promise<NotificationSubscription[]> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return [];
    }

    const [memberships, rows] = await Promise.all([
        resolveActiveStudioMemberships(session.activeStudioId),
        resolveNotificationSubscriptions(session.activeStudioId, [session.user.userId]),
    ]);
    const currentMembership = memberships.find((membership) => membership.user_id === session.user.userId) ?? null;
    return buildInheritedSubscriptions({
        studioId: session.activeStudioId,
        userId: session.user.userId,
        role: currentMembership?.role ?? null,
        rows,
        getAudienceDecision,
    });
}
