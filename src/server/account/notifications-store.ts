import type {
    NotificationDelivery,
    NotificationFeedSnapshot,
    NotificationPreferences,
    NotificationSignal,
    NotificationShellSummary,
    NotificationSubscription,
} from "@/server/contracts/notifications";

import { restInsert, restSelect, restUpdate, restUpsert } from "@/server/db/rest";
import { buildDigestScheduleLabel, isNotificationUnread } from "@/server/platform/notifications-core";

export interface NotificationPreferenceRow {
    user_id: string;
    in_app_enabled: boolean;
    digest_enabled: boolean;
    digest_cadence: NotificationPreferences["digestCadence"];
    digest_hour_utc: number;
    digest_weekday: number;
}

export interface NotificationSubscriptionRow {
    id: string;
    studio_id: string;
    user_id: string;
    domain: NotificationSubscription["domain"];
    following: boolean;
    created_at: string;
    updated_at: string;
}

export interface NotificationSignalRow {
    id: string;
    signal_key: string;
    studio_id: string;
    domain: NotificationSignal["domain"];
    severity: NotificationSignal["severity"];
    source_type: string;
    source_id: string | null;
    title: string;
    body: string;
    href: string;
    audience_label: string;
    why: string;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface NotificationDeliveryRow {
    id: string;
    user_id: string;
    state: NotificationDelivery["state"];
    delivery_reason: string;
    delivered_at: string | null;
    acknowledged_at: string | null;
    dismissed_at: string | null;
    created_at: string;
    updated_at: string;
    studio_notification_signals: NotificationSignalRow | null;
}

export interface NotificationInboxSnapshotRow {
    studio_id: string;
    user_id: string;
    unread_count: number;
    preview_delivery_ids: string[] | null;
    synced_at: string | null;
    refreshed_at: string;
    created_at: string;
    updated_at: string;
}

export interface StudioMembershipRow {
    user_id: string;
    role: "owner" | "admin" | "member" | "finance";
    status: "active" | "invited" | "suspended";
}

export interface ProfileLabelRow {
    id: string;
    email: string;
    display_name: string | null;
}

export interface NotificationSignalRecordInput {
    signalKey: string;
    domain: NotificationSignal["domain"];
    severity: NotificationSignal["severity"];
    sourceType: string;
    sourceId: string | null;
    title: string;
    body: string;
    href: string;
    audienceLabel: string;
    why: string;
    resolvedAt: string | null;
    updatedAt: string;
}

const notificationSubscriptionDomains: NotificationSubscription["domain"][] = [
    "workspace",
    "billing",
    "team",
    "support",
    "projects",
    "governance",
    "coverage",
];

export function createDefaultNotificationPreferences(): NotificationPreferences {
    return {
        inAppEnabled: true,
        digestEnabled: true,
        digestCadence: "daily",
        digestHourUtc: 16,
        digestWeekday: 1,
    };
}

export function createEmptyNotificationFeedSnapshot(
    workspaceId: string | null,
    preferences: NotificationPreferences,
): NotificationFeedSnapshot {
    return {
        workspaceId,
        generatedAt: new Date().toISOString(),
        unreadCount: 0,
        pendingCount: 0,
        acknowledgedCount: 0,
        dismissedCount: 0,
        subscriptions: [],
        items: [],
        digest: {
            cadence: preferences.digestCadence,
            scheduledForLabel: buildDigestScheduleLabel(preferences),
            items: [],
            domainCounts: [],
        },
    };
}

export function createEmptyNotificationShellSummary(workspaceId: string | null): NotificationShellSummary {
    return {
        workspaceId,
        generatedAt: new Date().toISOString(),
        syncedAt: null,
        stale: false,
        unreadCount: 0,
        items: [],
    };
}

export function mapNotificationPreferences(row: NotificationPreferenceRow | null): NotificationPreferences {
    if (!row) {
        return createDefaultNotificationPreferences();
    }

    return {
        inAppEnabled: row.in_app_enabled,
        digestEnabled: row.digest_enabled,
        digestCadence: row.digest_cadence,
        digestHourUtc: row.digest_hour_utc,
        digestWeekday: row.digest_weekday,
    };
}

export function mapNotificationSignal(row: NotificationSignalRow): NotificationSignal {
    return {
        signalId: row.id,
        signalKey: row.signal_key,
        studioId: row.studio_id,
        domain: row.domain,
        severity: row.severity,
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.title,
        body: row.body,
        href: row.href,
        audienceLabel: row.audience_label,
        why: row.why,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapNotificationDelivery(row: NotificationDeliveryRow): NotificationDelivery | null {
    if (!row.studio_notification_signals) {
        return null;
    }

    return {
        deliveryId: row.id,
        userId: row.user_id,
        state: row.state,
        stateChangedAt: row.updated_at,
        deliveredAt: row.delivered_at,
        acknowledgedAt: row.acknowledged_at,
        dismissedAt: row.dismissed_at,
        deliveryReason: row.delivery_reason,
        isUnread: isNotificationUnread(row.state),
        isDigestCandidate: row.state !== "dismissed",
        signal: mapNotificationSignal(row.studio_notification_signals),
    };
}

function getSignalAudienceLabel(domain: NotificationSignal["domain"]) {
    switch (domain) {
        case "workspace":
            return "Workspace operators";
        case "billing":
            return "Billing operators";
        case "team":
            return "Team operators";
        case "support":
            return "Support operators";
        case "projects":
            return "Project operators";
        case "governance":
            return "Governance operators";
        case "coverage":
            return "Coverage operators";
        default:
            return "Workspace operators";
    }
}

export function createNotificationSignalRecordInput(
    input: Omit<NotificationSignalRecordInput, "audienceLabel"> & { audienceLabel?: string },
): NotificationSignalRecordInput {
    return {
        ...input,
        audienceLabel: input.audienceLabel ?? getSignalAudienceLabel(input.domain),
    };
}

export async function ensureNotificationPreferences(userId: string) {
    const rows = await restSelect<NotificationPreferenceRow[]>("user_notification_preferences", {
        select: "user_id,in_app_enabled,digest_enabled,digest_cadence,digest_hour_utc,digest_weekday",
        filters: {
            user_id: `eq.${userId}`,
            limit: "1",
        },
    });

    if (rows[0]) {
        return mapNotificationPreferences(rows[0]);
    }

    const inserted = await restInsert<NotificationPreferenceRow[]>("user_notification_preferences", {
        user_id: userId,
        in_app_enabled: true,
        digest_enabled: true,
        digest_cadence: "daily",
        digest_hour_utc: 16,
        digest_weekday: 1,
    });

    return mapNotificationPreferences(inserted[0] ?? null);
}

export async function resolveActiveStudioMemberships(studioId: string) {
    return restSelect<StudioMembershipRow[]>("studio_memberships", {
        select: "user_id,role,status",
        filters: {
            studio_id: `eq.${studioId}`,
            status: "eq.active",
            order: "created_at.asc",
        },
    });
}

export async function resolveProfileLabels(userIds: string[]) {
    if (userIds.length === 0) {
        return new Map<string, string>();
    }

    const rows = await restSelect<ProfileLabelRow[]>("profiles", {
        select: "id,email,display_name",
        filters: {
            id: `in.(${userIds.join(",")})`,
        },
    });

    return new Map(rows.map((row) => [row.id, row.display_name ?? row.email]));
}

export async function resolveNotificationSubscriptions(studioId: string, userIds: string[]) {
    if (userIds.length === 0) {
        return [] as NotificationSubscriptionRow[];
    }

    return restSelect<NotificationSubscriptionRow[]>("studio_notification_subscriptions", {
        select: "id,studio_id,user_id,domain,following,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            user_id: `in.(${userIds.join(",")})`,
            order: "created_at.asc",
            limit: "200",
        },
    });
}

export async function resolveNotificationPreferencesForUsers(userIds: string[]) {
    if (userIds.length === 0) {
        return [] as NotificationPreferenceRow[];
    }

    return restSelect<NotificationPreferenceRow[]>("user_notification_preferences", {
        select: "user_id,in_app_enabled,digest_enabled,digest_cadence,digest_hour_utc,digest_weekday",
        filters: {
            user_id: `in.(${userIds.join(",")})`,
            limit: String(Math.max(userIds.length, 1)),
        },
    });
}

export function buildInheritedSubscriptions({
    studioId,
    userId,
    role,
    rows,
    getAudienceDecision,
}: {
    studioId: string | null;
    userId: string;
    role: StudioMembershipRow["role"] | null;
    rows: NotificationSubscriptionRow[];
    getAudienceDecision: (domain: NotificationSubscription["domain"], role: StudioMembershipRow["role"] | null) => {
        audienceLabel: string;
        reason: string;
    };
}): NotificationSubscription[] {
    return notificationSubscriptionDomains.map((domain) => {
        const row = rows.find((entry) => entry.domain === domain) ?? null;
        const decision = getAudienceDecision(domain, role);

        return {
            subscriptionId: row?.id ?? `${studioId ?? "workspace-none"}:${userId}:${domain}`,
            studioId,
            userId,
            domain,
            following: row?.following ?? true,
            inherited: !row,
            audienceLabel: decision.audienceLabel,
            reason: row ? "Explicit lane subscription stored for this workspace." : decision.reason,
            createdAt: row?.created_at ?? null,
            updatedAt: row?.updated_at ?? null,
        };
    });
}

export async function resolveNotificationSignals(studioId: string) {
    return restSelect<NotificationSignalRow[]>("studio_notification_signals", {
        select: "id,signal_key,studio_id,domain,severity,source_type,source_id,title,body,href,audience_label,why,resolved_at,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "updated_at.desc",
            limit: "250",
        },
    });
}

export async function upsertNotificationSignals(studioId: string, signals: NotificationSignalRecordInput[]) {
    if (signals.length === 0) {
        return;
    }

    await restUpsert<NotificationSignalRow[]>(
        "studio_notification_signals",
        signals.map((signal) => ({
            signal_key: signal.signalKey,
            studio_id: studioId,
            domain: signal.domain,
            severity: signal.severity,
            source_type: signal.sourceType,
            source_id: signal.sourceId,
            title: signal.title,
            body: signal.body,
            href: signal.href,
            audience_label: signal.audienceLabel,
            why: signal.why,
            resolved_at: signal.resolvedAt,
            updated_at: signal.updatedAt,
        })),
        {
            onConflict: "studio_id,signal_key",
        },
    );
}

export async function resolveExistingNotificationDeliveries(signalIds: string[], userIds: string[]) {
    if (signalIds.length === 0 || userIds.length === 0) {
        return [] as Array<{ id: string; signal_id: string; user_id: string }>;
    }

    return restSelect<Array<{ id: string; signal_id: string; user_id: string }>>("user_notification_deliveries", {
        select: "id,signal_id,user_id",
        filters: {
            signal_id: `in.(${signalIds.join(",")})`,
            user_id: `in.(${userIds.join(",")})`,
            limit: "800",
        },
    });
}

export async function insertNotificationDeliveries(
    payloads: Array<{
        signal_id: string;
        user_id: string;
        state: NotificationDelivery["state"];
        delivery_reason: string;
    }>,
) {
    if (payloads.length === 0) {
        return;
    }

    await restInsert("user_notification_deliveries", payloads);
}

export async function resolveNotificationFeedRows(userId: string) {
    return restSelect<NotificationDeliveryRow[]>("user_notification_deliveries", {
        select:
            "id,user_id,state,delivery_reason,delivered_at,acknowledged_at,dismissed_at,created_at,updated_at,studio_notification_signals(id,signal_key,studio_id,domain,severity,source_type,source_id,title,body,href,audience_label,why,resolved_at,created_at,updated_at)",
        filters: {
            user_id: `eq.${userId}`,
            order: "updated_at.desc",
            limit: "80",
        },
    });
}

export async function resolveNotificationFeedRowsByIds(userId: string, deliveryIds: string[]) {
    if (deliveryIds.length === 0) {
        return [] as NotificationDeliveryRow[];
    }

    return restSelect<NotificationDeliveryRow[]>("user_notification_deliveries", {
        select:
            "id,user_id,state,delivery_reason,delivered_at,acknowledged_at,dismissed_at,created_at,updated_at,studio_notification_signals(id,signal_key,studio_id,domain,severity,source_type,source_id,title,body,href,audience_label,why,resolved_at,created_at,updated_at)",
        filters: {
            id: `in.(${deliveryIds.join(",")})`,
            user_id: `eq.${userId}`,
            limit: String(Math.max(deliveryIds.length, 1)),
        },
    });
}

export async function markPendingDeliveriesDelivered(deliveryIds: string[]) {
    if (deliveryIds.length === 0) {
        return;
    }

    await restUpdate(
        "user_notification_deliveries",
        {
            state: "delivered",
            delivered_at: new Date().toISOString(),
        },
        {
            id: `in.(${deliveryIds.join(",")})`,
            state: "eq.pending",
        },
    );
}

export async function dismissNotificationDeliveriesByIds(deliveryIds: string[]) {
    if (deliveryIds.length === 0) {
        return;
    }

    await restUpdate(
        "user_notification_deliveries",
        {
            state: "dismissed",
            dismissed_at: new Date().toISOString(),
        },
        {
            id: `in.(${deliveryIds.join(",")})`,
        },
    );
}

export async function upsertNotificationPreferenceRow(userId: string, preferences: NotificationPreferences) {
    await restUpsert(
        "user_notification_preferences",
        {
            user_id: userId,
            in_app_enabled: preferences.inAppEnabled,
            digest_enabled: preferences.digestEnabled,
            digest_cadence: preferences.digestCadence,
            digest_hour_utc: preferences.digestHourUtc,
            digest_weekday: preferences.digestWeekday,
        },
        {
            onConflict: "user_id",
        },
    );
}

export async function upsertNotificationSubscriptionRow({
    studioId,
    userId,
    domain,
    following,
}: {
    studioId: string;
    userId: string;
    domain: NotificationSubscription["domain"];
    following: boolean;
}) {
    await restUpsert(
        "studio_notification_subscriptions",
        {
            studio_id: studioId,
            user_id: userId,
            domain,
            following,
        },
        {
            onConflict: "studio_id,user_id,domain",
        },
    );
}

export async function resolveNotificationInboxSnapshots(userId: string, studioIds: string[]) {
    if (studioIds.length === 0) {
        return [] as NotificationInboxSnapshotRow[];
    }

    return restSelect<NotificationInboxSnapshotRow[]>("user_notification_inbox_snapshots", {
        select: "studio_id,user_id,unread_count,preview_delivery_ids,synced_at,refreshed_at,created_at,updated_at",
        filters: {
            user_id: `eq.${userId}`,
            studio_id: `in.(${studioIds.join(",")})`,
            limit: String(Math.max(studioIds.length, 1)),
        },
    });
}

export async function resolveNotificationInboxSnapshot(studioId: string, userId: string) {
    const rows = await resolveNotificationInboxSnapshots(userId, [studioId]);
    return rows[0] ?? null;
}

export async function upsertNotificationInboxSnapshot({
    studioId,
    userId,
    unreadCount,
    previewDeliveryIds,
    syncedAt,
    refreshedAt,
}: {
    studioId: string;
    userId: string;
    unreadCount: number;
    previewDeliveryIds: string[];
    syncedAt: string | null;
    refreshedAt: string;
}) {
    await restUpsert(
        "user_notification_inbox_snapshots",
        {
            studio_id: studioId,
            user_id: userId,
            unread_count: unreadCount,
            preview_delivery_ids: previewDeliveryIds,
            synced_at: syncedAt,
            refreshed_at: refreshedAt,
        },
        {
            onConflict: "studio_id,user_id",
        },
    );
}

export async function resolveOwnedNotificationDelivery(userId: string, deliveryId: string) {
    const rows = await restSelect<NotificationDeliveryRow[]>("user_notification_deliveries", {
        select:
            "id,user_id,state,delivery_reason,delivered_at,acknowledged_at,dismissed_at,created_at,updated_at,studio_notification_signals(id,signal_key,studio_id,domain,severity,source_type,source_id,title,body,href,audience_label,why,resolved_at,created_at,updated_at)",
        filters: {
            id: `eq.${deliveryId}`,
            user_id: `eq.${userId}`,
            limit: "1",
        },
    });

    return rows[0] ?? null;
}

export async function acknowledgeNotificationDeliveryById(deliveryId: string) {
    await restUpdate(
        "user_notification_deliveries",
        {
            state: "acknowledged",
            acknowledged_at: new Date().toISOString(),
        },
        {
            id: `eq.${deliveryId}`,
        },
    );
}

export async function dismissNotificationDeliveryById(deliveryId: string) {
    await restUpdate(
        "user_notification_deliveries",
        {
            state: "dismissed",
            dismissed_at: new Date().toISOString(),
        },
        {
            id: `eq.${deliveryId}`,
        },
    );
}
