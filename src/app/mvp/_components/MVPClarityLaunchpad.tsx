"use client";

import Link from "next/link";
import React from "react";
import { AlertTriangle, CheckCircle2, Film, History, Layers3, Loader2, PlayCircle, Sparkles } from "lucide-react";

interface MVPClarityLaunchpadProps {
    draftUpdatedAt?: string | null;
    draftSceneId?: string | null;
    hasDraft: boolean;
    launchProjectId?: string | null;
    launchSceneId?: string | null;
    launchSourceKind?: string | null;
    startWorkspaceHref?: string | null;
    linkedLaunchMessage?: string;
    linkedLaunchStatus?: "idle" | "opening" | "opened" | "unavailable";
    onOpenDemoWorld: () => void;
    onStartWorkspace: () => void;
    onResumeDraft: () => void;
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

const formatSourceLabel = (sourceKind?: string | null) => {
    switch (sourceKind) {
        case "capture_session":
            return "Capture set";
        case "external_world_package":
            return "External world";
        case "third_party_world_model_output":
            return "Third-party world";
        case "provider_generated_still":
            return "Generated still";
        case "linked_scene_version":
            return "Linked world";
        case "demo_world":
            return "Demo world";
        case "upload":
            return "Scout stills";
        default:
            return "Project source";
    }
};

export default function MVPClarityLaunchpad({
    draftUpdatedAt,
    draftSceneId,
    hasDraft,
    launchProjectId,
    launchSceneId,
    launchSourceKind,
    startWorkspaceHref = null,
    linkedLaunchMessage,
    linkedLaunchStatus = "idle",
    onOpenDemoWorld,
    onStartWorkspace,
    onResumeDraft,
}: MVPClarityLaunchpadProps) {
    const launchLocked = linkedLaunchStatus === "opening";
    const hasProjectLaunchContext = Boolean(launchProjectId || launchSourceKind);
    const sourceLabel = formatSourceLabel(launchSourceKind);
    const primaryActionLabel = hasProjectLaunchContext ? "Continue to world start" : "Open demo world";
    const primaryAction = hasProjectLaunchContext ? onStartWorkspace : onOpenDemoWorld;
    const canResumeDraft = hasDraft && !hasProjectLaunchContext;

    return (
        <div className="relative flex min-h-screen w-full overflow-x-hidden overflow-y-auto bg-[#101418] text-white supports-[min-height:100dvh]:min-h-dvh">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(191,214,222,0.16),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(220,195,161,0.12),transparent_22%),linear-gradient(180deg,#151b22_0%,#101418_100%)]" />

            <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8 lg:min-h-dvh lg:flex-row lg:items-stretch lg:px-10 lg:py-10">
                <div className="flex flex-1 flex-col justify-between rounded-[36px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(22,28,34,0.94),rgba(16,20,24,0.92))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full border border-[#bfd6de]/30 bg-[#bfd6de]/12 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#deedf1]">
                                World-first start
                            </span>
                        </div>
                        <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-[#bfd6de]/70">Start with the world</p>
                        <h1 className="mt-4 max-w-4xl text-[3rem] font-medium leading-[0.92] tracking-[-0.06em] text-white md:text-[4.4rem]">
                            {hasProjectLaunchContext ? "Build one project world." : "Build one world."}
                            <br />
                            Save it once. Then direct it.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-7 text-[#d3ccc2] md:text-lg">
                            {hasProjectLaunchContext
                                ? `${sourceLabel} is already attached to this project. Build the world first, then unlock saved versions, review, and handoff from that same record.`
                                : "Open the demo or a saved draft to inspect the same world-first path."}
                        </p>

                        {launchSceneId ? (
                            <div
                                className={`mt-6 rounded-[28px] border p-5 ${
                                    linkedLaunchStatus === "unavailable"
                                        ? "border-[#d9bfc7]/35 bg-[#d9bfc7]/10"
                                        : "border-[#bfd6de]/25 bg-[#bfd6de]/10"
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
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#ddd5cb]">Project-linked launch</p>
                                        <p className="mt-2 text-sm font-medium text-white">
                                            {linkedLaunchStatus === "opening"
                                                ? `Opening ${launchSceneId}`
                                                : linkedLaunchStatus === "unavailable"
                                                  ? `Could not reopen ${launchSceneId}`
                                                  : `Ready to continue ${launchSceneId}`}
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-[#d3ccc2]">
                                            {linkedLaunchMessage ||
                                                "Project launches reopen the same world so versions, review, and handoff stay attached."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            {hasProjectLaunchContext && startWorkspaceHref && !launchLocked ? (
                                <Link
                                    href={startWorkspaceHref}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4efe8] px-6 py-3 text-sm font-medium text-[#101418] transition-colors hover:bg-[#ebe3d8]"
                                >
                                    <PlayCircle className="h-4 w-4" />
                                    {primaryActionLabel}
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    onClick={primaryAction}
                                    disabled={launchLocked}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4efe8] px-6 py-3 text-sm font-medium text-[#101418] transition-colors hover:bg-[#ebe3d8] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <PlayCircle className="h-4 w-4" />
                                    {primaryActionLabel}
                                </button>
                            )}
                            {canResumeDraft ? (
                                <button
                                    type="button"
                                    onClick={onResumeDraft}
                                    disabled={launchLocked}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#bfd6de]/30 bg-[#bfd6de]/12 px-6 py-3 text-sm font-medium text-[#deedf1] transition-colors hover:bg-[#bfd6de]/16 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <History className="h-4 w-4" />
                                    Resume local draft
                                    {draftSceneId ? ` · ${draftSceneId}` : draftUpdatedAt ? ` · ${formatTimestamp(draftUpdatedAt)}` : ""}
                                </button>
                            ) : null}
                        </div>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#9d978f]">
                            {hasProjectLaunchContext ? "Project identity stays attached as you move into the workspace." : "Draft recovery stays local until a project-bound world exists."}
                        </p>
                    </div>

                    <div className="mt-8 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[24px] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#9d978f]">
                                <Layers3 className="h-4 w-4 text-[#bfd6de]" />
                                1. Start
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">
                                {hasProjectLaunchContext ? `${sourceLabel} stays attached to the same project world.` : "Open the demo or a saved draft from the same rails."}
                            </p>
                        </div>
                        <div className="rounded-[24px] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#9d978f]">
                                <Film className="h-4 w-4 text-[#dcc3a1]" />
                                2. Save
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">Anchor the world once so review, reopen, and handoff point at the same record.</p>
                        </div>
                        <div className="rounded-[24px] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.035)] p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#9d978f]">
                                <Sparkles className="h-4 w-4 text-[#c7d7c8]" />
                                3. Direct
                            </div>
                            <p className="mt-3 text-sm font-medium text-white">Richer direction, review, and handoff unlock after the first save.</p>
                        </div>
                    </div>
                </div>

                <div className="flex w-full max-w-[32rem] flex-col gap-4 lg:flex-[0_0_32rem]">
                    <div className="overflow-hidden rounded-[36px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(22,28,34,0.92),rgba(16,20,24,0.9))] shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
                        <div
                            className="relative aspect-[16/10] w-full bg-cover bg-center"
                            style={{ backgroundImage: "url(/images/hero/interior_daylight.png)" }}
                        >
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,11,0.08)_0%,rgba(4,7,11,0.18)_48%,rgba(4,7,11,0.9)_100%)]" />
                            <div className="absolute inset-x-0 bottom-0 p-6">
                                <div className="inline-flex rounded-full border border-[var(--border-soft)] bg-[rgba(16,20,24,0.45)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#ddd5cb] backdrop-blur-md">
                                    {hasProjectLaunchContext ? sourceLabel : "Demo world"}
                                </div>
                                <p className="mt-4 text-2xl font-medium text-white">
                                    {hasProjectLaunchContext ? "Project-led first world" : "Neighborhood cafe interior"}
                                </p>
                                <p className="mt-3 max-w-md text-sm leading-6 text-[#ebe4da]/82">
                                    {hasProjectLaunchContext
                                        ? "The same focused shell stays in front, with the source path already attached."
                                        : "Use the demo for the quickest tour of the world-first workflow."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[30px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(22,28,34,0.9),rgba(16,20,24,0.86))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#9d978f]">What stays fixed</p>
                        <div className="mt-4 rounded-[24px] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-5 py-5">
                            <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-start">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#c7d7c8]/80">Persistent world state</p>
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
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#bfd6de]/80">Per-scene direction</p>
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

                    <div className="rounded-[28px] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] p-5 text-sm leading-6 text-[#d3ccc2]">
                        The shell starts simple. Richer controls appear only after the world is saved.
                    </div>
                </div>
            </div>
        </div>
    );
}
