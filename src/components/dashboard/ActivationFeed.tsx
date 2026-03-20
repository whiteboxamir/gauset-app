import Link from "next/link";

import type { ActivationFeedEntry } from "@/server/projects/dashboard";

import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";

function getTone(source: ActivationFeedEntry["source"]) {
    return source === "audit" ? "info" : "neutral";
}

export function ActivationFeed({
    events,
}: {
    events: ActivationFeedEntry[];
}) {
    if (events.length === 0) {
        return (
            <EmptyState
                eyebrow="Activation feed"
                title="No activation activity yet"
                body="Workspace events, account actions, and project activity will appear here as the control layer starts doing real work."
            />
        );
    }

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Activation feed</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Live workspace and project activity</h3>
                </div>
                <StatusBadge label={`${events.length} events`} tone="neutral" />
            </div>

            <div className="mt-5 space-y-3">
                {events.map((event) => (
                    <Link
                        key={event.id}
                        href={event.href}
                        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge label={event.contextLabel} tone={getTone(event.source)} />
                                    <StatusBadge label={event.eventType} tone="neutral" />
                                </div>
                                <p className="mt-3 text-sm font-medium text-white">{event.summary}</p>
                            </div>
                            <p className="text-xs text-neutral-500">{event.createdAt}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
