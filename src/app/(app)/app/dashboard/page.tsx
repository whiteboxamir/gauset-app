import { ActivationFeed } from "@/components/dashboard/ActivationFeed";
import { ActivationChecklist } from "@/components/dashboard/ActivationChecklist";
import { ActivationReadinessBoard } from "@/components/dashboard/ActivationReadinessBoard";
import { ContinuityPanel } from "@/components/dashboard/ContinuityPanel";
import { OperationsSummaryPanel } from "@/components/dashboard/OperationsSummaryPanel";
import { ProjectOperationsPanel } from "@/components/dashboard/ProjectOperationsPanel";
import { ProjectsWorkspaceOverview } from "@/components/dashboard/ProjectsWorkspaceOverview";
import { ReleaseReadinessPanel } from "@/components/platform/ReleaseReadinessPanel";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { CreateProjectPanel } from "@/components/worlds/CreateProjectPanel";
import { ProjectCardDeck } from "@/components/worlds/ProjectCardDeck";
import { WorldTruthPanel } from "@/components/worlds/WorldTruthPanel";
import { requireAuthSession } from "@/server/auth/guards";
import { getDesignPartnerDashboardForSession } from "@/server/projects/dashboard";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";

export default async function PlatformDashboardPage() {
    const session = await requireAuthSession("/app/dashboard");
    const [dashboard, surface] = await Promise.all([
        getDesignPartnerDashboardForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            governance: true,
            notificationSubscriptions: true,
            continuity: true,
        }),
    ]);
    const { coordinationSnapshot, continuitySnapshot } = surface;
    const hasPlatformSurface = Boolean(coordinationSnapshot && continuitySnapshot);
    const projectMetaById = Object.fromEntries(
        (coordinationSnapshot?.operations.projectRisks ?? []).map((project) => [
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

    if (!dashboard.hasActiveStudio) {
        return (
            <div className="space-y-6">
                <ProjectsWorkspaceOverview snapshot={dashboard} projectRisks={[]} canAccessMvp={session.entitlements.canAccessMvp} />
                <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
                    <ActivationReadinessBoard snapshot={dashboard} canAccessMvp={session.entitlements.canAccessMvp} />
                    <WorldTruthPanel
                        hasStudio={dashboard.hasActiveStudio}
                        canAccessMvp={session.entitlements.canAccessMvp}
                        linkedWorldCount={dashboard.worldLinkedCount}
                        activeReviewShareCount={dashboard.activeReviewShareCount}
                        projectHref="/app/worlds"
                    />
                </div>
                <StudioBootstrapPanel
                    id="studio-bootstrap"
                    eyebrow="Activation action"
                    title="Create the first studio directly from the dashboard"
                    body="The activation OS starts by making workspace selection explicit. Creating the first studio here provisions the owner seat, branding shell, onboarding activation, and persisted active workspace in one move."
                />
                <ActivationChecklist snapshot={dashboard} />
                <ActivationFeed events={dashboard.activationFeed} />
            </div>
        );
    }

    if (!hasPlatformSurface) {
        return null;
    }

    return (
        <div className="space-y-6">
            <ProjectsWorkspaceOverview
                snapshot={dashboard}
                projectRisks={coordinationSnapshot!.operations.projectRisks}
                canAccessMvp={session.entitlements.canAccessMvp}
            />

            <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
                <WorldTruthPanel
                    hasStudio={dashboard.hasActiveStudio}
                    canAccessMvp={session.entitlements.canAccessMvp}
                    linkedWorldCount={dashboard.worldLinkedCount}
                    activeReviewShareCount={dashboard.activeReviewShareCount}
                    projectHref="/app/worlds"
                />
                <ActivationReadinessBoard snapshot={dashboard} canAccessMvp={session.entitlements.canAccessMvp} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <ProjectCardDeck
                    projects={dashboard.recentProjects}
                    projectMetaById={projectMetaById}
                    canAccessMvp={session.entitlements.canAccessMvp}
                    eyebrow="Recent project home"
                    title="Projects worth opening now"
                    description="Recent projects stay visible here with world-link truth, review posture, and workspace launch controls."
                    emptyTitle="No active projects yet"
                    emptyBody="Create your first project to establish ownership, history, and entitlement-aware world launch from the workspace shell."
                />
                <CreateProjectPanel compact id="project-composer" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                <ReleaseReadinessPanel
                    snapshot={dashboard.releaseReadiness}
                    eyebrow="Workspace release readiness"
                    title="Can this workspace safely ship, share, review, and operate right now?"
                />
                <ProjectOperationsPanel snapshot={coordinationSnapshot!} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                <OperationsSummaryPanel
                    snapshot={coordinationSnapshot!.operations}
                    workload={coordinationSnapshot!.workload}
                    workspaceLabel={dashboard.partnerLabel}
                />
                <ContinuityPanel snapshot={continuitySnapshot!} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                <ActivationFeed events={dashboard.activationFeed} />
                <ActivationChecklist snapshot={dashboard} />
            </div>
        </div>
    );
}
