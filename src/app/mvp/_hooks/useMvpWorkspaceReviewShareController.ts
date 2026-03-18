"use client";

import { useCallback, useRef, useState } from "react";

import { copyTextToClipboard } from "@/lib/browserClipboard";
import { extractApiError } from "@/lib/mvp-api";
import { createReviewPackage, encodeReviewPackage } from "@/lib/mvp-review";
import type { SceneReviewRecord } from "@/lib/mvp-workspace";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import type { CreateReviewShareResponse } from "@/server/contracts/review-shares";

import type { SceneVersion } from "./mvpWorkspaceReviewShared";

interface UseMvpWorkspaceReviewShareControllerOptions {
    activeScene: string | null;
    assetsList: any[];
    sceneDocument: SceneDocumentV2;
    selectedVersion: SceneVersion | null;
    reviewData: SceneReviewRecord;
    onExport?: () => void;
}

export function useMvpWorkspaceReviewShareController({
    activeScene,
    assetsList,
    sceneDocument,
    selectedVersion,
    reviewData,
    onExport,
}: UseMvpWorkspaceReviewShareControllerOptions) {
    const [shareStatus, setShareStatus] = useState("");
    const [isCreatingReviewLink, setIsCreatingReviewLink] = useState(false);
    const createReviewLinkRequestRef = useRef<Promise<CreateReviewShareResponse> | null>(null);
    const canCopyReviewLink = !activeScene || Boolean(selectedVersion?.version_id);

    const buildReviewLink = useCallback(async () => {
        if (createReviewLinkRequestRef.current) {
            return createReviewLinkRequestRef.current;
        }

        const request = (async () => {
            const versionId = selectedVersion?.version_id ?? null;
            if (activeScene && !versionId) {
                throw new Error("Select a saved version before creating a secure review link.");
            }

            const hasSavedVersion = Boolean(activeScene && versionId);
            const reviewPackage = hasSavedVersion
                ? null
                : createReviewPackage(sceneDocument, assetsList, activeScene, versionId, reviewData);
            const payload = reviewPackage ? encodeReviewPackage(reviewPackage) : undefined;
            const requestBody = hasSavedVersion
                ? {
                      sceneId: activeScene,
                      versionId,
                  }
                : {
                      sceneId: activeScene,
                      versionId,
                      payload,
                      reviewPackage,
                      sceneDocument: reviewPackage?.sceneDocument,
                      sceneGraph: reviewPackage?.sceneGraph,
                      assetsList: reviewPackage?.assetsList,
                  };

            const response = await fetch("/api/review-shares", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(await extractApiError(response, `Review link creation failed (${response.status})`));
            }

            return (await response.json()) as CreateReviewShareResponse;
        })();

        createReviewLinkRequestRef.current = request;

        try {
            return await request;
        } finally {
            createReviewLinkRequestRef.current = null;
        }
    }, [activeScene, assetsList, reviewData, sceneDocument, selectedVersion]);

    const copyReviewLink = useCallback(async () => {
        if (createReviewLinkRequestRef.current) {
            return;
        }

        setIsCreatingReviewLink(true);
        try {
            setShareStatus(activeScene ? "Creating secure review link..." : "Creating review link...");
            const share = await buildReviewLink();
            await copyTextToClipboard(share.shareUrl);
            setShareStatus(share.shareMode === "localhost_fallback" ? "Review link copied." : "Secure review link copied.");
        } catch (error) {
            setShareStatus(error instanceof Error ? error.message : "Unable to create review link.");
        } finally {
            setIsCreatingReviewLink(false);
        }
    }, [activeScene, buildReviewLink]);

    const exportScenePackage = useCallback(() => {
        const versionId = selectedVersion?.version_id ?? null;
        const reviewPackage = createReviewPackage(sceneDocument, assetsList, activeScene, versionId, reviewData);
        const blob = new Blob([JSON.stringify(reviewPackage, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${activeScene ?? "gauset-scene"}-${versionId ?? "draft"}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setShareStatus("Scene package exported.");
        onExport?.();
    }, [activeScene, assetsList, onExport, reviewData, sceneDocument, selectedVersion]);

    return {
        shareStatus,
        isCreatingReviewLink,
        canCopyReviewLink,
        copyReviewLink,
        exportScenePackage,
    };
}

export type MvpWorkspaceReviewShareController = ReturnType<typeof useMvpWorkspaceReviewShareController>;
