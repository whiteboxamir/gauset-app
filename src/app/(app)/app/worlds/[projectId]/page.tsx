import { notFound } from "next/navigation";

import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { ReleaseReadinessPanel } from "@/components/platform/ReleaseReadinessPanel";
import { ActivityFeed } from "@/components/worlds/ActivityFeed";
import { ProjectHomeHero } from "@/components/worlds/ProjectHomeHero";
import { ProjectWorldLaunchPanel } from "@/components/worlds/ProjectWorldLaunchPanel";
import { ProjectWorldLinkManager } from "@/components/worlds/ProjectWorldLinkManager";
import { ReviewSharePanel } from "@/components/worlds/ReviewSharePanel";
import { WorldTruthPanel } from "@/components/worlds/WorldTruthPanel";
import { requireAuthSession } from "@/server/auth/guards";
import { canSessionAccessMvp } from "@/server/mvp/access";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import { getProjectReadinessDetailForSession } from "@/server/projects/readiness";
import { canManageProjectReviewShares } from "@/server/review-shares/permissions";
import { getProjectReviewSharesForSession } from "@/server/review-shares/service";

export default async function PlatformProjectDetailPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const session = await requireAuthSession("/app/worlds");
    const { projectId } = await params;
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
                    eyebrow="Project readiness"
                    title="Can we safely send, share, review, and operate this right now?"
                />
            </div>

            <OperationalAttentionStrip
                eyebrow="Project coordination"
                title="Current project ownership state"
                items={projectItems}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                coverage={coordinationSnapshot.coverage}
                emptyBody="This project has no open coordination blockers right now."
            />

            <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
                <ProjectWorldLaunchPanel projectId={detail.project.projectId} canAccessMvp={canAccessMvp} />
                <ReviewSharePanel
                    projectId={detail.project.projectId}
                    worldLinks={detail.worldLinks}
                    canAccessMvp={canAccessMvp}
                    canManageReviewShares={canManageReviewShares}
                    reviewShares={reviewShareState.shares}
                    reviewShareSummary={reviewShareState.summary}
                />
            </div>

            <ProjectWorldLinkManager
                projectId={detail.project.projectId}
                worldLinks={detail.worldLinks}
                canAccessMvp={canAccessMvp}
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
    );
}
