"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { GovernancePolicy } from "@/server/contracts/governance";

import { StatusBadge } from "@/components/platform/StatusBadge";

export function GovernancePolicyPanel({
    policy,
    canManage,
}: {
    policy: GovernancePolicy;
    canManage: boolean;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState(policy);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setDraft(policy);
        setMessage(null);
        setError(null);
    }, [policy]);

    return (
        <section id="policy" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Workspace policy</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Governance outcomes and approvals</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        These values decide when the platform treats work as stale, when an operator is overloaded, and when risky changes need an approval path instead of an immediate update.
                    </p>
                </div>
                <StatusBadge label={canManage ? "Writable" : "Read-only"} tone={canManage ? "success" : "neutral"} />
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Overload rule</p>
                    <p className="mt-2 text-sm text-white">
                        An available operator is overloaded above {policy.maxActiveItemsPerAvailableOperator} active items or {policy.maxUrgentItemsPerAvailableOperator} urgent items.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Urgent drift</p>
                    <p className="mt-2 text-sm text-white">
                        Urgent work starts escalating after {policy.urgentOwnershipDriftHours} hours without healthy ownership progress.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Continuity review</p>
                    <p className="mt-2 text-sm text-white">
                        Lane handoffs go stale after {policy.staleHandoffHours} hours and urgent away-mutations are
                        {policy.requireHandoffForAwayWithUrgentWork ? " blocked without a handoff." : " allowed without a required handoff."}
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Approval posture</p>
                    <p className="mt-2 text-sm text-white">
                        {policy.requirePolicyChangeApproval
                            ? "Relaxing governance thresholds requires approval."
                            : "Policy changes can be applied immediately by authorized operators."}
                    </p>
                </article>
            </div>

            <form
                className="mt-5 space-y-5"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/account/governance/policy", {
                                method: "PATCH",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(draft),
                            });
                            const payload = (await response.json()) as {
                                success?: boolean;
                                mode?: "updated" | "requested";
                                message?: string;
                            };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to update governance policy.");
                            }

                            setMessage(
                                payload.mode === "requested"
                                    ? "Policy relaxation queued for approval."
                                    : "Workspace governance policy updated.",
                            );
                            router.refresh();
                        } catch (policyError) {
                            setError(policyError instanceof Error ? policyError.message : "Unable to update governance policy.");
                        }
                    });
                }}
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">When is an invite considered stale? (hours)</span>
                        <input
                            type="number"
                            min={24}
                            max={2160}
                            value={draft.staleInviteHours}
                            onChange={(event) => setDraft((current) => ({ ...current, staleInviteHours: Number(event.target.value) || current.staleInviteHours }))}
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">When should support drift be flagged? (hours)</span>
                        <input
                            type="number"
                            min={12}
                            max={720}
                            value={draft.staleSupportHours}
                            onChange={(event) => setDraft((current) => ({ ...current, staleSupportHours: Number(event.target.value) || current.staleSupportHours }))}
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">When should project risk go stale? (hours)</span>
                        <input
                            type="number"
                            min={24}
                            max={2880}
                            value={draft.staleProjectHours}
                            onChange={(event) => setDraft((current) => ({ ...current, staleProjectHours: Number(event.target.value) || current.staleProjectHours }))}
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">When should lane handoffs go stale? (hours)</span>
                        <input
                            type="number"
                            min={1}
                            max={720}
                            value={draft.staleHandoffHours}
                            onChange={(event) => setDraft((current) => ({ ...current, staleHandoffHours: Number(event.target.value) || current.staleHandoffHours }))}
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Longest allowed snooze window (hours)</span>
                        <input
                            type="number"
                            min={24}
                            max={2160}
                            value={draft.maxSnoozeHours}
                            onChange={(event) => setDraft((current) => ({ ...current, maxSnoozeHours: Number(event.target.value) || current.maxSnoozeHours }))}
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">How many active items should one available operator carry?</span>
                        <input
                            type="number"
                            min={1}
                            max={24}
                            value={draft.maxActiveItemsPerAvailableOperator}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    maxActiveItemsPerAvailableOperator:
                                        Number(event.target.value) || current.maxActiveItemsPerAvailableOperator,
                                }))
                            }
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">How many urgent items should one available operator carry?</span>
                        <input
                            type="number"
                            min={1}
                            max={12}
                            value={draft.maxUrgentItemsPerAvailableOperator}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    maxUrgentItemsPerAvailableOperator:
                                        Number(event.target.value) || current.maxUrgentItemsPerAvailableOperator,
                                }))
                            }
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">How long can urgent ownership drift before escalation?</span>
                        <input
                            type="number"
                            min={1}
                            max={168}
                            value={draft.urgentOwnershipDriftHours}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    urgentOwnershipDriftHours: Number(event.target.value) || current.urgentOwnershipDriftHours,
                                }))
                            }
                            disabled={!canManage || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                    {[
                        ["requireAdminInviteApproval", "Admin invites require approval"],
                        ["requireElevatedRoleChangeApproval", "Admin promotions require approval"],
                        ["requireSensitiveBillingApproval", "Billing plan changes require approval"],
                        ["requirePolicyChangeApproval", "Policy relaxation requires approval"],
                        ["requireHandoffForAwayWithUrgentWork", "Urgent away status requires handoff"],
                    ].map(([key, label]) => (
                        <label key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={draft[key as keyof GovernancePolicy] as boolean}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        [key]: event.target.checked,
                                    }))
                                }
                                disabled={!canManage || isPending}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                            />
                            <span className="text-sm text-neutral-200">{label}</span>
                        </label>
                    ))}
                </div>

                <button
                    type="submit"
                    disabled={!canManage || isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : canManage ? "Save governance policy" : "Read-only access"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
