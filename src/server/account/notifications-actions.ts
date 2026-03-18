import type { NotificationPreferences, NotificationSubscription } from "@/server/contracts/notifications";
import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";

import {
    refreshNotificationInboxSnapshotsForUser,
    synchronizeNotificationReadModelForSession,
} from "./notifications-feed";
import {
    acknowledgeNotificationDeliveryById,
    dismissNotificationDeliveriesByIds,
    dismissNotificationDeliveryById,
    resolveNotificationFeedRows,
    resolveOwnedNotificationDelivery,
    upsertNotificationPreferenceRow,
    upsertNotificationSubscriptionRow,
} from "./notifications-store";

export async function updateNotificationPreferencesForSession(session: AuthSession, preferences: NotificationPreferences) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    await upsertNotificationPreferenceRow(session.user.userId, preferences);

    if (!preferences.inAppEnabled) {
        const rows = await resolveNotificationFeedRows(session.user.userId);
        const activeDeliveryIds = rows
            .filter((row) => !row.studio_notification_signals?.resolved_at && ["pending", "delivered"].includes(row.state))
            .map((row) => row.id);
        await dismissNotificationDeliveriesByIds(activeDeliveryIds);
        await refreshNotificationInboxSnapshotsForUser({
            userId: session.user.userId,
        });
    } else if (session.activeStudioId) {
        const items = await synchronizeNotificationReadModelForSession(session);
        await refreshNotificationInboxSnapshotsForUser({
            userId: session.user.userId,
            studioIds: [session.activeStudioId],
            syncedAt: new Date().toISOString(),
            items,
        });
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "notification_preferences",
        targetId: session.user.userId,
        eventType: "notifications.preferences.updated",
        summary: "Updated notification routing preferences.",
        metadata: preferences,
    });
}

export async function updateNotificationSubscriptionForSession({
    session,
    domain,
    following,
}: {
    session: AuthSession;
    domain: NotificationSubscription["domain"];
    following: boolean;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!session.activeStudioId) {
        throw new Error("An active workspace is required to update lane subscriptions.");
    }

    await upsertNotificationSubscriptionRow({
        studioId: session.activeStudioId,
        userId: session.user.userId,
        domain,
        following,
    });

    if (!following) {
        const rows = await resolveNotificationFeedRows(session.user.userId);
        const deliveryIds = rows
            .filter((row) => row.studio_notification_signals?.domain === domain && ["pending", "delivered"].includes(row.state))
            .map((row) => row.id);
        await dismissNotificationDeliveriesByIds(deliveryIds);
        await refreshNotificationInboxSnapshotsForUser({
            userId: session.user.userId,
            studioIds: [session.activeStudioId],
        });
    } else {
        const items = await synchronizeNotificationReadModelForSession(session);
        await refreshNotificationInboxSnapshotsForUser({
            userId: session.user.userId,
            studioIds: [session.activeStudioId],
            syncedAt: new Date().toISOString(),
            items,
        });
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "notification_subscription",
        targetId: `${session.user.userId}:${domain}`,
        eventType: "notifications.subscription.updated",
        summary: `${following ? "Followed" : "Muted"} the ${domain} lane.`,
        metadata: {
            domain,
            following,
        },
    });
}

export async function acknowledgeNotificationDeliveryForSession({
    session,
    deliveryId,
}: {
    session: AuthSession;
    deliveryId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const delivery = await resolveOwnedNotificationDelivery(session.user.userId, deliveryId);
    if (!delivery) {
        throw new Error("Notification delivery not found.");
    }

    await acknowledgeNotificationDeliveryById(deliveryId);
    await refreshNotificationInboxSnapshotsForUser({
        userId: session.user.userId,
        studioIds: delivery.studio_notification_signals?.studio_id ? [delivery.studio_notification_signals.studio_id] : undefined,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "notification_delivery",
        targetId: deliveryId,
        eventType: "notifications.delivery.acknowledged",
        summary: `Acknowledged notification ${delivery.studio_notification_signals?.title ?? deliveryId}.`,
    });
}

export async function dismissNotificationDeliveryForSession({
    session,
    deliveryId,
}: {
    session: AuthSession;
    deliveryId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const delivery = await resolveOwnedNotificationDelivery(session.user.userId, deliveryId);
    if (!delivery) {
        throw new Error("Notification delivery not found.");
    }

    await dismissNotificationDeliveryById(deliveryId);
    await refreshNotificationInboxSnapshotsForUser({
        userId: session.user.userId,
        studioIds: delivery.studio_notification_signals?.studio_id ? [delivery.studio_notification_signals.studio_id] : undefined,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "notification_delivery",
        targetId: deliveryId,
        eventType: "notifications.delivery.dismissed",
        summary: `Dismissed notification ${delivery.studio_notification_signals?.title ?? deliveryId}.`,
    });
}
