"use client";

import React from "react";
import { Share2 } from "lucide-react";

import { formatReviewTimestamp } from "@/components/Editor/reviewExperienceShared";
import type { ReviewPackage } from "@/lib/mvp-review";
import type { SceneReviewRecord } from "@/lib/mvp-workspace";

function humanizeToken(value: string) {
    return value.replaceAll("_", " ").trim();
}

function formatTruthLabel(value: string | null | undefined, fallback: string) {
    return value ? humanizeToken(value) : fallback;
}

function getTruthTone(value: string | null | undefined) {
    if (!value) {
        return "border-neutral-800 bg-neutral-950/60 text-neutral-300";
    }
    if (value.includes("blocked") || value.includes("preview") || value.includes("review_only")) {
        return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    }
    if (value.includes("ready")) {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    }
    return "border-sky-500/30 bg-sky-500/10 text-sky-100";
}

export const ReviewExperienceSummarySection = React.memo(function ReviewExperienceSummarySection({
    reviewPackage,
    reviewData,
    sceneId,
    versionId,
}: {
    reviewPackage: ReviewPackage | null;
    reviewData: SceneReviewRecord | null;
    sceneId: string | null;
    versionId: string | null;
}) {
    const isVersionLocked = Boolean(versionId);
    const truthSummary = reviewPackage?.truthSummary ?? null;
    const blockers = truthSummary?.blockers ?? [];

    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-[0.18em] mb-3">
                <Share2 className="h-3 w-3" />
                Summary
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Delivery mode</p>
                    <p className="mt-2 text-white">{isVersionLocked ? "Saved-version package" : "Inline review package"}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {isVersionLocked
                            ? "This review stays pinned to a saved scene version."
                            : "This package was shared without a saved version, so it reflects the exported payload only."}
                    </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Scene anchor</p>
                    <p className="mt-2 text-white">{sceneId ?? "inline package"}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{versionId ? `Version ${versionId}` : "No saved version id attached"}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Scene contents</p>
                    <p className="mt-2 text-white">{reviewPackage?.summary.assetCount ?? 0} assets in scene</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {reviewPackage?.summary.hasEnvironment ? "Environment included" : "No environment in this package"}
                    </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Approval state</p>
                    <p className="mt-2 text-white">{reviewData?.approval?.state ? reviewData.approval.state.replaceAll("_", " ") : "Draft"}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {reviewData?.approval?.updated_by
                            ? `Review owner ${reviewData.approval.updated_by}${reviewData.approval.updated_at ? ` · ${formatReviewTimestamp(reviewData.approval.updated_at)}` : ""}`
                            : "No explicit reviewer recorded yet."}
                    </p>
                </div>
            </div>
            {truthSummary ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Lane truth</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {truthSummary.lane ? (
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getTruthTone(truthSummary.lane)}`}>
                                    {humanizeToken(truthSummary.lane)}
                                </span>
                            ) : null}
                            {truthSummary.truthLabel ? (
                                <span className="rounded-full border border-neutral-700 bg-neutral-900/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-200">
                                    {truthSummary.truthLabel}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-white">{truthSummary.sourceLabel ?? formatTruthLabel(truthSummary.lane, "No lane source recorded")}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {truthSummary.ingestRecordId
                                ? `Ingest record ${truthSummary.ingestRecordId}`
                                : "This recipient route is reading saved world truth from the shared review package."}
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Delivery posture</p>
                        <div className="mt-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getTruthTone(truthSummary.deliveryStatus)}`}>
                                {formatTruthLabel(truthSummary.deliveryStatus, "Not recorded")}
                            </span>
                        </div>
                        <p className="mt-2 text-white">
                            {truthSummary.latestVersionId ? `Saved anchor ${truthSummary.latestVersionId}` : "This review package is not version-locked."}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {truthSummary.deliveryStatus
                                ? `Recorded delivery posture: ${humanizeToken(truthSummary.deliveryStatus)}.`
                                : "No persisted delivery posture was attached to this package."}
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Blockers</p>
                        <p className="mt-2 text-white">
                            {blockers.length > 0 ? blockers.map(humanizeToken).join(", ") : "No blockers recorded"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {blockers.length > 0
                                ? "Recipient review reflects the recorded blockers above."
                                : "No blocker flags are attached to the saved truth summary for this package."}
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Downstream target</p>
                        <p className="mt-2 text-white">{truthSummary.downstreamTargetLabel ?? "No downstream target recorded"}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {truthSummary.downstreamTargetSummary ?? "No persisted downstream summary was attached to this review package."}
                        </p>
                        <p className="mt-2 text-[11px] leading-5 text-neutral-500">
                            This route reports the recorded delivery posture only. It does not create or reroute handoff.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">World truth</p>
                    <p className="mt-2 text-white">Saved truth metadata is not available for this review package.</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                        This recipient route can still open the package, but lane, delivery, blockers, and downstream posture were not attached.
                    </p>
                </div>
            )}
            {reviewData?.approval?.note ? <p className="mt-3 text-sm text-neutral-400">{reviewData.approval.note}</p> : null}
        </div>
    );
});
