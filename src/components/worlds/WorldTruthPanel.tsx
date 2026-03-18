import Link from "next/link";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";

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
                    <h3 className="mt-3 text-2xl font-medium tracking-tight text-white">What this layer is actually responsible for</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        Projects own the durable account-layer record. Linked worlds attach real <code className="text-white">scene_id</code> values to that record. Secure
                        review shares stay signed, persisted, and revocable without broadening anonymous MVP access.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-400">
                        When the current account can inspect saved MVP history, project and world-link surfaces now show source, lane, and delivery posture directly. If they cannot inspect
                        that history, they say so instead of implying reconstruction or production readiness.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={hasStudio ? "Workspace mounted" : "Workspace required"} tone={hasStudio ? "success" : "warning"} />
                    <StatusBadge label={canAccessMvp ? "Workspace shell available" : "Workspace shell blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    <StatusBadge
                        label={activeReviewShareCount > 0 ? `${activeReviewShareCount} live review links` : "No live review links"}
                        tone={activeReviewShareCount > 0 ? "success" : "neutral"}
                    />
                </div>
            </div>

            <div className={`mt-6 grid gap-4 ${compact ? "lg:grid-cols-1" : "xl:grid-cols-3"}`}>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Ownership</p>
                    <p className="mt-3 text-sm text-white">A scene can only be linked once across project ownership without reusing the existing project.</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">The project layer now rejects manual links that would bypass existing scene ownership.</p>
                </article>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Launch path</p>
                    <p className="mt-3 text-sm text-white">
                        Opening a linked world now carries its <code className="text-white">scene_id</code> into the authenticated <code className="text-white">/mvp</code> shell.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Plain <code className="text-white">/mvp</code> still opens the general workspace entry, while project and world surfaces reopen the owned world directly and only
                        record reopen activity for scenes the project already owns.
                    </p>
                </article>
                <article className="rounded-[1.45rem] border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Operational posture</p>
                    <p className="mt-3 text-sm text-white">
                        {linkedWorldCount > 0
                            ? `${linkedWorldCount} linked worlds are already recorded in the platform layer.`
                            : "No linked worlds are recorded yet."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Authenticated staging proof still depends on real env and fixture inputs. This surface only reports what the current runtime and stored data actually know.
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
                <OpenWorkspaceButton
                    label={canAccessMvp ? "Open workspace shell" : "Workspace shell unavailable"}
                    disabled={!canAccessMvp}
                    variant="secondary"
                />
            </div>
        </section>
    );
}
