"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    Box,
    Copy,
    Download,
    History,
    Layers,
    Loader2,
    MessageSquareText,
    MapPinned,
    NotebookPen,
    Plus,
    RefreshCcw,
    Save,
    Share2,
    Trash2,
} from "lucide-react";
import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import { createReviewPackage, encodeReviewPackage } from "@/lib/mvp-review";

type SaveState = "idle" | "saving" | "saved" | "recovered" | "error";

interface SceneVersion {
    version_id: string;
    saved_at: string;
    source?: string;
    comment_count?: number;
    summary?: {
        asset_count?: number;
        has_environment?: boolean;
    };
}

interface ReviewComment {
    comment_id: string;
    author: string;
    body: string;
    anchor?: string;
    created_at: string;
}

interface SceneReview {
    scene_id: string;
    metadata: {
        project_name?: string;
        scene_title?: string;
        location_name?: string;
        owner?: string;
        notes?: string;
    };
    approval: {
        state?: string;
        updated_at?: string | null;
        updated_by?: string | null;
        note?: string;
        history?: Array<{
            state?: string;
            updated_at?: string | null;
            updated_by?: string | null;
            note?: string;
        }>;
    };
}

interface RightPanelProps {
    sceneGraph: any;
    setSceneGraph: React.Dispatch<React.SetStateAction<any>>;
    assetsList: any[];
    activeScene: string | null;
    saveState: SaveState;
    saveMessage: string;
    saveError: string;
    lastSavedAt: string | null;
    versions: SceneVersion[];
    onManualSave: () => Promise<any> | void;
    onRestoreVersion: (versionId: string) => Promise<any> | void;
}

const formatTimestamp = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
};

const statusClassName = (state: SaveState) => {
    if (state === "saved") return "border-emerald-900/40 bg-emerald-950/30 text-emerald-300";
    if (state === "saving") return "border-blue-900/40 bg-blue-950/30 text-blue-300";
    if (state === "recovered") return "border-amber-900/40 bg-amber-950/30 text-amber-200";
    if (state === "error") return "border-rose-900/40 bg-rose-950/30 text-rose-300";
    return "border-neutral-800 bg-neutral-900/70 text-neutral-300";
};

export default function RightPanel({
    sceneGraph,
    setSceneGraph,
    assetsList,
    activeScene,
    saveState,
    saveMessage,
    saveError,
    lastSavedAt,
    versions,
    onManualSave,
    onRestoreVersion,
}: RightPanelProps) {
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [comments, setComments] = useState<ReviewComment[]>([]);
    const [commentAuthor, setCommentAuthor] = useState("Reviewer");
    const [commentBody, setCommentBody] = useState("");
    const [commentStatus, setCommentStatus] = useState("");
    const [commentError, setCommentError] = useState("");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [shareStatus, setShareStatus] = useState("");
    const [reviewData, setReviewData] = useState<SceneReview | null>(null);
    const [reviewStatus, setReviewStatus] = useState("");
    const [reviewError, setReviewError] = useState("");
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [approvalNote, setApprovalNote] = useState("");

    const environmentId = useMemo(() => {
        if (!sceneGraph?.environment) return null;
        if (typeof sceneGraph.environment === "string") return sceneGraph.environment;
        return sceneGraph.environment.id ?? null;
    }, [sceneGraph]);

    const selectedVersion = useMemo(
        () => versions.find((version) => version.version_id === selectedVersionId) ?? versions[0] ?? null,
        [selectedVersionId, versions],
    );

    useEffect(() => {
        if (selectedVersionId && versions.some((version) => version.version_id === selectedVersionId)) {
            return;
        }
        setSelectedVersionId(versions[0]?.version_id ?? null);
    }, [selectedVersionId, versions]);

    useEffect(() => {
        let cancelled = false;
        const loadReview = async () => {
            if (!activeScene) {
                setReviewData(null);
                return;
            }
            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Review metadata load failed (${response.status})`));
                }
                const payload = (await response.json()) as SceneReview;
                if (!cancelled) {
                    setReviewData(payload);
                    setApprovalNote(payload.approval?.note ?? "");
                    setReviewError("");
                }
            } catch (error) {
                if (!cancelled) {
                    setReviewData(null);
                    setReviewError(error instanceof Error ? error.message : "Review metadata load failed.");
                }
            }
        };
        void loadReview();
        return () => {
            cancelled = true;
        };
    }, [activeScene]);

    useEffect(() => {
        let cancelled = false;
        const loadComments = async () => {
            if (!activeScene || !selectedVersion?.version_id) {
                setComments([]);
                return;
            }
            try {
                const response = await fetch(
                    `${MVP_API_BASE_URL}/scene/${activeScene}/versions/${selectedVersion.version_id}/comments`,
                    { cache: "no-store" },
                );
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Comment load failed (${response.status})`));
                }
                const payload = await response.json();
                if (!cancelled) {
                    setComments(Array.isArray(payload.comments) ? payload.comments : []);
                    setCommentError("");
                }
            } catch (error) {
                if (!cancelled) {
                    setComments([]);
                    setCommentError(error instanceof Error ? error.message : "Comment load failed.");
                }
            }
        };
        void loadComments();
        return () => {
            cancelled = true;
        };
    }, [activeScene, selectedVersion]);

    const handleDragStart = (event: React.DragEvent, asset: any) => {
        event.dataTransfer.setData("asset", JSON.stringify(asset));
    };

    const addAssetToScene = (asset: any) => {
        setSceneGraph((prev: any) => ({
            ...prev,
            assets: [
                ...(prev.assets ?? []),
                {
                    ...asset,
                    instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                },
            ],
        }));
    };

    const duplicateSceneAsset = (instanceId: string) => {
        setSceneGraph((prev: any) => {
            const source = (prev.assets ?? []).find((asset: any) => asset.instanceId === instanceId);
            if (!source) return prev;

            const sourcePos = source.position ?? [0, 0, 0];
            const cloned = {
                ...source,
                instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                position: [sourcePos[0] + 0.75, sourcePos[1], sourcePos[2] + 0.75],
            };
            return {
                ...prev,
                assets: [...(prev.assets ?? []), cloned],
            };
        });
    };

    const deleteSceneAsset = (instanceId: string) => {
        setSceneGraph((prev: any) => ({
            ...prev,
            assets: (prev.assets ?? []).filter((asset: any) => asset.instanceId !== instanceId),
        }));
    };

    const buildReviewLink = () => {
        const reviewPackage = createReviewPackage(
            {
                environment: sceneGraph?.environment ?? null,
                assets: Array.isArray(sceneGraph?.assets) ? sceneGraph.assets : [],
            },
            assetsList,
            activeScene,
            selectedVersion?.version_id ?? null,
            reviewData
                ? {
                      metadata: reviewData.metadata,
                      approval: reviewData.approval,
                  }
                : undefined,
        );
        const encodedPayload = encodeReviewPackage(reviewPackage);
        const url = new URL(`${window.location.origin}/mvp/review`);
        url.searchParams.set("payload", encodedPayload);
        if (activeScene) {
            url.searchParams.set("scene", activeScene);
        }
        if (selectedVersion?.version_id) {
            url.searchParams.set("version", selectedVersion.version_id);
        }
        return url.toString();
    };

    const copyReviewLink = async () => {
        try {
            const link = buildReviewLink();
            await navigator.clipboard.writeText(link);
            setShareStatus("Review link copied.");
        } catch {
            setShareStatus("Unable to copy review link.");
        }
    };

    const exportScenePackage = () => {
        const reviewPackage = createReviewPackage(
            {
                environment: sceneGraph?.environment ?? null,
                assets: Array.isArray(sceneGraph?.assets) ? sceneGraph.assets : [],
            },
            assetsList,
            activeScene,
            selectedVersion?.version_id ?? null,
            reviewData
                ? {
                      metadata: reviewData.metadata,
                      approval: reviewData.approval,
                  }
                : undefined,
        );
        const blob = new Blob([JSON.stringify(reviewPackage, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${activeScene ?? "gauset-scene"}-${selectedVersion?.version_id ?? "draft"}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setShareStatus("Scene package exported.");
    };

    const submitComment = async () => {
        if (!activeScene || !selectedVersion?.version_id || !commentBody.trim()) return;
        setIsSubmittingComment(true);
        setCommentStatus("");
        setCommentError("");

        try {
            const response = await fetch(
                `${MVP_API_BASE_URL}/scene/${activeScene}/versions/${selectedVersion.version_id}/comments`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        author: commentAuthor,
                        body: commentBody,
                        anchor: "scene",
                    }),
                },
            );
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Comment save failed (${response.status})`));
            }
            const payload = await response.json();
            setComments((prev) => [...prev, payload.comment]);
            setCommentBody("");
            setCommentStatus("Comment pinned to this version.");
        } catch (error) {
            setCommentError(error instanceof Error ? error.message : "Comment save failed.");
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const updateReviewField = (field: keyof SceneReview["metadata"], value: string) => {
        setReviewData((prev) => ({
            scene_id: activeScene ?? prev?.scene_id ?? "",
            metadata: {
                ...(prev?.metadata ?? {}),
                [field]: value,
            },
            approval: prev?.approval ?? {
                state: "draft",
                updated_at: null,
                updated_by: "Reviewer",
                note: "",
                history: [],
            },
        }));
    };

    const saveReview = async (nextState?: string) => {
        if (!activeScene) return;
        setIsSavingReview(true);
        setReviewStatus("");
        setReviewError("");

        const metadata = reviewData?.metadata ?? {};
        const approvalState = nextState ?? reviewData?.approval?.state ?? "draft";
        const updatedBy = metadata.owner?.trim() || "Reviewer";

        try {
            const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata,
                    approval_state: approvalState,
                    updated_by: updatedBy,
                    note: approvalNote,
                }),
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Review metadata save failed (${response.status})`));
            }
            const payload = (await response.json()) as SceneReview;
            setReviewData(payload);
            setApprovalNote(payload.approval?.note ?? "");
            setReviewStatus(nextState ? `Scene marked ${nextState.replaceAll("_", " ")}.` : "Review metadata saved.");
        } catch (error) {
            setReviewError(error instanceof Error ? error.message : "Review metadata save failed.");
        } finally {
            setIsSavingReview(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-neutral-950 overflow-y-auto">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/30">
                <div>
                    <h3 className="font-semibold text-white tracking-tight text-sm">Scene Inspector</h3>
                    <p className="text-[11px] text-neutral-500 mt-1 font-mono">{activeScene ?? "scene_not_saved"}</p>
                </div>
                <button
                    onClick={onManualSave}
                    disabled={saveState === "saving"}
                    className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-60 disabled:hover:bg-blue-600"
                    title="Save Scene as JSON"
                >
                    {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </button>
            </div>

            <div className="p-4 border-b border-neutral-800 space-y-3 shrink-0">
                <div className={`rounded-xl border px-3 py-3 text-xs ${statusClassName(saveState)}`}>
                    <p className="font-medium tracking-wide uppercase text-[10px] mb-1">Save State</p>
                    <p>{saveMessage || "Scene is idle."}</p>
                    {lastSavedAt && <p className="text-[11px] text-neutral-400 mt-2">Last saved {formatTimestamp(lastSavedAt)}</p>}
                    {saveError && <p className="text-[11px] text-rose-200 mt-2 whitespace-pre-wrap">{saveError}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={copyReviewLink}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs text-white hover:border-blue-500/50 hover:text-blue-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <Share2 className="h-3.5 w-3.5" />
                        Copy Review Link
                    </button>
                    <button
                        onClick={exportScenePackage}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs text-white hover:border-blue-500/50 hover:text-blue-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Export Package
                    </button>
                </div>
                {shareStatus && <p className="text-[11px] text-blue-300">{shareStatus}</p>}

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        <NotebookPen className="h-3 w-3" />
                        Review Metadata
                    </div>
                    {activeScene ? (
                        <>
                            <input
                                value={reviewData?.metadata.project_name ?? ""}
                                onChange={(event) => updateReviewField("project_name", event.target.value)}
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Project name"
                            />
                            <input
                                value={reviewData?.metadata.scene_title ?? ""}
                                onChange={(event) => updateReviewField("scene_title", event.target.value)}
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Scene title"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    value={reviewData?.metadata.location_name ?? ""}
                                    onChange={(event) => updateReviewField("location_name", event.target.value)}
                                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                    placeholder="Location"
                                />
                                <input
                                    value={reviewData?.metadata.owner ?? ""}
                                    onChange={(event) => updateReviewField("owner", event.target.value)}
                                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                    placeholder="Owner"
                                />
                            </div>
                            <textarea
                                value={reviewData?.metadata.notes ?? ""}
                                onChange={(event) => updateReviewField("notes", event.target.value)}
                                className="w-full min-h-20 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Production notes, intent, or handoff context"
                            />
                            <textarea
                                value={approvalNote}
                                onChange={(event) => setApprovalNote(event.target.value)}
                                className="w-full min-h-16 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Approval note"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => void saveReview("in_review")}
                                    disabled={isSavingReview}
                                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white disabled:opacity-50"
                                >
                                    Mark In Review
                                </button>
                                <button
                                    onClick={() => void saveReview("approved")}
                                    disabled={isSavingReview}
                                    className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200 disabled:opacity-50"
                                >
                                    Approve Scene
                                </button>
                                <button
                                    onClick={() => void saveReview("changes_requested")}
                                    disabled={isSavingReview}
                                    className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 disabled:opacity-50"
                                >
                                    Request Changes
                                </button>
                                <button
                                    onClick={() => void saveReview()}
                                    disabled={isSavingReview}
                                    className="rounded-lg border border-neutral-800 bg-white px-3 py-2 text-xs text-black disabled:opacity-50"
                                >
                                    {isSavingReview ? "Saving..." : "Save Metadata"}
                                </button>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">
                                <div className="flex items-center gap-2">
                                    <MapPinned className="h-3.5 w-3.5 text-neutral-500" />
                                    <span>
                                        Approval: {reviewData?.approval?.state?.replaceAll("_", " ") ?? "draft"}
                                        {reviewData?.approval?.updated_by ? ` · ${reviewData.approval.updated_by}` : ""}
                                    </span>
                                </div>
                                {reviewData?.approval?.updated_at && (
                                    <p className="mt-1 text-[11px] text-neutral-500">
                                        Updated {formatTimestamp(reviewData.approval.updated_at)}
                                    </p>
                                )}
                            </div>
                            {reviewStatus && <p className="text-[11px] text-emerald-300">{reviewStatus}</p>}
                            {reviewError && <p className="text-[11px] text-rose-300 whitespace-pre-wrap">{reviewError}</p>}
                        </>
                    ) : (
                        <p className="text-xs text-neutral-600">Save the scene once before attaching review metadata and approvals.</p>
                    )}
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        <History className="h-3 w-3" />
                        Version History
                    </div>
                    {versions.length > 0 ? (
                        <div className="space-y-2">
                            {versions.slice(0, 6).map((version) => {
                                const isSelected = version.version_id === selectedVersion?.version_id;
                                const commentCount =
                                    isSelected && comments.length > 0 ? comments.length : version.comment_count;
                                return (
                                    <div
                                        key={version.version_id}
                                        onClick={() => setSelectedVersionId(version.version_id)}
                                        className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                            isSelected
                                                ? "border-blue-500/60 bg-blue-950/20"
                                                : "border-neutral-800 bg-neutral-950/60 hover:border-neutral-700"
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-white truncate">{formatTimestamp(version.saved_at) || version.version_id}</p>
                                            <p className="text-neutral-500">
                                                {version.source ?? "manual"} · {version.summary?.asset_count ?? 0} assets
                                                {version.summary?.has_environment ? " · env" : ""}
                                                {typeof commentCount === "number" ? ` · ${commentCount} comments` : ""}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void onRestoreVersion(version.version_id);
                                            }}
                                            className="shrink-0 p-1.5 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
                                            title="Restore version"
                                        >
                                            <RefreshCcw className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-neutral-600">Autosaves and manual saves will appear here.</p>
                    )}
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        <MessageSquareText className="h-3 w-3" />
                        Version Comments
                    </div>
                    {selectedVersion ? (
                        <div className="space-y-3">
                            <p className="text-[11px] text-neutral-500">
                                Comments are pinned to {formatTimestamp(selectedVersion.saved_at) || selectedVersion.version_id}.
                            </p>
                            <input
                                value={commentAuthor}
                                onChange={(event) => setCommentAuthor(event.target.value)}
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Reviewer name"
                            />
                            <textarea
                                value={commentBody}
                                onChange={(event) => setCommentBody(event.target.value)}
                                className="w-full min-h-20 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/60"
                                placeholder="Pin feedback to this version"
                            />
                            <button
                                onClick={submitComment}
                                disabled={isSubmittingComment || !activeScene || !commentBody.trim()}
                                className="w-full rounded-lg bg-white text-black text-xs font-medium px-3 py-2 disabled:opacity-50"
                            >
                                {isSubmittingComment ? "Saving Comment..." : "Add Version Comment"}
                            </button>
                            {commentStatus && <p className="text-[11px] text-emerald-300">{commentStatus}</p>}
                            {commentError && <p className="text-[11px] text-rose-300 whitespace-pre-wrap">{commentError}</p>}
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                {comments.length > 0 ? (
                                    comments.map((comment) => (
                                        <div key={comment.comment_id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs text-white">{comment.author}</p>
                                                <p className="text-[11px] text-neutral-500">{formatTimestamp(comment.created_at)}</p>
                                            </div>
                                            <p className="mt-2 text-xs text-neutral-300 whitespace-pre-wrap">{comment.body}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-neutral-600">No comments pinned to this version yet.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-neutral-600">Save the scene to start leaving version-pinned review notes.</p>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 border-b border-neutral-800">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    <Layers className="h-3 w-3" />
                    Scene Graph
                </div>

                {environmentId ? (
                    <div className="space-y-2 text-sm animate-in fade-in">
                        <div className="bg-neutral-900/80 rounded-lg px-3 py-2.5 text-emerald-400 border py-1.5 border-emerald-900/30 flex justify-between items-center shadow-inner">
                            <span className="font-medium">Environment Splat</span>
                            <span className="text-[10px] bg-emerald-950/50 px-1.5 py-0.5 rounded text-emerald-500 font-mono tracking-wider">BG</span>
                        </div>
                        {(sceneGraph.assets ?? []).map((asset: any, index: number) => (
                            <div
                                key={asset.instanceId || index}
                                className="bg-neutral-900/50 rounded-lg px-3 py-2.5 text-blue-400 border border-blue-900/30 ml-4 flex flex-col gap-2 hover:border-blue-700/50 hover:bg-neutral-900 transition-colors"
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-medium flex items-center gap-2 truncate">
                                        <Box className="h-3 w-3 opacity-50 shrink-0" /> {asset.name}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => duplicateSceneAsset(asset.instanceId)}
                                            className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
                                            title="Duplicate"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => deleteSceneAsset(asset.instanceId)}
                                            className="p-1 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <span className="text-xs text-neutral-500 font-mono">
                                    pos [{(asset.position ?? [0, 0, 0]).map((value: number) => Number(value).toFixed(2)).join(", ")}]
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-20 flex items-center justify-center">
                        <p className="text-xs text-neutral-600 italic">Scene is empty</p>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-neutral-900/20">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    <Box className="h-3 w-3" />
                    Local Assets
                </div>

                {assetsList.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 pb-8">
                        {assetsList.map((asset: any, index: number) => (
                            <div
                                key={asset.id || index}
                                draggable
                                onDragStart={(event) => handleDragStart(event, asset)}
                                onClick={() => addAssetToScene(asset)}
                                className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 hover:border-blue-500/50 cursor-grab active:cursor-grabbing transition-all group aspect-square flex flex-col justify-between hover:shadow-xl hover:shadow-black/50 animate-in zoom-in-95 duration-200"
                            >
                                <div
                                    className="w-full flex-1 bg-gradient-to-tr from-neutral-800 to-neutral-700 rounded-lg mb-2 overflow-hidden relative shadow-inner bg-cover bg-center"
                                    style={asset.preview ? { backgroundImage: `url(${asset.preview})` } : undefined}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-neutral-900/40 transition-opacity backdrop-blur-[2px]">
                                        <div className="bg-blue-600 text-white rounded-full p-1 shadow-lg pointer-events-none">
                                            <Plus className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-center text-neutral-400 font-medium truncate group-hover:text-blue-200">{asset.name}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center h-40 flex items-center justify-center border-2 border-dashed border-neutral-800/50 rounded-xl bg-neutral-900/30">
                        <p className="text-xs text-neutral-600 px-4">Assets generated from TripoSR will appear here.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
