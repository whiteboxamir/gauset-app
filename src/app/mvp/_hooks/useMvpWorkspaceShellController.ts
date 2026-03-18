"use client";

import { useCallback, useMemo } from "react";

import type { MvpSceneStore } from "@/state/mvpSceneStore.ts";

interface UseMvpWorkspaceShellControllerOptions {
    sceneStore: MvpSceneStore;
}

export function useMvpWorkspaceShellController({ sceneStore }: UseMvpWorkspaceShellControllerOptions) {
    const sceneStoreActions = useMemo(() => sceneStore.getState().actions, [sceneStore]);

    const replaceSceneEnvironment = useCallback(
        (environment: Record<string, unknown> | null) => {
            sceneStoreActions.setEnvironment(environment);
        },
        [sceneStoreActions],
    );

    const appendSceneAsset = useCallback(
        (asset: Record<string, unknown>) => {
            sceneStoreActions.appendAsset(asset);
        },
        [sceneStoreActions],
    );

    const duplicateSceneAsset = useCallback(
        (instanceId: string) => {
            sceneStoreActions.duplicateAsset(instanceId);
        },
        [sceneStoreActions],
    );

    const removeSceneAsset = useCallback(
        (instanceId: string) => {
            sceneStoreActions.removeAsset(instanceId);
        },
        [sceneStoreActions],
    );

    const removeScenePin = useCallback(
        (pinId: string) => {
            sceneStoreActions.removePin(pinId);
        },
        [sceneStoreActions],
    );

    const removeSceneView = useCallback(
        (viewId: string) => {
            sceneStoreActions.removeCameraView(viewId);
        },
        [sceneStoreActions],
    );

    return {
        replaceSceneEnvironment,
        appendSceneAsset,
        duplicateSceneAsset,
        removeSceneAsset,
        removeScenePin,
        removeSceneView,
    };
}

export type MvpWorkspaceShellController = ReturnType<typeof useMvpWorkspaceShellController>;
