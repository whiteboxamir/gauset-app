"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { AccessReviewDecision, GovernanceAccessReviewSnapshot } from "@/server/contracts/governance";

import { EmptyState } from "@/components/platform/EmptyState";
import { formatDateTime } from "@/components/platform/formatters";
import { StatusBadge } from "@/components/platform/StatusBadge";

const decisions: AccessReviewDecision[] = ["keep", "revoke", "escalate", "defer"];

export function AccessReviewPanel({
    snapshot,
    canManage,
}: {
    snapshot: GovernanceAccessReviewSnapshot;
    canManage: boolean;
}) {
    const router = useRouter();
    const [drafts, setDrafts] = useState<Record<string, AccessReviewDecision>>(
        () => Object.fromEntries(snapshot.entries.filter((entry) => entry.decision).map((entry) => [entry.entryId, entry.decision])) as Record<string, AccessReviewDecision>,
    );
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setDrafts(
            Object.fromEntries(snapshot.entries.filter((entry) => entry.decision).map((entry) => [entry.entryId, entry.decision])) as Record<
                string,
                AccessReviewDecision
            >,
        );
    }, [snapshot.entries]);

    const openEntries = useMemo(
        () =>
            snapshot.entries.map((entry) => ({
                ...entry,
                nextDecision: drafts[entry.entryId] ?? entry.decision ?? "keep",
            })),
        [drafts, snapshot.entries],
    );

    const refreshWithMessage = (nextMessage: string) => {
        setMessage(nextMessage);
        router.refresh();
    };

    return (
        <section id="access-review" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Access review</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Operator and invite review loop</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Run a lightweight access review over active members and pending invites so elevated access and stale invitations stop drifting invisibly.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={snapshot.status} tone={snapshot.status === "open" ? "warning" : snapshot.status === "completed" ? "success" : "neutral"} />
                    <StatusBadge label={snapshot.dueLabel} tone="neutral" />
                </div>
            </div>

            {snapshot.status === "none" ? (
                <EmptyState
                    className="mt-5"
                    eyebrow="Access review"
                    title="No review in flight"
                    body="Start a workspace access review to record explicit decisions on members and pending invitations."
                    actions={
                        canManage ? (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                    setError(null);
                                    setMessage(null);
                                    startTransition(async () => {
                                        try {
                                            const response = await fetch("/api/account/governance/access-reviews", {
                                                method: "POST",
                                            });
                                            const payload = (await response.json()) as { success?: boolean; message?: string };
                                            if (!response.ok || !payload.success) {
                                                throw new Error(payload.message || "Unable to start access review.");
                                            }

                                            refreshWithMessage("Access review started.");
                                        } catch (reviewError) {
                                            setError(reviewError instanceof Error ? reviewError.message : "Unable to start access review.");
                                        }
                                    });
                                }}
                                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
                            >
                                Start access review
                            </button>
                        ) : null
                    }
                />
            ) : snapshot.status === "completed" ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-neutral-300">
                        Last completed {formatDateTime(snapshot.completedAt)} by {snapshot.completedByLabel ?? "an operator"}.
                    </p>
                    {canManage ? (
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                                setError(null);
                                setMessage(null);
                                startTransition(async () => {
                                    try {
                                        const response = await fetch("/api/account/governance/access-reviews", {
                                            method: "POST",
                                        });
                                        const payload = (await response.json()) as { success?: boolean; message?: string };
                                        if (!response.ok || !payload.success) {
                                            throw new Error(payload.message || "Unable to start access review.");
                                        }

                                        refreshWithMessage("New access review started.");
                                    } catch (reviewError) {
                                        setError(reviewError instanceof Error ? reviewError.message : "Unable to start access review.");
                                    }
                                });
                            }}
                            className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
                        >
                            Start new review
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="mt-5 space-y-3">
                    {openEntries.map((entry) => (
                        <article key={entry.entryId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge label={entry.subjectType} tone="neutral" />
                                        {entry.elevated ? <StatusBadge label="Elevated" tone="warning" /> : null}
                                        {entry.stale ? <StatusBadge label="Stale" tone="danger" /> : null}
                                    </div>
                                    <p className="mt-3 text-sm font-medium text-white">{entry.label}</p>
                                    {entry.secondaryLabel ? <p className="mt-1 text-sm text-neutral-500">{entry.secondaryLabel}</p> : null}
                                </div>
                                {canManage ? (
                                    <div className="grid gap-2 sm:grid-cols-[180px,auto]">
                                        <select
                                            value={entry.nextDecision}
                                            onChange={(event) =>
                                                setDrafts((current) => ({
                                                    ...current,
                                                    [entry.entryId]: event.target.value as AccessReviewDecision,
                                                }))
                                            }
                                            disabled={isPending}
                                            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                                        >
                                            {decisions.map((decision) => (
                                                <option key={decision} value={decision} className="bg-black text-white">
                                                    {decision}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => {
                                                setError(null);
                                                setMessage(null);
                                                startTransition(async () => {
                                                    try {
                                                        const response = await fetch("/api/account/governance/access-reviews", {
                                                            method: "PATCH",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                            },
                                                            body: JSON.stringify({
                                                                action: "decide",
                                                                reviewId: snapshot.reviewId,
                                                                entryId: entry.entryId,
                                                                decision: entry.nextDecision,
                                                            }),
                                                        });
                                                        const payload = (await response.json()) as { success?: boolean; message?: string };
                                                        if (!response.ok || !payload.success) {
                                                            throw new Error(payload.message || "Unable to record access review decision.");
                                                        }

                                                        refreshWithMessage(`Recorded ${entry.nextDecision} for ${entry.label}.`);
                                                    } catch (reviewError) {
                                                        setError(reviewError instanceof Error ? reviewError.message : "Unable to record access review decision.");
                                                    }
                                                });
                                            }}
                                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                        >
                                            Save decision
                                        </button>
                                    </div>
                                ) : (
                                    <StatusBadge label={entry.decision ?? "pending"} tone={entry.decision ? "success" : "warning"} />
                                )}
                            </div>
                        </article>
                    ))}

                    {canManage ? (
                        <button
                            type="button"
                            disabled={isPending || snapshot.undecidedCount > 0}
                            onClick={() => {
                                setError(null);
                                setMessage(null);
                                startTransition(async () => {
                                    try {
                                        const response = await fetch("/api/account/governance/access-reviews", {
                                            method: "PATCH",
                                            headers: {
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                                action: "complete",
                                                reviewId: snapshot.reviewId,
                                            }),
                                        });
                                        const payload = (await response.json()) as { success?: boolean; message?: string };
                                        if (!response.ok || !payload.success) {
                                            throw new Error(payload.message || "Unable to complete access review.");
                                        }

                                        refreshWithMessage("Access review completed.");
                                    } catch (reviewError) {
                                        setError(reviewError instanceof Error ? reviewError.message : "Unable to complete access review.");
                                    }
                                });
                            }}
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Complete review
                        </button>
                    ) : null}
                </div>
            )}

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
