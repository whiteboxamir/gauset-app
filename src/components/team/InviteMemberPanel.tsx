"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { TeamRoster } from "@/server/contracts/team";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { teamRoleCopy } from "./teamPresentation";
import { consumeTeamFlash, persistTeamFlash } from "./teamFlash";

const roleOptions = ["member", "finance", "admin"] as const;
const TEAM_INVITE_FLASH_KEY = "gauset-team-invite-flash";

export function InviteMemberPanel({
    roster,
    provisionedSeatCount,
    planSeatLimit,
    seatsUsed,
    staleInviteHours,
    requiresAdminInviteApproval,
}: {
    roster: TeamRoster;
    provisionedSeatCount: number | null;
    planSeatLimit: number | null;
    seatsUsed: number;
    staleInviteHours: number;
    requiresAdminInviteApproval: boolean;
}) {
    const router = useRouter();
    const [isHydrated, setIsHydrated] = useState(false);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<(typeof roleOptions)[number]>("member");
    const [message, setMessage] = useState<string | null>(null);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const pendingInvites = roster.invitations.filter((invitation) => invitation.status === "pending").length;
    const projectedSeatCount = seatsUsed + pendingInvites;
    const seatHeadroom = provisionedSeatCount === null ? null : Math.max(provisionedSeatCount - projectedSeatCount, 0);
    const trimmedEmail = email.trim();
    const canInvite = Boolean(isHydrated && roster.studio?.canInviteMembers && !isPending);
    const canSubmit = Boolean(canInvite && trimmedEmail && (seatHeadroom === null || seatHeadroom > 0));

    useEffect(() => {
        setIsHydrated(true);
        const flash = consumeTeamFlash(TEAM_INVITE_FLASH_KEY);
        if (!flash) {
            return;
        }

        setMessage(flash.message ?? null);
        setInviteUrl(flash.inviteLink ?? null);
    }, []);

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Invite collaborator</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Expand the workspace cleanly</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        Team invites stay tied to real seat posture, governance approval rules, and email-delivery truth. This surface does not pretend a seat is certified or provisioned until the membership actually exists.
                    </p>
                </div>
                {roster.studio ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={`${roster.studio.seatCount} live`} tone="neutral" />
                        <StatusBadge label={`${roster.studio.pendingInvitationCount} pending`} tone="warning" />
                    </div>
                ) : null}
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-4">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Provisioned seats</p>
                    <p className="mt-2 text-lg font-medium text-white">
                        {provisionedSeatCount === null
                            ? `${projectedSeatCount} projected seats`
                            : `${projectedSeatCount} / ${provisionedSeatCount} projected seats`}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        {provisionedSeatCount === null
                            ? "This workspace is not exposing a fixed provisioned seat count here, so invitations stay reviewable but not auto-certified."
                            : seatHeadroom !== null && seatHeadroom > 0
                              ? `${seatHeadroom} provisioned seats remain after the current pending queue.`
                              : "Live plus pending seats already fill the currently provisioned capacity."}
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Plan ceiling</p>
                    <p className="mt-2 text-lg font-medium text-white">{planSeatLimit ?? "Custom"}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        {planSeatLimit === null
                            ? "No explicit plan ceiling is exposed on this workspace, so seat provisioning must be confirmed outside this surface."
                            : provisionedSeatCount !== null && planSeatLimit > provisionedSeatCount
                              ? `${planSeatLimit - provisionedSeatCount} more seats can still be provisioned before the plan ceiling is reached.`
                              : "This workspace is already provisioned up to the recorded plan ceiling."}
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Approval posture</p>
                    <p className="mt-2 text-lg font-medium text-white">{requiresAdminInviteApproval ? "Admin invites queue review" : "Invites can issue directly"}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Member and finance invites can issue immediately when entitlements allow. Admin invites follow the workspace governance policy when stricter review is enabled.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Invite truth</p>
                    <p className="mt-2 text-lg font-medium text-white">{pendingInvites} pending · {staleInviteHours}h stale window</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Delivery uses email OTP when available. If delivery falls back, this surface shows the manual link instead of implying the partner already received it.
                    </p>
                </article>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-3">
                {roleOptions.map((option) => (
                    <article
                        key={option}
                        className={`rounded-2xl border px-4 py-4 transition-colors ${
                            role === option ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-white/[0.03]"
                        }`}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-white">{teamRoleCopy[option].label}</p>
                            {option === "admin" && requiresAdminInviteApproval ? <StatusBadge label="Approval path" tone="warning" /> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{teamRoleCopy[option].description}</p>
                    </article>
                ))}
            </div>

            <form
                className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,0.7fr,auto]"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setInviteUrl(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/team/invitations", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    email: trimmedEmail,
                                    role,
                                }),
                            });
                            const payload = (await response.json()) as {
                                success?: boolean;
                                message?: string;
                                mode?: "requested" | "invited";
                                deliveryMode?: "sent" | "manual";
                                inviteUrl?: string;
                            };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to create invitation.");
                            }

                            if (payload.mode === "requested") {
                                setEmail("");
                                setRole("member");
                                setInviteUrl(null);
                                const nextMessage = "Admin invitation queued for approval. Open governance to approve or reject it.";
                                setMessage(nextMessage);
                                persistTeamFlash(TEAM_INVITE_FLASH_KEY, {
                                    message: nextMessage,
                                    inviteLink: null,
                                });
                                router.refresh();
                                return;
                            }

                            const nextInviteUrl = payload.deliveryMode === "manual" ? payload.inviteUrl ?? null : null;
                            const nextMessage =
                                payload.deliveryMode === "manual"
                                    ? "Invitation created. Email delivery fell back to a manual invite link."
                                    : "Invitation sent.";

                            setEmail("");
                            setRole("member");
                            setInviteUrl(nextInviteUrl);
                            setMessage(nextMessage);
                            persistTeamFlash(TEAM_INVITE_FLASH_KEY, {
                                message: nextMessage,
                                inviteLink: nextInviteUrl,
                            });
                            router.refresh();
                        } catch (inviteError) {
                            setError(inviteError instanceof Error ? inviteError.message : "Unable to create invitation.");
                        }
                    });
                }}
            >
                <input
                    data-testid="team-invite-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={!canInvite}
                    placeholder="newpartner@client.com"
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                />
                <select
                    data-testid="team-invite-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as (typeof roleOptions)[number])}
                    disabled={!canInvite}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                >
                    {roleOptions.map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                            {option}
                        </option>
                    ))}
                </select>
                <button
                    type="submit"
                    data-testid="team-invite-submit"
                    disabled={!canSubmit}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Sending..." : "Send invite"}
                </button>
            </form>

            {role === "admin" && requiresAdminInviteApproval ? (
                <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Admin invitations do not auto-land on stricter workspaces. The request is queued into governance first, then the invite is issued after approval.
                </p>
            ) : null}
            {seatHeadroom !== null && seatHeadroom <= 0 ? (
                <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    All currently provisioned seats are already consumed by active members and pending invitations. Increase seat provisioning or clear pending invites before sending another invite.
                </p>
            ) : null}
            {message ? <p data-testid="team-invite-message" className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {inviteUrl ? (
                <div data-testid="team-invite-link" className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Manual invite link</p>
                    <p className="mt-2 break-all">{inviteUrl}</p>
                </div>
            ) : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
