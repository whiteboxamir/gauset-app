"use client";

import { ArrowRight, Loader2, Upload } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";

type LeftPanelImportSectionProps = Pick<
    MvpWorkspaceIntakeController,
    | "backendMode"
    | "backendWritesDisabled"
    | "backendWritesDisabledMessage"
    | "isUploading"
    | "reconstructionAvailable"
    | "triggerFilePicker"
>;

export function LeftPanelImportSection({
    backendMode,
    backendWritesDisabled,
    backendWritesDisabledMessage,
    isUploading,
    reconstructionAvailable,
    triggerFilePicker,
}: LeftPanelImportSectionProps) {
    return (
        <div
            className={`mb-5 rounded-[24px] border p-5 transition-all group shadow-[0_16px_36px_rgba(0,0,0,0.2)] ${
                backendMode === "offline" || backendWritesDisabled
                    ? "border-white/10 bg-black/30 cursor-not-allowed opacity-75"
                    : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] hover:border-sky-400/35 hover:bg-white/[0.05] cursor-pointer"
            }`}
            onClick={triggerFilePicker}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Scene intake</p>
                    <p className="mt-3 text-xl font-medium tracking-tight text-white group-hover:text-sky-100">
                        {backendMode === "offline"
                            ? "Reconnect local services"
                            : backendWritesDisabled
                              ? "Uploads safety-disabled"
                              : isUploading
                                ? "Importing scout stills"
                                : "Bring in scout stills"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        {backendMode === "offline"
                            ? "Reconnect the local backend first so this workspace can intake stills and build scenes."
                            : backendWritesDisabled
                              ? backendWritesDisabledMessage
                              : reconstructionAvailable
                                ? "Use one frame for preview or asset work, or drop in a small orbit set for reconstruction."
                                : "Use one frame for preview or asset work, or prepare an orbit set while reconstruction comes online."}
                    </p>
                </div>
                {isUploading ? (
                    <Loader2 className="h-8 w-8 shrink-0 animate-spin text-sky-400" />
                ) : (
                    <Upload className="h-8 w-8 shrink-0 text-neutral-500 transition-colors group-hover:text-sky-300" />
                )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">JPG / PNG / WEBP</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Single still or orbit set</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">QC + lane routing</span>
            </div>

            {isUploading ? (
                <div className="mt-4 rounded-[1rem] border border-sky-400/20 bg-sky-500/8 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-sky-100/80">Upload in progress</p>
                        <p className="text-[11px] text-sky-100">Importing scout stills into the world record intake tray.</p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-300/70" />
                    </div>
                </div>
            ) : null}

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-neutral-200">
                {backendMode === "offline" ? "Backend required" : backendWritesDisabled ? "Uploads disabled" : "Import scout stills"}
                <ArrowRight className="h-3.5 w-3.5" />
            </div>
        </div>
    );
}
