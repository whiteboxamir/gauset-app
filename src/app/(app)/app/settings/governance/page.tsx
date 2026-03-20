import { GovernancePolicyPanel } from "@/components/settings/GovernancePolicyPanel";
import { ApprovalQueuePanel } from "@/components/settings/ApprovalQueuePanel";
import { AccessReviewPanel } from "@/components/settings/AccessReviewPanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { getPlatformGovernanceSettingsSurfaceForSession } from "@/server/platform/surface-settings";

export default async function PlatformGovernancePage() {
    const session = await requireAuthSession("/app/settings/governance");
    if (!session.activeStudioId) {
        return (
            <StudioBootstrapPanel
                eyebrow="Governance"
                title="Create a workspace before governing it"
                body="Governance only becomes meaningful once approvals, access, support, billing, and project posture all resolve through an active studio."
            />
        );
    }

    const surface = await getPlatformGovernanceSettingsSurfaceForSession(session);
    const { governanceSnapshot: snapshot, notificationSubscriptions } = surface;
    if (!snapshot) {
        return null;
    }
    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    const canManage = activeStudio ? ["owner", "admin"].includes(activeStudio.role) : false;

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Governance OS</p>
                        <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">Policy, approvals, and access review</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">
                            This lane turns operational thresholds and sensitive workspace mutations into explicit controls with an approval trail and a reusable access-review loop.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <StatusBadge label={snapshot.overallStatus} tone={snapshot.overallStatus === "blocked" ? "danger" : snapshot.overallStatus === "attention" ? "warning" : "success"} />
                            <StatusBadge label={`${snapshot.pendingApprovalCount} approvals`} tone={snapshot.pendingApprovalCount > 0 ? "danger" : "neutral"} />
                            <StatusBadge label={`${snapshot.exceptionCount} exceptions`} tone={snapshot.exceptionCount > 0 ? "warning" : "success"} />
                            {activeStudio ? <StatusBadge label={`${activeStudio.role} access`} tone="info" /> : null}
                        </div>
                    </div>
                </div>
            </section>

            <LaneSubscriptionPanel
                title="Follow or mute governance lanes"
                subtitle="Governance follows decide whether policy drift, approvals, and coverage posture route back into your in-app feed."
                subscriptions={notificationSubscriptions}
                domains={["governance", "coverage", "workspace"]}
                compact
            />
            <GovernancePolicyPanel policy={snapshot.policy} canManage={canManage} />
            <ApprovalQueuePanel pendingRequests={snapshot.pendingRequests} recentRequests={snapshot.recentRequests} canManage={canManage} />
            <AccessReviewPanel snapshot={snapshot.accessReview} canManage={canManage} />
        </div>
    );
}
