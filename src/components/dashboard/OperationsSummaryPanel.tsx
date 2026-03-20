import type { OperationsSnapshot } from "@/server/contracts/operations";
import type { CoordinationWorkload } from "@/server/contracts/coordination";

import { StatusBadge } from "@/components/platform/StatusBadge";

function getTone(status: OperationsSnapshot["overallStatus"]) {
    switch (status) {
        case "urgent":
            return "danger";
        case "watch":
            return "warning";
        default:
            return "success";
    }
}

export function OperationsSummaryPanel({
    snapshot,
    workspaceLabel,
    workload,
}: {
    snapshot: OperationsSnapshot;
    workspaceLabel: string;
    workload?: CoordinationWorkload;
}) {
    return (
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Operations OS</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">{workspaceLabel}</h1>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        The platform is now in operating mode. This surface prioritizes blockers, aging work, and recently closed loops across billing, team, support, workspace configuration, and projects.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={snapshot.overallStatus} tone={getTone(snapshot.overallStatus)} />
                        <StatusBadge label={`${snapshot.urgentCount} urgent`} tone={snapshot.urgentCount > 0 ? "danger" : "neutral"} />
                        <StatusBadge label={`${snapshot.watchCount} watch`} tone={snapshot.watchCount > 0 ? "warning" : "neutral"} />
                        <StatusBadge label={`${snapshot.resolvedCount} recently resolved`} tone="success" />
                        {workload ? (
                            <StatusBadge
                                label={workload.coverageHealth}
                                tone={workload.coverageHealth === "stable" ? "success" : workload.coverageHealth === "undercovered" ? "warning" : "danger"}
                            />
                        ) : null}
                        {workload && workload.unownedItemCount > 0 ? <StatusBadge label={`${workload.unownedItemCount} unowned`} tone="warning" /> : null}
                        {workload && workload.undercoveredLaneCount > 0 ? (
                            <StatusBadge label={`${workload.undercoveredLaneCount} lane gaps`} tone="warning" />
                        ) : null}
                        {workload && workload.unavailableOwnerItemCount > 0 ? (
                            <StatusBadge label={`${workload.unavailableOwnerItemCount} unavailable-owner`} tone="warning" />
                        ) : null}
                    </div>
                </div>

                <div className="grid min-w-[300px] gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {snapshot.domains.map((domain) => (
                        <article key={domain.domain} className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{domain.label}</p>
                                    <p className="mt-3 text-2xl font-medium text-white">{domain.openCount}</p>
                                </div>
                                <StatusBadge label={domain.status} tone={domain.status === "urgent" ? "danger" : domain.status === "watch" ? "warning" : "success"} />
                            </div>
                            <p className="mt-2 text-sm text-neutral-400">
                                {domain.openCount > 0 ? "Action items are live for this lane." : "No open operational blockers right now."}
                            </p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
