import Link from "next/link";

import type { ContinuitySnapshot } from "@/server/contracts/continuity";
import type { OperationsDomain } from "@/server/contracts/operations";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

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

export function ContinuitySurfacePanel({
    snapshot,
    domains,
    eyebrow,
    title,
    emptyBody,
}: {
    snapshot: ContinuitySnapshot;
    domains: OperationsDomain[];
    eyebrow: string;
    title: string;
    emptyBody: string;
}) {
    const handoffs = snapshot.handoffs.filter((handoff) => domains.includes(handoff.domain));

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-2 text-lg font-medium text-white">{title}</h2>
                </div>
                <Link href="/app/team#lane-handoffs" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                    Open handoffs
                </Link>
            </div>

            {handoffs.length === 0 ? (
                <p className="mt-5 text-sm leading-7 text-neutral-400">{emptyBody}</p>
            ) : (
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {handoffs.map((handoff) => (
                        <article key={handoff.domain} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-white">{handoff.domain}</p>
                                        <StatusBadge label={handoff.health} tone={getHealthTone(handoff.health)} />
                                        {handoff.required ? <StatusBadge label="Required" tone="warning" /> : null}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-neutral-300">{handoff.summary ?? "No handoff summary recorded yet."}</p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                {handoff.primaryOperator ? <StatusBadge label={`Primary ${handoff.primaryOperator.label}`} tone="info" /> : null}
                                {handoff.backupOperator ? <StatusBadge label={`Backup ${handoff.backupOperator.label}`} tone="neutral" /> : null}
                                {handoff.reviewByAt ? <StatusBadge label={`Review ${new Date(handoff.reviewByAt).toLocaleDateString()}`} tone="neutral" /> : null}
                            </div>

                            <p className="mt-4 text-xs text-neutral-500">
                                Updated {formatDateTime(handoff.updatedAt, "Not recorded")}
                                {handoff.updatedByLabel ? ` by ${handoff.updatedByLabel}` : ""}.
                            </p>

                            {handoff.reasons.length > 0 ? (
                                <div className="mt-4 space-y-2">
                                    {handoff.reasons.slice(0, 2).map((reason) => (
                                        <p key={reason} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-400">
                                            {reason}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
