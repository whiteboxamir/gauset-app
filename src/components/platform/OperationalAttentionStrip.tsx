import Link from "next/link";

import type { CoverageSnapshot } from "@/server/contracts/coverage";
import type { CoordinationOperator, CoordinationViewer, CoordinatedOperationalItem } from "@/server/contracts/coordination";

import { EmptyState } from "./EmptyState";
import { CoordinationItemCard } from "./CoordinationItemCard";

export function OperationalAttentionStrip({
    title = "What needs action now",
    eyebrow = "Operations",
    items,
    viewer,
    operators,
    maxSnoozeHours,
    coverage,
    emptyTitle = "No immediate operational blockers",
    emptyBody = "The current surface has no open attention items from the shared operations model.",
}: {
    title?: string;
    eyebrow?: string;
    items: CoordinatedOperationalItem[];
    viewer: CoordinationViewer;
    operators: CoordinationOperator[];
    maxSnoozeHours: number;
    coverage?: CoverageSnapshot;
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
                <Link href="/app/dashboard#action-center" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                    Open dashboard action center
                </Link>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {items.slice(0, 3).map((item) => (
                    <CoordinationItemCard
                        key={item.itemKey}
                        item={item}
                        viewer={viewer}
                        operators={operators}
                        maxSnoozeHours={maxSnoozeHours}
                        coverage={coverage}
                        compact
                    />
                ))}
            </div>
        </section>
    );
}
