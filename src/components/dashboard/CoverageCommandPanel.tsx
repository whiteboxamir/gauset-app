import Link from "next/link";

import type { CoordinationSnapshot } from "@/server/contracts/coordination";

import { describeCoverageNarrative, describeCoverageStatus } from "@/components/platform/coverage-guidance";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { getCapacityTone, getCoverageHealthTone, getCoverageStatusTone } from "@/components/platform/coverage-presentation";

function AttentionList({
    title,
    items,
    emptyLabel,
}: {
    title: string;
    items: CoordinationSnapshot["coverage"]["rebalanceCandidates"];
    emptyLabel: string;
}) {
    return (
        <article className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-white">{title}</h3>
                <StatusBadge label={`${items.length}`} tone={items.length > 0 ? "warning" : "neutral"} />
            </div>
            {items.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-neutral-500">{emptyLabel}</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {items.slice(0, 4).map((item) => (
                        <Link
                            key={item.itemKey}
                            href={item.href}
                            className="block rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                        >
                            <div className="flex flex-wrap gap-2">
                                <StatusBadge label={item.domain} tone="neutral" />
                                {item.ownerStatus ? <StatusBadge label={item.ownerStatus} tone={getCoverageStatusTone(item.ownerStatus)} /> : null}
                                {item.ownerCapacityState && item.ownerCapacityState !== "balanced" ? (
                                    <StatusBadge label={item.ownerCapacityState} tone={getCapacityTone(item.ownerCapacityState)} />
                                ) : null}
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">{item.title}</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">{item.reason}</p>
                            {item.suggestedAssignee ? (
                                <p className="mt-2 text-xs text-cyan-100">
                                    Suggested assignee: {item.suggestedAssignee.label} · {item.suggestedAssignee.reason}
                                </p>
                            ) : null}
                        </Link>
                    ))}
                </div>
            )}
        </article>
    );
}

export function CoverageCommandPanel({
    snapshot,
}: {
    snapshot: CoordinationSnapshot;
}) {
    const { coverage } = snapshot;
    const laneGaps = coverage.lanes.filter((lane) => lane.status === "undercovered");
    const overloadedOperators = coverage.operators.filter((operator) => operator.capacityState === "overloaded");
    const narrative = describeCoverageNarrative(coverage);

    return (
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Coverage OS</p>
                    <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">{narrative.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">{narrative.body}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={coverage.health} tone={getCoverageHealthTone(coverage.health)} />
                        <StatusBadge label={`${coverage.summary.availableOperatorCount} available`} tone="success" />
                        <StatusBadge label={`${coverage.summary.focusedOperatorCount} focused`} tone="info" />
                        <StatusBadge label={`${coverage.summary.awayOperatorCount} away`} tone={coverage.summary.awayOperatorCount > 0 ? "warning" : "neutral"} />
                        <StatusBadge label={`${coverage.summary.backupOperatorCount} backup`} tone="neutral" />
                        <StatusBadge
                            label={`${coverage.summary.rebalanceCandidateCount} rebalance`}
                            tone={coverage.summary.rebalanceCandidateCount > 0 ? "warning" : "neutral"}
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={narrative.secondaryHref}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                    >
                        {narrative.secondaryLabel}
                    </Link>
                    <Link
                        href={narrative.primaryHref}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                    >
                        {narrative.primaryLabel}
                    </Link>
                </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
                <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Operator roster</h3>
                        <StatusBadge label={`${coverage.operators.length} operators`} tone="neutral" />
                    </div>
                    <div className="mt-4 space-y-3">
                        {coverage.operators.map((operator) => (
                            <div key={operator.userId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{operator.label}</p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {operator.role ?? "member"} · {operator.primaryDomains.join(" / ") || "No primary lanes"}
                                        </p>
                                        <p className="mt-2 text-sm text-neutral-400">{describeCoverageStatus(operator.coverageStatus)}</p>
                                        {operator.note ? <p className="mt-2 text-sm text-neutral-400">{operator.note}</p> : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge label={operator.coverageStatus} tone={getCoverageStatusTone(operator.coverageStatus)} />
                                        <StatusBadge label={operator.capacityState} tone={getCapacityTone(operator.capacityState)} />
                                        <StatusBadge label={`${operator.activeAssignmentCount}/${Math.max(operator.maxActiveItems, 1)} active`} tone="neutral" />
                                        <StatusBadge label={`${operator.urgentAssignmentCount}/${Math.max(operator.maxUrgentItems, 1)} urgent`} tone="neutral" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <div className="space-y-4">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-medium text-white">Best next move</h3>
                            <StatusBadge label={coverage.health} tone={getCoverageHealthTone(coverage.health)} />
                        </div>
                        <p className="mt-4 text-sm leading-6 text-neutral-300">{narrative.body}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                                href={narrative.primaryHref}
                                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                            >
                                {narrative.primaryLabel}
                            </Link>
                            <Link
                                href={narrative.secondaryHref}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                            >
                                {narrative.secondaryLabel}
                            </Link>
                        </div>
                    </article>

                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-medium text-white">Why this workspace is {coverage.health}</h3>
                            <StatusBadge label={`${coverage.summary.reasons.length}`} tone="neutral" />
                        </div>
                        <div className="mt-4 space-y-2">
                            {coverage.summary.reasons.map((reason) => (
                                <p key={reason} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-300">
                                    {reason}
                                </p>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-medium text-white">Lane coverage</h3>
                            <StatusBadge label={`${laneGaps.length} gaps`} tone={laneGaps.length > 0 ? "warning" : "success"} />
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {coverage.lanes.map((lane) => (
                                <div key={lane.domain} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium text-white">{lane.label}</p>
                                        <StatusBadge label={lane.status} tone={lane.status === "undercovered" ? "warning" : "success"} />
                                    </div>
                                    <p className="mt-2 text-xs text-neutral-500">
                                        {lane.coveredOperatorCount} covering · {lane.urgentItemCount} urgent · {lane.unavailableOwnerItemCount} unavailable-owner
                                    </p>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-medium text-white">Overloaded operators</h3>
                            <StatusBadge label={`${overloadedOperators.length}`} tone={overloadedOperators.length > 0 ? "danger" : "success"} />
                        </div>
                        {overloadedOperators.length === 0 ? (
                            <p className="mt-4 text-sm leading-6 text-neutral-500">No operators are above the current capacity policy.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {overloadedOperators.map((operator) => (
                                    <div key={operator.userId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                        <p className="text-sm font-medium text-white">{operator.label}</p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {operator.activeAssignmentCount}/{Math.max(operator.maxActiveItems, 1)} active · {operator.urgentAssignmentCount}/
                                            {Math.max(operator.maxUrgentItems, 1)} urgent
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>
                </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
                <AttentionList title="Urgent without owner" items={coverage.unownedUrgentItems} emptyLabel="Urgent items are currently owned." />
                <AttentionList
                    title="Owned by unavailable operators"
                    items={coverage.unavailableOwnerItems}
                    emptyLabel="No active items are stuck behind away or off-roster owners."
                />
                <AttentionList title="Rebalance pressure" items={coverage.rebalanceCandidates} emptyLabel="No immediate rebalance suggestions." />
            </div>
        </section>
    );
}
