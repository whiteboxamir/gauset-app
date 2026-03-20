import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectReadinessCard } from "@/server/contracts/projects";
import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

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

export function WorldsWorkspaceOverview({
    projects,
    projectRisks,
    workspaceReadiness,
    canAccessMvp,
}: {
    projects: ProjectReadinessCard[];
    projectRisks: ProjectOperationalRisk[];
    workspaceReadiness: ReleaseReadinessSnapshot;
    canAccessMvp: boolean;
}) {
    const activeProjects = projects.filter((project) => project.status !== "archived").length;
    const linkedWorlds = projects.reduce((sum, project) => sum + project.worldCount, 0);
    const liveReviewShares = projectRisks.reduce((sum, project) => sum + project.activeReviewShareCount, 0);
    const atRiskProjects = projectRisks.filter((project) => project.riskLevel !== "stable");
    const topGate = workspaceReadiness.gates.find((gate) => gate.state !== "ready") ?? null;
    const resumeProject =
        projects
            .filter((project) => project.primarySceneId && project.lastWorldOpenedAt)
            .sort((left, right) => Date.parse(right.lastWorldOpenedAt ?? "") - Date.parse(left.lastWorldOpenedAt ?? ""))[0] ??
        projects.find((project) => project.primarySceneId) ??
        null;

    return (
        <section className="overflow-hidden rounded-[2.2rem] border border-[var(--border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(199,215,200,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/78">Primary workflow</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-[var(--foreground)]">Build one world. Save it once. Then direct it.</h1>
                    <p className="mt-3 text-sm leading-6 text-[#d3ccc2]">
                        Gauset is the persistent world system of record for AI filmmaking. The saved world carries the world bible, cast continuity, look development, shot direction, review, and handoff from one durable record.
                    </p>
                    {resumeProject?.primarySceneId ? (
                        <div className="mt-5 rounded-[1.4rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.04)] px-4 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">Return to saved world</p>
                            <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                                {resumeProject.name} {resumeProject.primaryEnvironmentLabel ? `· ${resumeProject.primaryEnvironmentLabel}` : ""}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[#b8b1a7]">
                                {resumeProject.lastWorldOpenedAt
                                    ? `Last reopened ${formatDate(resumeProject.lastWorldOpenedAt)} through ${resumeProject.primarySceneId}.`
                                    : `Project-linked launch is ready through ${resumeProject.primarySceneId}.`}
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={canAccessMvp ? "Saved-world workflow live" : "Saved-world workflow blocked"} tone={canAccessMvp ? "success" : "warning"} />
                        <StatusBadge
                            label={atRiskProjects.length > 0 ? `${atRiskProjects.length} records need attention` : "World library stable"}
                            tone={atRiskProjects.length > 0 ? "warning" : "success"}
                        />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        {resumeProject?.primarySceneId ? (
                            <OpenWorkspaceButton
                                projectId={resumeProject.projectId}
                                sceneId={resumeProject.primarySceneId}
                                label={canAccessMvp ? "Return to last saved world" : "Saved-world workspace unavailable"}
                                disabled={!canAccessMvp}
                            />
                        ) : (
                            <Link
                                href="#project-library"
                                className="rounded-2xl bg-[#f4efe8] px-4 py-2.5 text-sm font-semibold text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                            >
                                Open project library
                            </Link>
                        )}
                        <Link
                            href="#project-composer"
                            className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-white/25 hover:bg-white/[0.08]"
                        >
                            Create project
                        </Link>
                    </div>
                </div>

                <div className="grid min-w-[300px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Tracked productions</p>
                        <p className="mt-3 text-3xl font-medium text-white">{projects.length}</p>
                        <p className="mt-1 text-sm text-neutral-400">{activeProjects} active records visible in the current workspace.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Saved worlds</p>
                        <p className="mt-3 text-3xl font-medium text-white">{linkedWorlds}</p>
                        <p className="mt-1 text-sm text-neutral-400">Each one is a project-bound reopen path back into the same persistent world record.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Next reopen</p>
                        <p className="mt-3 text-sm font-medium text-white">
                            {resumeProject?.name ?? topGate?.title ?? "No blocking gate"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {resumeProject?.primarySceneId
                                ? resumeProject.lastWorldOpenedAt
                                    ? `Last reopened ${formatDate(resumeProject.lastWorldOpenedAt)} through ${resumeProject.primarySceneId}.`
                                    : `Launch-ready through ${resumeProject.primarySceneId}.`
                                : topGate?.summary ?? "The world-record posture is currently aligned."}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Live review links</p>
                        <p className="mt-3 text-3xl font-medium text-white">{liveReviewShares}</p>
                        <p className="mt-1 text-sm text-neutral-400">Review stays pinned to saved worlds, not mutable drafts or loose prompts.</p>
                    </article>
                </div>
            </div>
        </section>
    );
}
