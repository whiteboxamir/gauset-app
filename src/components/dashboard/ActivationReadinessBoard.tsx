import Link from "next/link";

import type { ActivationDomain, DesignPartnerDashboardSnapshot } from "@/server/projects/dashboard";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";

function getTone(status: ActivationDomain["status"]) {
    switch (status) {
        case "ready":
            return "success";
        case "attention":
            return "warning";
        case "blocked":
            return "danger";
        default:
            return "neutral";
    }
}

export function ActivationReadinessBoard({
    snapshot,
    canAccessMvp = false,
}: {
    snapshot: DesignPartnerDashboardSnapshot;
    canAccessMvp?: boolean;
}) {
    return (
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Design Partner Activation</p>
                    <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">{snapshot.partnerLabel}</h1>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        {snapshot.readyCount} of {snapshot.totalCount} activation lanes are fully ready.{" "}
                        {snapshot.hasActiveStudio
                            ? "This surface tracks entitlement posture, team coverage, world linkage, secure review distribution, billing readiness, and support routing from live platform data."
                            : "The first activation move is explicit workspace creation so the rest of the platform can execute against a real studio."}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge label={`${snapshot.overallScore}% ready`} tone={snapshot.overallScore >= 80 ? "success" : snapshot.overallScore >= 50 ? "warning" : "danger"} />
                        <StatusBadge label={snapshot.planName ?? (snapshot.hasActiveStudio ? "No active plan" : "Workspace required")} tone={snapshot.planName ? "info" : "neutral"} />
                        <StatusBadge
                            label={snapshot.hasActiveStudio ? (snapshot.billingReady ? "Provisioned" : "Provisioning pending") : "Bootstrap first"}
                            tone={snapshot.billingReady ? "success" : "warning"}
                        />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            href={snapshot.hasActiveStudio ? "/app/worlds" : "/app/dashboard#studio-bootstrap"}
                            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                        >
                            {snapshot.hasActiveStudio ? "Open project library" : "Create workspace"}
                        </Link>
                        <OpenWorkspaceButton
                            label={snapshot.hasActiveStudio && canAccessMvp ? "Open workspace shell" : "Workspace shell unavailable"}
                            disabled={!snapshot.hasActiveStudio || !canAccessMvp}
                            variant="secondary"
                        />
                    </div>
                </div>

                <div className="grid min-w-[280px] gap-3 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Projects</p>
                        <p className="mt-3 text-2xl font-medium text-white">{snapshot.projectCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.worldLinkedCount} linked worlds under management.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Review shares</p>
                        <p className="mt-3 text-2xl font-medium text-white">{snapshot.activeReviewShareCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.totalReviewShareCount} persisted review links tracked.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Team seats</p>
                        <p className="mt-3 text-2xl font-medium text-white">{snapshot.teamSeatCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.pendingInvitationCount} invites currently in flight.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Support</p>
                        <p className="mt-3 text-2xl font-medium text-white">{snapshot.openSupportThreadCount}</p>
                        <p className="mt-1 text-sm text-neutral-400">{snapshot.supportThreadCount} support threads recorded.</p>
                    </article>
                </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
                {snapshot.domains.map((domain) => (
                    <Link
                        key={domain.id}
                        href={domain.href}
                        className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 transition-colors hover:border-white/20 hover:bg-black/30"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{domain.label}</p>
                                <p className="mt-3 text-sm font-medium text-white">{domain.summary}</p>
                            </div>
                            <StatusBadge label={domain.status} tone={getTone(domain.status)} />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-neutral-400">{domain.detail}</p>
                    </Link>
                ))}
            </div>

            <div className="mt-6 grid gap-3">
                {snapshot.actions.slice(0, 4).map((action) => (
                    <Link
                        key={action.id}
                        href={action.href}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:border-white/20 hover:bg-black/30"
                    >
                        <div>
                            <p className="text-sm font-medium text-white">{action.title}</p>
                            <p className="mt-1 text-sm text-neutral-400">{action.description}</p>
                        </div>
                        <StatusBadge label={action.status} tone={action.status === "done" ? "success" : action.status === "next" ? "warning" : "danger"} />
                    </Link>
                ))}
            </div>
        </section>
    );
}
