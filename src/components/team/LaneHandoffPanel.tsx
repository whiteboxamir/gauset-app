"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { ContinuitySnapshot } from "@/server/contracts/continuity";
import type { CoverageSnapshot } from "@/server/contracts/coverage";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

type HandoffDraft = {
    summary: string;
    activeRisks: string;
    nextActions: string;
    primaryOperatorUserId: string;
    backupOperatorUserId: string;
    reviewByAt: string;
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

function buildDrafts(snapshot: ContinuitySnapshot): Record<string, HandoffDraft> {
    return Object.fromEntries(
        snapshot.handoffs.map((handoff) => [
            handoff.domain,
            {
                summary: handoff.summary ?? "",
                activeRisks: handoff.activeRisks.join("\n"),
                nextActions: handoff.nextActions.join("\n"),
                primaryOperatorUserId: handoff.primaryOperator?.userId ?? "",
                backupOperatorUserId: handoff.backupOperator?.userId ?? "",
                reviewByAt: toLocalDateTimeInput(handoff.reviewByAt),
            },
        ]),
    );
}

export function LaneHandoffPanel({
    snapshot,
    coverage,
    canManage,
}: {
    snapshot: ContinuitySnapshot;
    coverage: CoverageSnapshot;
    canManage: boolean;
}) {
    const router = useRouter();
    const [drafts, setDrafts] = useState<Record<string, HandoffDraft>>(() => buildDrafts(snapshot));
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setDrafts(buildDrafts(snapshot));
        setMessage(null);
        setError(null);
    }, [snapshot]);

    const saveLane = (domain: string, draft: HandoffDraft) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/continuity/lanes/${encodeURIComponent(domain)}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        summary: draft.summary.trim() || null,
                        activeRisks: draft.activeRisks
                            .split(/\r?\n/)
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        nextActions: draft.nextActions
                            .split(/\r?\n/)
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        primaryOperatorUserId: draft.primaryOperatorUserId || null,
                        backupOperatorUserId: draft.backupOperatorUserId || null,
                        reviewByAt: toIsoOrNull(draft.reviewByAt),
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to update lane handoff.");
                }

                setMessage(`Saved ${domain} lane handoff.`);
                router.refresh();
            } catch (handoffError) {
                setError(handoffError instanceof Error ? handoffError.message : "Unable to update lane handoff.");
            }
        });
    };

    const clearLane = (domain: string) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/continuity/lanes/${encodeURIComponent(domain)}`, {
                    method: "DELETE",
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to clear lane handoff.");
                }

                setMessage(`Cleared ${domain} lane handoff.`);
                router.refresh();
            } catch (handoffError) {
                setError(handoffError instanceof Error ? handoffError.message : "Unable to clear lane handoff.");
            }
        });
    };

    return (
        <section id="lane-handoffs" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Lane handoffs</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Write or refresh continuity before operators go away</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-400">
                        Team is the continuity authoring surface. When urgent work is carried by an away operator, the workspace policy can require a handoff here before the coverage state changes.
                    </p>
                </div>
                <StatusBadge label={canManage ? "Writable" : "Read-only"} tone={canManage ? "success" : "neutral"} />
            </div>

            <div className="mt-5 space-y-4">
                {snapshot.handoffs.map((handoff) => {
                    const draft = drafts[handoff.domain] ?? {
                        summary: "",
                        activeRisks: "",
                        nextActions: "",
                        primaryOperatorUserId: "",
                        backupOperatorUserId: "",
                        reviewByAt: "",
                    };
                    const domainOptions = coverage.operators.filter((operator) => operator.primaryDomains.includes(handoff.domain));
                    const options = domainOptions.length > 0 ? domainOptions : coverage.operators;

                    return (
                        <article key={handoff.domain} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-lg font-medium text-white">{handoff.domain}</p>
                                        <StatusBadge label={handoff.health} tone={handoff.health === "critical" ? "danger" : handoff.health === "drifting" ? "warning" : "success"} />
                                        {handoff.required ? <StatusBadge label="Required for away" tone="warning" /> : null}
                                    </div>
                                    {handoff.reasons.length > 0 ? (
                                        <p className="mt-2 text-sm leading-6 text-neutral-400">{handoff.reasons.join(" ")}</p>
                                    ) : (
                                        <p className="mt-2 text-sm leading-6 text-neutral-400">This lane is currently documented and aligned.</p>
                                    )}
                                    <p className="mt-2 text-xs text-neutral-500">
                                        Last updated {formatDateTime(handoff.updatedAt, "Not recorded")}
                                        {handoff.updatedByLabel ? ` by ${handoff.updatedByLabel}` : ""}.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {handoff.primaryOperator ? <StatusBadge label={`Primary ${handoff.primaryOperator.label}`} tone="info" /> : null}
                                    {handoff.backupOperator ? <StatusBadge label={`Backup ${handoff.backupOperator.label}`} tone="neutral" /> : null}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Summary</span>
                                    <textarea
                                        value={draft.summary}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    summary: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        rows={4}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Review by</span>
                                    <input
                                        type="datetime-local"
                                        value={draft.reviewByAt}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    reviewByAt: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Active risks</span>
                                    <textarea
                                        value={draft.activeRisks}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    activeRisks: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        rows={4}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Next actions</span>
                                    <textarea
                                        value={draft.nextActions}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    nextActions: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        rows={4}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Primary operator</span>
                                    <select
                                        value={draft.primaryOperatorUserId}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    primaryOperatorUserId: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    >
                                        <option value="" className="bg-neutral-950 text-white">
                                            No primary operator
                                        </option>
                                        {options.map((option) => (
                                            <option key={option.userId} value={option.userId} className="bg-neutral-950 text-white">
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Backup operator</span>
                                    <select
                                        value={draft.backupOperatorUserId}
                                        onChange={(event) =>
                                            setDrafts((current) => ({
                                                ...current,
                                                [handoff.domain]: {
                                                    ...draft,
                                                    backupOperatorUserId: event.target.value,
                                                },
                                            }))
                                        }
                                        disabled={!canManage || isPending}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                    >
                                        <option value="" className="bg-neutral-950 text-white">
                                            No backup operator
                                        </option>
                                        {options.map((option) => (
                                            <option key={option.userId} value={option.userId} className="bg-neutral-950 text-white">
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() => saveLane(handoff.domain, draft)}
                                    className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Save handoff
                                </button>
                                <button
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() => clearLane(handoff.domain)}
                                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Clear handoff
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
