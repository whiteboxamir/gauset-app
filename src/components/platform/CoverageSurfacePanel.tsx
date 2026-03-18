import Link from "next/link";

import type { CoverageSnapshot } from "@/server/contracts/coverage";
import type { CoordinationOperator, CoordinationViewer, CoordinatedOperationalItem } from "@/server/contracts/coordination";
import type { OperationsDomain } from "@/server/contracts/operations";

import { CoordinationItemCard } from "@/components/platform/CoordinationItemCard";
import { describeCoverageStatus } from "@/components/platform/coverage-guidance";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { getCapacityTone, getCoverageStatusTone } from "@/components/platform/coverage-presentation";

function describeSurfaceCoverageNarrative({
    domains,
    coverage,
}: {
    domains: OperationsDomain[];
    coverage: CoverageSnapshot;
}) {
    const laneSummaries = coverage.lanes.filter((lane) => domains.includes(lane.domain));
    const laneGap = laneSummaries.find((lane) => lane.status === "undercovered") ?? null;
    const unownedUrgent = laneSummaries.reduce((total, lane) => total + lane.unownedUrgentItemCount, 0);
    const unavailableOwners = laneSummaries.reduce((total, lane) => total + lane.unavailableOwnerItemCount, 0);

    if (unownedUrgent > 0) {
        return unownedUrgent === 1
            ? "One urgent item in this surface has no owner right now."
            : `${unownedUrgent} urgent items in this surface have no owner right now.`;
    }

    if (unavailableOwners > 0) {
        return unavailableOwners === 1
            ? "One item here is still owned by an unavailable operator."
            : `${unavailableOwners} items here are still owned by unavailable operators.`;
    }

    if (laneGap) {
        return laneGap.gapReason ?? `${laneGap.label} has no effective coverage right now.`;
    }

    return "Owner availability, lane posture, and rebalance pressure are aligned for this surface right now.";
}

export function CoverageSurfacePanel({
    eyebrow,
    title,
    domains,
    items,
    coverage,
    viewer,
    operators,
    maxSnoozeHours,
    emptyBody,
}: {
    eyebrow: string;
    title: string;
    domains: OperationsDomain[];
    items: CoordinatedOperationalItem[];
    coverage: CoverageSnapshot;
    viewer: CoordinationViewer;
    operators: CoordinationOperator[];
    maxSnoozeHours: number;
    emptyBody: string;
}) {
    const laneSummaries = coverage.lanes.filter((lane) => domains.includes(lane.domain));
    const narrative = describeSurfaceCoverageNarrative({ domains, coverage });

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-2 text-lg font-medium text-white">{title}</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">{narrative}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/app/team" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                        Open team coverage
                    </Link>
                    <Link href="/app/dashboard#action-center" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                        Open action center
                    </Link>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                {laneSummaries.map((lane) => (
                    <StatusBadge
                        key={lane.domain}
                        label={`${lane.label} ${lane.status === "undercovered" ? "gap" : `${lane.coveredOperatorCount} covered`}`}
                        tone={lane.status === "undercovered" ? "warning" : "neutral"}
                    />
                ))}
                {coverage.summary.unavailableOwnerItemCount > 0 ? (
                    <StatusBadge label={`${coverage.summary.unavailableOwnerItemCount} unavailable-owner`} tone="warning" />
                ) : null}
                {coverage.summary.unownedUrgentItemCount > 0 ? <StatusBadge label={`${coverage.summary.unownedUrgentItemCount} urgent unowned`} tone="warning" /> : null}
            </div>

            {items.length === 0 ? (
                <p className="mt-5 text-sm leading-7 text-neutral-400">{emptyBody}</p>
            ) : (
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {items.slice(0, 2).map((item) => (
                        <CoordinationItemCard
                            key={item.itemKey}
                            item={item}
                            viewer={viewer}
                            operators={operators}
                            maxSnoozeHours={maxSnoozeHours}
                            coverage={coverage}
                            compact
                        />
                    ))}
                </div>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-3">
                {coverage.operators
                    .filter((operator) => operator.primaryDomains.some((domain) => domains.includes(domain)))
                    .slice(0, 3)
                    .map((operator) => (
                        <article key={operator.userId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-medium text-white">{operator.label}</p>
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge label={operator.coverageStatus} tone={getCoverageStatusTone(operator.coverageStatus)} />
                                    {operator.capacityState !== "balanced" ? (
                                        <StatusBadge label={operator.capacityState} tone={getCapacityTone(operator.capacityState)} />
                                    ) : null}
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-neutral-500">
                                {operator.activeAssignmentCount}/{Math.max(operator.maxActiveItems, 1)} active · {operator.urgentAssignmentCount}/
                                {Math.max(operator.maxUrgentItems, 1)} urgent
                            </p>
                            <p className="mt-2 text-sm text-neutral-400">{describeCoverageStatus(operator.coverageStatus)}</p>
                        </article>
                    ))}
            </div>
        </section>
    );
}
