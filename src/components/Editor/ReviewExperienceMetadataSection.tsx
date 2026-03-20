"use client";

import React from "react";
import { MessageSquareText } from "lucide-react";

import type { SceneReviewRecord } from "@/lib/mvp-workspace";

export const ReviewExperienceMetadataSection = React.memo(function ReviewExperienceMetadataSection({
    reviewData,
}: {
    reviewData: SceneReviewRecord | null;
}) {
    if (!reviewData?.metadata) {
        return null;
    }

    const metadataRows = [
        { label: "Project", value: reviewData.metadata.project_name },
        { label: "Scene", value: reviewData.metadata.scene_title },
        { label: "Location", value: reviewData.metadata.location_name },
        { label: "Owner", value: reviewData.metadata.owner },
        { label: "Address", value: reviewData.metadata.address },
        { label: "Shoot day", value: reviewData.metadata.shoot_day },
        { label: "Permit", value: reviewData.metadata.permit_status },
        { label: "Access", value: reviewData.metadata.access_notes },
        { label: "Parking", value: reviewData.metadata.parking_notes },
        { label: "Power", value: reviewData.metadata.power_notes },
        { label: "Safety", value: reviewData.metadata.safety_notes },
    ].filter((row) => Boolean(row.value.trim()));

    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-[0.18em] mb-3">
                <MessageSquareText className="h-3 w-3" />
                Review Metadata
            </div>
            {metadataRows.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    {metadataRows.map((row) => (
                        <div key={row.label} className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{row.label}</p>
                            <p className="mt-2 text-white whitespace-pre-wrap">{row.value}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-neutral-500">No production metadata was attached to this review package.</p>
            )}
            {reviewData.metadata.notes ? <p className="mt-3 text-sm text-neutral-400 whitespace-pre-wrap">{reviewData.metadata.notes}</p> : null}
        </div>
    );
});
