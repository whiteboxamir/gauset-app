"use client";

import { ArrowRight, Loader2, Upload } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";
import { formatUploadBytes } from "@/lib/mvp-upload";

type LeftPanelImportSectionProps = Pick<
    MvpWorkspaceIntakeController,
    | "backendMode"
    | "backendWritesDisabled"
    | "backendWritesDisabledMessage"
    | "isUploading"
    | "uploadQueue"
    | "uploadQueueSummary"
    | "directUploadAvailable"
    | "directUploadTransport"
    | "directUploadMaximumSizeInBytes"
    | "legacyProxyMaximumSizeInBytes"
    | "reconstructionAvailable"
    | "triggerFilePicker"
>;

function phaseLabel(phase: LeftPanelImportSectionProps["uploadQueue"][number]["phase"]) {
    switch (phase) {
        case "queued":
            return "Queued";
        case "uploading":
            return "Uploading";
        case "registering":
            return "Registering";
        case "complete":
            return "Ready";
        case "error":
            return "Needs attention";
        default:
            return "Queued";
    }
}

export function LeftPanelImportSection({
    backendMode,
    backendWritesDisabled,
    backendWritesDisabledMessage,
    isUploading,
    uploadQueue,
    uploadQueueSummary,
    directUploadAvailable,
    directUploadTransport,
    directUploadMaximumSizeInBytes,
    legacyProxyMaximumSizeInBytes,
    reconstructionAvailable,
    triggerFilePicker,
}: LeftPanelImportSectionProps) {
    const uploadTransportLabel =
        uploadQueueSummary.activeTransport === "legacy"
            ? "secure intake proxy"
            : uploadQueueSummary.activeTransport === "backend"
              ? "direct backend intake"
              : "durable intake";
    const uploadTransportDetail =
        uploadQueueSummary.activeTransport === "legacy"
            ? "This deployment is using the workspace proxy fallback while a larger direct upload path is unavailable."
            : uploadQueueSummary.activeTransport === "backend"
              ? "This workspace is sending stills straight to the backend intake instead of proxying them through the app."
              : "This workspace is sending stills to durable storage before intake registration.";
    const intakeDescription =
        backendMode === "offline"
            ? "Reconnect the local backend first so this workspace can intake stills and build scenes."
            : backendWritesDisabled
              ? backendWritesDisabledMessage
              : directUploadAvailable === false
                ? "Single-frame preview and asset work are available here while larger direct upload is unavailable."
                : directUploadTransport === "backend"
                  ? "Use one frame for preview or asset work, or drop in a small orbit set. Larger stills can upload straight to the backend here."
                : reconstructionAvailable
                  ? "Use one frame for preview or asset work, or drop in a small orbit set for reconstruction."
                  : "Use one frame for preview or asset work, or prepare an orbit set while reconstruction comes online.";

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
                        {intakeDescription}
                    </p>
                    {backendMode !== "offline" && !backendWritesDisabled && directUploadAvailable && directUploadTransport === "backend" ? (
                        <p className="mt-2 text-xs leading-5 text-sky-100/75">
                            Direct backend intake is available here for stills up to {formatUploadBytes(directUploadMaximumSizeInBytes)}.
                        </p>
                    ) : null}
                    {backendMode !== "offline" && !backendWritesDisabled && directUploadAvailable === false ? (
                        <p className="mt-2 text-xs leading-5 text-amber-200/90" data-testid="mvp-upload-cap-warning">
                            Fallback proxy only. Stills above {formatUploadBytes(legacyProxyMaximumSizeInBytes)} stay blocked until a larger direct upload path is available.
                        </p>
                    ) : null}
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
                        <p className="text-[11px] text-sky-100">
                            {uploadQueueSummary.completedCount > 0
                                ? `${uploadQueueSummary.completedCount} of ${uploadQueueSummary.totalCount} ready`
                                : `Routing stills into ${uploadTransportLabel}`}
                        </p>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-sky-100/90">
                        {uploadQueueSummary.activeFileName
                            ? `${uploadQueueSummary.activeFileName} is moving through ${uploadTransportLabel} now.`
                            : uploadTransportDetail}
                    </p>
                    <div className="mt-3 space-y-2.5">
                        {uploadQueue.slice(0, 3).map((item) => (
                            <div key={item.id} className="rounded-[0.95rem] border border-white/8 bg-black/20 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-[11px] font-medium text-white">{item.fileName}</p>
                                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-100/75">
                                            {phaseLabel(item.phase)}{item.errorMessage ? ` · ${item.errorMessage}` : ""}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-[10px] text-sky-100/75">
                                        {item.progressPercent > 0 ? `${Math.round(item.progressPercent)}%` : formatUploadBytes(item.sizeBytes)}
                                    </p>
                                </div>
                                <div className="mt-2 overflow-hidden rounded-full bg-white/[0.08]">
                                    <div
                                        className={`h-1.5 rounded-full transition-[width] duration-200 ${
                                            item.phase === "error" ? "bg-rose-300/80" : item.phase === "complete" ? "bg-emerald-300/80" : "bg-sky-300/80"
                                        }`}
                                        style={{ width: `${Math.max(item.progressPercent, item.phase === "complete" ? 100 : 6)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
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
