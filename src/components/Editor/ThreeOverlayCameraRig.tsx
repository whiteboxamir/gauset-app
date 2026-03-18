"use client";

import React from "react";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { type CameraPathFrame, type CameraPose } from "@/lib/mvp-workspace";
import { useThreeOverlayCameraRigController } from "./useThreeOverlayCameraRigController";

export const CameraRig = React.memo(function CameraRig({
    viewerFov,
    controlsRef,
    focusRequest,
    captureRequestKey,
    onCapturePose,
    isRecordingPath,
    onPathRecorded,
}: {
    viewerFov: number;
    controlsRef: React.MutableRefObject<any>;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    onCapturePose?: (pose: CameraPose) => void;
    isRecordingPath: boolean;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
}) {
    useThreeOverlayCameraRigController({
        viewerFov,
        controlsRef,
        focusRequest,
        captureRequestKey,
        onCapturePose,
        isRecordingPath,
        onPathRecorded,
    });

    return null;
});
