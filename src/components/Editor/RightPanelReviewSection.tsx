"use client";

import React from "react";
import { MapPinned, NotebookPen } from "lucide-react";

import type { MvpWorkspaceReviewController } from "@/app/mvp/_hooks/useMvpWorkspaceReviewController";

import {
    editorEyebrowClassName,
    editorFieldClassName,
    editorGhostButtonClassName,
    editorPrimaryButtonClassName,
    editorSectionClassName,
    editorSectionMutedClassName,
    editorTextareaClassName,
} from "./editorChrome";
import { formatTimestamp } from "./rightPanelShared";

type RightPanelReviewSectionProps = Pick<
    MvpWorkspaceReviewController,
    | "isSavingReview"
    | "reviewData"
    | "reviewError"
    | "reviewStatus"
    | "saveReview"
    | "updateApprovalNote"
    | "updateReviewField"
> & {
    activeScene: string | null;
};

export const RightPanelReviewSection = React.memo(function RightPanelReviewSection({
    activeScene,
    isSavingReview,
    reviewData,
    reviewError,
    reviewStatus,
    saveReview,
    updateApprovalNote,
    updateReviewField,
}: RightPanelReviewSectionProps) {
    return (
        <div className={`${editorSectionClassName} space-y-3`}>
            <div className={`flex items-center gap-2 ${editorEyebrowClassName}`}>
                <NotebookPen className="h-3 w-3" />
                Production Review
            </div>
            <p className="text-[11px] leading-5 text-neutral-400">
                This metadata stays attached to the active scene. External review links and exported packages use the selected saved version from the continuity section above when one exists.
            </p>
            {activeScene ? (
                <>
                    <input
                        value={reviewData.metadata.project_name}
                        onChange={(event) => updateReviewField("project_name", event.target.value)}
                        className={editorFieldClassName}
                        placeholder="Project name"
                    />
                    <input
                        value={reviewData.metadata.scene_title}
                        onChange={(event) => updateReviewField("scene_title", event.target.value)}
                        className={editorFieldClassName}
                        placeholder="Scene title"
                    />
                    <div className="grid grid-cols-1 gap-2">
                        <input
                            value={reviewData.metadata.location_name}
                            onChange={(event) => updateReviewField("location_name", event.target.value)}
                            className={editorFieldClassName}
                            placeholder="Location"
                        />
                        <input
                            value={reviewData.metadata.owner}
                            onChange={(event) => updateReviewField("owner", event.target.value)}
                            className={editorFieldClassName}
                            placeholder="Owner"
                        />
                    </div>
                    <input
                        value={reviewData.metadata.address}
                        onChange={(event) => updateReviewField("address", event.target.value)}
                        className={editorFieldClassName}
                        placeholder="Address"
                    />
                    <div className="grid grid-cols-1 gap-2">
                        <input
                            value={reviewData.metadata.shoot_day}
                            onChange={(event) => updateReviewField("shoot_day", event.target.value)}
                            className={editorFieldClassName}
                            placeholder="Shoot day"
                        />
                        <input
                            value={reviewData.metadata.permit_status}
                            onChange={(event) => updateReviewField("permit_status", event.target.value)}
                            className={editorFieldClassName}
                            placeholder="Permit status"
                        />
                    </div>
                    <textarea
                        value={reviewData.metadata.notes}
                        onChange={(event) => updateReviewField("notes", event.target.value)}
                        className={`${editorTextareaClassName} min-h-20`}
                        placeholder="Production context"
                    />
                    <div className="grid grid-cols-1 gap-2">
                        <textarea
                            value={reviewData.metadata.access_notes}
                            onChange={(event) => updateReviewField("access_notes", event.target.value)}
                            className={`${editorTextareaClassName} min-h-16`}
                            placeholder="Access notes"
                        />
                        <textarea
                            value={reviewData.metadata.parking_notes}
                            onChange={(event) => updateReviewField("parking_notes", event.target.value)}
                            className={`${editorTextareaClassName} min-h-16`}
                            placeholder="Parking notes"
                        />
                        <textarea
                            value={reviewData.metadata.power_notes}
                            onChange={(event) => updateReviewField("power_notes", event.target.value)}
                            className={`${editorTextareaClassName} min-h-16`}
                            placeholder="Power notes"
                        />
                        <textarea
                            value={reviewData.metadata.safety_notes}
                            onChange={(event) => updateReviewField("safety_notes", event.target.value)}
                            className={`${editorTextareaClassName} min-h-16`}
                            placeholder="Safety notes"
                        />
                    </div>
                    <textarea
                        value={reviewData.approval.note ?? ""}
                        onChange={(event) => updateApprovalNote(event.target.value)}
                        className={`${editorTextareaClassName} min-h-16`}
                        placeholder="Approval note"
                    />
                    <div className="grid grid-cols-1 gap-2">
                        <button
                            onClick={() => void saveReview("in_review")}
                            disabled={isSavingReview}
                            className={`${editorGhostButtonClassName} disabled:opacity-50`}
                        >
                            Mark In Review
                        </button>
                        <button
                            onClick={() => void saveReview("approved")}
                            disabled={isSavingReview}
                            className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 px-3 py-2.5 text-[12px] font-medium text-emerald-200 disabled:opacity-50"
                        >
                            Approve Scene
                        </button>
                        <button
                            onClick={() => void saveReview("changes_requested")}
                            disabled={isSavingReview}
                            className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-3 py-2.5 text-[12px] font-medium text-amber-200 disabled:opacity-50"
                        >
                            Request Changes
                        </button>
                        <button
                            onClick={() => void saveReview()}
                            disabled={isSavingReview}
                            className={`${editorPrimaryButtonClassName} disabled:opacity-50`}
                        >
                            {isSavingReview ? "Saving..." : "Save Review"}
                        </button>
                    </div>
                    <div className={`${editorSectionMutedClassName} text-xs text-neutral-300`}>
                        <div className="flex items-center gap-2">
                            <MapPinned className="h-3.5 w-3.5 text-neutral-500" />
                            <span>
                                Approval: {reviewData.approval.state?.replaceAll("_", " ") ?? "draft"}
                                {reviewData.approval.updated_by ? ` · ${reviewData.approval.updated_by}` : ""}
                            </span>
                        </div>
                        {reviewData.approval.updated_at ? (
                            <p className="mt-1 text-[11px] text-neutral-500">Updated {formatTimestamp(reviewData.approval.updated_at)}</p>
                        ) : null}
                    </div>
                    {reviewStatus ? <p className="text-[11px] text-emerald-300">{reviewStatus}</p> : null}
                    {reviewError ? <p className="text-[11px] text-rose-300 whitespace-pre-wrap">{reviewError}</p> : null}
                </>
            ) : (
                <p className="text-xs text-neutral-400">Save the scene once before attaching review metadata and approvals.</p>
            )}
        </div>
    );
});
