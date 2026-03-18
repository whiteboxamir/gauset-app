import type { StudioWorkspaceState, StudioWorkspaceSummary } from "@/server/contracts/account";
import type { AuthSession } from "@/server/contracts/auth";
import type { StudioRole } from "@/types/platform/common";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restRpc, restSelect, restUpdate, restUpsert } from "@/server/db/rest";
import { logPlatformAuditEvent } from "@/server/platform/audit";

interface StudioRow {
    id: string;
    slug: string;
    name: string;
    billing_email: string | null;
}

interface BrandingRow {
    studio_id: string;
    support_email: string | null;
    accent_color: string | null;
    website_url: string | null;
}

interface CreateStudioRpcRow {
    studio_id: string;
    studio_slug: string;
    studio_name: string;
    membership_role: StudioRole;
}

interface FinalizeInvitationRpcRow {
    studio_id: string;
    membership_id: string;
    studio_name: string;
    membership_role: StudioRole;
}

function normalizeText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

async function resolveStudioSummary({
    studioId,
    role,
}: {
    studioId: string;
    role: StudioRole;
}): Promise<StudioWorkspaceSummary | null> {
    const [studios, brandings, memberships, invitations] = await Promise.all([
        restSelect<StudioRow[]>("studios", {
            select: "id,slug,name,billing_email",
            filters: {
                id: `eq.${studioId}`,
                limit: "1",
            },
        }),
        restSelect<BrandingRow[]>("studio_branding", {
            select: "studio_id,support_email,accent_color,website_url",
            filters: {
                studio_id: `eq.${studioId}`,
                limit: "1",
            },
        }),
        restSelect<Array<{ id: string }>>("studio_memberships", {
            select: "id",
            filters: {
                studio_id: `eq.${studioId}`,
                status: "eq.active",
            },
        }),
        restSelect<Array<{ id: string }>>("studio_invitations", {
            select: "id",
            filters: {
                studio_id: `eq.${studioId}`,
                status: "eq.pending",
            },
        }),
    ]);

    const studio = studios[0] ?? null;
    if (!studio) {
        return null;
    }

    const branding = brandings[0] ?? null;
    return {
        studioId: studio.id,
        slug: studio.slug,
        name: studio.name,
        billingEmail: studio.billing_email,
        supportEmail: branding?.support_email ?? null,
        accentColor: branding?.accent_color ?? null,
        websiteUrl: branding?.website_url ?? null,
        role,
        seatCount: memberships.length,
        pendingInvitationCount: invitations.length,
    };
}

async function persistActiveStudioSelection({
    userId,
    studioId,
    onboardingState,
}: {
    userId: string;
    studioId: string;
    onboardingState?: "invited" | "active" | "suspended" | "closed";
}) {
    await restUpdate(
        "profiles",
        {
            active_studio_id: studioId,
            ...(onboardingState ? { onboarding_state: onboardingState } : {}),
        },
        {
            id: `eq.${userId}`,
        },
    );
}

async function resolveAccessibleStudioRows(studioIds: string[]) {
    if (studioIds.length === 0) {
        return [] as StudioRow[];
    }

    return restSelect<StudioRow[]>("studios", {
        select: "id,slug,name,billing_email",
        filters: {
            id: `in.(${studioIds.join(",")})`,
        },
    });
}

export async function getStudioWorkspaceStateForSession(session: AuthSession): Promise<StudioWorkspaceState> {
    if (!isPlatformDatabaseConfigured()) {
        return {
            activeStudio: null,
            accessibleStudios: [],
        };
    }

    const studioIds = session.studios.map((studio) => studio.studioId);
    const [activeStudio, studioRows] = await Promise.all([
        session.activeStudioId
            ? resolveStudioSummary({
                  studioId: session.activeStudioId,
                  role: session.studios.find((studio) => studio.studioId === session.activeStudioId)?.role ?? "member",
              })
            : Promise.resolve(null),
        resolveAccessibleStudioRows(studioIds),
    ]);

    return {
        activeStudio,
        accessibleStudios: session.studios.map((studio) => {
            const row = studioRows.find((entry) => entry.id === studio.studioId);
            return {
                studioId: studio.studioId,
                slug: row?.slug ?? `workspace-${studio.studioId.slice(0, 8)}`,
                name: row?.name ?? studio.studioName,
                role: studio.role,
                planCode: studio.planCode,
                isActive: studio.studioId === session.activeStudioId,
            };
        }),
    };
}

export async function createStudioForSession({
    session,
    name,
    billingEmail,
    supportEmail,
    accentColor,
    websiteUrl,
}: {
    session: AuthSession;
    name: string;
    billingEmail?: string | null;
    supportEmail?: string | null;
    accentColor?: string | null;
    websiteUrl?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const studioName = normalizeText(name);
    if (!studioName) {
        throw new Error("Studio name is required.");
    }

    const rows = await restRpc<CreateStudioRpcRow[]>("create_studio_workspace", {
        actor_user_id: session.user.userId,
        requested_name: studioName,
        requested_billing_email: normalizeText(billingEmail),
        requested_support_email: normalizeText(supportEmail),
        requested_accent_color: normalizeText(accentColor),
        requested_website_url: normalizeText(websiteUrl),
    });
    const createdStudio = rows[0] ?? null;
    const studioId = createdStudio?.studio_id;
    if (!studioId) {
        throw new Error("Unable to create studio.");
    }

    const activeStudio = await resolveStudioSummary({
        studioId,
        role: createdStudio.membership_role,
    });
    if (!activeStudio) {
        throw new Error("Studio was created but could not be resolved.");
    }

    return activeStudio;
}

export async function setActiveStudioForSession({
    session,
    studioId,
}: {
    session: AuthSession;
    studioId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const accessibleStudio = session.studios.find((studio) => studio.studioId === studioId) ?? null;
    if (!accessibleStudio) {
        throw new Error("Workspace access denied.");
    }

    await persistActiveStudioSelection({
        userId: session.user.userId,
        studioId,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "profile",
        targetId: session.user.userId,
        eventType: "account.active_studio_selected",
        summary: `Activated workspace ${accessibleStudio.studioName}.`,
    });

    const activeStudio = await resolveStudioSummary({
        studioId,
        role: accessibleStudio.role,
    });
    if (!activeStudio) {
        throw new Error("Unable to resolve the selected workspace.");
    }

    return activeStudio;
}

export async function finalizeStudioInvitationForSession({
    session,
    invitationToken,
}: {
    session: AuthSession;
    invitationToken: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const rows = await restRpc<FinalizeInvitationRpcRow[]>("finalize_workspace_invitation", {
        actor_user_id: session.user.userId,
        invitation_token: invitationToken,
    });
    const finalizedInvite = rows[0] ?? null;
    if (!finalizedInvite?.studio_id) {
        throw new Error("Unable to finalize invite.");
    }

    const activeStudio = await resolveStudioSummary({
        studioId: finalizedInvite.studio_id,
        role: finalizedInvite.membership_role,
    });
    if (!activeStudio) {
        throw new Error("Unable to resolve the activated workspace.");
    }

    return {
        activeStudio,
        membershipId: finalizedInvite.membership_id,
    };
}

export async function updateStudioBrandingForSession({
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
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!session.activeStudioId) {
        throw new Error("No active studio is available.");
    }

    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    if (!activeStudio || !["owner", "admin"].includes(activeStudio.role)) {
        throw new Error("Studio settings require owner or admin access.");
    }

    await restUpdate(
        "studios",
        {
            ...(normalizeText(name) ? { name: normalizeText(name) } : {}),
            billing_email: normalizeText(billingEmail),
        },
        {
            id: `eq.${session.activeStudioId}`,
        },
    );

    await restUpsert(
        "studio_branding",
        {
            studio_id: session.activeStudioId,
            support_email: normalizeText(supportEmail),
            accent_color: normalizeText(accentColor),
            website_url: normalizeText(websiteUrl),
        },
        {
            onConflict: "studio_id",
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "studio",
        targetId: session.activeStudioId,
        eventType: "studio.settings_updated",
        summary: "Updated studio profile settings.",
    });
}
