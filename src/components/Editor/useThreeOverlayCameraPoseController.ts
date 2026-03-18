"use client";

import { type MutableRefObject, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { type CameraPose, type Vector3Tuple, fovToLensMm } from "@/lib/mvp-workspace";
import { EDITOR_CAMERA_FAR, EDITOR_CAMERA_NEAR } from "./threeOverlayShared";

function applyEditorCameraClipping(camera: THREE.PerspectiveCamera) {
    camera.near = EDITOR_CAMERA_NEAR;
    camera.far = EDITOR_CAMERA_FAR;
}

export interface UseThreeOverlayCameraPoseControllerOptions {
    viewerFov: number;
    controlsRef: MutableRefObject<any>;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    onCapturePose?: (pose: CameraPose) => void;
}

export function useThreeOverlayCameraPoseController({
    viewerFov,
    controlsRef,
    focusRequest,
    captureRequestKey,
    onCapturePose,
}: UseThreeOverlayCameraPoseControllerOptions) {
    const { camera } = useThree();
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const lastCaptureRequestRef = useRef<number>(0);
    const lastFocusTokenRef = useRef<number>(0);

    useEffect(() => {
        applyEditorCameraClipping(perspectiveCamera);
        perspectiveCamera.fov = viewerFov;
        perspectiveCamera.updateProjectionMatrix();
    }, [perspectiveCamera, viewerFov]);

    useEffect(() => {
        if (!focusRequest || focusRequest.token === lastFocusTokenRef.current) {
            return;
        }

        lastFocusTokenRef.current = focusRequest.token;
        perspectiveCamera.position.set(...focusRequest.position);
        if (focusRequest.up) {
            perspectiveCamera.up.set(...focusRequest.up);
        } else {
            perspectiveCamera.up.set(0, 1, 0);
        }
        applyEditorCameraClipping(perspectiveCamera);
        perspectiveCamera.fov = focusRequest.fov;
        perspectiveCamera.updateProjectionMatrix();
        if (controlsRef.current?.target) {
            controlsRef.current.target.set(...focusRequest.target);
            controlsRef.current.update();
        }
    }, [controlsRef, focusRequest, perspectiveCamera]);

    useEffect(() => {
        if (!onCapturePose || captureRequestKey === 0 || captureRequestKey === lastCaptureRequestRef.current) {
            return;
        }

        lastCaptureRequestRef.current = captureRequestKey;
        const target = controlsRef.current?.target
            ? ([controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z] as Vector3Tuple)
            : ([0, 0, 0] as Vector3Tuple);
        onCapturePose({
            position: [perspectiveCamera.position.x, perspectiveCamera.position.y, perspectiveCamera.position.z],
            target,
            fov: perspectiveCamera.fov,
            lens_mm: Math.round(fovToLensMm(perspectiveCamera.fov) * 10) / 10,
        });
    }, [captureRequestKey, controlsRef, onCapturePose, perspectiveCamera]);

    return perspectiveCamera;
}

export type ThreeOverlayCameraPoseController = ReturnType<typeof useThreeOverlayCameraPoseController>;
