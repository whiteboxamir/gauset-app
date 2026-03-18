import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { GovernanceStrip } from "@/components/platform/GovernanceStrip";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { StudioSettingsForm } from "@/components/settings/StudioSettingsForm";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { getAccountSettingsSnapshotForSession } from "@/server/account/service";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";

export default async function PlatformProfileSettingsPage() {
    const session = await requireAuthSession("/app/settings/profile");
    const [snapshot, surface] = await Promise.all([
        getAccountSettingsSnapshotForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            governance: true,
            notificationSubscriptions: true,
            accessReasons: true,
            continuity: true,
        }),
    ]);
    const { coordinationSnapshot, governanceSnapshot, notificationSubscriptions, accessReasons, continuitySnapshot } = surface;
    if (!coordinationSnapshot || !governanceSnapshot || !continuitySnapshot) {
        return null;
    }
    const workspaceItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
        (item) => item.domain === "workspace" || item.domain === "billing",
    );
    const identityChecks = [
        { label: "Display name", ready: Boolean(snapshot.profile.displayName?.trim()) },
        { label: "Job title", ready: Boolean(snapshot.profile.jobTitle?.trim()) },
        { label: "Timezone", ready: Boolean(snapshot.profile.timezone?.trim()) && snapshot.profile.timezone !== "UTC" },
        { label: "Tracked session", ready: Boolean(snapshot.security.currentSession) },
    ];
    const readinessCount = identityChecks.filter((item) => item.ready).length;

    return (
        <div className="space-y-6">
            <GovernanceStrip
                eyebrow="Workspace governance"
                title="Policy and approval posture"
                items={governanceSnapshot.items.filter((item) => item.domain === "workspace" || item.domain === "billing")}
                emptyBody="Workspace policy and approval posture are aligned."
            />

            <OperationalAttentionStrip
                eyebrow="Workspace operations"
                title="Workspace and profile actions"
                items={[...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
                    (item) => item.domain === "workspace" || item.domain === "billing",
                )}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                coverage={coordinationSnapshot.coverage}
                emptyBody="Workspace profile data is aligned with the current shared operations thresholds."
            />

            <CoverageSurfacePanel
                eyebrow="Workspace coverage"
                title="Identity, contacts, and billing ownership quality"
                domains={["workspace", "billing"]}
                items={workspaceItems}
                coverage={coordinationSnapshot.coverage}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                emptyBody="Workspace identity and contact ownership are aligned with current operator availability."
            />
            <ContinuitySurfacePanel
                snapshot={continuitySnapshot}
                domains={["workspace", "billing"]}
                eyebrow="Workspace continuity"
                title="Workspace identity and billing handoff posture"
                emptyBody="No workspace or billing continuity handoff has been recorded yet."
            />

            <LaneSubscriptionPanel
                title="Follow or mute profile-adjacent lanes"
                subtitle="Profile follows decide whether workspace identity and billing-contact posture stays in your routed inbox."
                subscriptions={notificationSubscriptions}
                domains={["workspace", "billing"]}
                compact
            />

            <AccessReasonPanel accessReasons={accessReasons} title="Why platform access is granted or blocked on this account" compact />

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Account email</p>
                    <p className="mt-3 text-lg text-white">{snapshot.profile.email}</p>
                    <p className="mt-1 text-sm text-neutral-500">Primary identity used for secure session bootstrap.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Providers</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {snapshot.profile.providers.map((provider) => (
                            <StatusBadge key={provider} label={provider} tone="neutral" />
                        ))}
                    </div>
                    <p className="mt-2 text-sm text-neutral-500">Provider inventory stays in the identity layer.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Active workspace</p>
                    <p className="mt-3 text-lg text-white">{snapshot.activeStudio?.name ?? "No workspace yet"}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {snapshot.activeStudio
                            ? `${snapshot.activeStudio.seatCount} active seats and ${snapshot.activeStudio.pendingInvitationCount} pending invites.`
                            : "Create or accept a workspace to unlock studio-scoped settings."}
                    </p>
                </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Identity readiness</p>
                            <h3 className="mt-2 text-lg font-medium text-white">{readinessCount} of {identityChecks.length} profile signals set</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge label={snapshot.security.currentSession ? "Tracked session" : "Legacy session"} tone={snapshot.security.currentSession ? "success" : "warning"} />
                            <StatusBadge label={`${snapshot.accessibleStudios.length} workspaces`} tone="info" />
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {identityChecks.map((item) => (
                            <article key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">{item.label}</p>
                                <div className="mt-2">
                                    <StatusBadge label={item.ready ? "Ready" : "Needs attention"} tone={item.ready ? "success" : "warning"} />
                                </div>
                            </article>
                        ))}
                    </div>

                    <p className="mt-4 text-sm leading-7 text-neutral-400">
                        Profile settings tune operator identity and secure-session clarity. They do not change workspace entitlements or claim rollout readiness beyond what the current account state can prove.
                    </p>
                </article>

                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Workspace access</p>
                            <h3 className="mt-2 text-lg font-medium text-white">Studios visible to this operator</h3>
                        </div>
                        {snapshot.activeStudio ? <StatusBadge label={`Active: ${snapshot.activeStudio.name}`} tone="info" /> : null}
                    </div>

                    {snapshot.accessibleStudios.length === 0 ? (
                        <p className="mt-5 text-sm leading-7 text-neutral-400">
                            Workspace access will appear here once the account joins or creates a studio.
                        </p>
                    ) : (
                        <div className="mt-5 space-y-3">
                            {snapshot.accessibleStudios.map((studio) => (
                                <article key={studio.studioId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-white">{studio.name}</p>
                                            <p className="mt-1 text-sm text-neutral-500">Slug `{studio.slug}`</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <StatusBadge label={studio.role} tone="info" />
                                            {studio.planCode ? <StatusBadge label={studio.planCode} tone="neutral" /> : null}
                                            {studio.isActive ? <StatusBadge label="Active workspace" tone="success" /> : null}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
                <ProfileSettingsForm profile={snapshot.profile} />
                <StudioSettingsForm studio={snapshot.activeStudio} />
            </div>
        </div>
    );
}
