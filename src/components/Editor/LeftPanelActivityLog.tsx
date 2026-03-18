"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import type { MvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";

import { editorEyebrowClassName, editorSectionClassName } from "./editorChrome";
import { formatJobTime, resolveJobTypeLabel } from "./leftPanelShared";

type LeftPanelActivityLogProps = Pick<MvpWorkspaceIntakeController, "jobs">;

export function LeftPanelActivityLog({ jobs }: LeftPanelActivityLogProps) {
    return (
        <div className={`mt-6 ${editorSectionClassName}`}>
            <div className={`mb-3 flex items-center gap-2 ${editorEyebrowClassName}`}>
                <Clock3 className="h-3 w-3" />
                Activity Log
            </div>
            {jobs.length > 0 ? (
                <div className="space-y-2">
                    {jobs.map((job) => (
                        <div key={job.id} className="rounded-xl border border-white/8 bg-black/10 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs text-white truncate">
                                        {resolveJobTypeLabel(job.type)} · {job.label}
                                    </p>
                                    <p className="text-[11px] text-neutral-500 font-mono truncate">{job.id}</p>
                                </div>
                                <div className="shrink-0">
                                    {job.status === "processing" ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                                    ) : job.status === "completed" ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-rose-300" />
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                                <span>{job.status}</span>
                                <span>{formatJobTime(job.updatedAt)}</span>
                            </div>
                            {job.error ? <p className="mt-2 text-[11px] text-rose-300 whitespace-pre-wrap">{job.error}</p> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-neutral-400">
                    Generated stills, world builds, reconstructions, and asset jobs appear here with a step-by-step status trail.
                </p>
            )}
        </div>
    );
}
