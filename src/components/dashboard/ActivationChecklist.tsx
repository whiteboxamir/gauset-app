import Link from "next/link";

import type { ActivationAction, DesignPartnerDashboardSnapshot } from "@/server/projects/dashboard";

import { StatusBadge } from "@/components/platform/StatusBadge";

function getTone(status: ActivationAction["status"]) {
    switch (status) {
        case "done":
            return "success";
        case "next":
            return "warning";
        case "blocked":
            return "danger";
        default:
            return "neutral";
    }
}

export function ActivationChecklist({
    snapshot,
}: {
    snapshot: DesignPartnerDashboardSnapshot;
}) {
    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Activation Queue</p>
                    <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">Next operator moves</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
                        These actions are backed by the live partner-control state above. Each one resolves a real activation dependency instead of a placeholder task.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {snapshot.supportEmail ? <StatusBadge label={`Support ${snapshot.supportEmail}`} tone="info" /> : null}
                    {snapshot.billingEmail ? <StatusBadge label={`Billing ${snapshot.billingEmail}`} tone="info" /> : null}
                    {snapshot.billingStatus ? <StatusBadge label={`Subscription ${snapshot.billingStatus}`} tone={snapshot.billingStatus === "past_due" ? "warning" : "neutral"} /> : null}
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {snapshot.actions.map((action) => (
                    <Link
                        key={action.id}
                        href={action.href}
                        className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-white">{action.title}</p>
                                <p className="mt-2 text-sm leading-6 text-neutral-400">{action.description}</p>
                            </div>
                            <StatusBadge label={action.status} tone={getTone(action.status)} />
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
