import Link from "next/link";

import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

import { compareReleaseReadinessStates, formatReleaseReadinessLabel, getReleaseReadinessTone } from "@/components/platform/release-readiness";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function ReleaseReadinessPanel({
    snapshot,
    eyebrow,
    title,
    maxGates = 6,
}: {
    snapshot: ReleaseReadinessSnapshot;
    eyebrow: string;
    title: string;
    maxGates?: number;
}) {
    const gates = snapshot.gates.slice().sort((left, right) => compareReleaseReadinessStates(left.state, right.state)).slice(0, maxGates);

    return (
        <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">{title}</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">{snapshot.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={formatReleaseReadinessLabel(snapshot.state)} tone={getReleaseReadinessTone(snapshot.state)} />
                    <StatusBadge label={`${snapshot.blockedGateCount} blocked`} tone={snapshot.blockedGateCount > 0 ? "danger" : "neutral"} />
                    <StatusBadge label={`${snapshot.atRiskGateCount} at risk`} tone={snapshot.atRiskGateCount > 0 ? "warning" : "neutral"} />
                </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {snapshot.capabilities.map((capability) => (
                    <article key={capability.capability} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{capability.capability}</p>
                            <StatusBadge label={formatReleaseReadinessLabel(capability.state)} tone={getReleaseReadinessTone(capability.state)} />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-neutral-300">{capability.summary}</p>
                    </article>
                ))}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {gates.map((gate) => (
                    <Link
                        key={gate.gateKey}
                        href={gate.href}
                        className="rounded-[1.45rem] border border-white/10 bg-black/20 p-4 transition-colors hover:border-white/20 hover:bg-black/30"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{gate.title}</p>
                                <p className="mt-3 text-sm font-medium text-white">{gate.summary}</p>
                            </div>
                            <StatusBadge label={formatReleaseReadinessLabel(gate.state)} tone={getReleaseReadinessTone(gate.state)} />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-neutral-400">{gate.detail}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                            <span>{gate.ownerLabel}</span>
                            <span className="text-neutral-700">/</span>
                            <span>{gate.routeLabel}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
