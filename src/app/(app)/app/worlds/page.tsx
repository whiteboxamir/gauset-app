import Link from "next/link";

import { CreateProjectPanel } from "@/components/worlds/CreateProjectPanel";
import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { LocalPreviewNotice } from "@/components/platform/LocalPreviewNotice";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { ReleaseReadinessPanel } from "@/components/platform/ReleaseReadinessPanel";
import { ProjectCardDeck } from "@/components/worlds/ProjectCardDeck";
import { WorldTruthPanel } from "@/components/worlds/WorldTruthPanel";
import { WorldsWorkspaceOverview } from "@/components/worlds/WorldsWorkspaceOverview";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { resolveMvpAccessMode } from "@/server/mvp/access-gate";
import { requireAuthSession } from "@/server/auth/guards";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import {
    listLocalPreviewProjectReadinessCardsForSession,
    listLocalPreviewProjectRisks,
} from "@/server/projects/local-preview";
import { getWorkspaceReleaseReadinessForSession, listProjectReadinessCardsForSession } from "@/server/projects/readiness";

const localPreviewDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatLocalPreviewDate(value?: string | null, fallback = "No recorded return yet") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return localPreviewDateFormatter.format(parsed);
}

export default async function PlatformWorldsPage() {
    const authSurfaceStatus = getAuthSurfaceStatus();
    const canAccessLocalPreviewMvp = resolveMvpAccessMode().bypassed;

    if (!authSurfaceStatus.authConfigured) {
        const projects = listLocalPreviewProjectReadinessCardsForSession();
        const projectRisks = listLocalPreviewProjectRisks();
        const projectMetaById = Object.fromEntries(
            projectRisks.map((project) => [
                project.projectId,
                {
                    riskLevel: project.riskLevel,
                    reasons: project.reasons,
                    activeReviewShareCount: project.activeReviewShareCount,
                    totalReviewShareCount: project.totalReviewShareCount,
                    lastActivityLabel: project.lastActivityLabel,
                },
            ]),
        );

        return (
            <div className="space-y-6">
                <LocalPreviewNotice
                    showWorldStartAction={false}
                    canAccessMvp={canAccessLocalPreviewMvp}
                    body="Persistent world routing is live here. Review, handoff, and sharing stay off."
                />

                <section
                    id="project-library"
                    className="overflow-hidden rounded-[2.2rem] border border-[var(--border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(199,215,200,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]"
                >
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div className="max-w-3xl">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#bfd6de]/78">Project records</p>
                            <h1 className="mt-3 text-3xl font-medium tracking-tight text-[var(--foreground)]">Build one world. Save it once. Then direct it.</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d3ccc2]">
                                Gauset is the persistent world and continuity record for AI filmmaking. Choose a project to test upload, save, reopen, and handoff posture without pretending the rest
                                of production is live.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#ddd5cb]">
                                {projects.length} project records
                            </span>
                            <span className="rounded-full border border-[#c7d7c8]/35 bg-[#c7d7c8]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#dce7dd]">
                                Saved-world route preview
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 xl:grid-cols-2">
                        {projects.map((project) => {
                            const projectMeta = projectMetaById[project.projectId];

                            return (
                                <article
                                    key={project.projectId}
                                    className="rounded-[1.85rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="max-w-2xl">
                                            <h3 className="mt-2 text-xl font-medium text-[var(--foreground)]">{project.name}</h3>
                                            <p className="mt-2 text-sm leading-6 text-[#c9c1b6]">
                                                {project.description ?? "Open the project, start the world, then anchor review and handoff to the first save."}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="rounded-full border border-[#c7d7c8]/35 bg-[#c7d7c8]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#dce7dd]">
                                                {project.status}
                                            </span>
                                            <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#ddd5cb]">
                                                {project.primarySceneId ? "Saved world ready" : "Awaiting first save"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-5 flex flex-wrap gap-2">
                                        <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] px-3 py-2 text-xs text-[#d3ccc2]">
                                            {project.primarySceneId ? `Resume ${project.primarySceneId}` : "No saved world yet"}
                                        </span>
                                        <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] px-3 py-2 text-xs text-[#d3ccc2]">
                                            {project.lastWorldOpenedAt
                                                ? `Last reopened ${formatLocalPreviewDate(project.lastWorldOpenedAt)}`
                                                : projectMeta?.riskLevel === "watch"
                                                  ? "Review links stay off in preview"
                                                  : "Clean sample shell"}
                                        </span>
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-center gap-3">
                                        {canAccessLocalPreviewMvp ? (
                                            <Link
                                                href={`/mvp/preview?project=${encodeURIComponent(project.projectId)}&entry=workspace`}
                                                className="rounded-2xl bg-[#f4efe8] px-4 py-2.5 text-sm font-semibold text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                                            >
                                                Start world
                                            </Link>
                                        ) : null}
                                        <Link
                                            href={`/app/worlds/${project.projectId}`}
                                            className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-white/25 hover:bg-white/[0.08]"
                                        >
                                            Project home
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </div>
        );
    }

    const session = await requireAuthSession("/app/worlds");
    const [projects, workspaceReadiness, surface] = await Promise.all([
        listProjectReadinessCardsForSession(session),
        getWorkspaceReleaseReadinessForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            notificationSubscriptions: true,
            accessReasons: true,
            continuity: true,
        }),
    ]);
    const { coordinationSnapshot, notificationSubscriptions, accessReasons, continuitySnapshot } = surface;
    if (!coordinationSnapshot || !continuitySnapshot) {
        return null;
    }

    const projectItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter((item) => item.domain === "projects");
    const projectMetaById = Object.fromEntries(
        coordinationSnapshot.operations.projectRisks.map((project) => [
            project.projectId,
            {
                riskLevel: project.riskLevel,
                reasons: project.reasons,
                activeReviewShareCount: project.activeReviewShareCount,
                totalReviewShareCount: project.totalReviewShareCount,
                lastActivityLabel: project.lastActivityLabel,
            },
        ]),
    );

    return (
        <div className="space-y-6">
            <WorldsWorkspaceOverview
                projects={projects}
                projectRisks={coordinationSnapshot.operations.projectRisks}
                workspaceReadiness={workspaceReadiness}
                canAccessMvp={session.entitlements.canAccessMvp}
            />

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <ProjectCardDeck
                    projects={projects}
                    projectMetaById={projectMetaById}
                    canAccessMvp={session.entitlements.canAccessMvp}
                    emptyTitle="No owned worlds yet"
                    emptyBody="Create a project to start mapping scenes and worlds to a durable account-layer object."
                />
                <CreateProjectPanel id="project-composer" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                <WorldTruthPanel
                    hasStudio={Boolean(session.activeStudioId)}
                    canAccessMvp={session.entitlements.canAccessMvp}
                    linkedWorldCount={projects.reduce((sum, project) => sum + project.worldCount, 0)}
                    activeReviewShareCount={coordinationSnapshot.operations.projectRisks.reduce((sum, project) => sum + project.activeReviewShareCount, 0)}
                    projectHref="/app/worlds"
                />
                <ReleaseReadinessPanel
                    snapshot={workspaceReadiness}
                    eyebrow="Workflow truth"
                    title="What is actually ready across saved worlds, review, and handoff?"
                    maxGates={4}
                />
            </div>

            <details className="rounded-[1.75rem] border border-white/10 bg-black/20" id="supporting-ops">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-white marker:content-none">
                    Supporting operations and access detail
                </summary>
                <div className="space-y-6 border-t border-white/10 px-5 py-5">
                    <OperationalAttentionStrip
                        eyebrow="Supporting operations"
                        title="Project risks that still need follow-through"
                        items={projectItems}
                        viewer={coordinationSnapshot.viewer}
                        operators={coordinationSnapshot.operators}
                        maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                        coverage={coordinationSnapshot.coverage}
                        emptyBody="The primary world workflow is stable across the current project set."
                    />

                    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                        <CoverageSurfacePanel
                            eyebrow="Supporting coverage"
                            title="Owner availability behind the active world workflow"
                            domains={["projects"]}
                            items={projectItems}
                            coverage={coordinationSnapshot.coverage}
                            viewer={coordinationSnapshot.viewer}
                            operators={coordinationSnapshot.operators}
                            maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                            emptyBody="Coverage is aligned behind the current world workflow."
                        />
                        <ContinuitySurfacePanel
                            snapshot={continuitySnapshot}
                            domains={["projects"]}
                            eyebrow="Supporting continuity"
                            title="Continuity posture around project-risk work"
                            emptyBody="No continuity handoff is currently needed for the active world workflow."
                        />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                        <LaneSubscriptionPanel
                            title="Follow supporting project-risk routing"
                            subtitle="Use follows for secondary operating signals around worlds rather than as the primary path into the product."
                            subscriptions={notificationSubscriptions}
                            domains={["projects"]}
                            compact
                        />
                        <AccessReasonPanel
                            accessReasons={accessReasons}
                            visibleKeys={["mvp_access"]}
                            title="Why world access is granted or blocked"
                            compact
                        />
                    </div>
                </div>
            </details>
        </div>
    );
}
