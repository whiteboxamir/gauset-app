import Link from "next/link";

import type { ContinuitySnapshot } from "@/server/contracts/continuity";

import { StatusBadge } from "@/components/platform/StatusBadge";

function getHealthTone(health: ContinuitySnapshot["health"]) {
    switch (health) {
        case "critical":
            return "danger";
        case "drifting":
            return "warning";
        case "stable":
        default:
            return "success";
    }
}

export function ContinuityPanel({
    snapshot,
}: {
    snapshot: ContinuitySnapshot;
}) {
    return (
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Continuity OS</p>
                    <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">Persistent handoff and escalation posture</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        Continuity now derives from live coordination, coverage posture, governance policy, and persisted lane handoffs instead of relying on implicit operator memory.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={snapshot.health} tone={getHealthTone(snapshot.health)} />
                    <StatusBadge label={`${snapshot.summary.staleHandoffCount} stale`} tone={snapshot.summary.staleHandoffCount > 0 ? "warning" : "success"} />
                    <StatusBadge label={`${snapshot.summary.criticalLaneCount} critical`} tone={snapshot.summary.criticalLaneCount > 0 ? "danger" : "neutral"} />
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-5">
                <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Stale handoffs</p>
                    <p className="mt-2 text-2xl font-medium text-white">{snapshot.summary.staleHandoffCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Missing handoffs</p>
                    <p className="mt-2 text-2xl font-medium text-white">{snapshot.summary.missingHandoffCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Away with urgent</p>
                    <p className="mt-2 text-2xl font-medium text-white">{snapshot.summary.awayWithUrgentWorkCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Coverage mismatch</p>
                    <p className="mt-2 text-2xl font-medium text-white">{snapshot.summary.mismatchedCoverageCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Critical lanes</p>
                    <p className="mt-2 text-2xl font-medium text-white">{snapshot.summary.criticalLaneCount}</p>
                </article>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Why the workspace is {snapshot.health}</p>
                    <div className="mt-3 space-y-2">
                        {snapshot.reasons.length === 0 ? (
                            <p className="text-sm leading-7 text-neutral-400">No continuity drifts are currently open.</p>
                        ) : (
                            snapshot.reasons.map((reason) => (
                                <p key={reason} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-300">
                                    {reason}
                                </p>
                            ))
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Alerts</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">Remediation always routes back to dashboard and team.</p>
                        </div>
                        <Link href="/app/team#lane-handoffs" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                            Open handoffs
                        </Link>
                    </div>
                    <div className="mt-3 space-y-3">
                        {snapshot.alerts.length === 0 ? (
                            <p className="text-sm leading-7 text-neutral-400">No continuity alerts are open.</p>
                        ) : (
                            snapshot.alerts.map((alert) => (
                                <article key={alert.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-white">{alert.title}</p>
                                            <p className="mt-1 text-sm leading-6 text-neutral-400">{alert.body}</p>
                                        </div>
                                        <StatusBadge label={alert.severity} tone={getHealthTone(alert.severity)} />
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
