import type { CoordinationSnapshot } from "@/server/contracts/coordination";

import { CoordinationItemCard } from "@/components/platform/CoordinationItemCard";
import { StatusBadge } from "@/components/platform/StatusBadge";

function Bucket({
    title,
    items,
    snapshot,
}: {
    title: string;
    items: CoordinationSnapshot["actionCenter"]["urgent"];
    snapshot: CoordinationSnapshot;
}) {
    return (
        <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-medium text-white">{title}</h3>
                <StatusBadge label={`${items.length}`} tone="neutral" />
            </div>
            {items.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-neutral-500">No items in this bucket.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {items.map((item) => (
                        <CoordinationItemCard
                            key={item.itemKey}
                            item={item}
                            viewer={snapshot.viewer}
                            operators={snapshot.operators}
                            maxSnoozeHours={snapshot.workload.maxSnoozeHours}
                            coverage={snapshot.coverage}
                            compact
                        />
                    ))}
                </div>
            )}
        </article>
    );
}

export function ActionCenter({
    snapshot,
}: {
    snapshot: CoordinationSnapshot;
}) {
    return (
        <section id="action-center" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Action center</p>
                    <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">Prioritized operator queue</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        These buckets are driven by live billing, team, support, workspace, and project signals. Claiming, ownership changes, snoozes, and resolutions persist across reloads and are capped by workspace policy.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`${snapshot.workload.unownedItemCount} unowned`} tone={snapshot.workload.unownedItemCount > 0 ? "warning" : "neutral"} />
                    <StatusBadge
                        label={`${snapshot.workload.unavailableOwnerItemCount} unavailable-owner`}
                        tone={snapshot.workload.unavailableOwnerItemCount > 0 ? "warning" : "neutral"}
                    />
                    <StatusBadge
                        label={`${snapshot.workload.overloadedOperatorCount} overloaded`}
                        tone={snapshot.workload.overloadedOperatorCount > 0 ? "warning" : "neutral"}
                    />
                    <StatusBadge
                        label={`${snapshot.workload.undercoveredLaneCount} lane gaps`}
                        tone={snapshot.workload.undercoveredLaneCount > 0 ? "warning" : "neutral"}
                    />
                    <StatusBadge label={`Max snooze ${snapshot.workload.maxSnoozeHours}h`} tone="neutral" />
                </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
                <Bucket title="Urgent" items={snapshot.actionCenter.urgent} snapshot={snapshot} />
                <Bucket title="Watch" items={snapshot.actionCenter.watch} snapshot={snapshot} />
                <Bucket title="Recently resolved" items={snapshot.actionCenter.resolved} snapshot={snapshot} />
            </div>
        </section>
    );
}
