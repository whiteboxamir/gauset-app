import type { CoordinationSnapshot } from "@/server/contracts/coordination";

import { CoordinationItemCard } from "@/components/platform/CoordinationItemCard";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function ProjectOperationsPanel({
    snapshot,
}: {
    snapshot: CoordinationSnapshot;
}) {
    const riskyProjects = [...snapshot.actionCenter.urgent, ...snapshot.actionCenter.watch].filter((item) => item.domain === "projects").slice(0, 6);

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Project operations</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Project operating posture</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`${snapshot.operations.projectRisks.filter((project) => project.riskLevel === "urgent").length} urgent`} tone="danger" />
                    <StatusBadge label={`${snapshot.operations.projectRisks.filter((project) => project.riskLevel === "watch").length} watch`} tone="warning" />
                </div>
            </div>

            {riskyProjects.length === 0 ? (
                <p className="mt-5 text-sm leading-6 text-neutral-400">No project-level operational blockers are open right now.</p>
            ) : (
                <div className="mt-5 space-y-3">
                    {riskyProjects.map((project) => (
                        <CoordinationItemCard
                            key={project.itemKey}
                            item={project}
                            viewer={snapshot.viewer}
                            operators={snapshot.operators}
                            maxSnoozeHours={snapshot.workload.maxSnoozeHours}
                            coverage={snapshot.coverage}
                            compact
                            showDomain={false}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
