import type { EntitlementSnapshot } from "./billing";
import type { StudioRole } from "./common";

export type AuthProvider = "magic_link" | "google" | "sso" | "admin";
export type OnboardingState = "invited" | "active" | "suspended" | "closed";

export interface SessionUserSummary {
    userId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    onboardingState: OnboardingState;
}

export interface SessionStudioSummary {
    studioId: string;
    studioName: string;
    role: StudioRole;
    planCode: string | null;
}

export interface AuthSession {
    user: SessionUserSummary;
    studios: SessionStudioSummary[];
    activeStudioId: string | null;
    providers: AuthProvider[];
    entitlements: EntitlementSnapshot;
}
