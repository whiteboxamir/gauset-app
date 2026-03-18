import { Loader2 } from "lucide-react";

export default function ProjectHomeLoading() {
    return (
        <div className="space-y-6">
            <section className="rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
                <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Project home
                </div>
                <h1 className="mt-5 text-3xl font-medium tracking-tight text-white">Restoring project continuity</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
                    Loading linked worlds, saved review-share history, and the real launch path for this project without assuming viewer or reconstruction capability.
                </p>
            </section>
            <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr] animate-pulse">
                <section className="h-72 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
                <section className="h-72 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr] animate-pulse">
                <section className="h-[40rem] rounded-[2rem] border border-white/10 bg-white/[0.04]" />
                <section className="h-[40rem] rounded-[2rem] border border-white/10 bg-white/[0.04]" />
            </div>
        </div>
    );
}
