import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectReadinessDetail } from "@/server/contracts/projects";
import type { ReviewShareCollectionSummary } from "@/server/contracts/review-shares";

import { formatReleaseReadinessLabel } from "@/components/platform/release-readiness";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatDate(value?: string | null, fallback = "Not yet recorded") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return dateFormatter.format(parsed);
}

export function ProjectHomeHero({
    detail,
    projectRisk,
    canAccessMvp,
    reviewShareSummary,
}: {
    detail: ProjectReadinessDetail;
    projectRisk: ProjectOperationalRisk | null;
    canAccessMvp: boolean;
    reviewShareSummary: ReviewShareCollectionSummary;
}) {
    const nextGate = detail.releaseReadiness.gates.find((gate) => gate.state !== "ready") ?? null;
    const hasPrimaryLaunch = Boolean(detail.project.primarySceneId);
    const launchLabel =
        detail.project.primarySceneId && canAccessMvp
            ? detail.project.lastWorldOpenedAt
                ? "Reopen saved world"
                : "Open saved world"
            : "Build world record";

    return (
        <section className="overflow-hidden rounded-[2.2rem] border border-[var(--border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(220,195,161,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/78">{detail.project.studioName ?? "Personal scope"}</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-[var(--foreground)]">{detail.project.name}</h1>
                    <p className="mt-3 text-sm leading-6 text-[#d3ccc2]">
                        {detail.project.description ??
                            "Build one world. Save it once. Then direct it. This project record is the durable home for continuity memory, saved versions, review, and handoff."}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={detail.project.status} tone={detail.project.status === "active" ? "success" : detail.project.status === "archived" ? "neutral" : "info"} />
                        <StatusBadge
                            label={detail.project.primarySceneId ? "Saved world ready" : "No saved world yet"}
                            tone={detail.project.primarySceneId ? "success" : "warning"}
                        />
                        <StatusBadge
                            label={formatReleaseReadinessLabel(detail.releaseReadiness.state)}
                            tone={detail.releaseReadiness.state === "blocked" ? "danger" : detail.releaseReadiness.state === "at_risk" ? "warning" : "success"}
                        />
                        <StatusBadge
                            label={reviewShareSummary.activeCount > 0 ? `${reviewShareSummary.activeCount} live review links` : "No live review links"}
                            tone={reviewShareSummary.activeCount > 0 ? "success" : "neutral"}
                        />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        {detail.project.primarySceneId ? (
                            <OpenWorkspaceButton
                                projectId={detail.project.projectId}
                                sceneId={detail.project.primarySceneId}
                                label={launchLabel}
                                disabled={!canAccessMvp}
                            />
                        ) : (
                            <Link
                                href="#project-world-launch"
                                className="rounded-2xl bg-[#f4efe8] px-4 py-2.5 text-sm font-semibold text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                            >
                                {launchLabel}
                            </Link>
                        )}
                    </div>
                </div>

                <div className="grid min-w-[320px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Primary world</p>
                        <p className="mt-3 text-sm font-medium text-white">{detail.project.primarySceneId ?? "No linked world yet"}</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {detail.project.primaryEnvironmentLabel ?? "Attach or reopen a primary saved world so the project stays a trustworthy system of record."}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Review posture</p>
                        <p className="mt-3 text-sm font-medium text-white">{reviewShareSummary.activeCount > 0 ? "Live secure access exists" : "No live secure access"}</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {reviewShareSummary.totalCount} total review links across active and historical delivery. Review stays pinned to saved versions instead of mutable workspace state.
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Reopen history</p>
                        <p className="mt-3 text-sm font-medium text-white">
                            {detail.project.lastWorldOpenedAt ? formatDate(detail.project.lastWorldOpenedAt) : hasPrimaryLaunch ? "Ready for first reopen" : "Awaiting primary launch"}
                        </p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {detail.project.lastWorldOpenedAt
                                ? `Last reopen signal ${formatDate(detail.project.lastWorldOpenedAt)}`
                                : hasPrimaryLaunch
                                ? "The primary world is linked and ready to reopen from this project."
                                  : "No project-linked world has been reopened yet."}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">World record state</p>
                        <p className="mt-3 text-sm font-medium text-white">{formatReleaseReadinessLabel(detail.releaseReadiness.state)}</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {nextGate?.summary ?? "The project world is ready to move through save, review, and handoff without losing continuity."}
                        </p>
                    </article>
                </div>
            </div>
        </section>
    );
}
