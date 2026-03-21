"use client";

import { useState } from "react";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { type SpatialPin, type SpatialPinType, createId, formatPinTypeLabel, nowIso } from "@/lib/mvp-workspace";

export interface UseThreeOverlayPinLayerControllerOptions {
    isPlacingPin: boolean;
    pinType: SpatialPinType;
    readOnly: boolean;
    onAddPin: (pin: SpatialPin) => void;
}

export function useThreeOverlayPinLayerController({
    isPlacingPin,
    pinType,
    readOnly,
    onAddPin,
}: UseThreeOverlayPinLayerControllerOptions) {
    const { camera, pointer, raycaster, scene } = useThree();
    const [hoverPosition, setHoverPosition] = useState<THREE.Vector3 | null>(null);

    useFrame(() => {
        if (!isPlacingPin || readOnly) {
            setHoverPosition((prev) => (prev ? null : prev));
            return;
        }
        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObjects(scene.children, true);
        if (intersections.length > 0) {
            setHoverPosition(intersections[0].point.clone());
        } else {
            setHoverPosition(null);
        }
    });

    const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
        if (!isPlacingPin || readOnly) {
            return;
        }
        event.stopPropagation();
        const resolvedPosition = event.point?.clone?.() ?? hoverPosition?.clone() ?? null;
        if (!resolvedPosition) {
            return;
        }
        onAddPin({
            id: createId("pin"),
            label: `${formatPinTypeLabel(pinType)} Pin`,
            type: pinType,
            position: [resolvedPosition.x, resolvedPosition.y, resolvedPosition.z],
            created_at: nowIso(),
        });
    };

    return {
        hoverPosition,
        handlePointerDown,
    };
}

export type ThreeOverlayPinLayerController = ReturnType<typeof useThreeOverlayPinLayerController>;
