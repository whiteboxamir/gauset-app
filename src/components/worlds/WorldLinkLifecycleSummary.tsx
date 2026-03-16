import type { ProjectWorldLink } from "@/server/projects/types";
import { formatDeliveryPosture, formatLaneTruthKind, formatWorldSourceKind } from "@/server/projects/types";

function formatTimestamp(value?: string | null, fallback = "Not reopened yet") {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
}

function toneClass(deliveryPosture: ProjectWorldLink["worldTruth"]["deliveryPosture"]) {
    if (deliveryPosture === "world_class_ready") {
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
    }
    if (deliveryPosture === "review_ready") {
        return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
    }
    if (deliveryPosture === "blocked") {
        return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    }
    return "border-white/10 bg-white/[0.04] text-neutral-200";
}

function pill(label: string, className: string) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${className}`}>
            {label}
        </span>
    );
}

export function WorldLinkLifecycleSummary({ worldLink }: { worldLink: ProjectWorldLink }) {
    return (
        <article className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Linked world</p>
                    <p className="mt-2 text-sm font-medium text-white">
                        {worldLink.environmentLabel ?? worldLink.sceneId}
                        {worldLink.isPrimary ? " · Primary reopen path" : ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">{worldLink.sceneId}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {pill(worldLink.worldTruth.sourceLabel ?? formatWorldSourceKind(worldLink.worldTruth.sourceKind), "border-white/10 bg-white/[0.04] text-neutral-100")}
                    {pill(worldLink.worldTruth.laneLabel ?? formatLaneTruthKind(worldLink.worldTruth.laneKind), "border-white/10 bg-white/[0.04] text-neutral-100")}
                    {pill(worldLink.worldTruth.deliveryLabel ?? formatDeliveryPosture(worldLink.worldTruth.deliveryPosture), toneClass(worldLink.worldTruth.deliveryPosture))}
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Source truth</p>
                    <p className="mt-2 text-sm text-white">{worldLink.worldTruth.sourceLabel ?? formatWorldSourceKind(worldLink.worldTruth.sourceKind)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Lane truth</p>
                    <p className="mt-2 text-sm text-white">{worldLink.worldTruth.laneLabel ?? formatLaneTruthKind(worldLink.worldTruth.laneKind)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Delivery posture</p>
                    <p className="mt-2 text-sm text-white">{worldLink.worldTruth.deliveryLabel ?? formatDeliveryPosture(worldLink.worldTruth.deliveryPosture)}</p>
                </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-neutral-400">{worldLink.worldTruth.deliverySummary}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span>{worldLink.reopenCount} recorded reopen{worldLink.reopenCount === 1 ? "" : "s"}</span>
                <span>Last reopen: {formatTimestamp(worldLink.lastReopenedAt)}</span>
                <span>Tracked since {formatTimestamp(worldLink.createdAt, worldLink.createdAt)}</span>
            </div>
        </article>
    );
}
