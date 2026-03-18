"use client";

import React from "react";
import { Share2 } from "lucide-react";

import { formatReviewTimestamp } from "@/components/Editor/reviewExperienceShared";
import type { ReviewPackage } from "@/lib/mvp-review";
import type { SceneReviewRecord } from "@/lib/mvp-workspace";

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
            {reviewData?.approval?.note ? <p className="mt-3 text-sm text-neutral-400">{reviewData.approval.note}</p> : null}
        </div>
    );
});
