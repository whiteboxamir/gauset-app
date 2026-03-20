import type { ProjectActivityEvent } from "@/server/contracts/projects";

import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return dateFormatter.format(parsed);
}

function formatEventType(value: string) {
    return value.replace(/^project\./, "").replaceAll("_", " ");
}

function getTone(eventType: string) {
    if (eventType.includes("revoked")) {
        return "danger" as const;
    }
    if (eventType.includes("linked") || eventType.includes("shared")) {
        return "success" as const;
    }
    if (eventType.includes("updated")) {
        return "info" as const;
    }
    return "neutral" as const;
}

export function ActivityFeed({
    events,
    title = "Recent activity",
    eyebrow = "Activity",
}: {
    events: ProjectActivityEvent[];
    title?: string;
    eyebrow?: string;
}) {
    if (events.length === 0) {
        return (
            <EmptyState
                eyebrow={eyebrow}
                title={title}
                body="Activity will appear here as projects are created, linked to worlds, shared for review, and reopened through the workspace shell."
            />
        );
    }

    return (
        <section className="rounded-[1.85rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
                </div>
                <StatusBadge label={`${events.length} events`} tone="info" />
            </div>

            <div className="mt-5 space-y-3">
                {events.map((event) => (
                    <article key={event.id} className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="max-w-3xl">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge label={formatEventType(event.eventType)} tone={getTone(event.eventType)} />
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{event.actorType}</p>
                                </div>
                                <p className="mt-3 text-sm font-medium text-white">{event.summary}</p>
                            </div>
                            <p className="text-xs text-neutral-500">{formatDate(event.createdAt)}</p>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
