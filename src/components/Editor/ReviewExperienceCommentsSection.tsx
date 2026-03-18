"use client";

import React from "react";
import { MessageSquareText } from "lucide-react";

import { formatReviewTimestamp, type ReviewComment } from "@/components/Editor/reviewExperienceShared";

export const ReviewExperienceCommentsSection = React.memo(function ReviewExperienceCommentsSection({
    comments,
}: {
    comments: ReviewComment[];
}) {
    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-[0.18em] mb-3">
                <MessageSquareText className="h-3 w-3" />
                Version Comments
            </div>
            {comments.length > 0 ? (
                <div className="space-y-3">
                    {comments.map((comment) => (
                        <div key={comment.comment_id} className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-white">{comment.author}</p>
                                <p className="text-[11px] text-neutral-500">{formatReviewTimestamp(comment.created_at)}</p>
                            </div>
                            <p className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{comment.body}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-neutral-500">No pinned comments were found for this version.</p>
            )}
        </div>
    );
});
