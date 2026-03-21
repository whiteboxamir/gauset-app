"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import {
    type CameraView,
    createDefaultReviewRecord,
    createId,
    normalizeReviewRecord,
    nowIso,
    type ReviewIssue,
    type ReviewIssueStatus,
    type SceneReviewRecord,
    type SpatialPin,
} from "@/lib/mvp-workspace";

import {
    DEFAULT_ISSUE_DRAFT,
    DEFAULT_VERSION_COMMENT_DRAFT,
    resolveVersionCommentAnchor,
    resolveSelectedAnchorLabel,
    resolveSelectedVersion,
    type IssueDraft,
    type LegacyComment,
    type SceneVersion,
    type VersionCommentDraft,
} from "./mvpWorkspaceReviewShared";

interface UseMvpWorkspaceReviewPersistenceControllerOptions {
    activeScene: string | null;
    cameraViews: CameraView[];
    pins: SpatialPin[];
    versions: SceneVersion[];
    lastSavedAt: string | null;
    selectedPinId: string | null;
    selectedViewId: string | null;
}

export function useMvpWorkspaceReviewPersistenceController({
    activeScene,
    cameraViews,
    pins,
    versions,
    lastSavedAt,
    selectedPinId,
    selectedViewId,
}: UseMvpWorkspaceReviewPersistenceControllerOptions) {
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [reviewData, setReviewData] = useState<SceneReviewRecord>(() => createDefaultReviewRecord(activeScene));
    const [reviewStatus, setReviewStatus] = useState("");
    const [reviewError, setReviewError] = useState("");
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [legacyComments, setLegacyComments] = useState<LegacyComment[]>([]);
    const [versionCommentDraft, setVersionCommentDraft] = useState<VersionCommentDraft>(DEFAULT_VERSION_COMMENT_DRAFT);
    const [commentStatus, setCommentStatus] = useState("");
    const [commentError, setCommentError] = useState("");
    const [isSavingComment, setIsSavingComment] = useState(false);
    const [issueDraft, setIssueDraft] = useState<IssueDraft>(DEFAULT_ISSUE_DRAFT);

    const selectedVersion = useMemo(
        () => resolveSelectedVersion(versions, selectedVersionId),
        [selectedVersionId, versions],
    );
    const selectedAnchorLabel = useMemo(
        () =>
            resolveSelectedAnchorLabel({
                cameraViews,
                pins,
                selectedPinId,
                selectedViewId,
            }),
        [cameraViews, pins, selectedPinId, selectedViewId],
    );
    const selectedCommentAnchor = useMemo(() => resolveVersionCommentAnchor(selectedAnchorLabel), [selectedAnchorLabel]);
    const visibleIssues = useMemo(
        () => reviewData.issues.filter((issue) => !selectedVersion || issue.version_id === selectedVersion.version_id),
        [reviewData.issues, selectedVersion],
    );
    const canAddIssue = Boolean(activeScene && selectedVersion && (issueDraft.title.trim() || issueDraft.body.trim()));
    const canSubmitComment = Boolean(activeScene && selectedVersion && versionCommentDraft.body.trim());

    useEffect(() => {
        setSelectedVersionId(null);
    }, [activeScene]);

    useEffect(() => {
        if (!activeScene || versions.length === 0) {
            setSelectedVersionId(null);
            return;
        }

        if (selectedVersionId && versions.some((version) => version.version_id === selectedVersionId)) {
            return;
        }

        setSelectedVersionId(versions[0]?.version_id ?? null);
    }, [activeScene, selectedVersionId, versions]);

    useEffect(() => {
        let cancelled = false;

        const loadReview = async () => {
            if (!activeScene) {
                setReviewData(createDefaultReviewRecord(null));
                return;
            }

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Review metadata load failed (${response.status})`));
                }

                const payload = normalizeReviewRecord(await response.json(), activeScene);
                if (!cancelled) {
                    setReviewData(payload);
                    setReviewError("");
                }
            } catch (error) {
                if (!cancelled) {
                    setReviewData(createDefaultReviewRecord(activeScene));
                    setReviewError(error instanceof Error ? error.message : "Review metadata load failed.");
                }
            }
        };

        void loadReview();
        return () => {
            cancelled = true;
        };
    }, [activeScene, lastSavedAt]);

    useEffect(() => {
        setIssueDraft((previous) => ({
            ...previous,
            author: reviewData.metadata.owner || previous.author || "Reviewer",
        }));
    }, [reviewData.metadata.owner]);

    useEffect(() => {
        setVersionCommentDraft((previous) => ({
            ...previous,
            author: reviewData.metadata.owner || previous.author || "Reviewer",
        }));
    }, [reviewData.metadata.owner]);

    useEffect(() => {
        setVersionCommentDraft((previous) => ({
            ...previous,
            body: "",
        }));
        setCommentStatus("");
        setCommentError("");
    }, [activeScene, selectedVersion?.version_id]);

    useEffect(() => {
        let cancelled = false;

        const loadLegacyComments = async () => {
            if (!activeScene || !selectedVersion?.version_id) {
                setLegacyComments([]);
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
                    setLegacyComments(Array.isArray(payload.comments) ? payload.comments : []);
                }
            } catch {
                if (!cancelled) {
                    setLegacyComments([]);
                }
            }
        };

        void loadLegacyComments();
        return () => {
            cancelled = true;
        };
    }, [activeScene, selectedVersion]);

    const persistReview = useCallback(
        async (nextReview: SceneReviewRecord, nextState?: string, successMessage?: string) => {
            if (!activeScene) return;

            setIsSavingReview(true);
            setReviewStatus("");
            setReviewError("");

            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        metadata: nextReview.metadata,
                        approval_state: nextState ?? nextReview.approval.state ?? "draft",
                        updated_by: nextReview.metadata.owner.trim() || "Reviewer",
                        note: nextReview.approval.note ?? "",
                        issues: nextReview.issues,
                    }),
                });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Review save failed (${response.status})`));
                }

                const payload = normalizeReviewRecord(await response.json(), activeScene);
                setReviewData(payload);
                setReviewStatus(
                    successMessage ?? (nextState ? `Scene marked ${nextState.replaceAll("_", " ")}.` : "GAUSET review saved."),
                );
            } catch (error) {
                setReviewError(error instanceof Error ? error.message : "Review save failed.");
            } finally {
                setIsSavingReview(false);
            }
        },
        [activeScene],
    );

    const saveReview = useCallback(
        async (nextState?: string) => {
            if (!activeScene) return;
            await persistReview({ ...reviewData, scene_id: activeScene }, nextState);
        },
        [activeScene, persistReview, reviewData],
    );

    const updateReviewField = useCallback(
        (field: keyof SceneReviewRecord["metadata"], value: string) => {
            setReviewData((previous) => ({
                ...previous,
                scene_id: activeScene ?? previous.scene_id,
                metadata: {
                    ...previous.metadata,
                    [field]: value,
                },
            }));
        },
        [activeScene],
    );

    const updateApprovalNote = useCallback(
        (value: string) => {
            setReviewData((previous) => ({
                ...previous,
                scene_id: activeScene ?? previous.scene_id,
                approval: {
                    ...previous.approval,
                    note: value,
                },
            }));
        },
        [activeScene],
    );

    const setIssueDraftField = useCallback((field: keyof IssueDraft, value: string) => {
        setIssueDraft((previous) => ({ ...previous, [field]: value } as IssueDraft));
    }, []);

    const setVersionCommentDraftField = useCallback((field: keyof VersionCommentDraft, value: string) => {
        setVersionCommentDraft((previous) => ({ ...previous, [field]: value }));
    }, []);

    const addIssue = useCallback(async () => {
        if (!activeScene || !selectedVersion?.version_id) return;
        if (!issueDraft.title.trim() && !issueDraft.body.trim()) return;

        const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
        const selectedView = cameraViews.find((view) => view.id === selectedViewId) ?? null;
        const now = nowIso();
        const nextIssue: ReviewIssue = {
            id: createId("issue"),
            title: issueDraft.title.trim() || "Untitled issue",
            body: issueDraft.body.trim(),
            type: issueDraft.type,
            severity: issueDraft.severity,
            status: issueDraft.status,
            assignee: issueDraft.assignee.trim(),
            author: issueDraft.author.trim() || "Reviewer",
            anchor_position: selectedPin?.position ?? null,
            anchor_view_id: selectedView?.id ?? null,
            version_id: selectedVersion.version_id,
            created_at: now,
            updated_at: now,
        };
        const nextReview: SceneReviewRecord = {
            ...reviewData,
            scene_id: activeScene,
            issues: [...reviewData.issues, nextIssue],
        };

        setReviewData(nextReview);
        setIssueDraft((previous) => ({ ...DEFAULT_ISSUE_DRAFT, author: previous.author || "Reviewer" }));
        await persistReview(nextReview, undefined, "Issue added to review handoff.");
    }, [activeScene, cameraViews, issueDraft, persistReview, pins, reviewData, selectedPinId, selectedViewId, selectedVersion]);

    const deleteIssue = useCallback(
        async (issueId: string) => {
            if (!activeScene) return;

            const nextReview = {
                ...reviewData,
                scene_id: activeScene,
                issues: reviewData.issues.filter((issue) => issue.id !== issueId),
            };
            setReviewData(nextReview);
            await persistReview(nextReview, undefined, "Issue removed.");
        },
        [activeScene, persistReview, reviewData],
    );

    const updateIssueStatus = useCallback(
        async (issueId: string, status: ReviewIssueStatus) => {
            if (!activeScene) return;

            const nextReview = {
                ...reviewData,
                scene_id: activeScene,
                issues: reviewData.issues.map((issue) =>
                    issue.id === issueId ? { ...issue, status, updated_at: nowIso() } : issue,
                ),
            };
            setReviewData(nextReview);
            await persistReview(nextReview, undefined, "Issue status updated.");
        },
        [activeScene, persistReview, reviewData],
    );

    const submitVersionComment = useCallback(async () => {
        if (!activeScene || !selectedVersion?.version_id || !versionCommentDraft.body.trim()) return;

        setIsSavingComment(true);
        setCommentStatus("");
        setCommentError("");

        try {
            const response = await fetch(
                `${MVP_API_BASE_URL}/scene/${activeScene}/versions/${selectedVersion.version_id}/comments`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        author: versionCommentDraft.author.trim() || reviewData.metadata.owner.trim() || "Reviewer",
                        body: versionCommentDraft.body.trim(),
                        anchor: selectedCommentAnchor,
                    }),
                },
            );
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Version comment save failed (${response.status})`));
            }

            const payload = (await response.json()) as { comment?: LegacyComment };
            if (payload.comment) {
                setLegacyComments((previous) => [...previous, payload.comment as LegacyComment]);
            }
            setVersionCommentDraft((previous) => ({
                ...DEFAULT_VERSION_COMMENT_DRAFT,
                author: previous.author.trim() || reviewData.metadata.owner || "Reviewer",
            }));
            setCommentStatus("Version comment saved.");
        } catch (error) {
            setCommentError(error instanceof Error ? error.message : "Version comment save failed.");
        } finally {
            setIsSavingComment(false);
        }
    }, [
        activeScene,
        reviewData.metadata.owner,
        selectedCommentAnchor,
        selectedVersion?.version_id,
        versionCommentDraft.author,
        versionCommentDraft.body,
    ]);

    const issueCountForVersion = useCallback(
        (versionId: string) => reviewData.issues.filter((issue) => issue.version_id === versionId).length,
        [reviewData.issues],
    );

    const commentCountForVersion = useCallback(
        (versionId: string) => {
            const persistedCount = versions.find((version) => version.version_id === versionId)?.comment_count ?? 0;
            if (selectedVersion?.version_id !== versionId) {
                return persistedCount;
            }

            return Math.max(persistedCount, legacyComments.length);
        },
        [legacyComments.length, selectedVersion?.version_id, versions],
    );

    const selectVersion = useCallback((versionId: string) => {
        setSelectedVersionId(versionId);
    }, []);

    return {
        selectedVersionId,
        selectedVersion,
        reviewData,
        reviewStatus,
        reviewError,
        isSavingReview,
        legacyComments,
        versionCommentDraft,
        commentStatus,
        commentError,
        isSavingComment,
        issueDraft,
        selectedAnchorLabel,
        selectedCommentAnchor,
        visibleIssues,
        canAddIssue,
        canSubmitComment,
        selectVersion,
        saveReview,
        updateReviewField,
        updateApprovalNote,
        setVersionCommentDraftField,
        setIssueDraftField,
        submitVersionComment,
        addIssue,
        deleteIssue,
        updateIssueStatus,
        issueCountForVersion,
        commentCountForVersion,
    };
}

export type MvpWorkspaceReviewPersistenceController = ReturnType<typeof useMvpWorkspaceReviewPersistenceController>;
