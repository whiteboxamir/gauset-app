import Link from "next/link";

import type { GovernanceSnapshot } from "@/server/contracts/governance";

import { StatusBadge } from "@/components/platform/StatusBadge";

function getTone(status: GovernanceSnapshot["overallStatus"]) {
    switch (status) {
        case "blocked":
            return "danger";
        case "attention":
            return "warning";
        default:
            return "success";
    }
}

export function GovernanceOverviewPanel({
    snapshot,
}: {
    snapshot: GovernanceSnapshot;
}) {
    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Governance</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Approval and policy lane</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-400">
                        Governance turns thresholds, approval gates, and access reviews into a visible control layer instead of implicit operator memory.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={snapshot.overallStatus} tone={getTone(snapshot.overallStatus)} />
                    <StatusBadge label={`${snapshot.pendingApprovalCount} approvals`} tone={snapshot.pendingApprovalCount > 0 ? "danger" : "neutral"} />
                    <StatusBadge label={`${snapshot.exceptionCount} exceptions`} tone={snapshot.exceptionCount > 0 ? "warning" : "success"} />
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {snapshot.items.slice(0, 4).map((item) => (
                    <Link
                        key={item.id}
                        href={item.href}
                        className="block rounded-[1.35rem] border border-white/10 bg-black/25 p-4 transition-colors hover:border-white/20 hover:bg-black/35"
                    >
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge label={item.severity} tone={item.severity === "urgent" ? "danger" : "warning"} />
                            <StatusBadge label={item.freshnessLabel} tone="neutral" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{item.summary}</p>
                    </Link>
                ))}
            </div>

            <Link href="/app/settings/governance" className="mt-5 inline-flex text-sm font-medium text-white transition-opacity hover:opacity-80">
                Open governance workspace
            </Link>
        </section>
    );
}
