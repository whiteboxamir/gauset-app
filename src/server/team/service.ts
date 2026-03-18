import { randomBytes } from "node:crypto";

import type { AuthSession } from "@/server/contracts/auth";
import type { TeamInvitation, TeamMember, TeamRoster } from "@/server/contracts/team";

import { sendEmailOtp } from "@/server/auth/supabase";
import { requestAdminInviteApprovalForSession, requestMemberRoleApprovalForSession } from "@/server/account/governance";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert, restSelect, restUpdate } from "@/server/db/rest";
import { logPlatformAuditEvent } from "@/server/platform/audit";

interface StudioRow {
    id: string;
    slug: string;
    name: string;
    billing_email: string | null;
}

interface MembershipRow {
    id: string;
    studio_id: string;
    user_id: string;
    role: TeamMember["role"];
    status: TeamMember["status"];
    seat_kind: TeamMember["seatKind"];
    created_at: string;
}

interface ProfileRow {
    id: string;
    email: string;
    display_name: string | null;
}

interface InvitationRow {
    id: string;
    studio_id: string;
    email: string;
    role: TeamInvitation["role"];
    status: TeamInvitation["status"];
    token: string;
    expires_at: string | null;
    created_at: string;
}

interface SubscriptionProvisioningRow {
    id: string;
    studio_id: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "paused" | "incomplete" | "unpaid";
    seat_count: number | null;
    created_at: string;
    plans?: {
        code: string;
        name: string;
        seat_limit: number | null;
    } | null;
}

export interface TeamSeatProvisioningSnapshot {
    planCode: string | null;
    planName: string | null;
    subscriptionStatus: SubscriptionProvisioningRow["status"] | null;
    provisionedSeatCount: number | null;
    planSeatLimit: number | null;
    activeSeatCount: number;
    pendingInviteCount: number;
    projectedSeatCount: number;
    availableSeatCount: number | null;
}

function roleRank(role: TeamMember["role"]) {
    return {
        owner: 0,
        admin: 1,
        finance: 2,
        member: 3,
    }[role];
}

function ensureManageableRole(role: TeamMember["role"] | TeamInvitation["role"]) {
    if (role === "owner") {
        throw new Error("Owner transfer is blocked from the team surface. Use a dedicated ownership-transfer flow instead.");
    }
}

function ensureManageableMembershipStatus(
    nextStatus: TeamMember["status"] | undefined,
    currentStatus: TeamMember["status"],
) {
    if (nextStatus && nextStatus === "invited" && currentStatus !== "invited") {
        throw new Error("Memberships cannot be moved back to invited. Use a pending invitation for new operators instead.");
    }
}

function requireManageTeamContext(session: AuthSession, requireInviteCapability = false) {
    if (!session.activeStudioId) {
        throw new Error("No active studio is available.");
    }

    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    if (!activeStudio || !["owner", "admin"].includes(activeStudio.role)) {
        throw new Error("Team management requires owner or admin access.");
    }
    if (requireInviteCapability && !session.entitlements.canInviteSeats) {
        throw new Error("Current entitlements do not allow seat invitations.");
    }

    return {
        studioId: session.activeStudioId,
        activeStudio,
    };
}

async function resolveProfiles(userIds: string[]) {
    if (userIds.length === 0) {
        return [] as ProfileRow[];
    }

    return restSelect<ProfileRow[]>("profiles", {
        select: "id,email,display_name",
        filters: {
            id: `in.(${userIds.join(",")})`,
        },
    });
}

async function resolveStudio(studioId: string) {
    const rows = await restSelect<StudioRow[]>("studios", {
        select: "id,slug,name,billing_email",
        filters: {
            id: `eq.${studioId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveMembershipById(studioId: string, membershipId: string) {
    const rows = await restSelect<MembershipRow[]>("studio_memberships", {
        select: "id,studio_id,user_id,role,status,seat_kind,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            id: `eq.${membershipId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveInvitationById(studioId: string, invitationId: string) {
    const rows = await restSelect<InvitationRow[]>("studio_invitations", {
        select: "id,studio_id,email,role,status,token,expires_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            id: `eq.${invitationId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveSeatProvisioning(studioId: string): Promise<TeamSeatProvisioningSnapshot> {
    const [subscriptions, activeMemberships, pendingInvitations] = await Promise.all([
        restSelect<SubscriptionProvisioningRow[]>("subscriptions", {
            select: "id,studio_id,status,seat_count,created_at,plans(code,name,seat_limit)",
            filters: {
                studio_id: `eq.${studioId}`,
                status: "in.(trialing,active,past_due)",
                order: "created_at.desc",
                limit: "8",
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

    const subscription = subscriptions[0] ?? null;
    const provisionedSeatCount = subscription?.seat_count ?? subscription?.plans?.seat_limit ?? null;
    const activeSeatCount = activeMemberships.length;
    const pendingInviteCount = pendingInvitations.length;
    const projectedSeatCount = activeSeatCount + pendingInviteCount;

    return {
        planCode: subscription?.plans?.code ?? null,
        planName: subscription?.plans?.name ?? null,
        subscriptionStatus: subscription?.status ?? null,
        provisionedSeatCount,
        planSeatLimit: subscription?.plans?.seat_limit ?? null,
        activeSeatCount,
        pendingInviteCount,
        projectedSeatCount,
        availableSeatCount: provisionedSeatCount === null ? null : Math.max(provisionedSeatCount - projectedSeatCount, 0),
    };
}

function assertSeatProvisioningCapacity({
    provisioning,
    requestedProjectedSeatCount,
    actionLabel,
}: {
    provisioning: TeamSeatProvisioningSnapshot;
    requestedProjectedSeatCount: number;
    actionLabel: string;
}) {
    if (provisioning.provisionedSeatCount === null || requestedProjectedSeatCount <= provisioning.provisionedSeatCount) {
        return;
    }

    const planLabel = provisioning.planCode ?? provisioning.planName ?? "the active workspace plan";
    const planCeiling =
        provisioning.planSeatLimit !== null && provisioning.planSeatLimit !== provisioning.provisionedSeatCount
            ? ` The plan ceiling is ${provisioning.planSeatLimit}, but only ${provisioning.provisionedSeatCount} seats are provisioned right now.`
            : "";

    throw new Error(
        `Seat provisioning is full for ${planLabel}. ${provisioning.activeSeatCount} active seats plus ${provisioning.pendingInviteCount} pending invite${provisioning.pendingInviteCount === 1 ? "" : "s"} already consume ${provisioning.projectedSeatCount} of ${provisioning.provisionedSeatCount} provisioned seats.${planCeiling} Increase seat provisioning or clear pending invites before ${actionLabel}.`,
    );
}

function buildInviteUrl(origin: string, token: string) {
    return `${origin}/auth/accept-invite?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/app/team")}`;
}

function buildOtpRedirect(origin: string, token: string) {
    return `${origin}/auth/callback?next=${encodeURIComponent("/app/team")}&invite_token=${encodeURIComponent(token)}`;
}

export async function getTeamRosterForSession(session: AuthSession): Promise<TeamRoster> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return {
            studio: null,
            members: [],
            invitations: [],
        };
    }

    const [studio, memberships, invitations] = await Promise.all([
        resolveStudio(session.activeStudioId),
        restSelect<MembershipRow[]>("studio_memberships", {
            select: "id,studio_id,user_id,role,status,seat_kind,created_at",
            filters: {
                studio_id: `eq.${session.activeStudioId}`,
                order: "created_at.asc",
            },
        }),
        restSelect<InvitationRow[]>("studio_invitations", {
            select: "id,studio_id,email,role,status,token,expires_at,created_at",
            filters: {
                studio_id: `eq.${session.activeStudioId}`,
                order: "created_at.desc",
            },
        }),
    ]);

    const profiles = await resolveProfiles(memberships.map((membership) => membership.user_id));
    const currentStudio = session.studios.find((entry) => entry.studioId === session.activeStudioId) ?? null;

    return {
        studio:
            studio && currentStudio
                ? {
                      studioId: studio.id,
                      studioName: studio.name,
                      slug: studio.slug,
                      billingEmail: studio.billing_email,
                      role: currentStudio.role,
                      seatCount: memberships.filter((member) => member.status === "active").length,
                      pendingInvitationCount: invitations.filter((invitation) => invitation.status === "pending").length,
                      canManageMembers: ["owner", "admin"].includes(currentStudio.role),
                      canInviteMembers: ["owner", "admin"].includes(currentStudio.role) && session.entitlements.canInviteSeats,
                  }
                : null,
        members: memberships
            .map((membership) => {
                const profile = profiles.find((entry) => entry.id === membership.user_id);
                return {
                    membershipId: membership.id,
                    userId: membership.user_id,
                    studioId: membership.studio_id,
                    email: profile?.email ?? "unknown@gauset.local",
                    displayName: profile?.display_name ?? null,
                    role: membership.role,
                    status: membership.status,
                    seatKind: membership.seat_kind,
                    joinedAt: membership.created_at,
                };
            })
            .sort((left, right) => {
                const statusOrder = left.status === right.status ? 0 : left.status === "active" ? -1 : 1;
                if (statusOrder !== 0) {
                    return statusOrder;
                }
                return roleRank(left.role) - roleRank(right.role);
            }),
        invitations: invitations.map((invitation) => ({
            invitationId: invitation.id,
            studioId: invitation.studio_id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expires_at,
            invitedAt: invitation.created_at,
        })),
    };
}

export async function getTeamSeatProvisioningForSession(session: AuthSession): Promise<TeamSeatProvisioningSnapshot> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return {
            planCode: null,
            planName: null,
            subscriptionStatus: null,
            provisionedSeatCount: null,
            planSeatLimit: null,
            activeSeatCount: 0,
            pendingInviteCount: 0,
            projectedSeatCount: 0,
            availableSeatCount: null,
        };
    }

    return resolveSeatProvisioning(session.activeStudioId);
}

export async function inviteStudioMemberForSession({
    session,
    email,
    role,
    origin,
    skipGovernanceApproval = false,
}: {
    session: AuthSession;
    email: string;
    role: TeamInvitation["role"];
    origin: string;
    skipGovernanceApproval?: boolean;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const { studioId } = requireManageTeamContext(session, true);
    ensureManageableRole(role);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error("Invite email is required.");
    }

    const [existingInvitation, existingProfiles] = await Promise.all([
        restSelect<InvitationRow[]>("studio_invitations", {
            select: "id,studio_id,email,role,status,token,expires_at,created_at",
            filters: {
                studio_id: `eq.${studioId}`,
                email: `ilike.${normalizedEmail}`,
                status: "eq.pending",
                limit: "1",
            },
        }),
        restSelect<ProfileRow[]>("profiles", {
            select: "id,email,display_name",
            filters: {
                email: `ilike.${normalizedEmail}`,
                limit: "1",
            },
        }),
    ]);

    if (existingInvitation[0]) {
        throw new Error("A pending invitation already exists for that email.");
    }

    const existingProfile = existingProfiles[0] ?? null;
    if (existingProfile) {
        const memberships = await restSelect<Array<{ id: string }>>("studio_memberships", {
            select: "id",
            filters: {
                studio_id: `eq.${studioId}`,
                user_id: `eq.${existingProfile.id}`,
                limit: "1",
            },
        });
        if (memberships[0]) {
            throw new Error("That user already belongs to the studio.");
        }
    }

    const provisioning = await resolveSeatProvisioning(studioId);
    assertSeatProvisioningCapacity({
        provisioning,
        requestedProjectedSeatCount: provisioning.projectedSeatCount + 1,
        actionLabel: "issuing another invite",
    });

    if (!skipGovernanceApproval) {
        const approvalRequest = await requestAdminInviteApprovalForSession({
            session,
            email: normalizedEmail,
            role,
            origin,
        });
        if (approvalRequest) {
            return {
                mode: "requested" as const,
                approvalRequest,
            };
        }
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const inserted = await restInsert<InvitationRow[]>("studio_invitations", {
        studio_id: studioId,
        email: normalizedEmail,
        role,
        status: "pending",
        token,
        invited_by_user_id: session.user.userId,
        expires_at: expiresAt,
    });

    let deliveryMode: "sent" | "manual" = "manual";
    const inviteUrl = buildInviteUrl(origin, token);

    try {
        await sendEmailOtp({
            email: normalizedEmail,
            createUser: true,
            redirectTo: buildOtpRedirect(origin, token),
            data: {
                studioId,
                invitedRole: role,
            },
        });
        deliveryMode = "sent";
    } catch {
        deliveryMode = "manual";
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_invitation",
        targetId: inserted[0]?.id ?? token,
        eventType: "team.invite_sent",
        summary: `Invited ${normalizedEmail} to the studio as ${role}.`,
        metadata: {
            deliveryMode,
        },
    });

    return {
        mode: "invited" as const,
        invitationId: inserted[0]?.id ?? null,
        deliveryMode,
        inviteUrl,
    };
}

export async function revokeStudioInvitationForSession({
    session,
    invitationId,
}: {
    session: AuthSession;
    invitationId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const { studioId } = requireManageTeamContext(session);
    const invitation = await resolveInvitationById(studioId, invitationId);
    if (!invitation || invitation.status !== "pending") {
        throw new Error("Pending invitation not found.");
    }

    await restUpdate(
        "studio_invitations",
        {
            status: "revoked",
        },
        {
            id: `eq.${invitationId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_invitation",
        targetId: invitationId,
        eventType: "team.invite_revoked",
        summary: `Revoked invitation for ${invitation.email}.`,
    });
}

export async function resendStudioInvitationForSession({
    session,
    invitationId,
    origin,
}: {
    session: AuthSession;
    invitationId: string;
    origin: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const { studioId } = requireManageTeamContext(session, true);
    const invitation = await resolveInvitationById(studioId, invitationId);
    if (!invitation || invitation.status !== "pending") {
        throw new Error("Pending invitation not found.");
    }

    const inviteUrl = buildInviteUrl(origin, invitation.token);
    let deliveryMode: "sent" | "manual" = "manual";

    try {
        await sendEmailOtp({
            email: invitation.email,
            createUser: true,
            redirectTo: buildOtpRedirect(origin, invitation.token),
            data: {
                studioId,
                invitedRole: invitation.role,
            },
        });
        deliveryMode = "sent";
    } catch {
        deliveryMode = "manual";
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_invitation",
        targetId: invitationId,
        eventType: "team.invite_resent",
        summary: `Resent invitation for ${invitation.email}.`,
        metadata: {
            deliveryMode,
        },
    });

    return {
        deliveryMode,
        inviteUrl,
    };
}

export async function updateStudioMemberForSession({
    session,
    membershipId,
    role,
    status,
    seatKind,
    skipGovernanceApproval = false,
}: {
    session: AuthSession;
    membershipId: string;
    role?: TeamMember["role"];
    status?: TeamMember["status"];
    seatKind?: TeamMember["seatKind"];
    skipGovernanceApproval?: boolean;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!role && !status && !seatKind) {
        throw new Error("Choose a role, seat state, or membership status change before saving.");
    }

    const { studioId } = requireManageTeamContext(session);
    const membership = await resolveMembershipById(studioId, membershipId);
    if (!membership) {
        throw new Error("Team member not found.");
    }
    if (role) {
        ensureManageableRole(role);
    }
    ensureManageableMembershipStatus(status, membership.status);

    const nextRole = role ?? membership.role;
    const nextStatus = status ?? membership.status;
    const nextSeatKind = seatKind ?? membership.seat_kind;

    if (nextRole === membership.role && nextStatus === membership.status && nextSeatKind === membership.seat_kind) {
        throw new Error("No team provisioning change was requested.");
    }
    if (membership.role === "owner") {
        throw new Error("Owner memberships cannot be modified from this surface yet.");
    }
    if (membership.user_id === session.user.userId && nextStatus === "suspended") {
        throw new Error("You cannot suspend your own studio membership.");
    }

    const profiles = await resolveProfiles([membership.user_id]);
    const subjectLabel = profiles[0]?.display_name ?? profiles[0]?.email ?? "this operator";

    if (membership.status !== "active" && nextStatus === "active") {
        const provisioning = await resolveSeatProvisioning(studioId);
        assertSeatProvisioningCapacity({
            provisioning,
            requestedProjectedSeatCount: provisioning.projectedSeatCount + 1,
            actionLabel: `reactivating ${subjectLabel}`,
        });
    }

    if (!skipGovernanceApproval) {
        const approvalRequest = await requestMemberRoleApprovalForSession({
            session,
            membershipId,
            currentRole: membership.role,
            nextRole: role,
            status,
            seatKind,
            subjectLabel,
        });
        if (approvalRequest) {
            return {
                mode: "requested" as const,
                approvalRequest,
            };
        }
    }

    await restUpdate(
        "studio_memberships",
        {
            ...(role ? { role } : {}),
            ...(status ? { status } : {}),
            ...(seatKind ? { seat_kind: seatKind } : {}),
        },
        {
            id: `eq.${membershipId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_membership",
        targetId: membershipId,
        eventType: "team.member_updated",
        summary: "Updated a studio member role or seat state.",
        metadata: {
            role: role ?? null,
            status: status ?? null,
            seatKind: seatKind ?? null,
        },
    });

    return {
        mode: "updated" as const,
    };
}
