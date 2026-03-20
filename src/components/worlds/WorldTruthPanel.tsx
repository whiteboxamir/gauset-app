import Link from "next/link";

import { StatusBadge } from "@/components/platform/StatusBadge";

export function WorldTruthPanel({
    hasStudio,
    canAccessMvp,
    linkedWorldCount,
    activeReviewShareCount,
    projectHref = "/app/worlds",
    compact = false,
}: {
    hasStudio: boolean;
    canAccessMvp: boolean;
    linkedWorldCount: number;
    activeReviewShareCount: number;
    projectHref?: string;
    compact?: boolean;
}) {
    return (
        <section className="rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">World-link truth</p>
                    <h3 className="mt-3 text-2xl font-medium tracking-tight text-white">What this saved-world layer actually owns</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        Projects own the durable world record. Linked worlds attach real <code className="text-white">scene_id</code> values to that record so continuity memory, cast notes,
                        look development, review, and handoff stay attached to one persistent source of truth.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-400">
                        When the current account can inspect saved history, project and world-link surfaces show only what the runtime truly knows. If they cannot inspect that history, they say so
                        instead of faking production readiness.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={hasStudio ? "Project layer mounted" : "Workspace required"} tone={hasStudio ? "success" : "warning"} />
                    <StatusBadge label={canAccessMvp ? "Saved-world workspace available" : "Saved-world workspace blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    <StatusBadge
                        label={activeReviewShareCount > 0 ? `${activeReviewShareCount} live review links` : "No live review links"}
                        tone={activeReviewShareCount > 0 ? "success" : "neutral"}
                    />
                </div>
            </div>

            <div className={`mt-6 grid gap-4 ${compact ? "lg:grid-cols-1" : "xl:grid-cols-3"}`}>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Continuity memory</p>
                    <p className="mt-3 text-sm text-white">The saved world is where the world bible, cast continuity, look development, and shot direction are supposed to live.</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">That memory should reopen with the same world instead of being rebuilt from prompts or chat history.</p>
                </article>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Reopen path</p>
                    <p className="mt-3 text-sm text-white">
                        Opening a linked world carries its <code className="text-white">scene_id</code> through the project-bound workspace path.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        The world library and project pages own the front door. Reopens stay project-bound so continuity and ownership remain explicit instead of dropping into a generic shell.
                    </p>
                </article>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Operational posture</p>
                    <p className="mt-3 text-sm text-white">
                        {linkedWorldCount > 0
                            ? `${linkedWorldCount} saved worlds are already recorded in the platform layer.`
                            : "No saved worlds are recorded yet."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        This surface only reports what the current runtime and stored data actually know. It does not invent readiness, reconstruction, or delivery certainty.
                    </p>
                </article>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
                <Link
                    href={projectHref}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                >
                    Open project library
                </Link>
                {!canAccessMvp ? (
                    <span className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-neutral-500">
                        Saved-world workspace unavailable
                    </span>
                ) : null}
            </div>
        </section>
    );
}
