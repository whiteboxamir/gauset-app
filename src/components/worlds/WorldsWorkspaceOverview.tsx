import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectReadinessCard } from "@/server/contracts/projects";
import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

import { formatReleaseReadinessLabel, getReleaseReadinessTone } from "@/components/platform/release-readiness";
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
    const projectsWithoutWorlds = projects.filter((project) => project.worldCount === 0).length;
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
        <section className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">World library</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">Project home for owned worlds</h1>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        Browse the durable project layer, see which worlds are really linked, and reopen owned worlds directly inside the authenticated workspace shell.
                    </p>
                    {resumeProject?.primarySceneId ? (
                        <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Return to world</p>
                            <p className="mt-2 text-sm font-medium text-white">
                                {resumeProject.name} {resumeProject.primaryEnvironmentLabel ? `· ${resumeProject.primaryEnvironmentLabel}` : ""}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-neutral-400">
                                {resumeProject.lastWorldOpenedAt
                                    ? `Last reopened ${formatDate(resumeProject.lastWorldOpenedAt)} through ${resumeProject.primarySceneId}.`
                                    : `Project-linked launch is ready through ${resumeProject.primarySceneId}.`}
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={formatReleaseReadinessLabel(workspaceReadiness.state)} tone={getReleaseReadinessTone(workspaceReadiness.state)} />
                        <StatusBadge label={canAccessMvp ? "Workspace shell available" : "Workspace shell blocked"} tone={canAccessMvp ? "success" : "warning"} />
                        <StatusBadge
                            label={atRiskProjects.length > 0 ? `${atRiskProjects.length} projects need attention` : "Project library stable"}
                            tone={atRiskProjects.length > 0 ? "warning" : "success"}
                        />
                        <StatusBadge
                            label={projectsWithoutWorlds > 0 ? `${projectsWithoutWorlds} projects missing world links` : "All tracked projects have a world"}
                            tone={projectsWithoutWorlds > 0 ? "warning" : "success"}
                        />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            href="#project-library"
                            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                        >
                            Jump to library
                        </Link>
                        <Link
                            href="#project-composer"
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            Create project
                        </Link>
                        {resumeProject?.primarySceneId ? (
                            <OpenWorkspaceButton
                                projectId={resumeProject.projectId}
                                sceneId={resumeProject.primarySceneId}
                                label={canAccessMvp ? "Return to last world" : "Workspace shell unavailable"}
                                disabled={!canAccessMvp}
                                variant="secondary"
                            />
                        ) : (
                            <OpenWorkspaceButton
                                label={canAccessMvp ? "Open workspace shell" : "Workspace shell unavailable"}
                                disabled={!canAccessMvp}
                                variant="secondary"
                            />
                        )}
                    </div>
                </div>

                <div className="grid min-w-[300px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Tracked projects</p>
                        <p className="mt-3 text-3xl font-medium text-white">{projects.length}</p>
                        <p className="mt-1 text-sm text-neutral-400">{activeProjects} active and visible in the current workspace.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Linked worlds</p>
                        <p className="mt-3 text-3xl font-medium text-white">{linkedWorlds}</p>
                        <p className="mt-1 text-sm text-neutral-400">World links are the truthful bridge between projects and MVP scene IDs.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Live review links</p>
                        <p className="mt-3 text-3xl font-medium text-white">{liveReviewShares}</p>
                        <p className="mt-1 text-sm text-neutral-400">Summed from current project operations, not mocked UI counters.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Continuity cue</p>
                        <p className="mt-3 text-sm font-medium text-white">
                            {resumeProject?.name ?? topGate?.title ?? "No blocking gate"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {resumeProject?.primarySceneId
                                ? resumeProject.lastWorldOpenedAt
                                    ? `Last reopened ${formatDate(resumeProject.lastWorldOpenedAt)} through ${resumeProject.primarySceneId}.`
                                    : `Launch-ready through ${resumeProject.primarySceneId}.`
                                : topGate?.summary ?? "Workspace project posture is currently aligned."}
                        </p>
                    </article>
                </div>
            </div>
        </section>
    );
}
