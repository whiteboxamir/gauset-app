export type AccessReasonRole = "owner" | "admin" | "member" | "finance" | null;
export type AccessReasonKey =
    | "mvp_access"
    | "seat_invites"
    | "priority_support"
    | "governance_manage"
    | "coverage_manage"
    | "billing_actions";

export interface AccessReasonInput {
    role: AccessReasonRole;
    hasActiveStudio: boolean;
    entitlements: {
        canAccessMvp: boolean;
        canInviteSeats: boolean;
        canUsePrioritySupport: boolean;
    };
}

export interface AccessReasonSummaryCore {
    key: AccessReasonKey;
    label: string;
    granted: boolean;
    summary: string;
    reasons: string[];
    href: string;
}

export interface TrackedPlatformSessionCore {
    sessionId: string;
    revokedAt: string | null;
    isCurrent: boolean;
}

export const PLATFORM_SESSION_TOUCH_WINDOW_MS = 5 * 60 * 1000;

function canManageGovernance(role: AccessReasonRole) {
    return role === "owner" || role === "admin";
}

function canManageBilling(role: AccessReasonRole) {
    return role === "owner" || role === "admin" || role === "finance";
}

export function deriveAccessReasonSummaries(input: AccessReasonInput): AccessReasonSummaryCore[] {
    const roleReason = input.role ? `Workspace role is ${input.role}.` : "No active workspace role is currently mounted.";
    const studioReason = input.hasActiveStudio ? "An active workspace is selected." : "No active workspace is selected.";

    return [
        {
            key: "mvp_access",
            label: "MVP access",
            granted: input.entitlements.canAccessMvp,
            summary: input.entitlements.canAccessMvp
                ? "Access is enabled by current plan or override."
                : "Access is blocked until a qualifying plan or override is present.",
            reasons: [studioReason, input.entitlements.canAccessMvp ? "Current entitlements include MVP access." : "Current entitlements do not include MVP access."],
            href: "/app/worlds",
        },
        {
            key: "seat_invites",
            label: "Seat invites",
            granted: input.entitlements.canInviteSeats && canManageGovernance(input.role),
            summary:
                input.entitlements.canInviteSeats && canManageGovernance(input.role)
                    ? "Seat invitations are enabled for the current operator."
                    : "Seat invitations are blocked by role or entitlements.",
            reasons: [studioReason, roleReason, input.entitlements.canInviteSeats ? "Current entitlements allow inviting seats." : "Current entitlements do not allow inviting seats."],
            href: "/app/team",
        },
        {
            key: "priority_support",
            label: "Priority support",
            granted: input.entitlements.canUsePrioritySupport,
            summary: input.entitlements.canUsePrioritySupport
                ? "Priority support is enabled by the active plan."
                : "Priority support falls back to the standard support lane.",
            reasons: [studioReason, input.entitlements.canUsePrioritySupport ? "Current entitlements include priority support." : "Current entitlements do not include priority support."],
            href: "/app/support",
        },
        {
            key: "governance_manage",
            label: "Governance manage",
            granted: canManageGovernance(input.role),
            summary: canManageGovernance(input.role)
                ? "Policy and approval controls are writable for this operator."
                : "Policy and approval controls are read-only for this operator.",
            reasons: [studioReason, roleReason],
            href: "/app/settings/governance",
        },
        {
            key: "coverage_manage",
            label: "Coverage manage",
            granted: canManageGovernance(input.role),
            summary: canManageGovernance(input.role)
                ? "Coverage and continuity controls are writable for this operator."
                : "Coverage and continuity controls are read-only for this operator.",
            reasons: [studioReason, roleReason],
            href: "/app/team",
        },
        {
            key: "billing_actions",
            label: "Billing actions",
            granted: canManageBilling(input.role),
            summary: canManageBilling(input.role)
                ? "Billing actions are enabled for the current workspace role."
                : "Billing actions are blocked for the current workspace role.",
            reasons: [studioReason, roleReason],
            href: "/app/billing",
        },
    ];
}

export function inferPlatformSessionLabel(userAgent: string | null | undefined) {
    const normalized = (userAgent ?? "").toLowerCase();
    const deviceLabel = normalized.includes("iphone")
        ? "iPhone"
        : normalized.includes("ipad")
          ? "iPad"
          : normalized.includes("android")
            ? "Android"
            : normalized.includes("mac os")
              ? "Mac"
              : normalized.includes("windows")
                ? "Windows"
                : normalized.includes("linux")
                  ? "Linux"
                  : "Unknown device";
    const browserLabel = normalized.includes("edg/")
        ? "Edge"
        : normalized.includes("chrome/")
          ? "Chrome"
          : normalized.includes("safari/") && !normalized.includes("chrome/")
            ? "Safari"
            : normalized.includes("firefox/")
              ? "Firefox"
              : "Browser";

    return `${deviceLabel} · ${browserLabel}`;
}

export function partitionActiveTrackedPlatformSessions<TSession extends TrackedPlatformSessionCore>(sessions: TSession[]) {
    return {
        currentSession: sessions.find((session) => session.isCurrent && !session.revokedAt) ?? null,
        otherSessions: sessions.filter((session) => !session.isCurrent && !session.revokedAt),
    };
}

export function resolveRevocableTrackedPlatformSessionIds<TSession extends Pick<TrackedPlatformSessionCore, "sessionId" | "revokedAt">>(
    sessions: TSession[],
    preserveSessionId: string | null,
) {
    return sessions.filter((session) => !session.revokedAt && session.sessionId !== preserveSessionId).map((session) => session.sessionId);
}

export function isTrackedPlatformSessionRevoked(revokedAt: string | null) {
    return Boolean(revokedAt);
}

export function shouldTouchPlatformSession(lastSeenAt: string | null, now = Date.now()) {
    if (!lastSeenAt) {
        return true;
    }

    const timestamp = Date.parse(lastSeenAt);
    if (Number.isNaN(timestamp)) {
        return true;
    }

    return now - timestamp >= PLATFORM_SESSION_TOUCH_WINDOW_MS;
}
