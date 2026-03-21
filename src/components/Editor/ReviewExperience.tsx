"use client";

import { useSearchParams } from "next/navigation";

import DeploymentFingerprintBadge from "@/components/Editor/DeploymentFingerprintBadge";
import { ReviewExperienceCommentsSection } from "@/components/Editor/ReviewExperienceCommentsSection";
import { ReviewExperienceHeader } from "@/components/Editor/ReviewExperienceHeader";
import { ReviewExperienceMetadataSection } from "@/components/Editor/ReviewExperienceMetadataSection";
import { ReviewExperienceSummarySection } from "@/components/Editor/ReviewExperienceSummarySection";
import ViewerPanel from "@/components/Editor/ViewerPanel";
import { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";

import { useReviewExperienceController } from "./useReviewExperienceController";

export default function ReviewExperience({
    deploymentFingerprint,
}: {
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const searchParams = useSearchParams();
    const { sceneId, versionId, reviewPackage, reviewData, comments, statusMessage, sceneDocument } = useReviewExperienceController({
        sceneId: searchParams.get("scene"),
        versionId: searchParams.get("version"),
        payload: searchParams.get("payload"),
        shareToken: searchParams.get("share"),
    });

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
            <ReviewExperienceHeader
                sceneId={reviewPackage?.sceneId ?? sceneId}
                versionId={reviewPackage?.versionId ?? versionId}
                exportedAt={reviewPackage?.exportedAt ?? null}
                isVersionLocked={Boolean(reviewPackage?.versionId ?? versionId)}
                statusMessage={statusMessage}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] flex-1">
                <div className="min-h-[70vh] border-b xl:border-b-0 xl:border-r border-neutral-900">
                    <ViewerPanel sceneDocument={sceneDocument} readOnly />
                </div>
                <aside className="p-6 space-y-5 bg-neutral-950">
                    <ReviewExperienceSummarySection
                        reviewPackage={reviewPackage}
                        reviewData={reviewData}
                        sceneId={reviewPackage?.sceneId ?? sceneId}
                        versionId={reviewPackage?.versionId ?? versionId}
                    />
                    <ReviewExperienceMetadataSection reviewData={reviewData} />
                    <ReviewExperienceCommentsSection comments={comments} />
                </aside>
            </div>
            <DeploymentFingerprintBadge fingerprint={deploymentFingerprint} testId="review-deployment-fingerprint" />
        </div>
    );
}
