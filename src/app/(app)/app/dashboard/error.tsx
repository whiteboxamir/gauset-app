"use client";

import { AlertTriangle } from "lucide-react";

export default function DashboardError({
    reset,
}: {
    reset: () => void;
}) {
    return (
        <section className="rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-rose-200/80">
                <AlertTriangle className="h-4 w-4" />
                Dashboard error
            </div>
            <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">The project workspace surface could not be loaded.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-rose-100/90">
                This page only reports real project, world-link, and review-share truth. If a dependency failed, retry instead of assuming the workspace is healthy.
            </p>
            <div className="mt-5 rounded-[1.4rem] border border-rose-300/15 bg-black/20 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-rose-100/70">What did not change</p>
                <p className="mt-2 text-sm leading-6 text-rose-50/90">
                    The failure does not mean the workspace, linked worlds, or review shares disappeared. It only means this dashboard could not confirm them right now.
                </p>
            </div>
            <button
                type="button"
                onClick={reset}
                className="mt-6 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
            >
                Retry dashboard
            </button>
        </section>
    );
}
