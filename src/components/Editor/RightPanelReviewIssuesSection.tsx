"use client";

import React from "react";
import { Focus, MapPin, Trash2 } from "lucide-react";

import type { MvpWorkspaceReviewController } from "@/app/mvp/_hooks/useMvpWorkspaceReviewController";
import type { ReviewIssueStatus } from "@/lib/mvp-workspace";
import { formatPinTypeLabel } from "@/lib/mvp-workspace";

import {
    editorEyebrowClassName,
    editorFieldClassName,
    editorPrimaryButtonClassName,
    editorSectionClassName,
} from "./editorChrome";
import { formatTimestamp, issueSeverityClass } from "./rightPanelShared";

type RightPanelReviewIssuesSectionProps = Pick<
    MvpWorkspaceReviewController,
    | "addIssue"
    | "canAddIssue"
    | "deleteIssue"
    | "focusIssue"
    | "issueDraft"
    | "reviewData"
    | "selectedAnchorLabel"
    | "selectedVersion"
    | "setIssueDraftField"
    | "updateIssueStatus"
    | "visibleIssues"
>;

export const RightPanelReviewIssuesSection = React.memo(function RightPanelReviewIssuesSection({
    addIssue,
    canAddIssue,
    deleteIssue,
    focusIssue,
    issueDraft,
    reviewData,
    selectedAnchorLabel,
    selectedVersion,
    setIssueDraftField,
    updateIssueStatus,
    visibleIssues,
}: RightPanelReviewIssuesSectionProps) {
    return (
        <div className={`${editorSectionClassName} space-y-3`}>
            <div className={`flex items-center gap-2 ${editorEyebrowClassName}`}>
                <MapPin className="h-3 w-3" />
                Review Issues
            </div>
            {selectedVersion ? (
                <>
                    <p className="text-[11px] text-neutral-500">Anchors: {selectedAnchorLabel}</p>
                    <input
                        value={issueDraft.title}
                        onChange={(event) => setIssueDraftField("title", event.target.value)}
                        className={editorFieldClassName}
                        placeholder="Issue title"
                    />
                    <textarea
                        value={issueDraft.body}
                        onChange={(event) => setIssueDraftField("body", event.target.value)}
                        className={`${editorFieldClassName} min-h-20`}
                        placeholder="What needs to change, verify, or protect?"
                    />
                    <div className="grid grid-cols-1 gap-2">
                        <select
                            value={issueDraft.type}
                            onChange={(event) => setIssueDraftField("type", event.target.value)}
                            className={editorFieldClassName}
                        >
                            <option value="general">General</option>
                            <option value="egress">Egress</option>
                            <option value="lighting">Lighting</option>
                            <option value="hazard">Hazard</option>
                        </select>
                        <select
                            value={issueDraft.severity}
                            onChange={(event) => setIssueDraftField("severity", event.target.value)}
                            className={editorFieldClassName}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                        <select
                            value={issueDraft.status}
                            onChange={(event) => setIssueDraftField("status", event.target.value)}
                            className={editorFieldClassName}
                        >
                            <option value="open">Open</option>
                            <option value="in_review">In Review</option>
                            <option value="blocked">Blocked</option>
                            <option value="resolved">Resolved</option>
                        </select>
                        <input
                            value={issueDraft.assignee}
                            onChange={(event) => setIssueDraftField("assignee", event.target.value)}
                            className={editorFieldClassName}
                            placeholder="Assignee"
                        />
                    </div>
                    <input
                        value={issueDraft.author}
                        onChange={(event) => setIssueDraftField("author", event.target.value)}
                        className={editorFieldClassName}
                        placeholder="Reviewer"
                    />
                    <button
                        onClick={() => void addIssue()}
                        disabled={!canAddIssue}
                        className={`w-full ${editorPrimaryButtonClassName} disabled:opacity-50`}
                    >
                        Add Structured Issue
                    </button>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {reviewData.issues.length > 0 ? (
                            visibleIssues.map((issue) => (
                                <div key={issue.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm text-white">{issue.title}</p>
                                            <p className="mt-1 text-[11px] text-neutral-500">
                                                {issue.author}
                                                {issue.assignee ? ` -> ${issue.assignee}` : ""}
                                                {issue.created_at ? ` · ${formatTimestamp(issue.created_at)}` : ""}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => void deleteIssue(issue.id)}
                                            className="rounded-lg p-1 text-rose-300 transition-colors hover:bg-rose-950/40 hover:text-rose-200"
                                            title="Delete issue"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    {issue.body ? <p className="mt-2 text-xs text-neutral-300 whitespace-pre-wrap">{issue.body}</p> : null}
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${issueSeverityClass(issue.severity)}`}>
                                            {issue.severity}
                                        </span>
                                        <span className="rounded-full border border-neutral-800 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300">
                                            {formatPinTypeLabel(issue.type)}
                                        </span>
                                        <select
                                            value={issue.status}
                                            onChange={(event) =>
                                                void updateIssueStatus(issue.id, event.target.value as ReviewIssueStatus)
                                            }
                                            className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300 outline-none"
                                        >
                                            <option value="open">Open</option>
                                            <option value="in_review">In Review</option>
                                            <option value="blocked">Blocked</option>
                                            <option value="resolved">Resolved</option>
                                        </select>
                                        {issue.anchor_position || issue.anchor_view_id ? (
                                            <button
                                                onClick={() => focusIssue(issue)}
                                                className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300 transition-colors hover:border-blue-500/40 hover:text-blue-200"
                                            >
                                                <Focus className="mr-1 inline h-3 w-3" />
                                                Focus
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-neutral-400">No structured issues yet for this scene.</p>
                        )}
                    </div>
                </>
            ) : (
                <p className="text-xs text-neutral-400">Save the scene to start leaving structured review issues.</p>
            )}
        </div>
    );
});
