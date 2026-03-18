import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { DesignPartnerDashboardSnapshot } from "@/server/projects/dashboard";

import { formatReleaseReadinessLabel, getReleaseReadinessTone } from "@/components/platform/release-readiness";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function countByRisk(projectRisks: ProjectOperationalRisk[], riskLevel: ProjectOperationalRisk["riskLevel"]) {
    return projectRisks.filter((project) => project.riskLevel === riskLevel).length;
}

function formatDate(value?: string | null, fallback = "No recorded return yet") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return dateFormatter.format(parsed);
}

export function ProjectsWorkspaceOverview({
    snapshot,
    projectRisks,
    canAccessMvp,
}: {
    snapshot: DesignPartnerDashboardSnapshot;
    projectRisks: ProjectOperationalRisk[];
    canAccessMvp: boolean;
}) {
    const urgentProjects = countByRisk(projectRisks, "urgent");
    const watchProjects = countByRisk(projectRisks, "watch");
    const topProjectRisk = projectRisks.find((project) => project.riskLevel !== "stable") ?? projectRisks[0] ?? null;
    const resumeLink = snapshot.resumeLink;
    const launchReadyProjects = snapshot.recentProjects.filter((project) => project.primarySceneId).length;

    return (
        <section className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.3)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Projects + worlds workspace</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">{snapshot.partnerLabel}</h1>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        A design-partner home base for project ownership, world linkage, review distribution, and workspace launch. This surface prefers stored platform truth
                        over generic activation copy so operators can see what is actually ready, drifting, or still blocked.
                    </p>
                    {resumeLink ? (
                        <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Return path</p>
                            <p className="mt-2 text-sm font-medium text-white">
                                {resumeLink.projectName} {resumeLink.environmentLabel ? `· ${resumeLink.environmentLabel}` : ""}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-neutral-400">
                                {resumeLink.openedAt
                                    ? `Last reopened ${formatDate(resumeLink.openedAt)}. Jump straight back into ${resumeLink.sceneId}.`
                                    : `Project-linked launch is ready through ${resumeLink.sceneId}.`}
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge
                            label={`${snapshot.overallScore}% ready`}
                            tone={snapshot.overallScore >= 80 ? "success" : snapshot.overallScore >= 50 ? "warning" : "danger"}
                        />
                        <StatusBadge label={snapshot.planName ?? (snapshot.hasActiveStudio ? "No active plan" : "Workspace required")} tone={snapshot.planName ? "info" : "neutral"} />
                        <StatusBadge
                            label={formatReleaseReadinessLabel(snapshot.releaseReadiness.state)}
                            tone={getReleaseReadinessTone(snapshot.releaseReadiness.state)}
                        />
                        <StatusBadge label={urgentProjects > 0 ? `${urgentProjects} urgent projects` : "No urgent projects"} tone={urgentProjects > 0 ? "danger" : "success"} />
                        <StatusBadge label={watchProjects > 0 ? `${watchProjects} at risk` : "No watch projects"} tone={watchProjects > 0 ? "warning" : "neutral"} />
                        <StatusBadge
                            label={launchReadyProjects > 0 ? `${launchReadyProjects} launch-ready worlds` : "No launch-ready worlds"}
                            tone={launchReadyProjects > 0 ? "info" : "warning"}
                        />
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        {resumeLink ? (
                            <OpenWorkspaceButton
                                projectId={resumeLink.projectId}
                                sceneId={resumeLink.sceneId}
                                label={canAccessMvp ? "Return to last world" : "Workspace shell unavailable"}
                                disabled={!canAccessMvp}
                            />
                        ) : (
                            <OpenWorkspaceButton
                                label={canAccessMvp ? "Open workspace shell" : "Workspace shell unavailable"}
                                disabled={!canAccessMvp}
                            />
                        )}
                        <Link
                            href="/app/worlds"
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            Open project library
                        </Link>
                        <Link
                            href={snapshot.recentProjects[0] ? `/app/worlds/${snapshot.recentProjects[0].projectId}` : "/app/worlds#project-composer"}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            {snapshot.recentProjects[0] ? "Open leading project" : "Create first project"}
                        </Link>
                    </div>
                </div>

                <div className="grid min-w-[300px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Projects</p>
                        <p className="mt-3 text-3xl font-medium text-white">{snapshot.projectCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.activeProjectCount} active across the current workspace.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Linked worlds</p>
                        <p className="mt-3 text-3xl font-medium text-white">{snapshot.worldLinkedCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">Each world link keeps project ownership explicit in the platform layer.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Secure review shares</p>
                        <p className="mt-3 text-3xl font-medium text-white">{snapshot.activeReviewShareCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.totalReviewShareCount} persisted review links tracked.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Continuity cue</p>
                        <p className="mt-3 text-sm font-medium text-white">
                            {resumeLink?.projectName ?? topProjectRisk?.name ?? "No tracked project risk yet"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {resumeLink
                                ? resumeLink.openedAt
                                    ? `Last reopened ${formatDate(resumeLink.openedAt)} through ${resumeLink.sceneId}.`
                                    : `Launch-ready through ${resumeLink.sceneId}.`
                                : topProjectRisk
                                  ? topProjectRisk.reasons.slice(0, 2).join(" · ")
                                  : "World-link truth is live, but project activity has not generated a signal yet."}
                        </p>
                    </article>
                </div>
            </div>
        </section>
    );
}
