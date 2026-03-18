import Link from "next/link";

import type { GovernanceAttentionItem } from "@/server/contracts/governance";

import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

function getTone(severity: GovernanceAttentionItem["severity"]) {
    return severity === "urgent" ? "danger" : "warning";
}

export function GovernanceStrip({
    title = "Governance posture",
    eyebrow = "Governance",
    items,
    emptyTitle = "No governance exceptions on this surface",
    emptyBody = "Current workspace policy, approvals, and access review state are aligned for this lane.",
}: {
    title?: string;
    eyebrow?: string;
    items: GovernanceAttentionItem[];
    emptyTitle?: string;
    emptyBody?: string;
}) {
    if (items.length === 0) {
        return <EmptyState eyebrow={eyebrow} title={emptyTitle} body={emptyBody} />;
    }

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-2 text-lg font-medium text-white">{title}</h2>
                </div>
                <Link href="/app/settings/governance" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                    Open governance
                </Link>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {items.slice(0, 3).map((item) => (
                    <Link
                        key={item.id}
                        href={item.href}
                        className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge label={item.severity} tone={getTone(item.severity)} />
                            <StatusBadge label={item.freshnessLabel} tone="neutral" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{item.remediation}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
