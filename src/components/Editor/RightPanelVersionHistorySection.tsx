"use client";

import React from "react";
import { History, MessageSquareText, RefreshCcw } from "lucide-react";

import type { MvpWorkspaceReviewController } from "@/app/mvp/_hooks/useMvpWorkspaceReviewController";

import {
    editorEyebrowClassName,
    editorFieldClassName,
    editorPrimaryButtonClassName,
    editorSectionClassName,
    editorSectionMutedClassName,
    editorTextareaClassName,
} from "./editorChrome";
import { formatTimestamp, type SceneVersion } from "./rightPanelShared";

type RightPanelVersionHistorySectionProps = Pick<
    MvpWorkspaceReviewController,
    | "issueCountForVersion"
    | "commentCountForVersion"
    | "commentError"
    | "commentStatus"
    | "canSubmitComment"
    | "isSavingComment"
    | "legacyComments"
    | "selectedCommentAnchor"
    | "setVersionCommentDraftField"
    | "selectVersion"
    | "selectedVersion"
    | "submitVersionComment"
    | "versionCommentDraft"
> & {
    activeScene: string | null;
    onRestoreVersion: (versionId: string) => Promise<any> | void;
    versions: SceneVersion[];
};

export const RightPanelVersionHistorySection = React.memo(function RightPanelVersionHistorySection({
    activeScene,
    canSubmitComment,
    commentCountForVersion,
    commentError,
    commentStatus,
    isSavingComment,
    issueCountForVersion,
    legacyComments,
    onRestoreVersion,
    selectedCommentAnchor,
    setVersionCommentDraftField,
    selectVersion,
    selectedVersion,
    submitVersionComment,
    versionCommentDraft,
    versions,
}: RightPanelVersionHistorySectionProps) {
    return (
        <div className={editorSectionClassName}>
            <div className={`mb-3 flex items-center gap-2 ${editorEyebrowClassName}`}>
                <History className="h-3 w-3" />
                Version History
            </div>
            <div className={`mb-3 ${editorSectionMutedClassName}`}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Current continuity</p>
                <p className="mt-1 text-sm text-white">
                    {selectedVersion
                        ? formatTimestamp(selectedVersion.saved_at) || selectedVersion.version_id
                        : activeScene
                          ? "Version selection pending"
                          : "Unsaved draft"}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-neutral-400">
                    {activeScene
                        ? selectedVersion
                            ? `Review links, exports, issue scope, and restore actions stay anchored to ${activeScene}.`
                            : versions.length > 0
                              ? `Select a saved version to anchor review links, exports, and issue scope for ${activeScene}.`
                              : `Version history stays attached to ${activeScene} once the next save lands.`
                        : "Save the first world state to start durable version history and review anchors."}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-neutral-500">
                    Restoring a version rewinds the world and director state for this scene. Review links and exports stay pinned to the saved version selected here.
                </p>
            </div>
            {versions.length > 0 ? (
                <div className="space-y-2">
                    {versions.slice(0, 6).map((version) => {
                        const isSelected = version.version_id === selectedVersion?.version_id;
                        const count = commentCountForVersion(version.version_id) + issueCountForVersion(version.version_id);
                        return (
                            <div
                                key={version.version_id}
                                onClick={() => selectVersion(version.version_id)}
                                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                                    isSelected
                                        ? "border-blue-500/60 bg-blue-950/20"
                                        : "border-white/8 bg-black/20 hover:border-white/16"
                                }`}
                            >
                                <div className="min-w-0">
                                    <p className="text-white truncate">{formatTimestamp(version.saved_at) || version.version_id}</p>
                                    <p className="text-neutral-500">
                                        {version.source ?? "manual"} · {version.summary?.asset_count ?? 0} assets
                                        {version.summary?.has_environment ? " · env" : ""}
                                        {typeof count === "number" ? ` · ${count} review items` : ""}
                                    </p>
                                </div>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onRestoreVersion(version.version_id);
                                    }}
                                    className="shrink-0 rounded-lg p-1.5 text-neutral-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                                    title="Restore version"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-xs text-neutral-400">Autosaves and manual saves will appear here.</p>
            )}
            {selectedVersion ? (
                <div className={`mt-3 ${editorSectionMutedClassName}`}>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        <MessageSquareText className="h-3 w-3" />
                        Version Comments
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                        Pinned comments stay attached to this saved version and appear on the recipient review route.
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-neutral-500">
                        Comment anchor: {selectedCommentAnchor === "scene" ? "scene-wide" : selectedCommentAnchor}
                    </p>
                    <div className="mt-3 grid gap-2">
                        <input
                            value={versionCommentDraft.author}
                            onChange={(event) => setVersionCommentDraftField("author", event.target.value)}
                            placeholder="Reviewer name"
                            className={editorFieldClassName}
                        />
                        <textarea
                            value={versionCommentDraft.body}
                            onChange={(event) => setVersionCommentDraftField("body", event.target.value)}
                            placeholder="Pinned version note"
                            rows={3}
                            className={editorTextareaClassName}
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => void submitVersionComment()}
                                disabled={!canSubmitComment || isSavingComment}
                                className={editorPrimaryButtonClassName}
                            >
                                {isSavingComment ? "Saving..." : "Add pinned comment"}
                            </button>
                            {commentStatus ? <p className="text-xs text-emerald-200/80">{commentStatus}</p> : null}
                            {commentError ? <p className="text-xs text-rose-200/80">{commentError}</p> : null}
                        </div>
                    </div>
                    {legacyComments.length > 0 ? (
                        <div className="mt-3 space-y-2">
                            {legacyComments.slice(0, 3).map((comment) => (
                                <div key={comment.comment_id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs text-white">{comment.author}</p>
                                            <p className="truncate text-[11px] text-neutral-500">
                                                {comment.anchor && comment.anchor !== "scene" ? comment.anchor : "scene-wide"}
                                            </p>
                                        </div>
                                        <p className="text-[11px] text-neutral-500">{formatTimestamp(comment.created_at)}</p>
                                    </div>
                                    <p className="mt-2 text-xs text-neutral-300 whitespace-pre-wrap">{comment.body}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-xs text-neutral-500">No version comments are recorded for this saved version yet.</p>
                    )}
                </div>
            ) : null}
        </div>
    );
});
