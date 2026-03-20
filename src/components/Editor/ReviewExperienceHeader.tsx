"use client";

import React from "react";

import { formatReviewTimestamp } from "@/components/Editor/reviewExperienceShared";

export const ReviewExperienceHeader = React.memo(function ReviewExperienceHeader({
    sceneId,
    versionId,
    exportedAt,
    isVersionLocked,
    statusMessage,
}: {
    sceneId: string | null;
    versionId: string | null;
    exportedAt?: string | null;
    isVersionLocked: boolean;
    statusMessage: string;
}) {
    return (
        <div className="border-b border-neutral-800 bg-black/30 backdrop-blur px-6 py-4 flex items-center justify-between gap-4">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Gauset Review</p>
                <h1 className="text-xl font-semibold mt-1" data-testid="review-page-title">
                    Read-only Scene Review
                </h1>
                <p className="text-xs text-neutral-400 mt-2">{statusMessage}</p>
            </div>
            <div className="text-right text-xs text-neutral-400 space-y-1">
                <p>{isVersionLocked ? "Saved-version review package" : "Inline review package"}</p>
                <p>{sceneId ?? "inline review package"}</p>
                {versionId ? <p>{versionId}</p> : null}
                <p>{exportedAt ? `Saved ${formatReviewTimestamp(exportedAt)}` : ""}</p>
            </div>
        </div>
    );
});
