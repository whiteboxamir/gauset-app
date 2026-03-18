import { GovernanceStrip } from "@/components/platform/GovernanceStrip";
import { SupportThreadComposer } from "@/components/support/SupportThreadComposer";
import { SupportThreadList } from "@/components/support/SupportThreadList";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { listProjectsForSession } from "@/server/projects/service";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";
import { listSupportThreadsForSession } from "@/server/support/service";

export default async function PlatformSupportPage() {
    const session = await requireAuthSession("/app/support");

    if (!session.activeStudioId) {
        return (
            <StudioBootstrapPanel
                eyebrow="Support"
                title="Activate a workspace before opening support threads"
                body="Support stays studio-scoped because billing issues, project context, and operator history all resolve through one workspace. Creating the first studio here unlocks the live support surface immediately."
            />
        );
    }

    const [threads, projects, surface] = await Promise.all([
        listSupportThreadsForSession(session),
        listProjectsForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            governance: true,
            notificationSubscriptions: true,
            continuity: true,
        }),
    ]);
    const { coordinationSnapshot, governanceSnapshot, notificationSubscriptions, continuitySnapshot } = surface;
    if (!coordinationSnapshot || !governanceSnapshot || !continuitySnapshot) {
        return null;
    }
    const supportItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter((item) => item.domain === "support");

    return (
        <div className="space-y-6">
            <GovernanceStrip
                eyebrow="Support governance"
                title="Policy breach view"
                items={governanceSnapshot.items.filter((item) => item.domain === "support")}
                emptyBody="Support policy thresholds and approval state are aligned on this workspace."
            />

            <OperationalAttentionStrip
                eyebrow="Support operations"
                title="Support actions"
                items={[...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter((item) => item.domain === "support")}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                coverage={coordinationSnapshot.coverage}
                emptyBody="The shared operations model has no open support blockers right now."
            />

            <CoverageSurfacePanel
                eyebrow="Support coverage"
                title="Owner availability and support lane posture"
                domains={["support"]}
                items={supportItems}
                coverage={coordinationSnapshot.coverage}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                emptyBody="Support coverage is aligned. No urgent support items are unowned or blocked behind unavailable operators."
            />
            <ContinuitySurfacePanel
                snapshot={continuitySnapshot}
                domains={["support"]}
                eyebrow="Support continuity"
                title="Support handoff posture"
                emptyBody="No support continuity handoff has been recorded yet."
            />

            <LaneSubscriptionPanel
                title="Follow or mute the support lane"
                subtitle="Support follows determine whether unresolved support posture becomes a persistent workspace signal for you."
                subscriptions={notificationSubscriptions}
                domains={["support"]}
                compact
            />

            <section className="grid gap-4 xl:grid-cols-4">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Open threads</p>
                    <p className="mt-3 text-lg text-white">{threads.filter((thread) => thread.status === "open" || thread.status === "pending").length}</p>
                    <p className="mt-1 text-sm text-neutral-500">Open and pending partner conversations.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Priority support</p>
                    <div className="mt-3">
                        <StatusBadge label={session.entitlements.canUsePrioritySupport ? "Enabled" : "Standard"} tone={session.entitlements.canUsePrioritySupport ? "success" : "neutral"} />
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Projects</p>
                    <p className="mt-3 text-lg text-white">{projects.length}</p>
                    <p className="mt-1 text-sm text-neutral-500">Available to attach as support context.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Workspace</p>
                    <p className="mt-3 text-lg text-white">{session.studios.find((studio) => studio.studioId === session.activeStudioId)?.studioName ?? "Studio"}</p>
                    <p className="mt-1 text-sm text-neutral-500">Support state stays isolated from editor internals.</p>
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr,1.05fr]">
                <SupportThreadComposer
                    projectOptions={projects.map((project) => ({ id: project.projectId, label: project.name }))}
                    prioritySupportEnabled={session.entitlements.canUsePrioritySupport}
                />
                <SupportThreadList threads={threads} prioritySupportEnabled={session.entitlements.canUsePrioritySupport} />
            </div>
        </div>
    );
}
