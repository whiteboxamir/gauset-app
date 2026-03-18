import { isTrackedPlatformSessionRevoked } from "../platform/security-core.ts";

export type TrackedPlatformSessionAccessReason =
    | "tracked_session_not_required"
    | "missing_tracked_cookie"
    | "stale_tracked_cookie"
    | "revoked_tracked_session"
    | "foreign_tracked_cookie"
    | "tracked_session_valid";

export interface TrackedPlatformSessionRowLike {
    user_id: string;
    revoked_at: string | null;
}

export interface TrackedPlatformSessionAccessInput {
    requireTrackedSession: boolean;
    platformSessionId: string | null;
    trackedPlatformSession: TrackedPlatformSessionRowLike | null;
    userId: string;
}

export interface TrackedPlatformSessionAccessResult {
    allowed: boolean;
    reason: TrackedPlatformSessionAccessReason;
}

export function resolveTrackedPlatformSessionAccess({
    requireTrackedSession,
    platformSessionId,
    trackedPlatformSession,
    userId,
}: TrackedPlatformSessionAccessInput): TrackedPlatformSessionAccessResult {
    if (!requireTrackedSession) {
        return {
            allowed: true,
            reason: "tracked_session_not_required",
        };
    }

    if (!platformSessionId) {
        return {
            allowed: false,
            reason: "missing_tracked_cookie",
        };
    }

    if (!trackedPlatformSession) {
        return {
            allowed: false,
            reason: "stale_tracked_cookie",
        };
    }

    if (isTrackedPlatformSessionRevoked(trackedPlatformSession.revoked_at)) {
        return {
            allowed: false,
            reason: "revoked_tracked_session",
        };
    }

    if (trackedPlatformSession.user_id !== userId) {
        return {
            allowed: false,
            reason: "foreign_tracked_cookie",
        };
    }

    return {
        allowed: true,
        reason: "tracked_session_valid",
    };
}
