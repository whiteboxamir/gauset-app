"use client";

import { useCallback, useState } from "react";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import type { BackendLaneCapability, CaptureSessionResponse, GeneratedEnvironmentMetadata } from "@/lib/mvp-product";

import {
    describeUnavailableCapability,
    deriveCaptureSessionNextCounts,
    formatBandLabel,
    pollJob,
    type JobRecord,
    type UploadItem,
    type WorkspaceIntakeActions,
} from "./mvpWorkspaceIntakeShared";

type EnvironmentSceneLoader = (
    sceneId: string,
    urlCandidates?: Record<string, string>,
    fileCandidates?: Record<string, string>,
    fallbackLane?: "preview" | "reconstruction",
) => Promise<{ metadata: GeneratedEnvironmentMetadata | null }>;

export function useMvpWorkspaceCaptureController({
    backendWritesDisabled,
    backendWritesDisabledMessage,
    selectedUpload,
    defaultMinimumCaptureImages,
    defaultRecommendedCaptureImages,
    reconstructionAvailable,
    reconstructionCapability,
    upsertJob,
    loadEnvironmentIntoScene,
    setStatusText,
    setErrorText,
    handleGenerationStart,
    handleGenerationSuccess,
    handleGenerationError,
}: {
    backendWritesDisabled: boolean;
    backendWritesDisabledMessage: string;
    selectedUpload: UploadItem | null;
    defaultMinimumCaptureImages: number;
    defaultRecommendedCaptureImages: number;
    reconstructionAvailable: boolean;
    reconstructionCapability: BackendLaneCapability | undefined;
    upsertJob: (job: JobRecord) => void;
    loadEnvironmentIntoScene: EnvironmentSceneLoader;
    setStatusText: (value: string) => void;
    setErrorText: (value: string) => void;
    handleGenerationStart: WorkspaceIntakeActions["handleGenerationStart"];
    handleGenerationSuccess: WorkspaceIntakeActions["handleGenerationSuccess"];
    handleGenerationError: WorkspaceIntakeActions["handleGenerationError"];
}) {
    const [isUpdatingCapture, setIsUpdatingCapture] = useState(false);
    const [isStartingReconstruction, setIsStartingReconstruction] = useState(false);
    const [captureSession, setCaptureSession] = useState<CaptureSessionResponse | null>(null);

    const captureQualitySummary = captureSession?.quality_summary;
    const captureBlockers = Array.isArray(captureSession?.reconstruction_blockers)
        ? captureSession.reconstruction_blockers
        : Array.isArray(captureQualitySummary?.reconstruction_gate?.blockers)
          ? captureQualitySummary.reconstruction_gate.blockers
          : [];
    const captureUniqueFrameCount =
        typeof captureQualitySummary?.unique_frame_count === "number"
            ? captureQualitySummary.unique_frame_count
            : Math.max((captureSession?.frame_count ?? 0) - (captureQualitySummary?.duplicate_frames ?? 0), 0);
    const captureDuplicateRatioPercent =
        typeof captureQualitySummary?.duplicate_ratio === "number"
            ? Math.round(captureQualitySummary.duplicate_ratio * 100)
            : null;
    const captureSetBlocked = Boolean(
        captureSession &&
            !captureSession.ready_for_reconstruction &&
            captureSession.frame_count >= captureSession.minimum_images &&
            captureBlockers.length > 0,
    );
    const captureNextActions = Array.isArray(captureQualitySummary?.recommended_next_actions)
        ? captureQualitySummary.recommended_next_actions
        : [];
    const { minimumCaptureImages, recommendedCaptureImages } = deriveCaptureSessionNextCounts(
        captureSession,
        defaultMinimumCaptureImages,
        defaultRecommendedCaptureImages,
    );

    const reconstructionButtonLabel = isStartingReconstruction
        ? "Starting Reconstruction..."
        : captureSetBlocked
          ? "Resolve Capture Blockers"
          : reconstructionAvailable
            ? "Start Reconstruction"
            : "Awaiting Multi-View Capture";

    const ensureCaptureSession = useCallback(async () => {
        if (backendWritesDisabled) {
            throw new Error(backendWritesDisabledMessage);
        }
        if (captureSession) {
            return captureSession;
        }

        const response = await fetch(`${MVP_API_BASE_URL}/capture/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_images: recommendedCaptureImages }),
        });
        if (!response.ok) {
            throw new Error(await extractApiError(response, `Capture session creation failed (${response.status})`));
        }

        const payload = (await response.json()) as CaptureSessionResponse;
        setCaptureSession(payload);
        return payload;
    }, [backendWritesDisabled, backendWritesDisabledMessage, captureSession, recommendedCaptureImages]);

    const addSelectedToCaptureSet = useCallback(async () => {
        if (!selectedUpload) {
            return;
        }
        if (backendWritesDisabled) {
            setErrorText(backendWritesDisabledMessage);
            return;
        }

        setIsUpdatingCapture(true);
        setErrorText("");
        setStatusText("Adding photo to capture set...");

        try {
            const session = await ensureCaptureSession();
            if (session.frames.some((frame) => frame.image_id === selectedUpload.image_id)) {
                setStatusText("Selected photo is already in the capture set.");
                return;
            }

            const response = await fetch(`${MVP_API_BASE_URL}/capture/session/${session.session_id}/frames`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_ids: [selectedUpload.image_id] }),
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Capture session update failed (${response.status})`));
            }

            const payload = (await response.json()) as CaptureSessionResponse;
            setCaptureSession(payload);
            const leadBlocker = Array.isArray(payload.reconstruction_blockers) ? payload.reconstruction_blockers[0] : null;
            setStatusText(
                payload.ready_for_reconstruction
                    ? `Capture set ready: ${payload.frame_count} views collected${
                          payload.quality_summary?.band ? ` · ${formatBandLabel(payload.quality_summary.band)}` : ""
                      }.`
                    : payload.frame_count >= payload.minimum_images && leadBlocker
                      ? `Capture set blocked: ${leadBlocker}`
                      : `Capture set updated: ${payload.frame_count}/${payload.minimum_images} views collected${
                            payload.quality_summary?.band ? ` · ${formatBandLabel(payload.quality_summary.band)}` : ""
                        }.`,
            );
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Capture session update failed.");
        } finally {
            setIsUpdatingCapture(false);
        }
    }, [
        backendWritesDisabled,
        backendWritesDisabledMessage,
        ensureCaptureSession,
        selectedUpload,
        setErrorText,
        setStatusText,
    ]);

    const startReconstruction = useCallback(async () => {
        if (!captureSession) {
            return;
        }
        if (backendWritesDisabled) {
            setErrorText(backendWritesDisabledMessage);
            return;
        }
        if (!reconstructionAvailable) {
            setErrorText(
                describeUnavailableCapability(
                    reconstructionCapability,
                    "Multi-view reconstruction is intentionally unavailable in this backend.",
                ),
            );
            return;
        }

        setIsStartingReconstruction(true);
        setErrorText("");
        handleGenerationStart({
            kind: "reconstruction",
            label: "Fusing capture set into a persistent world",
            detail: `Reconstructing from ${captureSession.frame_count} capture views.`,
            inputLabel: `${captureSession.frame_count} capture views`,
        });
        setStatusText("Fusing the capture set into a persistent world...");

        try {
            const response = await fetch(`${MVP_API_BASE_URL}/reconstruct/session/${captureSession.session_id}`, {
                method: "POST",
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Reconstruction failed to start (${response.status})`));
            }

            const payload = (await response.json()) as CaptureSessionResponse;
            setCaptureSession(payload);

            const jobId = payload.job_id ?? payload.scene_id;
            if (!jobId) {
                throw new Error("Missing reconstruction job id.");
            }

            upsertJob({
                id: jobId,
                type: "reconstruction",
                imageId: captureSession.session_id,
                label: `${payload.frame_count} capture views`,
                status: "processing",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const finalJob = await pollJob(jobId);
            upsertJob({
                id: jobId,
                type: "reconstruction",
                imageId: captureSession.session_id,
                label: `${payload.frame_count} capture views`,
                status: finalJob.status,
                createdAt: finalJob.created_at ?? new Date().toISOString(),
                updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                error: finalJob.error ?? undefined,
            });
            if (finalJob.status === "failed") {
                throw new Error(finalJob.error || "Reconstruction failed.");
            }

            const sceneId = finalJob.result?.scene_id ?? payload.scene_id ?? jobId;
            const result = await loadEnvironmentIntoScene(
                sceneId,
                finalJob.result?.urls ?? payload.urls,
                finalJob.result?.files ?? undefined,
                "reconstruction",
            );
            setCaptureSession((previous) =>
                previous
                    ? {
                          ...previous,
                          status: "completed",
                          updated_at: new Date().toISOString(),
                          job_id: jobId,
                          scene_id: sceneId,
                          urls: finalJob.result?.urls ?? payload.urls,
                          last_error: undefined,
                      }
                    : previous,
            );
            handleGenerationSuccess({
                kind: "reconstruction",
                label: "Reconstruction ready",
                detail: `Loaded ${sceneId} from ${payload.frame_count} capture views.`,
                inputLabel: `${payload.frame_count} capture views`,
                sceneId,
            });
            setStatusText(
                `${result.metadata?.truth_label ?? "Reconstruction"} ready: ${sceneId}${
                    result.metadata?.quality?.band ? ` · ${result.metadata.quality.band.replaceAll("_", " ")}` : ""
                }`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "Reconstruction failed to start.";
            setErrorText(message);
            handleGenerationError({
                label: "Reconstruction failed",
                detail: message,
            });
        } finally {
            setIsStartingReconstruction(false);
        }
    }, [
        backendWritesDisabled,
        backendWritesDisabledMessage,
        captureSession,
        handleGenerationError,
        handleGenerationStart,
        handleGenerationSuccess,
        loadEnvironmentIntoScene,
        reconstructionAvailable,
        reconstructionCapability,
        setErrorText,
        setStatusText,
        upsertJob,
    ]);

    return {
        isUpdatingCapture,
        isStartingReconstruction,
        captureSession,
        captureQualitySummary,
        captureBlockers,
        captureUniqueFrameCount,
        captureDuplicateRatioPercent,
        captureSetBlocked,
        captureNextActions,
        minimumCaptureImages,
        recommendedCaptureImages,
        reconstructionButtonLabel,
        addSelectedToCaptureSet,
        startReconstruction,
    };
}
