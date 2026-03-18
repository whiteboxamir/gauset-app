"use client";

import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Film, History, Layers3, Loader2, PlayCircle, Sparkles } from "lucide-react";

interface MVPClarityLaunchpadProps {
    draftUpdatedAt?: string | null;
    draftSceneId?: string | null;
    hasDraft: boolean;
    launchSceneId?: string | null;
    linkedLaunchMessage?: string;
    linkedLaunchStatus?: "idle" | "opening" | "opened" | "unavailable";
    onOpenDemoWorld: () => void;
    onResumeDraft: () => void;
    onStartBlank: () => void;
}

const formatTimestamp = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
};

export default function MVPClarityLaunchpad({
    draftUpdatedAt,
    draftSceneId,
    hasDraft,
    launchSceneId,
    linkedLaunchMessage,
    linkedLaunchStatus = "idle",
    onOpenDemoWorld,
    onResumeDraft,
    onStartBlank,
}: MVPClarityLaunchpadProps) {
    const launchLocked = linkedLaunchStatus === "opening";

    return (
        <div className="relative flex min-h-screen w-screen overflow-x-hidden overflow-y-auto bg-[#05070a] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(251,191,36,0.14),transparent_22%),linear-gradient(180deg,#071018_0%,#040507_100%)]" />

            <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8 lg:min-h-screen lg:flex-row lg:items-stretch lg:px-10 lg:py-10">
                <div className="flex flex-1 flex-col justify-between rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,21,0.94),rgba(7,10,14,0.9))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl lg:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                                Creator preview
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                                Try the workflow
                            </span>
                        </div>
                        <p className="mt-8 text-[11px] uppercase tracking-[0.28em] text-cyan-200/65">One image in. World out.</p>
                        <h1 className="mt-4 max-w-4xl text-[3rem] font-medium leading-[0.92] tracking-[-0.06em] text-white md:text-[4.4rem]">
                            Bring one image.
                            <br />
                            Get a world. Direct the shot.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-300 md:text-lg">
                            Start with the demo or your own still. Gauset gives you a world you can revisit, reframe, and export
                            without rebuilding it from scratch.
                        </p>

                        {launchSceneId ? (
                            <div
                                className={`mt-6 rounded-[28px] border p-5 ${
                                    linkedLaunchStatus === "unavailable"
                                        ? "border-rose-400/25 bg-rose-500/10"
                                        : "border-cyan-300/15 bg-cyan-400/10"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                                        {linkedLaunchStatus === "opening" ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-cyan-100" />
                                        ) : linkedLaunchStatus === "unavailable" ? (
                                            <AlertTriangle className="h-4 w-4 text-rose-100" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 text-cyan-100" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-300">Project-linked launch</p>
                                        <p className="mt-2 text-sm font-medium text-white">
                                            {linkedLaunchStatus === "opening"
                                                ? `Opening ${launchSceneId}`
                                                : linkedLaunchStatus === "unavailable"
                                                  ? `Could not reopen ${launchSceneId}`
                                                  : `Ready to continue ${launchSceneId}`}
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-300">
                                            {linkedLaunchMessage ||
                                                "Project launches reopen the saved world first, then keep versions and review anchors attached to the linked scene."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={onOpenDemoWorld}
                                disabled={launchLocked}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <PlayCircle className="h-4 w-4" />
                                Open demo world
                            </button>
                            <button
                                type="button"
                                onClick={onStartBlank}
                                disabled={launchLocked}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Start blank workspace
                                <ArrowRight className="h-4 w-4" />
                            </button>
                            {hasDraft ? (
                                <button
                                    type="button"
                                    onClick={onResumeDraft}
                                    disabled={launchLocked}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-6 py-3 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <History className="h-4 w-4" />
                                    Resume local draft
                                    {draftSceneId ? ` · ${draftSceneId}` : draftUpdatedAt ? ` · ${formatTimestamp(draftUpdatedAt)}` : ""}
                                </button>
                            ) : null}
                        </div>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-500">
                            Local draft recovery stays browser-scoped. Project-linked launches reopen saved world history or stored artifacts without pretending that live reconstruction or premium WebGL2 are guaranteed on this host.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                <Layers3 className="h-4 w-4 text-cyan-300" />
                                1. Bring one image
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">Open the demo or bring your own still to start a world in seconds.</p>
                        </div>
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                <Film className="h-4 w-4 text-amber-200" />
                                2. Direct the shot
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">Keep the world fixed while you change views, notes, and framing.</p>
                        </div>
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                <Sparkles className="h-4 w-4 text-emerald-300" />
                                3. Save and share
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">Keep versions, review what changed, and export a handoff package.</p>
                        </div>
                    </div>
                </div>

                <div className="flex w-full max-w-[32rem] flex-col gap-4 lg:flex-[0_0_32rem]">
                    <div className="overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,24,0.96),rgba(7,10,14,0.92))] shadow-[0_30px_90px_rgba(0,0,0,0.4)]">
                        <div
                            className="relative aspect-[16/10] w-full bg-cover bg-center"
                            style={{ backgroundImage: "url(/images/hero/interior_daylight.png)" }}
                        >
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,11,0.08)_0%,rgba(4,7,11,0.18)_48%,rgba(4,7,11,0.9)_100%)]" />
                            <div className="absolute inset-x-0 bottom-0 p-6">
                                <div className="inline-flex rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-300 backdrop-blur-md">
                                    Demo world
                                </div>
                                <p className="mt-4 text-2xl font-medium text-white">Neighborhood cafe interior</p>
                                <p className="mt-3 max-w-md text-sm leading-6 text-neutral-200/82">
                                    Start here if you want the fastest tour: one world stays fixed while you try different shots inside it.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,24,0.92),rgba(7,10,14,0.88))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">What stays fixed vs what changes</p>
                        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 px-5 py-5">
                            <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-start">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/75">Persistent world state</p>
                                    <div className="mt-3 space-y-2 text-sm text-white">
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                            Room layout
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                            Props and placement
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                            World identity
                                        </p>
                                    </div>
                                </div>

                                <div className="hidden h-full min-h-24 w-px bg-white/10 md:block" />
                                <div className="h-px bg-white/10 md:hidden" />

                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/75">Per-scene direction</p>
                                    <div className="mt-3 space-y-2 text-sm text-white">
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />
                                            Shot note
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />
                                            Blocking choices
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />
                                            Exported version
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-neutral-300">
                        This guided preview stays separate from the main `/mvp` workspace while we validate the first-run experience and the truthful return-to-world path.
                    </div>
                </div>
            </div>
        </div>
    );
}
