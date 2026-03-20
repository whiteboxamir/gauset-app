import type { AuthProvider, OnboardingState } from "./auth";
import type { StudioRole } from "./common";

export interface UserProfileSettings {
    userId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    timezone: string;
    onboardingState: OnboardingState;
    providers: AuthProvider[];
}

export interface NotificationPreferences {
    inAppEnabled: boolean;
    digestEnabled: boolean;
    digestCadence: "daily" | "weekly";
    digestHourUtc: number;
    digestWeekday: number;
}

export interface StudioWorkspaceSummary {
    studioId: string;
    slug: string;
    name: string;
    billingEmail: string | null;
    supportEmail: string | null;
    accentColor: string | null;
    websiteUrl: string | null;
    role: StudioRole;
    seatCount: number;
    pendingInvitationCount: number;
}

export interface SecurityEvent {
    id: string;
    actorType: "user" | "admin" | "system";
    eventType: string;
    summary: string;
    createdAt: string;
}

export interface SecurityOverview {
    email: string;
    onboardingState: OnboardingState;
    providers: AuthProvider[];
    activeStudioName: string | null;
    activeStudioRole: StudioRole | null;
    planCode: string | null;
    canInviteSeats: boolean;
    canAccessMvp: boolean;
    canUsePrioritySupport: boolean;
    legacySessionDetected: boolean;
    currentSession: unknown | null;
    otherSessions: unknown[];
    accessReasons: unknown[];
    recentEvents: SecurityEvent[];
}

export interface AccountSettingsSnapshot {
    profile: UserProfileSettings;
    activeStudio: StudioWorkspaceSummary | null;
    notifications: NotificationPreferences;
    security: SecurityOverview;
}
