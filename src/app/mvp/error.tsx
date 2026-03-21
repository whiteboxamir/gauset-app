"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function MVPError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_24%),linear-gradient(180deg,#05070a_0%,#040507_100%)] px-6 py-10 text-white">
            <div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
                <div className="w-full rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,21,0.96),rgba(7,10,14,0.92))] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.26em] text-cyan-200/70">
                        <AlertTriangle className="h-4 w-4" />
                        Persistent world workspace
                    </div>
                    <h1 className="mt-6 text-3xl font-medium tracking-[-0.04em] text-white">Failed to load world record</h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-300">
                        The workspace hit an error before the saved-world surface could finish mounting. The route has not changed product truth: viewer certification stays host-specific, and reconstruction remains whatever the backend actually reports.
                    </p>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-400">
                        {error.message || "Unknown MVP render failure."}
                    </div>
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Safe retry</p>
                            <p className="mt-2 text-sm text-white">Retrying remounts only the workspace shell. It does not fabricate backend availability or viewer proof.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">What persists</p>
                            <p className="mt-2 text-sm text-white">Saved versions, local draft recovery, and review state remain attached to their real scene ids.</p>
                        </div>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={reset}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
                        >
                            <RefreshCcw className="h-4 w-4" />
                            Retry world record
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
