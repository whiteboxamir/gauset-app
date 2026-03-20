"use client";

import { type MutableRefObject, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { type CameraPose, type Vector3Tuple, fovToLensMm } from "@/lib/mvp-workspace";
import { EDITOR_CAMERA_FAR, EDITOR_CAMERA_NEAR } from "./threeOverlayShared";

function applyEditorCameraClipping(camera: THREE.PerspectiveCamera) {
    camera.near = EDITOR_CAMERA_NEAR;
    camera.far = EDITOR_CAMERA_FAR;
}

const FOCUS_TRANSITION_DURATION_SECONDS = 0.42;

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
    const focusAnimationRef = useRef<{
        active: boolean;
        elapsed: number;
        fromPosition: THREE.Vector3;
        fromTarget: THREE.Vector3;
        fromUp: THREE.Vector3;
        fromFov: number;
        toPosition: THREE.Vector3;
        toTarget: THREE.Vector3;
        toUp: THREE.Vector3;
        toFov: number;
    }>({
        active: false,
        elapsed: 0,
        fromPosition: new THREE.Vector3(),
        fromTarget: new THREE.Vector3(),
        fromUp: new THREE.Vector3(),
        fromFov: viewerFov,
        toPosition: new THREE.Vector3(),
        toTarget: new THREE.Vector3(),
        toUp: new THREE.Vector3(),
        toFov: viewerFov,
    });

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
        focusAnimationRef.current.active = true;
        focusAnimationRef.current.elapsed = 0;
        focusAnimationRef.current.fromPosition.copy(perspectiveCamera.position);
        focusAnimationRef.current.fromUp.copy(perspectiveCamera.up);
        focusAnimationRef.current.fromFov = perspectiveCamera.fov;
        focusAnimationRef.current.toPosition.set(...focusRequest.position);
        focusAnimationRef.current.toUp.set(...(focusRequest.up ?? [0, 1, 0]));
        focusAnimationRef.current.toFov = focusRequest.fov;
        if (controlsRef.current?.target) {
            focusAnimationRef.current.fromTarget.copy(controlsRef.current.target);
        } else {
            focusAnimationRef.current.fromTarget.set(0, 0, 0);
        }
        focusAnimationRef.current.toTarget.set(...focusRequest.target);
    }, [controlsRef, focusRequest, perspectiveCamera]);

    useFrame((_, delta) => {
        const animation = focusAnimationRef.current;
        if (!animation.active) {
            return;
        }

        animation.elapsed = Math.min(FOCUS_TRANSITION_DURATION_SECONDS, animation.elapsed + delta);
        const rawT = Math.min(1, animation.elapsed / FOCUS_TRANSITION_DURATION_SECONDS);
        const easedT = 1 - Math.pow(1 - rawT, 3);

        perspectiveCamera.position.lerpVectors(animation.fromPosition, animation.toPosition, easedT);
        perspectiveCamera.up.lerpVectors(animation.fromUp, animation.toUp, easedT).normalize();
        applyEditorCameraClipping(perspectiveCamera);
        perspectiveCamera.fov = THREE.MathUtils.lerp(animation.fromFov, animation.toFov, easedT);
        perspectiveCamera.updateProjectionMatrix();

        if (controlsRef.current?.target) {
            controlsRef.current.target.lerpVectors(animation.fromTarget, animation.toTarget, easedT);
            controlsRef.current.update();
        }

        if (rawT >= 1) {
            animation.active = false;
        }
    });

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
