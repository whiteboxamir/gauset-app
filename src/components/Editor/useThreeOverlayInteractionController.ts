"use client";

import { type MutableRefObject, useCallback, useEffect } from "react";
import * as THREE from "three";

import { type SpatialPin, type SpatialPinType, createId, formatPinTypeLabel, nowIso } from "@/lib/mvp-workspace";
import type { SceneNodeId } from "@/lib/scene-graph/types.ts";
import type { MvpSceneSelectionMode } from "@/state/mvpSceneStore.ts";
import type { AssetTransformPatch } from "./threeOverlayShared";

interface SelectionModifierEvent {
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
}

function resolveSelectionMode(event?: SelectionModifierEvent): MvpSceneSelectionMode {
    if (event?.metaKey || event?.ctrlKey) {
        return "toggle";
    }
    if (event?.shiftKey) {
        return "add";
    }
    return "replace";
}

export interface UseThreeOverlayInteractionControllerOptions {
    controlsRef: MutableRefObject<any>;
    canvasElementRef: MutableRefObject<HTMLCanvasElement | null>;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    readOnly: boolean;
    onSelectPin?: (pinId: string | null) => void;
    onClearSelection?: () => void;
    onSelectNode?: (nodeId: SceneNodeId, options?: { mode?: MvpSceneSelectionMode }) => void;
    onSelectAsset?: (instanceId: string, options?: { mode?: MvpSceneSelectionMode }) => void;
    onUpdateNodeTransformDraft?: (nodeId: SceneNodeId, patch: AssetTransformPatch) => void;
    onUpdateAssetTransformDraft?: (instanceId: string, patch: AssetTransformPatch) => void;
    onCommitSceneTransforms?: () => void;
    onAppendPin?: (pin: SpatialPin) => void;
}

export function useThreeOverlayInteractionController({
    controlsRef,
    canvasElementRef,
    isPinPlacementEnabled,
    pinType,
    readOnly,
    onSelectPin,
    onClearSelection,
    onSelectNode,
    onSelectAsset,
    onUpdateNodeTransformDraft,
    onUpdateAssetTransformDraft,
    onCommitSceneTransforms,
    onAppendPin,
}: UseThreeOverlayInteractionControllerOptions) {
    const selectPin = useCallback(
        (pinId: string | null) => {
            if (!onSelectPin) {
                return;
            }
            onSelectPin(pinId);
        },
        [onSelectPin],
    );

    const clearSceneSelection = useCallback(() => {
        if (onClearSelection) {
            onClearSelection();
            return;
        }
        onSelectPin?.(null);
    }, [onClearSelection, onSelectPin]);

    const updateAssetTransform = useCallback(
        (instanceId: string, patch: AssetTransformPatch) => {
            onUpdateAssetTransformDraft?.(instanceId, patch);
        },
        [onUpdateAssetTransformDraft],
    );

    const updateNodeTransform = useCallback(
        (nodeId: SceneNodeId, patch: AssetTransformPatch) => {
            onUpdateNodeTransformDraft?.(nodeId, patch);
        },
        [onUpdateNodeTransformDraft],
    );

    const commitSceneTransforms = useCallback(() => {
        onCommitSceneTransforms?.();
    }, [onCommitSceneTransforms]);

    const addPin = useCallback(
        (pin: SpatialPin) => {
            if (!onAppendPin) {
                return;
            }
            onAppendPin(pin);
            selectPin(pin.id);
        },
        [onAppendPin, selectPin],
    );

    const selectSceneAsset = useCallback(
        (instanceId: string, event?: SelectionModifierEvent) => {
            onSelectAsset?.(instanceId, { mode: resolveSelectionMode(event) });
        },
        [onSelectAsset],
    );

    const selectSceneNode = useCallback(
        (nodeId: SceneNodeId, event?: SelectionModifierEvent) => {
            onSelectNode?.(nodeId, { mode: resolveSelectionMode(event) });
        },
        [onSelectNode],
    );

    const addPinAtControlsTarget = useCallback(() => {
        if (!isPinPlacementEnabled || readOnly) {
            return false;
        }

        const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);

        addPin({
            id: createId("pin"),
            label: `${formatPinTypeLabel(pinType)} Pin`,
            type: pinType,
            position: [target.x, target.y, target.z],
            created_at: nowIso(),
        });
        return true;
    }, [addPin, controlsRef, isPinPlacementEnabled, pinType, readOnly]);

    useEffect(() => {
        const canvas = canvasElementRef.current;
        if (!canvas || !isPinPlacementEnabled || readOnly) {
            return;
        }

        const handleCanvasClick = () => {
            addPinAtControlsTarget();
        };

        canvas.addEventListener("click", handleCanvasClick);
        return () => {
            canvas.removeEventListener("click", handleCanvasClick);
        };
    }, [addPinAtControlsTarget, canvasElementRef, isPinPlacementEnabled, readOnly]);

    return {
        selectPin,
        clearSceneSelection,
        updateAssetTransform,
        updateNodeTransform,
        commitSceneTransforms,
        addPin,
        selectSceneAsset,
        selectSceneNode,
    };
}

export type ThreeOverlayInteractionController = ReturnType<typeof useThreeOverlayInteractionController>;
