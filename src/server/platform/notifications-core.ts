export const notificationCoreDomainValues = ["workspace", "billing", "team", "support", "projects", "governance", "coverage"] as const;
export const notificationCoreSeverityValues = ["info", "warning", "urgent"] as const;
export const notificationCoreDeliveryStateValues = ["pending", "delivered", "acknowledged", "dismissed"] as const;
export const notificationCoreDigestCadenceValues = ["daily", "weekly"] as const;
export const NOTIFICATION_SHELL_SNAPSHOT_TTL_MS = 60 * 1000;

export type NotificationCoreDomain = (typeof notificationCoreDomainValues)[number];
export type NotificationCoreSeverity = (typeof notificationCoreSeverityValues)[number];
export type NotificationCoreDeliveryState = (typeof notificationCoreDeliveryStateValues)[number];
export type NotificationCoreDigestCadence = (typeof notificationCoreDigestCadenceValues)[number];
export type NotificationRoutingRole = "owner" | "admin" | "member" | "finance" | null;

export interface NotificationAudienceDecision {
    deliver: boolean;
    audienceLabel: string;
    reason: string;
}

export interface NotificationDeliveryRoutingDecision {
    deliver: boolean;
    reason: string;
}

export interface NotificationSignalCandidate<TMetadata = Record<string, unknown>> {
    signalKey: string;
    severity: NotificationCoreSeverity;
    resolvedAt: string | null;
    updatedAt: string;
    metadata?: TMetadata;
}

export interface NotificationDigestPreferences {
    digestCadence: NotificationCoreDigestCadence;
    digestHourUtc: number;
    digestWeekday: number;
}

export interface NotificationDigestDelivery {
    state: NotificationCoreDeliveryState;
    signal: {
        domain: NotificationCoreDomain;
        severity: NotificationCoreSeverity;
        resolvedAt: string | null;
    };
}

export interface NotificationFeedItemLike {
    state: NotificationCoreDeliveryState;
    stateChangedAt: string;
    signal: {
        severity: NotificationCoreSeverity;
        resolvedAt: string | null;
    };
}

function getSeverityRank(severity: NotificationCoreSeverity) {
    return {
        urgent: 3,
        warning: 2,
        info: 1,
    }[severity];
}

export function isNotificationUnread(state: NotificationCoreDeliveryState) {
    return state === "pending" || state === "delivered";
}

export function shouldIncludeInDigest(state: NotificationCoreDeliveryState) {
    return state !== "dismissed";
}

export function resolveNotificationDeliveryDecision({
    audience,
    inAppEnabled,
    subscriptionFollowing,
}: {
    audience: NotificationAudienceDecision;
    inAppEnabled: boolean;
    subscriptionFollowing: boolean;
}): NotificationDeliveryRoutingDecision {
    if (!inAppEnabled) {
        return {
            deliver: false,
            reason: "In-app delivery is disabled for this operator.",
        };
    }

    if (!subscriptionFollowing) {
        return {
            deliver: false,
            reason: "Lane is muted for this operator.",
        };
    }

    if (!audience.deliver) {
        return {
            deliver: false,
            reason: audience.reason,
        };
    }

    return {
        deliver: true,
        reason: audience.reason,
    };
}

export function upsertDerivedSignalCandidate<TMetadata = Record<string, unknown>>(
    signalMap: Map<string, NotificationSignalCandidate<TMetadata>>,
    candidate: NotificationSignalCandidate<TMetadata>,
) {
    const existing = signalMap.get(candidate.signalKey);
    if (!existing) {
        signalMap.set(candidate.signalKey, candidate);
        return;
    }

    const severityRank = getSeverityRank(candidate.severity) - getSeverityRank(existing.severity);
    if (severityRank > 0) {
        signalMap.set(candidate.signalKey, candidate);
        return;
    }

    if (existing.resolvedAt && !candidate.resolvedAt) {
        signalMap.set(candidate.signalKey, candidate);
        return;
    }

    if (Date.parse(candidate.updatedAt) > Date.parse(existing.updatedAt)) {
        signalMap.set(candidate.signalKey, {
            ...existing,
            ...candidate,
            severity: severityRank >= 0 ? candidate.severity : existing.severity,
        });
    }
}

export function deriveNotificationAudience({
    domain,
    role,
    active,
    canUsePrioritySupport,
    canInviteSeats,
}: {
    domain: NotificationCoreDomain;
    role: NotificationRoutingRole;
    active: boolean;
    canUsePrioritySupport: boolean;
    canInviteSeats: boolean;
}): NotificationAudienceDecision {
    if (!active || !role) {
        return {
            deliver: false,
            audienceLabel: "Active workspace operators",
            reason: "Inactive memberships do not receive routed platform signals.",
        };
    }

    switch (domain) {
        case "workspace":
            return ["owner", "admin"].includes(role)
                ? {
                      deliver: true,
                      audienceLabel: "Workspace operators",
                      reason: "Workspace posture is routed to owner and admin operators.",
                  }
                : {
                      deliver: false,
                      audienceLabel: "Workspace operators",
                      reason: "Only owner and admin operators manage workspace posture.",
                  };
        case "billing":
            return ["owner", "admin", "finance"].includes(role)
                ? {
                      deliver: true,
                      audienceLabel: "Billing operators",
                      reason: "Billing posture is routed to owner, admin, and finance operators.",
                  }
                : {
                      deliver: false,
                      audienceLabel: "Billing operators",
                      reason: "Billing signals are limited to billing-capable roles.",
                  };
        case "team":
        case "governance":
        case "coverage":
            return ["owner", "admin"].includes(role)
                ? {
                      deliver: true,
                      audienceLabel: "Governance operators",
                      reason:
                          domain === "coverage"
                              ? "Coverage posture is routed to owner and admin operators."
                              : "Sensitive workspace control is routed to owner and admin operators.",
                  }
                : {
                      deliver: false,
                      audienceLabel: "Governance operators",
                      reason: "This lane is limited to owner and admin operators.",
                  };
        case "support":
            return canUsePrioritySupport || ["owner", "admin"].includes(role)
                ? {
                      deliver: true,
                      audienceLabel: "Support operators",
                      reason: canUsePrioritySupport
                          ? "Priority support entitlement routes support signals to this operator."
                          : "Support escalation is routed to owner and admin operators.",
                  }
                : {
                      deliver: true,
                      audienceLabel: "Workspace members",
                      reason: "Standard support visibility still reaches active workspace members.",
                  };
        case "projects":
            return {
                deliver: true,
                audienceLabel: canInviteSeats ? "Project operators" : "Workspace members",
                reason: "Project-risk posture is routed to active workspace members who can act on it.",
            };
        default:
            return {
                deliver: true,
                audienceLabel: "Workspace members",
                reason: "Active membership routed this signal by default.",
            };
    }
}

export function buildDigestScheduleLabel(preferences: NotificationDigestPreferences) {
    const hour = `${String(preferences.digestHourUtc).padStart(2, "0")}:00 UTC`;
    if (preferences.digestCadence === "daily") {
        return `Daily around ${hour}`;
    }

    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][preferences.digestWeekday] ?? "Monday";
    return `Weekly on ${weekday} around ${hour}`;
}

export function isNotificationShellSnapshotFresh(syncedAt: string | null, now = Date.now()) {
    if (!syncedAt) {
        return false;
    }

    const timestamp = Date.parse(syncedAt);
    if (Number.isNaN(timestamp)) {
        return false;
    }

    return now - timestamp < NOTIFICATION_SHELL_SNAPSHOT_TTL_MS;
}

export function buildDigestDomainCounts(deliveries: NotificationDigestDelivery[]) {
    const counts = new Map<
        NotificationCoreDomain,
        {
            domain: NotificationCoreDomain;
            count: number;
            urgentCount: number;
        }
    >();

    deliveries.filter((delivery) => shouldIncludeInDigest(delivery.state)).forEach((delivery) => {
        const existing = counts.get(delivery.signal.domain) ?? {
            domain: delivery.signal.domain,
            count: 0,
            urgentCount: 0,
        };
        existing.count += 1;
        if (delivery.signal.severity === "urgent" && !delivery.signal.resolvedAt) {
            existing.urgentCount += 1;
        }
        counts.set(delivery.signal.domain, existing);
    });

    return Array.from(counts.values()).sort((left, right) => {
        if (right.urgentCount !== left.urgentCount) {
            return right.urgentCount - left.urgentCount;
        }
        return right.count - left.count;
    });
}

export function sortNotificationFeedItems<TItem extends NotificationFeedItemLike>(items: TItem[]) {
    return [...items].sort((left, right) => {
        if (left.signal.resolvedAt && !right.signal.resolvedAt) return 1;
        if (!left.signal.resolvedAt && right.signal.resolvedAt) return -1;

        const leftUnread = isNotificationUnread(left.state);
        const rightUnread = isNotificationUnread(right.state);
        if (leftUnread !== rightUnread) {
            return leftUnread ? -1 : 1;
        }

        const severityOrder = { urgent: 0, warning: 1, info: 2 };
        if (severityOrder[left.signal.severity] !== severityOrder[right.signal.severity]) {
            return severityOrder[left.signal.severity] - severityOrder[right.signal.severity];
        }

        return Date.parse(right.stateChangedAt) - Date.parse(left.stateChangedAt);
    });
}

export function buildNotificationFeedCounts(states: NotificationCoreDeliveryState[]) {
    return {
        unreadCount: states.filter((state) => isNotificationUnread(state)).length,
        pendingCount: states.filter((state) => state === "pending" || state === "delivered").length,
        acknowledgedCount: states.filter((state) => state === "acknowledged").length,
        dismissedCount: states.filter((state) => state === "dismissed").length,
    };
}
