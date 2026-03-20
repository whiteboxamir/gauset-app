"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { TeamMember, TeamRoster } from "@/server/contracts/team";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";
import { EmptyState } from "@/components/platform/EmptyState";
import { getInvitationFreshness, teamRoleCopy } from "./teamPresentation";
import { consumeTeamFlash, persistTeamFlash } from "./teamFlash";

type MemberDraft = Pick<TeamMember, "role" | "status" | "seatKind">;
const TEAM_ROSTER_FLASH_KEY = "gauset-team-roster-flash";

export function TeamRosterPanel({
    roster,
    currentUserId,
    provisionedSeatCount,
    planSeatLimit,
    staleInviteHours,
    requiresElevatedRoleChangeApproval,
}: {
    roster: TeamRoster;
    currentUserId: string;
    provisionedSeatCount: number | null;
    planSeatLimit: number | null;
    staleInviteHours: number;
    requiresElevatedRoleChangeApproval: boolean;
}) {
    const router = useRouter();
    const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>(
        () =>
            Object.fromEntries(
                roster.members.map((member) => [
                    member.membershipId,
                    {
                        role: member.role,
                        status: member.status,
                        seatKind: member.seatKind,
                    },
                ]),
            ) as Record<string, MemberDraft>,
    );
    const [message, setMessage] = useState<string | null>(null);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const flash = consumeTeamFlash(TEAM_ROSTER_FLASH_KEY);
        if (!flash) {
            return;
        }

        setMessage(flash.message ?? null);
        setInviteLink(flash.inviteLink ?? null);
    }, []);

    if (!roster.studio) {
        return <EmptyState eyebrow="Team" title="No active studio roster" body="Studio memberships and invitations will appear here once a workspace is attached to the account." />;
    }

    const canManageMembers = roster.studio.canManageMembers;
    const now = Date.now();
    const activeMembers = roster.members.filter((member) => member.status === "active");
    const pendingInvitations = roster.invitations.filter((invitation) => invitation.status === "pending");
    const projectedSeatCount = activeMembers.length + pendingInvitations.length;
    const seatHeadroom = provisionedSeatCount === null ? null : Math.max(provisionedSeatCount - projectedSeatCount, 0);
    const roleSummary = (["owner", "admin", "finance", "member"] as const)
        .map((role) => {
            const count = activeMembers.filter((member) => member.role === role).length;
            return count > 0 ? `${count} ${teamRoleCopy[role].label.toLowerCase()}` : null;
        })
        .filter(Boolean)
        .join(" · ");
    const stalePendingInvitations = pendingInvitations.filter((invitation) =>
        Boolean(getInvitationFreshness({ invitation, staleInviteHours, now })?.label === "Stale"),
    ).length;

    return (
        <section className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Studio roster</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Members</h3>
                    </div>
                    <StatusBadge label={roster.studio.studioName} tone="info" />
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-4">
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Provisioned seats</p>
                        <p className="mt-2 text-lg font-medium text-white">{activeMembers.length} active</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {provisionedSeatCount === null
                                ? `${projectedSeatCount} seats are live or projected once current invites land.`
                                : `${projectedSeatCount} of ${provisionedSeatCount} provisioned seats are live or projected.`}
                        </p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Role coverage</p>
                        <p className="mt-2 text-lg font-medium text-white">{roleSummary || "No active members"}</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">Role mix helps explain who should own billing, team controls, and daily collaboration.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Invite queue</p>
                        <p className="mt-2 text-lg font-medium text-white">{pendingInvitations.length} pending</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {stalePendingInvitations > 0
                                ? `${stalePendingInvitations} invite${stalePendingInvitations === 1 ? "" : "s"} already crossed the ${staleInviteHours}-hour stale window.`
                                : `Pending invites stay healthy while they are accepted or refreshed before ${staleInviteHours} hours.`}
                        </p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Governance path</p>
                        <p className="mt-2 text-lg font-medium text-white">
                            {requiresElevatedRoleChangeApproval ? "Admin promotions review first" : "Role changes apply directly"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {seatHeadroom === null
                                ? "Seat capacity is not exposing a hard cap on this surface, so changes stay reviewable but not auto-certified."
                                : seatHeadroom !== null && seatHeadroom > 0
                                  ? `${seatHeadroom} projected seats remain before new provisioning work is needed.${planSeatLimit ? ` Plan ceiling ${planSeatLimit}.` : ""}`
                                  : "Live plus pending seats already fill the currently provisioned capacity, so invites and reactivations should be coordinated before more access lands."}
                        </p>
                    </article>
                </div>

                {seatHeadroom !== null && seatHeadroom <= 0 ? (
                    <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        Active members plus pending invites already consume the current provisioned seat count. New invites and reactivations will fail until provisioning changes or pending access is cleared.
                    </p>
                ) : null}

                <div className="mt-5 space-y-3">
                    {roster.members.map((member) => {
                        const draft = memberDrafts[member.membershipId] ?? {
                            role: member.role,
                            status: member.status,
                            seatKind: member.seatKind,
                        };
                        const isSelf = member.userId === currentUserId;
                        const isLocked = !canManageMembers || member.role === "owner" || isSelf;
                        const hasChanges = draft.role !== member.role || draft.status !== member.status || draft.seatKind !== member.seatKind;
                        const promotingToAdmin = member.role !== "admin" && draft.role === "admin";
                        const statusOptions = member.status === "invited" ? (["invited", "active", "suspended"] as const) : (["active", "suspended"] as const);

                        return (
                            <article key={member.membershipId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-white">{member.displayName ?? member.email}</p>
                                        <p className="mt-1 text-sm text-neutral-500">{member.email}</p>
                                        <p className="mt-2 text-xs text-neutral-500">Joined {formatDateTime(member.joinedAt, "Recently")}</p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-400">{teamRoleCopy[draft.role].description}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge label={member.status} tone={member.status === "active" ? "success" : "warning"} />
                                        <StatusBadge label={member.seatKind} tone="neutral" />
                                        {isSelf ? <StatusBadge label="You" tone="info" /> : null}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr,0.9fr,0.9fr,auto]">
                                    <select
                                        value={draft.role}
                                        onChange={(event) =>
                                            setMemberDrafts((current) => ({
                                                ...current,
                                                [member.membershipId]: {
                                                    ...draft,
                                                    role: event.target.value as MemberDraft["role"],
                                                },
                                            }))
                                        }
                                        disabled={isLocked || isPending}
                                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                    >
                                        {["member", "finance", "admin"].map((option) => (
                                            <option key={option} value={option} className="bg-black text-white">
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={draft.status}
                                        onChange={(event) =>
                                            setMemberDrafts((current) => ({
                                                ...current,
                                                [member.membershipId]: {
                                                    ...draft,
                                                    status: event.target.value as MemberDraft["status"],
                                                },
                                            }))
                                        }
                                        disabled={isLocked || isPending}
                                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                    >
                                        {statusOptions.map((option) => (
                                            <option key={option} value={option} className="bg-black text-white">
                                                {option === "invited" ? "invited (legacy)" : option}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={draft.seatKind}
                                        onChange={(event) =>
                                            setMemberDrafts((current) => ({
                                                ...current,
                                                [member.membershipId]: {
                                                    ...draft,
                                                    seatKind: event.target.value as MemberDraft["seatKind"],
                                                },
                                            }))
                                        }
                                        disabled={isLocked || isPending}
                                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                    >
                                        {["paid", "observer", "internal"].map((option) => (
                                            <option key={option} value={option} className="bg-black text-white">
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={isLocked || isPending || !hasChanges}
                                        onClick={() => {
                                            setMessage(null);
                                            setInviteLink(null);
                                            setError(null);
                                            startTransition(async () => {
                                                try {
                                                    const payload = {
                                                        ...(draft.role !== member.role ? { role: draft.role } : {}),
                                                        ...(draft.status !== member.status ? { status: draft.status } : {}),
                                                        ...(draft.seatKind !== member.seatKind ? { seatKind: draft.seatKind } : {}),
                                                    };
                                                    const response = await fetch(`/api/team/members/${member.membershipId}`, {
                                                        method: "PATCH",
                                                        headers: {
                                                            "Content-Type": "application/json",
                                                        },
                                                        body: JSON.stringify(payload),
                                                    });
                                                    const result = (await response.json()) as {
                                                        success?: boolean;
                                                        message?: string;
                                                        mode?: "updated" | "requested";
                                                    };
                                                    if (!response.ok || !result.success) {
                                                        throw new Error(result.message || "Unable to update team member.");
                                                    }

                                                    const nextMessage =
                                                        result.mode === "requested"
                                                            ? `Admin promotion for ${member.displayName ?? member.email} queued for approval.`
                                                            : `Updated ${member.displayName ?? member.email}.`;
                                                    setMessage(nextMessage);
                                                    persistTeamFlash(TEAM_ROSTER_FLASH_KEY, {
                                                        message: nextMessage,
                                                        inviteLink: null,
                                                    });
                                                    router.refresh();
                                                } catch (memberError) {
                                                    setError(memberError instanceof Error ? memberError.message : "Unable to update team member.");
                                                }
                                            });
                                        }}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Save
                                    </button>
                                </div>

                                {promotingToAdmin && requiresElevatedRoleChangeApproval ? (
                                    <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                        This role change will queue a governance approval before admin access is granted.
                                    </p>
                                ) : null}
                                {member.status === "invited" ? (
                                    <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                        This membership is still marked as invited. New pending access should live in the invitation queue, not on an accepted member record.
                                    </p>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            </div>

            <div data-testid="team-invitations-section" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Pending access</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Invitations</h3>
                    </div>
                    <StatusBadge label={`${roster.invitations.filter((entry) => entry.status === "pending").length} pending`} tone="warning" />
                </div>

                {roster.invitations.length === 0 ? (
                    <EmptyState eyebrow="Invitations" title="No invitations in flight" body="New collaborator invites will land here once they are issued from the platform team surface." />
                ) : (
                    <div className="mt-5 space-y-3">
                        {roster.invitations.map((invitation) => (
                            (() => {
                                const freshness = getInvitationFreshness({ invitation, staleInviteHours, now });

                                return (
                                    <article key={invitation.invitationId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-medium text-white">{invitation.email}</p>
                                                <p className="mt-1 text-sm text-neutral-500">{teamRoleCopy[invitation.role].label}</p>
                                                <p className="mt-2 text-sm leading-6 text-neutral-400">{teamRoleCopy[invitation.role].description}</p>
                                                <p className="mt-2 text-xs text-neutral-500">
                                                    Invited {formatDateTime(invitation.invitedAt)}. Expires {formatDateTime(invitation.expiresAt, "No expiry")}
                                                </p>
                                                {freshness ? <p className="mt-2 text-xs text-neutral-400">{freshness.detail}</p> : null}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge label={invitation.status} tone={invitation.status === "pending" ? "warning" : "neutral"} />
                                                {freshness ? <StatusBadge label={freshness.label} tone={freshness.tone} /> : null}
                                                {canManageMembers && invitation.status === "pending" ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            data-testid={`team-invite-resend-${invitation.invitationId}`}
                                                            disabled={isPending}
                                                            onClick={() => {
                                                                setMessage(null);
                                                                setInviteLink(null);
                                                                setError(null);
                                                                startTransition(async () => {
                                                                    try {
                                                                        const response = await fetch("/api/team/invitations", {
                                                                            method: "PATCH",
                                                                            headers: {
                                                                                "Content-Type": "application/json",
                                                                            },
                                                                            body: JSON.stringify({
                                                                                invitationId: invitation.invitationId,
                                                                                action: "resend",
                                                                            }),
                                                                        });
                                                                        const payload = (await response.json()) as {
                                                                            success?: boolean;
                                                                            message?: string;
                                                                            deliveryMode?: "sent" | "manual";
                                                                            inviteUrl?: string;
                                                                        };
                                                                        if (!response.ok || !payload.success) {
                                                                            throw new Error(payload.message || "Unable to resend invitation.");
                                                                        }

                                                                        const nextInviteLink =
                                                                            payload.deliveryMode === "manual" ? payload.inviteUrl ?? null : null;
                                                                        const nextMessage =
                                                                            payload.deliveryMode === "manual"
                                                                                ? `Invite for ${invitation.email} was refreshed with a manual link fallback.`
                                                                                : `Invite re-sent to ${invitation.email}.`;
                                                                        setInviteLink(nextInviteLink);
                                                                        setMessage(nextMessage);
                                                                        persistTeamFlash(TEAM_ROSTER_FLASH_KEY, {
                                                                            message: nextMessage,
                                                                            inviteLink: nextInviteLink,
                                                                        });
                                                                        router.refresh();
                                                                    } catch (inviteError) {
                                                                        setError(inviteError instanceof Error ? inviteError.message : "Unable to resend invitation.");
                                                                    }
                                                                });
                                                            }}
                                                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                                        >
                                                            Resend
                                                        </button>
                                                        <button
                                                            type="button"
                                                            data-testid={`team-invite-revoke-${invitation.invitationId}`}
                                                            disabled={isPending}
                                                            onClick={() => {
                                                                setMessage(null);
                                                                setInviteLink(null);
                                                                setError(null);
                                                                startTransition(async () => {
                                                                    try {
                                                                        const response = await fetch("/api/team/invitations", {
                                                                            method: "PATCH",
                                                                            headers: {
                                                                                "Content-Type": "application/json",
                                                                            },
                                                                            body: JSON.stringify({
                                                                                invitationId: invitation.invitationId,
                                                                                action: "revoke",
                                                                            }),
                                                                        });
                                                                        const payload = (await response.json()) as { success?: boolean; message?: string };
                                                                        if (!response.ok || !payload.success) {
                                                                            throw new Error(payload.message || "Unable to revoke invitation.");
                                                                        }

                                                                        const nextMessage = `Invitation revoked for ${invitation.email}.`;
                                                                        setMessage(nextMessage);
                                                                        persistTeamFlash(TEAM_ROSTER_FLASH_KEY, {
                                                                            message: nextMessage,
                                                                            inviteLink: null,
                                                                        });
                                                                        router.refresh();
                                                                    } catch (inviteError) {
                                                                        setError(inviteError instanceof Error ? inviteError.message : "Unable to revoke invitation.");
                                                                    }
                                                                });
                                                            }}
                                                            className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/20 disabled:opacity-60"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })()
                        ))}
                    </div>
                )}
            </div>

            {message ? <p data-testid="team-roster-message" className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {inviteLink ? (
                <div data-testid="team-roster-link" className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Manual invite link</p>
                    <p className="mt-2 break-all">{inviteLink}</p>
                </div>
            ) : null}
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
