"use client";

import { useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CoverageAttentionItem, CoverageSnapshot, OperatorCoverageStatus } from "@/server/contracts/coverage";
import type { OperationsDomain } from "@/server/contracts/operations";

import { describeCoverageNarrative, describeCoverageStatus } from "@/components/platform/coverage-guidance";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { describeProjectedLoad, getCapacityTone, getCoverageHealthTone, getCoverageStatusTone } from "@/components/platform/coverage-presentation";

type CoverageDraft = {
    status: OperatorCoverageStatus;
    effectiveUntil: string;
    note: string;
    primaryDomains: OperationsDomain[];
    maxActiveItemsOverride: string;
    maxUrgentItemsOverride: string;
};

const domainOptions: OperationsDomain[] = ["workspace", "billing", "team", "support", "projects"];
const domainLabels: Record<OperationsDomain, string> = {
    workspace: "Workspace",
    billing: "Billing",
    team: "Team",
    support: "Support",
    projects: "Projects",
};

function toLocalDateTimeInput(value: string | null) {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
    const trimmed = value.trim();
    return trimmed ? new Date(trimmed).toISOString() : null;
}

function buildDrafts(snapshot: CoverageSnapshot): Record<string, CoverageDraft> {
    return Object.fromEntries(
        snapshot.operators.map((operator) => [
            operator.userId,
            {
                status: operator.coverageStatus,
                effectiveUntil: toLocalDateTimeInput(operator.effectiveUntil),
                note: operator.note ?? "",
                primaryDomains: operator.primaryDomains,
                maxActiveItemsOverride: operator.maxActiveItemsOverride ? String(operator.maxActiveItemsOverride) : "",
                maxUrgentItemsOverride: operator.maxUrgentItemsOverride ? String(operator.maxUrgentItemsOverride) : "",
            },
        ]),
    ) as Record<string, CoverageDraft>;
}

function toFutureIso(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function summarizeHandoffTargets(items: CoverageAttentionItem[]) {
    const counts = new Map<string, number>();
    items.forEach((item) => {
        const label = item.suggestedAssignee?.label;
        if (!label) {
            return;
        }
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
        .map(([label, count]) => `${label} +${count}`)
        .join(" · ");
}

function formatEffectiveUntil(value: string | null) {
    if (!value) {
        return "No temporary window";
    }

    return `Until ${new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(value))}`;
}

function normalizeNarrativeHref(href: string) {
    return href === "/app/team" ? "#coverage-roster" : href;
}

export function TeamCoverageControlPanel({
    coverage,
    canManage,
}: {
    coverage: CoverageSnapshot;
    canManage: boolean;
}) {
    const router = useRouter();
    const [drafts, setDrafts] = useState<Record<string, CoverageDraft>>(() => buildDrafts(coverage));
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const narrative = describeCoverageNarrative(coverage);
    const topActions = [
        {
            label: narrative.primaryLabel,
            href: normalizeNarrativeHref(narrative.primaryHref),
            solid: true,
        },
        {
            label: narrative.secondaryLabel,
            href: normalizeNarrativeHref(narrative.secondaryHref),
            solid: false,
        },
    ];

    useEffect(() => {
        setDrafts(buildDrafts(coverage));
        setMessage(null);
        setError(null);
    }, [coverage]);

    const runOperatorAction = (userId: string, payload: Record<string, unknown>, successMessage: string) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/coverage/operators/${encodeURIComponent(userId)}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });
                const result = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Unable to update operator coverage.");
                }

                setMessage(successMessage);
                router.refresh();
            } catch (actionError) {
                setError(actionError instanceof Error ? actionError.message : "Unable to update operator coverage.");
            }
        });
    };

    const runRebalance = (itemKey: string) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/coverage/rebalance/${encodeURIComponent(itemKey)}`, {
                    method: "PATCH",
                });
                const result = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Unable to apply the suggested assignee.");
                }

                setMessage("Applied the suggested assignee.");
                router.refresh();
            } catch (actionError) {
                setError(actionError instanceof Error ? actionError.message : "Unable to apply the suggested assignee.");
            }
        });
    };

    const runBatchHandoff = (userId: string, label: string) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/coverage/operators/${encodeURIComponent(userId)}/handoff`, {
                    method: "PATCH",
                });
                const result = (await response.json()) as { success?: boolean; message?: string; appliedCount?: number };
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Unable to hand off suggested items.");
                }

                setMessage(
                    `Applied ${result.appliedCount ?? 0} suggested handoff${result.appliedCount === 1 ? "" : "s"} for ${label}.`,
                );
                router.refresh();
            } catch (actionError) {
                setError(actionError instanceof Error ? actionError.message : "Unable to hand off suggested items.");
            }
        });
    };

    return (
        <section className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Coverage control plane</p>
                        <h3 className="mt-2 text-2xl font-medium tracking-tight text-white">{narrative.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{narrative.body}</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {topActions.map((action) => (
                                <Link
                                    key={`${action.label}-${action.href}`}
                                    href={action.href}
                                    className={
                                        action.solid
                                            ? "rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                                            : "rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                    }
                                >
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={coverage.health} tone={getCoverageHealthTone(coverage.health)} />
                        <StatusBadge label={`${coverage.summary.undercoveredLaneCount} lane gaps`} tone={coverage.summary.undercoveredLaneCount > 0 ? "warning" : "success"} />
                        <StatusBadge
                            label={`${coverage.summary.rebalanceCandidateCount} rebalance`}
                            tone={coverage.summary.rebalanceCandidateCount > 0 ? "warning" : "neutral"}
                        />
                        <StatusBadge label={canManage ? "Writable" : "Read-only"} tone={canManage ? "success" : "neutral"} />
                    </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Available now</p>
                        <p className="mt-2 text-2xl font-medium text-white">{coverage.summary.availableOperatorCount}</p>
                        <p className="mt-2 text-sm text-neutral-400">Operators ready for normal queue flow.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Urgent without owner</p>
                        <p className="mt-2 text-2xl font-medium text-white">{coverage.summary.unownedUrgentItemCount}</p>
                        <p className="mt-2 text-sm text-neutral-400">Urgent items that need an owner immediately.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Unavailable ownership</p>
                        <p className="mt-2 text-2xl font-medium text-white">{coverage.summary.unavailableOwnerItemCount}</p>
                        <p className="mt-2 text-sm text-neutral-400">Live items still sitting with away or inactive operators.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Overloaded operators</p>
                        <p className="mt-2 text-2xl font-medium text-white">{coverage.summary.overloadedOperatorCount}</p>
                        <p className="mt-2 text-sm text-neutral-400">Operators currently beyond workspace policy.</p>
                    </article>
                </div>
            </section>

            <div id="coverage-roster" className="space-y-4">
                {coverage.operators.map((operator) => {
                    const draft = drafts[operator.userId];
                    const handoffItems = coverage.rebalanceCandidates.filter(
                        (item) => item.ownerUserId === operator.userId && item.suggestedAssignee,
                    );
                    const handoffSummary = summarizeHandoffTargets(handoffItems);
                    const visibleDomains = operator.primaryDomains.length > 0 ? operator.primaryDomains : draft.primaryDomains;
                    const quickActions = [
                        {
                            label: "Available now",
                            description: "Return to normal queue flow.",
                            payload: {
                                action: "set",
                                status: "available" as const,
                                effectiveUntil: null,
                                note: null,
                                primaryDomains: draft.primaryDomains,
                                maxActiveItemsOverride: draft.maxActiveItemsOverride ? Number(draft.maxActiveItemsOverride) : null,
                                maxUrgentItemsOverride: draft.maxUrgentItemsOverride ? Number(draft.maxUrgentItemsOverride) : null,
                            },
                            successMessage: `Set ${operator.label} to available.`,
                        },
                        {
                            label: "Focus 2h",
                            description: "Protect heads-down work for the next two hours.",
                            payload: {
                                action: "set",
                                status: "focused" as const,
                                effectiveUntil: toFutureIso(2),
                                note: "Heads-down window",
                                primaryDomains: draft.primaryDomains,
                                maxActiveItemsOverride: draft.maxActiveItemsOverride ? Number(draft.maxActiveItemsOverride) : null,
                                maxUrgentItemsOverride: draft.maxUrgentItemsOverride ? Number(draft.maxUrgentItemsOverride) : null,
                            },
                            successMessage: `Focused ${operator.label} for two hours.`,
                        },
                        {
                            label: "Away 8h",
                            description: "Mark the operator unavailable for the next shift window.",
                            payload: {
                                action: "set",
                                status: "away" as const,
                                effectiveUntil: toFutureIso(8),
                                note: "Temporary away window",
                                primaryDomains: draft.primaryDomains,
                                maxActiveItemsOverride: draft.maxActiveItemsOverride ? Number(draft.maxActiveItemsOverride) : null,
                                maxUrgentItemsOverride: draft.maxUrgentItemsOverride ? Number(draft.maxUrgentItemsOverride) : null,
                            },
                            successMessage: `Marked ${operator.label} away for eight hours.`,
                        },
                        {
                            label: "Backup 4h",
                            description: "Keep the operator as reserve coverage without making them primary.",
                            payload: {
                                action: "set",
                                status: "backup" as const,
                                effectiveUntil: toFutureIso(4),
                                note: "Backup window",
                                primaryDomains: draft.primaryDomains,
                                maxActiveItemsOverride: draft.maxActiveItemsOverride ? Number(draft.maxActiveItemsOverride) : null,
                                maxUrgentItemsOverride: draft.maxUrgentItemsOverride ? Number(draft.maxUrgentItemsOverride) : null,
                            },
                            successMessage: `Set ${operator.label} as backup coverage.`,
                        },
                    ];

                    return (
                        <article key={operator.userId} className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="max-w-3xl">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-lg font-medium text-white">{operator.label}</p>
                                        {operator.isCurrentUser ? <StatusBadge label="You" tone="info" /> : null}
                                        <StatusBadge label={operator.coverageStatus} tone={getCoverageStatusTone(operator.coverageStatus)} />
                                        <StatusBadge label={operator.capacityState} tone={getCapacityTone(operator.capacityState)} />
                                    </div>
                                    <p className="mt-1 text-sm text-neutral-500">{operator.email}</p>
                                    <p className="mt-2 text-sm text-neutral-300">{describeCoverageStatus(operator.coverageStatus)}</p>
                                    <p className="mt-2 text-xs text-neutral-500">
                                        {operator.role ?? "member"} · Primary lanes {visibleDomains.map((domain) => domainLabels[domain]).join(" / ") || "not set"} ·{" "}
                                        {operator.activeAssignmentCount}/{Math.max(operator.maxActiveItems, 1)} active · {operator.urgentAssignmentCount}/
                                        {Math.max(operator.maxUrgentItems, 1)} urgent
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                                            {formatEffectiveUntil(operator.effectiveUntil)}
                                        </span>
                                        {operator.note ? (
                                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{operator.note}</span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {operator.staleInProgressCount > 0 ? <StatusBadge label={`${operator.staleInProgressCount} stale`} tone="warning" /> : null}
                                    {operator.unavailableOwnedItemCount > 0 ? (
                                        <StatusBadge label={`${operator.unavailableOwnedItemCount} unavailable-owned`} tone="warning" />
                                    ) : null}
                                    {handoffItems.length > 0 ? (
                                        <StatusBadge label={`${handoffItems.length} suggested handoffs`} tone="warning" />
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-4">
                                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Current load</p>
                                    <p className="mt-2 text-lg font-medium text-white">{operator.activeAssignmentCount}</p>
                                    <p className="mt-1 text-xs text-neutral-500">{operator.openAssignmentCount} open · {operator.inProgressAssignmentCount} in progress</p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Urgent pressure</p>
                                    <p className="mt-2 text-lg font-medium text-white">{operator.urgentAssignmentCount}</p>
                                    <p className="mt-1 text-xs text-neutral-500">Policy limit {Math.max(operator.maxUrgentItems, 1)} urgent items</p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Queue posture</p>
                                    <p className="mt-2 text-lg font-medium text-white">{operator.canTakeNewWork ? "Can take work" : "Hold new work"}</p>
                                    <p className="mt-1 text-xs text-neutral-500">{operator.snoozedAssignmentCount} snoozed · {operator.resolvedAssignmentCount} resolved</p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Rebalance pressure</p>
                                    <p className="mt-2 text-lg font-medium text-white">{handoffItems.length}</p>
                                    <p className="mt-1 text-xs text-neutral-500">
                                        {handoffItems.length > 0 ? handoffSummary || "Suggested assignees ready." : "No suggested handoffs right now."}
                                    </p>
                                </article>
                            </div>

                            <div className="mt-5 rounded-[1.3rem] border border-white/10 bg-black/20 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Quick actions</p>
                                        <p className="mt-2 text-sm text-neutral-400">These save immediately and keep lane responsibility plus overrides intact.</p>
                                    </div>
                                    {handoffItems.length > 0 && canManage ? (
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => runBatchHandoff(operator.userId, operator.label)}
                                            className="rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
                                        >
                                            Handoff suggested items
                                        </button>
                                    ) : null}
                                </div>

                                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                    {quickActions.map((action) => (
                                        <button
                                            key={action.label}
                                            type="button"
                                            disabled={!canManage || isPending}
                                            onClick={() => runOperatorAction(operator.userId, action.payload, action.successMessage)}
                                            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-60"
                                        >
                                            <p className="text-sm font-medium text-white">{action.label}</p>
                                            <p className="mt-2 text-xs leading-5 text-neutral-400">{action.description}</p>
                                        </button>
                                    ))}
                                </div>

                                {handoffItems.length > 0 ? (
                                    <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                        {handoffItems.length} suggested handoff{handoffItems.length === 1 ? "" : "s"} ready. {handoffSummary || "No alternative assignee summary available yet."}
                                    </p>
                                ) : null}
                            </div>

                            <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr,1fr]">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Advanced controls</p>
                                        <p className="mt-2 text-sm text-neutral-500">Use these when the quick actions are close but not quite right.</p>
                                    </div>

                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Coverage status</span>
                                        <select
                                            value={draft.status}
                                            disabled={!canManage || isPending}
                                            onChange={(event) =>
                                                setDrafts((current) => ({
                                                    ...current,
                                                    [operator.userId]: {
                                                        ...draft,
                                                        status: event.target.value as OperatorCoverageStatus,
                                                    },
                                                }))
                                            }
                                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                        >
                                            {["available", "focused", "away", "backup"].map((option) => (
                                                <option key={option} value={option} className="bg-black text-white">
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Effective until</span>
                                        <input
                                            type="datetime-local"
                                            value={draft.effectiveUntil}
                                            disabled={!canManage || isPending}
                                            onChange={(event) =>
                                                setDrafts((current) => ({
                                                    ...current,
                                                    [operator.userId]: {
                                                        ...draft,
                                                        effectiveUntil: event.target.value,
                                                    },
                                                }))
                                            }
                                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                        />
                                    </label>

                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Note</span>
                                        <input
                                            type="text"
                                            value={draft.note}
                                            maxLength={280}
                                            disabled={!canManage || isPending}
                                            onChange={(event) =>
                                                setDrafts((current) => ({
                                                    ...current,
                                                    [operator.userId]: {
                                                        ...draft,
                                                        note: event.target.value,
                                                    },
                                                }))
                                            }
                                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                        />
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Primary lanes</p>
                                        <p className="mt-2 text-sm text-neutral-500">These lanes bias suggestions and tell the dashboard who is expected to cover what.</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {domainOptions.map((domain) => {
                                                const selected = draft.primaryDomains.includes(domain);
                                                return (
                                                    <button
                                                        key={domain}
                                                        type="button"
                                                        disabled={!canManage || isPending}
                                                        onClick={() =>
                                                            setDrafts((current) => ({
                                                                ...current,
                                                                [operator.userId]: {
                                                                    ...draft,
                                                                    primaryDomains: selected
                                                                        ? draft.primaryDomains.filter((entry) => entry !== domain)
                                                                        : [...draft.primaryDomains, domain],
                                                                },
                                                            }))
                                                        }
                                                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                            selected
                                                                ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                                                                : "border-white/10 bg-white/[0.03] text-white"
                                                        } disabled:opacity-60`}
                                                    >
                                                        {domain}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Active override</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={48}
                                                value={draft.maxActiveItemsOverride}
                                                disabled={!canManage || isPending}
                                                onChange={(event) =>
                                                    setDrafts((current) => ({
                                                        ...current,
                                                        [operator.userId]: {
                                                            ...draft,
                                                            maxActiveItemsOverride: event.target.value,
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                            />
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Urgent override</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={24}
                                                value={draft.maxUrgentItemsOverride}
                                                disabled={!canManage || isPending}
                                                onChange={(event) =>
                                                    setDrafts((current) => ({
                                                        ...current,
                                                        [operator.userId]: {
                                                            ...draft,
                                                            maxUrgentItemsOverride: event.target.value,
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() =>
                                        runOperatorAction(
                                            operator.userId,
                                            {
                                                action: "set",
                                                status: draft.status,
                                                effectiveUntil: toIsoOrNull(draft.effectiveUntil),
                                                note: draft.note.trim() || null,
                                                primaryDomains: draft.primaryDomains,
                                                maxActiveItemsOverride: draft.maxActiveItemsOverride ? Number(draft.maxActiveItemsOverride) : null,
                                                maxUrgentItemsOverride: draft.maxUrgentItemsOverride ? Number(draft.maxUrgentItemsOverride) : null,
                                            },
                                            `Updated coverage for ${operator.label}.`,
                                        )
                                    }
                                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
                                >
                                    Save advanced controls
                                </button>
                                <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() =>
                                        runOperatorAction(
                                            operator.userId,
                                            { action: "clear" },
                                            `Cleared explicit coverage overrides for ${operator.label}.`,
                                        )
                                    }
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                >
                                    Clear to role defaults
                                </button>
                                <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() =>
                                        runOperatorAction(
                                            operator.userId,
                                            { action: "expire" },
                                            `Expired the temporary coverage state for ${operator.label}.`,
                                        )
                                    }
                                    className="rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
                                >
                                    Expire temporary state
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>

            <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Rebalance pressure</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Suggested assignees from shared capacity logic</h3>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            Every recommendation below is already filtered through lane coverage, operator availability, and current load.
                        </p>
                    </div>
                    <StatusBadge label={`${coverage.rebalanceCandidates.length} candidates`} tone={coverage.rebalanceCandidates.length > 0 ? "warning" : "success"} />
                </div>

                {coverage.rebalanceCandidates.length === 0 ? (
                    <p className="mt-5 text-sm leading-7 text-neutral-400">No current items need or justify a shared rebalance.</p>
                ) : (
                    <div className="mt-5 space-y-3">
                        {coverage.rebalanceCandidates.map((item) => {
                            const currentOwner = item.ownerUserId
                                ? coverage.operators.find((operator) => operator.userId === item.ownerUserId) ?? null
                                : null;
                            const suggestedOperator = item.suggestedAssignee
                                ? coverage.operators.find((operator) => operator.userId === item.suggestedAssignee?.userId) ?? null
                                : null;
                            const currentLoad = currentOwner
                                ? describeProjectedLoad({
                                      operator: currentOwner,
                                      item: { severity: item.severity },
                                      currentOwnerUserId: item.ownerUserId,
                                      nextOwnerUserId: suggestedOperator?.userId ?? null,
                                  })
                                : null;
                            const nextLoad = suggestedOperator
                                ? describeProjectedLoad({
                                      operator: suggestedOperator,
                                      item: { severity: item.severity },
                                      currentOwnerUserId: item.ownerUserId,
                                      nextOwnerUserId: suggestedOperator.userId,
                                  })
                                : null;

                            return (
                                <article key={item.itemKey} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="max-w-3xl">
                                            <p className="text-sm font-medium text-white">{item.title}</p>
                                            <p className="mt-1 text-sm text-neutral-500">{item.reason}</p>
                                            {item.suggestedAssignee ? (
                                                <p className="mt-2 text-xs text-cyan-100">
                                                    {item.suggestedAssignee.label} · {item.suggestedAssignee.reason}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <StatusBadge label={item.domain} tone="neutral" />
                                            {item.ownerStatus ? <StatusBadge label={item.ownerStatus} tone={getCoverageStatusTone(item.ownerStatus)} /> : null}
                                            {item.suggestedAssignee && canManage ? (
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() => runRebalance(item.itemKey)}
                                                    className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:border-sky-300/30 hover:bg-sky-500/15 disabled:opacity-60"
                                                >
                                                    Apply suggestion
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>

                                    {(currentOwner || suggestedOperator) ? (
                                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                                            {currentOwner && currentLoad ? (
                                                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Current owner after move</p>
                                                    <p className="mt-2 text-sm font-medium text-white">{currentOwner.label}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        Active {currentOwner.activeAssignmentCount} to {currentLoad.nextActive} · Urgent {currentOwner.urgentAssignmentCount} to {currentLoad.nextUrgent}
                                                    </p>
                                                </div>
                                            ) : null}
                                            {suggestedOperator && nextLoad ? (
                                                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/80">Suggested owner after move</p>
                                                    <p className="mt-2 text-sm font-medium text-white">{suggestedOperator.label}</p>
                                                    <p className="mt-1 text-xs text-sky-100/80">
                                                        Active {suggestedOperator.activeAssignmentCount} to {nextLoad.nextActive} · Urgent {suggestedOperator.urgentAssignmentCount} to {nextLoad.nextUrgent}
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            {message ? <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
