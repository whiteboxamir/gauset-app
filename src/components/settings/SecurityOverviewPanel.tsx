import type { ReactNode } from "react";

import type { SecurityOverview } from "@/server/contracts/account";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";
import { EmptyState } from "@/components/platform/EmptyState";

export function SecurityOverviewPanel({
    security,
    actionSlot,
}: {
    security: SecurityOverview;
    actionSlot?: ReactNode;
}) {
    return (
        <section className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Account security</p>
                        <h3 className="mt-2 text-lg font-medium text-white">{security.email}</h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-400">
                            Security posture now combines tracked-session inventory, revocation history, and shared access reasoning without crossing into the editor/runtime lane.
                        </p>
                    </div>
                    {actionSlot ? <div className="flex flex-wrap items-center gap-3">{actionSlot}</div> : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    <StatusBadge label={security.onboardingState} tone="info" />
                    {security.providers.map((provider) => (
                        <StatusBadge key={provider} label={provider} tone="neutral" />
                    ))}
                    {security.activeStudioRole ? <StatusBadge label={security.activeStudioRole} tone="warning" /> : null}
                    {security.canAccessMvp ? <StatusBadge label="MVP access" tone="success" /> : null}
                    {security.canUsePrioritySupport ? <StatusBadge label="Priority support" tone="success" /> : null}
                    {security.canInviteSeats ? <StatusBadge label="Seat invites" tone="info" /> : null}
                    {security.legacySessionDetected ? <StatusBadge label="Legacy session" tone="warning" /> : null}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Tracked session posture</p>
                        <p className="mt-2 text-lg font-medium text-white">
                            {security.currentSession ? "Current session tracked" : security.legacySessionDetected ? "Legacy session only" : "No current session"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{security.otherSessions.length} other tracked session{security.otherSessions.length === 1 ? "" : "s"} visible.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Workspace context</p>
                        <p className="mt-2 text-lg font-medium text-white">{security.activeStudioName ?? "No active workspace"}</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {security.activeStudioRole ? `${security.activeStudioRole} role with ${security.planCode ?? "no plan"} posture.` : "Workspace-scoped entitlements resolve after a studio becomes active."}
                        </p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Recent audit activity</p>
                        <p className="mt-2 text-lg font-medium text-white">{security.recentEvents.length} recorded events</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            Audit history reflects profile, team, and session mutations already persisted by the platform.
                        </p>
                    </article>
                </div>
            </div>

            {security.recentEvents.length === 0 ? (
                <EmptyState
                    eyebrow="Audit trail"
                    title="No recent account events"
                    body="Platform audit events will accumulate here as profile, team, and support actions are recorded."
                />
            ) : (
                <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Recent audit trail</p>
                    <div className="mt-5 space-y-3">
                        {security.recentEvents.map((event) => (
                            <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{event.summary}</p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{event.eventType}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={event.actorType} tone="neutral" />
                                        <p className="text-xs text-neutral-500">{formatDateTime(event.createdAt)}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
