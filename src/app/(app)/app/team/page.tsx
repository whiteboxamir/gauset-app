import { InviteMemberPanel } from "@/components/team/InviteMemberPanel";
import { LaneHandoffPanel } from "@/components/team/LaneHandoffPanel";
import { TeamCoverageControlPanel } from "@/components/team/TeamCoverageControlPanel";
import { TeamRosterPanel } from "@/components/team/TeamRosterPanel";
import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { GovernanceStrip } from "@/components/platform/GovernanceStrip";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import { getTeamRosterForSession, getTeamSeatProvisioningForSession } from "@/server/team/service";

export default async function PlatformTeamPage() {
    const session = await requireAuthSession("/app/team");
    const [roster, provisioning, surface] = await Promise.all([
        getTeamRosterForSession(session),
        getTeamSeatProvisioningForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            governance: true,
            notificationSubscriptions: true,
            accessReasons: true,
            continuity: true,
        }),
    ]);
    const { coordinationSnapshot, governanceSnapshot, notificationSubscriptions, accessReasons, continuitySnapshot } = surface;
    const canManageContinuity = roster.studio ? ["owner", "admin"].includes(roster.studio.role) : false;

    if (!roster.studio || !coordinationSnapshot || !governanceSnapshot || !continuitySnapshot) {
        return (
            <StudioBootstrapPanel
                eyebrow="Team"
                title="Create a studio before managing seats"
                body="Team management is studio-scoped. Creating the first workspace here provisions the owner seat immediately so invitations, role changes, and seat posture become real instead of dead-ending."
            />
        );
    }

    return (
        <div className="space-y-6">
            <GovernanceStrip
                eyebrow="Team governance"
                title="Approval and access-review state"
                items={governanceSnapshot.items.filter((item) => item.domain === "team")}
                emptyBody="Team approvals and access review are aligned with current workspace policy."
            />

            <OperationalAttentionStrip
                eyebrow="Team operations"
                title="Team actions"
                items={[...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter((item) => item.domain === "team")}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                coverage={coordinationSnapshot.coverage}
                emptyBody="The shared operations model has no open team blockers right now."
            />

            <section className="grid gap-4 xl:grid-cols-4">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Studio</p>
                    <p className="mt-3 text-lg text-white">{roster.studio.studioName}</p>
                    <p className="mt-1 text-sm text-neutral-500">Slug `{roster.studio.slug}`</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Provisioned seats</p>
                    <p className="mt-3 text-lg text-white">
                        {provisioning.activeSeatCount}
                        {provisioning.provisionedSeatCount ? ` / ${provisioning.provisionedSeatCount}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {provisioning.provisionedSeatCount
                            ? `${Math.max(provisioning.provisionedSeatCount - provisioning.projectedSeatCount, 0)} seats remain after the current pending queue.`
                            : "No explicit provisioned seat count is recorded here yet."}
                    </p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Pending invites</p>
                    <p className="mt-3 text-lg text-white">{roster.studio.pendingInvitationCount}</p>
                    <p className="mt-1 text-sm text-neutral-500">These are unaccepted invitations sitting in the control layer.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Seat posture</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge label={roster.studio.role} tone="info" />
                        <StatusBadge label={roster.studio.canInviteMembers ? "Can invite" : "Invite blocked"} tone={roster.studio.canInviteMembers ? "success" : "warning"} />
                        {provisioning.planSeatLimit ? <StatusBadge label={`Plan ceiling ${provisioning.planSeatLimit}`} tone="neutral" /> : null}
                    </div>
                </article>
            </section>

            <LaneSubscriptionPanel
                title="Follow or mute team-control lanes"
                subtitle="Team follows control whether membership, coverage, and governance signals persist for this workspace operator."
                subscriptions={notificationSubscriptions}
                domains={["team", "coverage", "governance"]}
                compact
            />

            <AccessReasonPanel
                accessReasons={accessReasons}
                visibleKeys={["seat_invites", "governance_manage", "coverage_manage"]}
                title="Why team controls are granted or blocked"
                compact
            />

            <TeamCoverageControlPanel coverage={coordinationSnapshot.coverage} canManage={roster.studio.canManageMembers} />
            <LaneHandoffPanel snapshot={continuitySnapshot} coverage={coordinationSnapshot.coverage} canManage={canManageContinuity} />
            <InviteMemberPanel
                roster={roster}
                provisionedSeatCount={provisioning.provisionedSeatCount}
                planSeatLimit={provisioning.planSeatLimit}
                seatsUsed={provisioning.activeSeatCount}
                staleInviteHours={governanceSnapshot.policy.staleInviteHours}
                requiresAdminInviteApproval={governanceSnapshot.policy.requireAdminInviteApproval}
            />
            <TeamRosterPanel
                roster={roster}
                currentUserId={session.user.userId}
                provisionedSeatCount={provisioning.provisionedSeatCount}
                planSeatLimit={provisioning.planSeatLimit}
                staleInviteHours={governanceSnapshot.policy.staleInviteHours}
                requiresElevatedRoleChangeApproval={governanceSnapshot.policy.requireElevatedRoleChangeApproval}
            />
        </div>
    );
}
