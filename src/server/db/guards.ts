import type { AuthSession } from "../contracts/auth";
import type { EntitlementSummary } from "../contracts/billing";

export class PlatformAuthorizationError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 403) {
        super(message);
        this.name = "PlatformAuthorizationError";
        this.statusCode = statusCode;
    }
}

export function assertAuthenticatedSession(session: AuthSession | null | undefined): AuthSession {
    if (!session) {
        throw new PlatformAuthorizationError("Authentication required.", 401);
    }
    return session;
}

export function assertActiveStudioAccess(session: AuthSession, studioId: string) {
    const studio = session.studios.find((entry) => entry.studioId === studioId);
    if (!studio) {
        throw new PlatformAuthorizationError("Studio membership required.", 403);
    }
    return studio;
}

export function assertEntitledAccess(
    entitlements: EntitlementSummary | null | undefined,
    capability: "canAccessMvp" | "canInviteSeats" | "canUseAdminConsole" | "canUsePrioritySupport",
) {
    if (!entitlements || entitlements[capability] !== true) {
        throw new PlatformAuthorizationError(`Missing entitlement: ${String(capability)}.`, 402);
    }
    return entitlements;
}
