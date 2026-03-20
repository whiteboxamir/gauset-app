import { supabaseSelect } from "../../lib/supabase.ts";
import { restInsert, restSelect, restUpdate } from "../db/rest.ts";

interface InvitationRow {
    id: string;
    studio_id: string;
    email: string;
    role: "owner" | "admin" | "member" | "finance";
    status: "pending" | "accepted" | "revoked" | "expired";
    token: string;
    expires_at: string | null;
    accepted_at: string | null;
    studios?: {
        id: string;
        name: string;
    } | null;
}

interface MembershipRow {
    id: string;
    role: "owner" | "admin" | "member" | "finance";
    status: "active" | "invited" | "suspended";
}

interface LaunchProfileRow {
    id: string;
    onboarding_state: "invited" | "active" | "suspended" | "closed";
}

function isExpired(value: string | null) {
    return Boolean(value && Date.parse(value) < Date.now());
}

export async function hasActiveInvitationForEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return false;

    try {
        const rows = await restSelect<InvitationRow[]>("studio_invitations", {
            select: "id,studio_id,email,role,status,token,expires_at,accepted_at",
            filters: {
                email: `ilike.${normalizedEmail}`,
                status: "eq.pending",
                limit: "10",
            },
        });

        return rows.some((row) => !isExpired(row.expires_at));
    } catch {
        return false;
    }
}

export async function hasWaitlistEntryForEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return false;

    try {
        const rows = await supabaseSelect<Array<{ email: string }>>("waitlist", {
            select: "email",
            filters: {
                email: `eq.${normalizedEmail}`,
                limit: "1",
            },
        });

        return rows.length > 0;
    } catch {
        return false;
    }
}

async function resolveProfileAccessForEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        return {
            profileId: null,
            onboardingState: null,
            hasActiveMembership: false,
            hasEstablishedAccess: false,
            isRestricted: false,
        };
    }

    try {
        const profiles = await restSelect<LaunchProfileRow[]>("profiles", {
            select: "id,onboarding_state",
            filters: {
                email: `ilike.${normalizedEmail}`,
                limit: "1",
            },
        });

        const profile = profiles[0] ?? null;
        if (!profile) {
            return {
                profileId: null,
                onboardingState: null,
                hasActiveMembership: false,
                hasEstablishedAccess: false,
                isRestricted: false,
            };
        }

        const memberships = await restSelect<Array<{ id: string }>>("studio_memberships", {
            select: "id",
            filters: {
                user_id: `eq.${profile.id}`,
                status: "eq.active",
                limit: "1",
            },
        });

        const hasActiveMembership = memberships.length > 0;
        const isRestricted = profile.onboarding_state === "suspended" || profile.onboarding_state === "closed";

        return {
            profileId: profile.id,
            onboardingState: profile.onboarding_state,
            hasActiveMembership,
            hasEstablishedAccess: profile.onboarding_state === "active" || hasActiveMembership,
            isRestricted,
        };
    } catch {
        return {
            profileId: null,
            onboardingState: null,
            hasActiveMembership: false,
            hasEstablishedAccess: false,
            isRestricted: false,
        };
    }
}

export async function hasLaunchAccessForEmail(email: string) {
    const [hasActiveInvitation, hasWaitlistEntry, profileAccess] = await Promise.all([
        hasActiveInvitationForEmail(email),
        hasWaitlistEntryForEmail(email),
        resolveProfileAccessForEmail(email),
    ]);

    const allowed =
        !profileAccess.isRestricted &&
        (hasActiveInvitation || hasWaitlistEntry || profileAccess.hasEstablishedAccess);

    return {
        hasActiveInvitation,
        hasWaitlistEntry,
        profileId: profileAccess.profileId,
        onboardingState: profileAccess.onboardingState,
        hasActiveMembership: profileAccess.hasActiveMembership,
        hasEstablishedAccess: profileAccess.hasEstablishedAccess,
        isRestricted: profileAccess.isRestricted,
        shouldActivateProfile:
            !profileAccess.isRestricted &&
            profileAccess.profileId !== null &&
            profileAccess.onboardingState === "invited" &&
            allowed,
        allowed,
    };
}

export async function activateLaunchAccessForUser(userId: string) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    try {
        const rows = await restSelect<LaunchProfileRow[]>("profiles", {
            select: "id,onboarding_state",
            filters: {
                id: `eq.${normalizedUserId}`,
                limit: "1",
            },
        });

        const profile = rows[0] ?? null;
        if (!profile || profile.onboarding_state !== "invited") {
            return;
        }

        await restUpdate(
            "profiles",
            {
                onboarding_state: "active",
            },
            {
                id: `eq.${normalizedUserId}`,
            },
        );
    } catch {
        // Best-effort activation. Authentication should not fail if profile promotion fails.
    }
}

export async function getInvitationPreview(token: string) {
    const rows = await restSelect<InvitationRow[]>("studio_invitations", {
        select: "id,studio_id,email,role,status,token,expires_at,accepted_at,studios(id,name)",
        filters: {
            token: `eq.${token}`,
            limit: "1",
        },
    });

    const invitation = rows[0] ?? null;
    if (!invitation) return null;
    return {
        ...invitation,
        expired: isExpired(invitation.expires_at),
    };
}

export async function ensureMembershipForInvitation({
    studioId,
    userId,
    role,
}: {
    studioId: string;
    userId: string;
    role: InvitationRow["role"];
}) {
    const existing = await restSelect<MembershipRow[]>("studio_memberships", {
        select: "id,role,status",
        filters: {
            studio_id: `eq.${studioId}`,
            user_id: `eq.${userId}`,
            limit: "1",
        },
    });

    if (existing[0]) {
        if (existing[0].role !== role || existing[0].status !== "active") {
            const updated = await restUpdate<MembershipRow[]>(
                "studio_memberships",
                {
                    role,
                    status: "active",
                },
                {
                    id: `eq.${existing[0].id}`,
                },
            );

            return updated[0] ?? existing[0];
        }

        return existing[0];
    }

    const inserted = await restInsert<MembershipRow[]>("studio_memberships", {
        studio_id: studioId,
        user_id: userId,
        role,
        status: "active",
    });

    return inserted[0];
}

export async function markInvitationAccepted(token: string, userId: string) {
    const updated = await restUpdate<InvitationRow[]>(
        "studio_invitations",
        {
            status: "accepted",
            accepted_by_user_id: userId,
            accepted_at: new Date().toISOString(),
        },
        {
            token: `eq.${token}`,
        },
    );

    return updated[0] ?? null;
}
