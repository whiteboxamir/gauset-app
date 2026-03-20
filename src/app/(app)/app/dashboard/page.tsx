import Link from "next/link";

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
                <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] px-5 py-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Secondary view</p>
                    <h2 className="mt-3 text-xl font-medium text-white">Operations live here after the world workflow is established.</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-400">
                        Use the world library as the primary authenticated path. This dashboard stays useful for activation and readiness once the workspace is in motion.
                    </p>
                    <div className="mt-4">
                        <Link
                            href="/app/worlds"
                            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                        >
                            Open world library
                        </Link>
                    </div>
                </section>
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
            <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Secondary view</p>
                <h2 className="mt-3 text-xl font-medium text-white">Operations summary for active world work.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-400">
                    The authenticated default path now starts in the world library. Use this page to monitor readiness, continuity, and project risk around the active workflow.
                </p>
                <div className="mt-4">
                    <Link
                        href="/app/worlds"
                        className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                    >
                        Return to world library
                    </Link>
                </div>
            </section>
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
                    eyebrow="Operations readiness"
                    title="Can this workspace support the active world workflow right now?"
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
