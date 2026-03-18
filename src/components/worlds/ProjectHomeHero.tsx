import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectReadinessDetail } from "@/server/contracts/projects";
import type { ReviewShareCollectionSummary } from "@/server/contracts/review-shares";

import { formatReleaseReadinessLabel, getReleaseReadinessTone } from "@/components/platform/release-readiness";
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

    return (
        <section className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">{detail.project.studioName ?? "Personal scope"}</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">{detail.project.name}</h1>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        {detail.project.description ??
                            "A project-level home base for world linkage, secure review distribution, and readiness truth across the authenticated workspace shell."}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={detail.project.status} tone={detail.project.status === "active" ? "success" : detail.project.status === "archived" ? "neutral" : "info"} />
                        <StatusBadge label={detail.project.membershipRole} tone="info" />
                        <StatusBadge
                            label={formatReleaseReadinessLabel(detail.releaseReadiness.state)}
                            tone={getReleaseReadinessTone(detail.releaseReadiness.state)}
                        />
                        <StatusBadge
                            label={projectRisk ? `${projectRisk.riskLevel} project posture` : "No project risk signal"}
                            tone={projectRisk?.riskLevel === "urgent" ? "danger" : projectRisk?.riskLevel === "watch" ? "warning" : "success"}
                        />
                        <StatusBadge
                            label={reviewShareSummary.activeCount > 0 ? `${reviewShareSummary.activeCount} live review links` : "No live review links"}
                            tone={reviewShareSummary.activeCount > 0 ? "success" : "neutral"}
                        />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <OpenWorkspaceButton
                            projectId={detail.project.projectId}
                            sceneId={detail.project.primarySceneId}
                            label={
                                detail.project.primarySceneId && canAccessMvp
                                    ? detail.project.lastWorldOpenedAt
                                        ? "Return to primary world"
                                        : "Open primary world"
                                    : "Workspace launch unavailable"
                            }
                            disabled={!detail.project.primarySceneId || !canAccessMvp}
                        />
                        <Link
                            href="#world-links"
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            Manage world links
                        </Link>
                        <Link
                            href="#review-shares"
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            Review shares
                        </Link>
                    </div>
                </div>

                <div className="grid min-w-[320px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Primary world</p>
                        <p className="mt-3 text-sm font-medium text-white">{detail.project.primarySceneId ?? "No linked world yet"}</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {detail.project.primaryEnvironmentLabel ?? "Link a primary world to make project launch truth explicit."}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Review posture</p>
                        <p className="mt-3 text-sm font-medium text-white">{reviewShareSummary.activeCount > 0 ? "Live secure access exists" : "No live secure access"}</p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {reviewShareSummary.totalCount} persisted links tracked across active, revoked, and expired history. Review delivery stays version-aware instead of opening anonymous MVP access.
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Workspace continuity</p>
                        <p className="mt-3 text-sm font-medium text-white">
                            {detail.project.lastWorldOpenedAt ? formatDate(detail.project.lastWorldOpenedAt) : hasPrimaryLaunch ? "Ready for first reopen" : "Awaiting primary launch"}
                        </p>
                        <p className="mt-2 text-sm text-neutral-400">
                            {detail.project.lastWorldOpenedAt
                                ? `Last workspace-open signal ${formatDate(detail.project.lastWorldOpenedAt)}`
                                : hasPrimaryLaunch
                                  ? "The primary world is linked, but this project has not been reopened from the library yet."
                                  : "No recorded workspace-open signal yet."}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Next gate</p>
                        <p className="mt-3 text-sm font-medium text-white">{nextGate?.title ?? "No blocking gate"}</p>
                        <p className="mt-2 text-sm text-neutral-400">{nextGate?.summary ?? "This project is currently aligned from stored platform truth."}</p>
                    </article>
                </div>
            </div>
        </section>
    );
}
