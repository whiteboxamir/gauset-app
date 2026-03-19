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

function getRiskTone(riskLevel?: ProjectOperationalRisk["riskLevel"]) {
    switch (riskLevel) {
        case "urgent":
            return "danger" as const;
        case "watch":
            return "warning" as const;
        default:
            return "success" as const;
    }
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
    const worldStateLabel = detail.project.primarySceneId ? "Saved world ready" : "Awaiting first save";
    const reviewStateLabel =
        reviewShareSummary.activeCount > 0
            ? `${reviewShareSummary.activeCount} live review link${reviewShareSummary.activeCount === 1 ? "" : "s"}`
            : "No live review links";
    const leadNarrative =
        detail.project.description ??
        "Build one world. Save it once. Then direct it. This project record is the durable home for continuity memory, saved versions, review, and handoff.";
    const riskSummary = projectRisk?.reasons[0] ?? null;

    return (
        <section className="overflow-hidden rounded-[2.2rem] border border-[var(--border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(220,195,161,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <div className="grid gap-6 xl:grid-cols-[1.18fr,0.82fr]">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/78">
                        {detail.project.studioName ?? "Personal scope"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge
                            label={detail.project.status}
                            tone={detail.project.status === "active" ? "success" : detail.project.status === "archived" ? "neutral" : "info"}
                        />
                        <StatusBadge label={worldStateLabel} tone={detail.project.primarySceneId ? "success" : "warning"} />
                        {projectRisk && projectRisk.riskLevel !== "stable" ? (
                            <StatusBadge label={`${projectRisk.riskLevel} signal`} tone={getRiskTone(projectRisk.riskLevel)} />
                        ) : null}
                    </div>

                    <h1 className="mt-4 text-[2rem] font-medium tracking-tight text-[var(--foreground)] md:text-[2.35rem]">
                        {detail.project.name}
                    </h1>
                    <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#d3ccc2]">{leadNarrative}</p>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
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
                        <p className="text-xs uppercase tracking-[0.16em] text-[#9d978f]">
                            {detail.project.primarySceneId
                                ? "Return to the same saved world from this project record."
                                : "Start with import or capture. Keep generation secondary."}
                        </p>
                    </div>
                </div>

                <aside className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Project record</p>

                    <div className="mt-4 space-y-3">
                        <section className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Primary world</p>
                            <p className="mt-2 text-base font-medium text-white">
                                {detail.project.primaryEnvironmentLabel ?? detail.project.primarySceneId ?? "No linked world yet"}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-neutral-400">
                                {detail.project.primarySceneId
                                    ? "The saved world stays attached to this project as the continuity source of record."
                                    : "Create or attach the first saved world here before review and handoff."}
                            </p>
                        </section>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Reopen cadence</p>
                                <p className="mt-2 text-sm font-medium text-white">
                                    {detail.project.lastWorldOpenedAt
                                        ? formatDate(detail.project.lastWorldOpenedAt)
                                        : hasPrimaryLaunch
                                          ? "Ready for first reopen"
                                          : "Awaiting primary launch"}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-neutral-400">
                                    {detail.project.lastWorldOpenedAt
                                        ? "This project has already returned to the saved world."
                                        : hasPrimaryLaunch
                                          ? "The project can reopen the current saved world without branching."
                                          : "No saved-world reopen has happened yet."}
                                </p>
                            </section>

                            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Review posture</p>
                                <p className="mt-2 text-sm font-medium text-white">{reviewStateLabel}</p>
                                <p className="mt-1 text-sm leading-6 text-neutral-400">
                                    {reviewShareSummary.totalCount} total review links. Review stays attached to saved versions instead of mutable workspace state.
                                </p>
                            </section>
                        </div>

                        <section className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Readiness</p>
                                    <p className="mt-2 text-sm font-medium text-white">
                                        {formatReleaseReadinessLabel(detail.releaseReadiness.state)}
                                    </p>
                                </div>
                                {projectRisk ? (
                                    <StatusBadge label={`${projectRisk.riskLevel} signal`} tone={getRiskTone(projectRisk.riskLevel)} />
                                ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                                {nextGate?.summary ??
                                    "The project world is ready to move through save, review, and handoff without losing continuity."}
                            </p>
                            {riskSummary ? (
                                <p className="mt-2 text-xs leading-5 text-neutral-500">Current signal: {riskSummary}</p>
                            ) : null}
                        </section>
                    </div>
                </aside>
            </div>
        </section>
    );
}
