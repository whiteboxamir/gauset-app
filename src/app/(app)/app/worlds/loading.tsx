import { Loader2 } from "lucide-react";

export default function WorldsLoading() {
    return (
        <div className="space-y-6">
            <section className="rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
                <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    World record library
                </div>
                <h1 className="mt-5 text-3xl font-medium tracking-tight text-white">Loading project-bound world records</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
                    Rebuilding the project library, saved-world anchors, and review posture so the same filmmaking record reopens with continuity intact.
                </p>
            </section>
            <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr] animate-pulse">
                <section className="h-80 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
                <section className="h-80 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr] animate-pulse">
                <section className="h-[36rem] rounded-[2rem] border border-white/10 bg-white/[0.04]" />
                <section className="h-[36rem] rounded-[2rem] border border-white/10 bg-white/[0.04]" />
            </div>
        </div>
    );
}
