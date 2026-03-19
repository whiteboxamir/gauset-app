import Link from "next/link";

import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectCard } from "@/server/contracts/projects";
import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

import { EmptyState } from "@/components/platform/EmptyState";
import { formatReleaseReadinessLabel, getReleaseReadinessTone } from "@/components/platform/release-readiness";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";
import { WorldLinkLifecycleSummary } from "@/components/worlds/WorldLinkLifecycleSummary";

type ProjectCardWithOptionalReadiness = ProjectCard & {
    releaseReadiness?: ReleaseReadinessSnapshot;
};

type ProjectCardMeta = Pick<
    ProjectOperationalRisk,
    "riskLevel" | "reasons" | "activeReviewShareCount" | "totalReviewShareCount" | "lastActivityLabel"
>;

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

export function ProjectCardDeck({
    projects,
    projectMetaById = {},
    canAccessMvp = false,
    eyebrow = "Project library",
    title = "Saved-world records",
    description = "Each project is the durable record for one filmmaking world: continuity memory, reopen history, review posture, and handoff all stay attached here.",
    emptyTitle = "No projects yet",
    emptyBody = "Create a project to start one durable world record. The first save turns it into a real continuity anchor.",
}: {
    projects: ProjectCardWithOptionalReadiness[];
    projectMetaById?: Record<string, ProjectCardMeta | undefined>;
    canAccessMvp?: boolean;
    eyebrow?: string;
    title?: string;
    description?: string;
    emptyTitle?: string;
    emptyBody?: string;
}) {
    if (projects.length === 0) {
        return <EmptyState eyebrow={eyebrow} title={emptyTitle} body={emptyBody} />;
    }

    return (
        <section id="project-library" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">{title}</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-400">{description}</p>
                </div>
                <StatusBadge label={`${projects.length} projects`} tone="info" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                {projects.map((project) => {
                    const projectMeta = projectMetaById[project.projectId];
                    const nextGate = project.releaseReadiness?.gates.find((gate) => gate.state !== "ready") ?? null;

                    return (
                        <article
                            key={project.projectId}
                            className="rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="max-w-2xl">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{project.studioName ?? "Personal scope"}</p>
                                    <h3 className="mt-2 text-xl font-medium text-white">{project.name}</h3>
                                    <p className="mt-3 text-sm leading-7 text-neutral-400">{project.description ?? "No description recorded for this project yet."}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge
                                        label={project.status}
                                        tone={project.status === "active" ? "success" : project.status === "archived" ? "neutral" : "info"}
                                    />
                                    <StatusBadge label={project.primarySceneId ? "Saved world ready" : "No saved world yet"} tone={project.primarySceneId ? "success" : "warning"} />
                                    <StatusBadge
                                        label={projectMeta ? `${projectMeta.riskLevel} signal` : "No project signal"}
                                        tone={getRiskTone(projectMeta?.riskLevel)}
                                    />
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <article className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Primary world</p>
                                    <p className="mt-2 text-sm font-medium text-white">{project.primarySceneId ?? "Not linked yet"}</p>
                                    <p className="mt-1 text-xs text-neutral-500">{project.primaryEnvironmentLabel ?? "Add a world label"}</p>
                                </article>
                                <article className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">World record state</p>
                                    <div className="mt-2">
                                        <StatusBadge
                                            label={project.releaseReadiness ? formatReleaseReadinessLabel(project.releaseReadiness.state) : "No readiness signal"}
                                            tone={project.releaseReadiness ? getReleaseReadinessTone(project.releaseReadiness.state) : "neutral"}
                                        />
                                    </div>
                                    <p className="mt-2 text-xs text-neutral-500">{nextGate?.summary ?? "No blocking gate recorded."}</p>
                                </article>
                                <article className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Review links</p>
                                    <p className="mt-2 text-sm font-medium text-white">
                                        {projectMeta ? `${projectMeta.activeReviewShareCount} live / ${projectMeta.totalReviewShareCount} total` : "Pending signal"}
                                    </p>
                                    <p className="mt-1 text-xs text-neutral-500">Pinned to saved versions so review does not drift from the world record.</p>
                                </article>
                                <article className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Reopen history</p>
                                    <p className="mt-2 text-sm font-medium text-white">{formatDate(project.lastWorldOpenedAt, "Not reopened yet")}</p>
                                    <p className="mt-1 text-xs text-neutral-500">
                                        {project.lastWorldOpenedAt
                                            ? `Last world launch through ${project.primarySceneId ?? "linked scene"}.`
                                            : projectMeta?.lastActivityLabel ?? "Launch path appears once a linked world is reopened."}
                                    </p>
                                </article>
                            </div>

                            {projectMeta?.reasons.length ? (
                                <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Current risk signal</p>
                                    <p className="mt-2 text-sm text-neutral-300">
                                        {projectMeta.reasons.slice(0, 2).join(" · ")}
                                        {project.lastActivityAt ? ` · Last activity ${formatDate(project.lastActivityAt)}` : ""}
                                    </p>
                                </div>
                            ) : null}

                            {project.primarySceneId ? (
                                <div className="mt-4">
                                    <WorldLinkLifecycleSummary
                                        sceneId={project.primarySceneId}
                                        fallbackLabel={project.primaryEnvironmentLabel}
                                        canAccessMvp={canAccessMvp}
                                        compact
                                    />
                                </div>
                            ) : (
                                <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">World record truth</p>
                                    <p className="mt-2 text-sm font-medium text-white">Awaiting first saved world</p>
                                    <p className="mt-2 text-sm text-neutral-400">
                                        The project record is ready now, but continuity memory, review, and handoff only become durable after the first world is saved.
                                    </p>
                                </div>
                            )}

                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                <Link
                                    href={`/app/worlds/${project.projectId}`}
                                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                >
                                    Open project home
                                </Link>
                                <OpenWorkspaceButton
                                    projectId={project.projectId}
                                    sceneId={project.primarySceneId}
                                    label={
                                        project.primarySceneId && canAccessMvp
                                            ? project.lastWorldOpenedAt
                                                ? "Return to saved world"
                                                : "Open saved world"
                                            : "Saved-world launch unavailable"
                                    }
                                    disabled={!project.primarySceneId || !canAccessMvp}
                                    variant="secondary"
                                />
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
