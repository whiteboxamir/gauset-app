import Link from "next/link";

import type { AccessReasonSummary } from "@/server/contracts/security";

import { StatusBadge } from "@/components/platform/StatusBadge";

export function AccessReasonPanel({
    accessReasons,
    visibleKeys,
    eyebrow = "Access reasons",
    title = "Why access is granted or blocked",
    compact = false,
}: {
    accessReasons: AccessReasonSummary[];
    visibleKeys?: AccessReasonSummary["key"][];
    eyebrow?: string;
    title?: string;
    compact?: boolean;
}) {
    const items = visibleKeys ? accessReasons.filter((reason) => visibleKeys.includes(reason.key)) : accessReasons;

    return (
        <section className={`rounded-[1.75rem] border border-white/10 bg-black/30 ${compact ? "p-5" : "p-6"}`}>
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
            </div>

            <div className={`mt-5 grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
                {items.map((reason) => (
                    <article key={reason.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-white">{reason.label}</p>
                                    <StatusBadge label={reason.granted ? "Granted" : "Blocked"} tone={reason.granted ? "success" : "warning"} />
                                </div>
                                <p className="mt-2 text-sm leading-6 text-neutral-300">{reason.summary}</p>
                            </div>
                            <Link href={reason.href} className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                                Open route
                            </Link>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {reason.reasons.map((entry) => (
                                <StatusBadge key={`${reason.key}-${entry}`} label={entry} tone="neutral" className="tracking-[0.08em] normal-case text-[11px]" />
                            ))}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
