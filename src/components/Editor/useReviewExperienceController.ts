"use client";

import { EMPTY_REVIEW_SCENE_DOCUMENT, type ReviewExperienceQuery } from "@/components/Editor/reviewExperienceShared";

import { useReviewExperienceInlinePackageController } from "./useReviewExperienceInlinePackageController";
import { useReviewExperienceSavedSceneController } from "./useReviewExperienceSavedSceneController";

export function useReviewExperienceController({ sceneId, versionId, payload, shareToken }: ReviewExperienceQuery) {
    const inlinePackage = useReviewExperienceInlinePackageController({
        payload,
        shareToken,
    });
    const savedScene = useReviewExperienceSavedSceneController({
        sceneId,
        versionId,
        shareToken,
        inlinePackage: inlinePackage.inlinePackage,
        inlineReviewData: inlinePackage.inlineReviewData,
        inlineStatusMessage: inlinePackage.inlineStatusMessage,
    });

    return {
        sceneId,
        versionId,
        payload,
        shareToken,
        ...savedScene,
        sceneDocument: savedScene.reviewPackage?.sceneDocument ?? EMPTY_REVIEW_SCENE_DOCUMENT,
    };
}

export type ReviewExperienceController = ReturnType<typeof useReviewExperienceController>;
