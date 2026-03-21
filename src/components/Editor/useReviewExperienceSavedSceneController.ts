"use client";

import { useEffect, useState } from "react";

import { buildReviewPackageFromSavedVersion, type ReviewComment } from "@/components/Editor/reviewExperienceShared";
import { extractApiError, MVP_API_BASE_URL, withMvpShareToken } from "@/lib/mvp-api";
import type { ReviewPackage } from "@/lib/mvp-review";
import type { SceneReviewRecord } from "@/lib/mvp-workspace";

interface UseReviewExperienceSavedSceneControllerOptions {
    sceneId: string | null;
    versionId: string | null;
    shareToken: string | null;
    inlinePackage: ReviewPackage | null;
    inlineReviewData: SceneReviewRecord | null;
    inlineStatusMessage: string | null;
}

export function useReviewExperienceSavedSceneController({
    sceneId,
    versionId,
    shareToken,
    inlinePackage,
    inlineReviewData,
    inlineStatusMessage,
}: UseReviewExperienceSavedSceneControllerOptions) {
    const [reviewPackage, setReviewPackage] = useState<ReviewPackage | null>(inlinePackage);
    const [reviewData, setReviewData] = useState<SceneReviewRecord | null>(inlineReviewData);
    const [comments, setComments] = useState<ReviewComment[]>([]);
    const [statusMessage, setStatusMessage] = useState(inlineStatusMessage ?? "Loading review scene...");

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setReviewPackage(inlinePackage);
            setReviewData(inlineReviewData);
            setComments([]);
            setStatusMessage(inlineStatusMessage ?? "Loading review scene...");

            if (!sceneId || !versionId) {
                return;
            }

            try {
                const versionResponse = await fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${versionId}`, shareToken), {
                    cache: "no-store",
                });
                if (!versionResponse.ok) {
                    throw new Error(await extractApiError(versionResponse, `Version load failed (${versionResponse.status})`));
                }

                const versionPayload = (await versionResponse.json()) as Record<string, unknown>;
                if (!cancelled) {
                    setReviewPackage((previousPackage) =>
                        buildReviewPackageFromSavedVersion({
                            sceneId,
                            versionId,
                            versionPayload,
                            previousPackage,
                            previousReview: inlineReviewData,
                            shareToken,
                        }),
                    );
                    setStatusMessage("Review scene loaded from saved version.");
                }

                const [reviewResponse, commentsResponse] = await Promise.all([
                    fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/review`, shareToken), {
                        cache: "no-store",
                    }),
                    fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${versionId}/comments`, shareToken), {
                        cache: "no-store",
                    }),
                ]);

                if (reviewResponse.ok) {
                    const reviewPayload = (await reviewResponse.json()) as SceneReviewRecord;
                    if (!cancelled) {
                        setReviewData(reviewPayload);
                    }
                }

                if (commentsResponse.ok) {
                    const commentsPayload = (await commentsResponse.json()) as { comments?: ReviewComment[] };
                    if (!cancelled) {
                        setComments(Array.isArray(commentsPayload.comments) ? commentsPayload.comments : []);
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    setStatusMessage(error instanceof Error ? error.message : "Unable to load saved review scene.");
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [inlinePackage, inlineReviewData, inlineStatusMessage, sceneId, shareToken, versionId]);

    return {
        reviewPackage,
        reviewData,
        comments,
        statusMessage,
    };
}
