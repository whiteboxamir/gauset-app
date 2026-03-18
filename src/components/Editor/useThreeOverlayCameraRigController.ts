"use client";

import { type MutableRefObject, useCallback } from "react";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { type CameraPathFrame, type CameraPose, type Vector3Tuple } from "@/lib/mvp-workspace";
import { useThreeOverlayCameraPoseController } from "./useThreeOverlayCameraPoseController";
import { useViewerCameraPathRecorder } from "./useViewerCameraPathRecorder";

export interface UseThreeOverlayCameraRigControllerOptions {
    viewerFov: number;
    controlsRef: MutableRefObject<any>;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    onCapturePose?: (pose: CameraPose) => void;
    isRecordingPath: boolean;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
}

export function useThreeOverlayCameraRigController({
    viewerFov,
    controlsRef,
    focusRequest,
    captureRequestKey,
    onCapturePose,
    isRecordingPath,
    onPathRecorded,
}: UseThreeOverlayCameraRigControllerOptions) {
    const perspectiveCamera = useThreeOverlayCameraPoseController({
        viewerFov,
        controlsRef,
        focusRequest,
        captureRequestKey,
        onCapturePose,
    });

    const getCurrentPathFrame = useCallback(() => {
        const target = controlsRef.current?.target
            ? ([controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z] as Vector3Tuple)
            : ([0, 0, 0] as Vector3Tuple);
        return {
            position: [perspectiveCamera.position.x, perspectiveCamera.position.y, perspectiveCamera.position.z] as Vector3Tuple,
            target,
            rotation: [
                perspectiveCamera.quaternion.x,
                perspectiveCamera.quaternion.y,
                perspectiveCamera.quaternion.z,
                perspectiveCamera.quaternion.w,
            ] as CameraPathFrame["rotation"],
            fov: perspectiveCamera.fov,
        };
    }, [controlsRef, perspectiveCamera]);

    useViewerCameraPathRecorder({
        isRecordingPath,
        getCurrentFrame: getCurrentPathFrame,
        onPathRecorded,
    });
}

export type ThreeOverlayCameraRigController = ReturnType<typeof useThreeOverlayCameraRigController>;
