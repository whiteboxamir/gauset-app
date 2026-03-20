import type {
    AccountSettingsSnapshot,
    NotificationPreferences,
    UserProfileSettings,
} from "@/server/contracts/account";
import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect, restUpdate } from "@/server/db/rest";
import { logPlatformAuditEvent } from "@/server/platform/audit";

import {
    getNotificationPreferencesForSession as getNotificationPreferencesForSessionFromCenter,
    updateNotificationPreferencesForSession as updateNotificationPreferencesForSessionFromCenter,
} from "./notifications";
import { getSecurityOverviewForSession as getSecurityOverviewForSessionFromCenter } from "./security";
import { getStudioWorkspaceStateForSession, updateStudioBrandingForSession } from "./workspaces";

interface ProfileRow {
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    job_title: string | null;
    timezone: string | null;
    onboarding_state: UserProfileSettings["onboardingState"];
}

function mapProfile(session: AuthSession, row: ProfileRow | null): UserProfileSettings {
    return {
        userId: session.user.userId,
        email: row?.email ?? session.user.email,
        displayName: row?.display_name ?? session.user.displayName,
        avatarUrl: row?.avatar_url ?? session.user.avatarUrl,
        jobTitle: row?.job_title ?? null,
        timezone: row?.timezone?.trim() || "UTC",
        onboardingState: row?.onboarding_state ?? session.user.onboardingState,
        providers: session.providers,
    };
}

async function resolveProfile(userId: string) {
    const rows = await restSelect<ProfileRow[]>("profiles", {
        select: "id,email,display_name,avatar_url,job_title,timezone,onboarding_state",
        filters: {
            id: `eq.${userId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

export async function getNotificationPreferencesForSession(session: AuthSession): Promise<NotificationPreferences> {
    return getNotificationPreferencesForSessionFromCenter(session);
}

export async function updateNotificationPreferencesForSession(
    session: AuthSession,
    preferences: NotificationPreferences,
) {
    return updateNotificationPreferencesForSessionFromCenter(session, preferences);
}

export async function getSecurityOverviewForSession(session: AuthSession) {
    return getSecurityOverviewForSessionFromCenter(session);
}

export async function getAccountSettingsSnapshotForSession(session: AuthSession): Promise<AccountSettingsSnapshot> {
    if (!isPlatformDatabaseConfigured()) {
        const notifications = await getNotificationPreferencesForSession(session);
        const security = await getSecurityOverviewForSession(session);
        return {
            profile: mapProfile(session, null),
            activeStudio: null,
            accessibleStudios: [],
            notifications,
            security,
        };
    }

    const [profile, notifications, workspaceState, security] = await Promise.all([
        resolveProfile(session.user.userId),
        getNotificationPreferencesForSession(session),
        getStudioWorkspaceStateForSession(session),
        getSecurityOverviewForSession(session),
    ]);

    return {
        profile: mapProfile(session, profile),
        activeStudio: workspaceState.activeStudio,
        accessibleStudios: workspaceState.accessibleStudios,
        notifications,
        security,
    };
}

export async function updateProfileForSession({
    session,
    displayName,
    jobTitle,
    timezone,
}: {
    session: AuthSession;
    displayName?: string | null;
    jobTitle?: string | null;
    timezone?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    await restUpdate(
        "profiles",
        {
            display_name: displayName?.trim() || null,
            job_title: jobTitle?.trim() || null,
            timezone: timezone?.trim() || "UTC",
        },
        {
            id: `eq.${session.user.userId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "profile",
        targetId: session.user.userId,
        eventType: "account.profile_updated",
        summary: "Updated personal profile settings.",
    });
}

export async function updateStudioWorkspaceForSession({
    session,
    name,
    billingEmail,
    supportEmail,
    accentColor,
    websiteUrl,
}: {
    session: AuthSession;
    name?: string | null;
    billingEmail?: string | null;
    supportEmail?: string | null;
    accentColor?: string | null;
    websiteUrl?: string | null;
}) {
    await updateStudioBrandingForSession({
        session,
        name,
        billingEmail,
        supportEmail,
        accentColor,
        websiteUrl,
    });
}
