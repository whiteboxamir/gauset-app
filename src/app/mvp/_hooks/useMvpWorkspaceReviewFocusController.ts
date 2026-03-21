"use client";

import { useCallback } from "react";

import { type CameraView, type ReviewIssue, type SpatialPin, type ViewerState } from "@/lib/mvp-workspace";
import type { MvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStore.ts";
import type { MvpSceneStoreActions } from "@/state/mvpSceneStore.ts";

interface UseMvpWorkspaceReviewFocusControllerOptions {
    cameraViews: CameraView[];
    pins: SpatialPin[];
    viewer: ViewerState;
    selectedPinId: string | null;
    selectedViewId: string | null;
    sceneStoreActions: Pick<MvpSceneStoreActions, "selectPin" | "selectView">;
    editorSessionActions: Pick<MvpEditorSessionStoreActions, "requestFocus">;
}

export function useMvpWorkspaceReviewFocusController({
    cameraViews,
    pins,
    viewer,
    selectedPinId,
    selectedViewId,
    sceneStoreActions,
    editorSessionActions,
}: UseMvpWorkspaceReviewFocusControllerOptions) {
    const focusView = useCallback(
        (view: CameraView) => {
            sceneStoreActions.selectView(view.id);
            editorSessionActions.requestFocus({
                position: view.position,
                target: view.target,
                fov: view.fov,
                lens_mm: view.lens_mm,
            });
        },
        [editorSessionActions, sceneStoreActions],
    );

    const focusPin = useCallback(
        (pin: SpatialPin) => {
            const selectedView = cameraViews.find((view) => view.id === selectedViewId) ?? null;
            sceneStoreActions.selectPin(pin.id);
            const fallbackView = selectedView ?? cameraViews[0] ?? null;
            editorSessionActions.requestFocus(
                fallbackView
                    ? {
                          position: fallbackView.position,
                          target: pin.position,
                          fov: fallbackView.fov,
                          lens_mm: fallbackView.lens_mm,
                      }
                    : {
                          position: [pin.position[0] + 4, pin.position[1] + 2, pin.position[2] + 4],
                          target: pin.position,
                          fov: viewer.fov,
                          lens_mm: viewer.lens_mm,
                      },
            );
        },
        [cameraViews, editorSessionActions, sceneStoreActions, selectedViewId, viewer],
    );

    const focusWorkspace = useCallback(() => {
        const latestView = cameraViews[cameraViews.length - 1] ?? null;
        if (latestView) {
            sceneStoreActions.selectView(latestView.id);
            editorSessionActions.requestFocus({
                position: latestView.position,
                target: latestView.target,
                fov: latestView.fov,
                lens_mm: latestView.lens_mm,
            });
            return;
        }

        const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
        const target = selectedPin?.position ?? ([0, 0, 0] as [number, number, number]);
        editorSessionActions.requestFocus({
            position: [target[0] + 6, target[1] + 4, target[2] + 6],
            target,
            fov: viewer.fov,
            lens_mm: viewer.lens_mm,
        });
    }, [cameraViews, editorSessionActions, pins, sceneStoreActions, selectedPinId, viewer]);

    const focusIssue = useCallback(
        (issue: ReviewIssue) => {
            if (issue.anchor_view_id) {
                const view = cameraViews.find((candidate) => candidate.id === issue.anchor_view_id);
                if (view) {
                    focusView(view);
                    return;
                }
            }

            if (issue.anchor_position) {
                editorSessionActions.requestFocus({
                    position: [issue.anchor_position[0] + 4, issue.anchor_position[1] + 2, issue.anchor_position[2] + 4],
                    target: issue.anchor_position,
                    fov: viewer.fov,
                    lens_mm: viewer.lens_mm,
                });
            }
        },
        [cameraViews, editorSessionActions, focusView, viewer],
    );

    return {
        focusWorkspace,
        focusView,
        focusPin,
        focusIssue,
    };
}

export type MvpWorkspaceReviewFocusController = ReturnType<typeof useMvpWorkspaceReviewFocusController>;
