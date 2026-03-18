import { CreateProjectPanel } from "@/components/worlds/CreateProjectPanel";
import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { ReleaseReadinessPanel } from "@/components/platform/ReleaseReadinessPanel";
import { ProjectCardDeck } from "@/components/worlds/ProjectCardDeck";
import { WorldTruthPanel } from "@/components/worlds/WorldTruthPanel";
import { WorldsWorkspaceOverview } from "@/components/worlds/WorldsWorkspaceOverview";
import { requireAuthSession } from "@/server/auth/guards";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import { getWorkspaceReleaseReadinessForSession, listProjectReadinessCardsForSession } from "@/server/projects/readiness";

export default async function PlatformWorldsPage() {
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
                    eyebrow="Workflow readiness"
                    title="Can this world workflow safely open, review, and hand off right now?"
                    maxGates={4}
                />
            </div>

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
    );
}
