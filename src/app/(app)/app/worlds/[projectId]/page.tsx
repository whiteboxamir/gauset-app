import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { LocalPreviewNotice } from "@/components/platform/LocalPreviewNotice";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { ReleaseReadinessPanel } from "@/components/platform/ReleaseReadinessPanel";
import { ActivityFeed } from "@/components/worlds/ActivityFeed";
import { ProjectHomeHero } from "@/components/worlds/ProjectHomeHero";
import { ProjectWorldLaunchPanel } from "@/components/worlds/ProjectWorldLaunchPanel";
import { ProjectWorldLinkManager } from "@/components/worlds/ProjectWorldLinkManager";
import { ReviewSharePanel } from "@/components/worlds/ReviewSharePanel";
import { WorldTruthPanel } from "@/components/worlds/WorldTruthPanel";
import { requireAuthSession } from "@/server/auth/guards";
import { getAuthSurfaceStatus } from "@/server/auth/surface";
import { canSessionAccessMvp } from "@/server/mvp/access";
import { resolveMvpAccessMode } from "@/server/mvp/access-gate";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import { getLocalPreviewProjectReadinessDetailForId, getLocalPreviewProjectRiskForId } from "@/server/projects/local-preview";
import { getProjectReadinessDetailForSession } from "@/server/projects/readiness";
import { canManageProjectReviewShares } from "@/server/review-shares/permissions";
import { getProjectReviewSharesForSession } from "@/server/review-shares/service";

export default async function PlatformProjectDetailPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const authSurfaceStatus = getAuthSurfaceStatus();
    const { projectId } = await params;
    const canAccessLocalPreviewMvp = resolveMvpAccessMode().bypassed;

    if (!authSurfaceStatus.authConfigured) {
        const detail = getLocalPreviewProjectReadinessDetailForId(projectId);
        if (!detail) {
            notFound();
        }

        const projectRisk = getLocalPreviewProjectRiskForId(projectId);

        return (
            <div className="space-y-6">
                <LocalPreviewNotice
                    title="Project record preview"
                    canAccessMvp={canAccessLocalPreviewMvp}
                    showWorldStartAction={false}
                    body="Project-bound world routing is live here. Review, handoff, and sharing stay off."
                />

                <section className="overflow-hidden rounded-[2.2rem] border border-[var(--border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(220,195,161,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
                    <div className="flex flex-wrap items-start justify-between gap-6">
                        <div className="max-w-3xl">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/78">Project record</p>
                            <h1 className="mt-3 text-3xl font-medium tracking-tight text-[var(--foreground)]">{detail.project.name}</h1>
                            <p className="mt-3 text-sm leading-6 text-[#d3ccc2]">
                                {detail.project.description ??
                                    "Build one world. Save it once. Then direct it. This project record keeps continuity memory, reopen history, review posture, and handoff attached to one durable source."}
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <span className="rounded-full border border-[#c7d7c8]/35 bg-[#c7d7c8]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#dce7dd]">
                                    {detail.project.status}
                                </span>
                                <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#ddd5cb]">
                                    {detail.project.primarySceneId ? "Saved world ready" : "No saved world yet"}
                                </span>
                                {projectRisk ? (
                                    <span className="rounded-full border border-[#dcc3a1]/35 bg-[#dcc3a1]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f3debf]">
                                        {projectRisk.riskLevel === "watch" ? "Sharing off" : "Local record"}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-6 flex flex-wrap gap-3">
                                <Link
                                    href="#project-world-launch"
                                    className="rounded-2xl bg-[#f4efe8] px-4 py-2.5 text-sm font-semibold text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                                >
                                    Build world record
                                </Link>
                                <Link
                                    href="/app/worlds"
                                    className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-white/25 hover:bg-white/[0.08]"
                                >
                                    Back to project library
                                </Link>
                            </div>
                        </div>

                        <div className="min-w-[280px] max-w-sm rounded-[1.7rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] p-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">World-first checklist</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[#d3ccc2]">1. Choose source</span>
                                <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[#d3ccc2]">2. Save first version</span>
                                <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[#d3ccc2]">3. Review or handoff</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                    <ProjectWorldLaunchPanel
                        projectId={detail.project.projectId}
                        canAccessMvp={canAccessLocalPreviewMvp}
                        resumeSceneId={detail.project.primarySceneId}
                    />
                    <section className="rounded-[1.85rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">World record</p>
                        <div className="mt-4 rounded-[1.2rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] p-4">
                            <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-[#c7d7c8]/35 bg-[#c7d7c8]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#dce7dd]">
                                    Saved world live
                                </span>
                                <span className="rounded-full border border-[#dcc3a1]/35 bg-[#dcc3a1]/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f3debf]">
                                    Sharing off
                                </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-[#b8b1a7]">
                                Choose one source path, save the first version, then reopen, review, and hand off from that same project-bound world record.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    const session = await requireAuthSession("/app/worlds");
    const detail = await getProjectReadinessDetailForSession(session, projectId);
    const canAccessMvp = await canSessionAccessMvp(session);

    if (!detail) {
        notFound();
    }

    const [reviewShares, surface] = await Promise.all([
        getProjectReviewSharesForSession(session, projectId),
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

    const canManageReviewShares = canManageProjectReviewShares(detail.project.membershipRole);
    const projectItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch, ...coordinationSnapshot.actionCenter.resolved].filter(
        (item) => item.entityType === "project" && item.entityId === projectId,
    );
    const projectRisk = coordinationSnapshot.operations.projectRisks.find((project) => project.projectId === projectId) ?? null;
    const reviewShareState = reviewShares ?? {
        shares: [],
        summary: {
            totalCount: 0,
            activeCount: 0,
            revokedCount: 0,
            expiredCount: 0,
        },
    };

    return (
        <div className="space-y-6">
            <ProjectHomeHero
                detail={detail}
                projectRisk={projectRisk}
                canAccessMvp={canAccessMvp}
                reviewShareSummary={reviewShareState.summary}
            />

            <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
                <ProjectWorldLaunchPanel
                    projectId={detail.project.projectId}
                    canAccessMvp={canAccessMvp}
                    resumeSceneId={detail.project.primarySceneId}
                />
                <ReviewSharePanel
                    projectId={detail.project.projectId}
                    worldLinks={detail.worldLinks}
                    canAccessMvp={canAccessMvp}
                    canManageReviewShares={canManageReviewShares}
                    reviewShares={reviewShareState.shares}
                    reviewShareSummary={reviewShareState.summary}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
                <WorldTruthPanel
                    hasStudio={Boolean(detail.project.studioId)}
                    canAccessMvp={canAccessMvp}
                    linkedWorldCount={detail.worldLinks.length}
                    activeReviewShareCount={reviewShareState.summary.activeCount}
                    projectHref="/app/worlds"
                    compact
                />
                <ReleaseReadinessPanel
                    snapshot={detail.releaseReadiness}
                    eyebrow="Workflow truth"
                    title="What is actually ready after save, review, and handoff checks?"
                />
            </div>

            <details className="rounded-[1.75rem] border border-white/10 bg-black/20" id="linked-world-admin">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-white marker:content-none">
                    Linked worlds, project operations, and support detail
                </summary>
                <div className="space-y-6 border-t border-white/10 px-5 py-5">
                    <ProjectWorldLinkManager
                        projectId={detail.project.projectId}
                        worldLinks={detail.worldLinks}
                        canAccessMvp={canAccessMvp}
                    />

                    <OperationalAttentionStrip
                        eyebrow="Supporting operations"
                        title="Coordination that sits behind the world workflow"
                        items={projectItems}
                        viewer={coordinationSnapshot.viewer}
                        operators={coordinationSnapshot.operators}
                        maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                        coverage={coordinationSnapshot.coverage}
                        emptyBody="This project has no open coordination blockers right now."
                    />

                    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                        <CoverageSurfacePanel
                            eyebrow="Project coverage"
                            title="Owner availability on this risky project"
                            domains={["projects"]}
                            items={projectItems}
                            coverage={coordinationSnapshot.coverage}
                            viewer={coordinationSnapshot.viewer}
                            operators={coordinationSnapshot.operators}
                            maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                            emptyBody="Project-risk ownership is aligned for this project."
                        />
                        <ContinuitySurfacePanel
                            snapshot={continuitySnapshot}
                            domains={["projects"]}
                            eyebrow="Project continuity"
                            title="Project-risk handoff posture"
                            emptyBody="No project-risk continuity handoff has been recorded yet."
                        />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                        <LaneSubscriptionPanel
                            title="Follow or mute this project lane"
                            subtitle="Project-risk follows change whether this lane keeps delivering persistent signals into your workspace inbox."
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

                    <ActivityFeed events={detail.activity} title="Project timeline" eyebrow="Timeline" />
                </div>
            </details>
        </div>
    );
}
