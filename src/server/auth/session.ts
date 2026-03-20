import { cookies } from "next/headers";

import type { AuthSession } from "../contracts/auth.ts";

import { getPlatformDatabaseConfig, isPlatformDatabaseConfigured } from "../db/client.ts";
import { restSelect } from "../db/rest.ts";
import { shouldTouchPlatformSession } from "../platform/security-core.ts";
import { AUTH_ACCESS_COOKIE, PLATFORM_SESSION_COOKIE } from "./cookies.ts";
import { getTrackedPlatformSession, touchTrackedPlatformSession } from "./platform-sessions.ts";
import { getUserForAccessToken } from "./supabase.ts";
import {
    resolveTrackedPlatformSessionAccess,
    type TrackedPlatformSessionAccessReason,
    type TrackedPlatformSessionAccessInput,
    type TrackedPlatformSessionAccessResult,
    type TrackedPlatformSessionRowLike,
} from "./tracked-session.ts";

export type { TrackedPlatformSessionAccessReason, TrackedPlatformSessionAccessInput, TrackedPlatformSessionAccessResult, TrackedPlatformSessionRowLike };

interface ProfileRow {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    onboarding_state: "invited" | "active" | "suspended" | "closed";
    active_studio_id: string | null;
}

interface MembershipRow {
    studio_id: string;
    role: "owner" | "admin" | "member" | "finance";
    status: "active" | "invited" | "suspended";
    created_at: string;
}

interface StudioRow {
    id: string;
    name: string;
}

interface SubscriptionRow {
    studio_id: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "paused" | "incomplete" | "unpaid";
    plans?: {
        code: string;
        features: Record<string, unknown> | null;
    } | null;
}

function createDefaultEntitlements(): AuthSession["entitlements"] {
    return {
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
}

async function resolveProfile(userId: string) {
    const rows = await restSelect<ProfileRow[]>("profiles", {
        select: "id,display_name,avatar_url,onboarding_state,active_studio_id",
        filters: {
            id: `eq.${userId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveMemberships(userId: string) {
    return restSelect<MembershipRow[]>("studio_memberships", {
        select: "studio_id,role,status,created_at",
        filters: {
            user_id: `eq.${userId}`,
            status: "eq.active",
            order: "created_at.asc",
        },
    });
}

async function resolveStudios(studioIds: string[]) {
    if (studioIds.length === 0) return [] as StudioRow[];
    return restSelect<StudioRow[]>("studios", {
        select: "id,name",
        filters: {
            id: `in.(${studioIds.join(",")})`,
        },
    });
}

async function resolveSubscriptions(studioIds: string[]) {
    if (studioIds.length === 0) return [] as SubscriptionRow[];
    return restSelect<SubscriptionRow[]>("subscriptions", {
        select: "studio_id,status,plans(code,features)",
        filters: {
            studio_id: `in.(${studioIds.join(",")})`,
            status: "in.(trialing,active,past_due)",
        },
    });
}

function deriveEntitlements(memberships: MembershipRow[], subscriptions: SubscriptionRow[]): AuthSession["entitlements"] {
    const entitlements = createDefaultEntitlements();
    entitlements.seatsUsed = memberships.length;

    const activePlan = subscriptions.find((entry) => entry.status === "active" || entry.status === "trialing")?.plans ?? null;
    const features = (activePlan?.features ?? {}) as Record<string, unknown>;

    entitlements.canAccessMvp = Boolean(features.mvpAccess);
    entitlements.canUsePrioritySupport = Boolean(features.prioritySupport);
    entitlements.canUseAdminConsole = Boolean(features.adminConsole);
    entitlements.canInviteSeats = memberships.some((entry) => entry.role === "owner" || entry.role === "admin");

    return entitlements;
}

function resolveActiveStudioId({
    memberships,
    persistedActiveStudioId,
}: {
    memberships: MembershipRow[];
    persistedActiveStudioId: string | null;
}) {
    if (persistedActiveStudioId && memberships.some((membership) => membership.studio_id === persistedActiveStudioId)) {
        return persistedActiveStudioId;
    }

    return memberships[0]?.studio_id ?? null;
}

export async function getCurrentAuthSession(): Promise<AuthSession | null> {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
    const trackedPlatformSessionId = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value ?? null;

    if (!accessToken) {
        return null;
    }

    try {
        const shouldRequireTrackedPlatformSession = isPlatformDatabaseConfigured() && Boolean(getPlatformDatabaseConfig().supabaseServiceRoleKey);
        const trackedPlatformSession =
            shouldRequireTrackedPlatformSession
                ? await getTrackedPlatformSession(trackedPlatformSessionId)
                : null;

        const user = await getUserForAccessToken(accessToken);
        const trackedPlatformSessionAccess = resolveTrackedPlatformSessionAccess({
            requireTrackedSession: shouldRequireTrackedPlatformSession,
            platformSessionId: trackedPlatformSessionId,
            trackedPlatformSession: trackedPlatformSession ? { user_id: trackedPlatformSession.user_id, revoked_at: trackedPlatformSession.revoked_at } : null,
            userId: user.id,
        });
        if (!trackedPlatformSessionAccess.allowed) {
            return null;
        }

        if (trackedPlatformSession?.session_id && shouldTouchPlatformSession(trackedPlatformSession.last_seen_at)) {
            void touchTrackedPlatformSession(trackedPlatformSession.session_id, user.id);
        }

        const profile =
            shouldRequireTrackedPlatformSession
                ? await resolveProfile(user.id)
                : null;

        const memberships =
            shouldRequireTrackedPlatformSession
                ? await resolveMemberships(user.id)
                : [];
        const studioIds = memberships.map((entry) => entry.studio_id);
        const [studios, subscriptions] =
            studioIds.length > 0 && shouldRequireTrackedPlatformSession
                ? await Promise.all([resolveStudios(studioIds), resolveSubscriptions(studioIds)])
                : [[], []];

        const entitlements = deriveEntitlements(memberships, subscriptions);
        const activeStudioId = resolveActiveStudioId({
            memberships,
            persistedActiveStudioId: profile?.active_studio_id ?? null,
        });

        return {
            user: {
                userId: user.id,
                email: user.email ?? "",
                displayName:
                    (profile?.display_name ?? String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "")).trim() || null,
                avatarUrl: profile?.avatar_url ?? null,
                onboardingState: profile?.onboarding_state ?? "active",
            },
            studios: memberships.map((membership) => ({
                studioId: membership.studio_id,
                studioName: studios.find((studio) => studio.id === membership.studio_id)?.name ?? "Studio",
                role: membership.role,
                planCode: subscriptions.find((subscription) => subscription.studio_id === membership.studio_id)?.plans?.code ?? null,
            })),
            activeStudioId,
            providers: trackedPlatformSession ? [trackedPlatformSession.provider] : ["magic_link"],
            platformSessionId: trackedPlatformSession?.session_id ?? null,
            platformSessionTracked: Boolean(trackedPlatformSession?.session_id),
            entitlements,
        };
    } catch {
        return null;
    }
}
