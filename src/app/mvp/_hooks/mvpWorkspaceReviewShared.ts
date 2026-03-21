"use client";

import type { CameraView, ReviewIssueStatus, SpatialPin, ViewerState } from "@/lib/mvp-workspace";

import type { SceneVersion } from "./mvpWorkspaceSessionShared";

export type { SceneVersion } from "./mvpWorkspaceSessionShared";

export interface ReviewAnchorSceneSlices {
    cameraViews: CameraView[];
    pins: SpatialPin[];
    viewer: ViewerState;
}

export interface LegacyComment {
    comment_id: string;
    author: string;
    body: string;
    anchor?: string | null;
    created_at: string;
}

export interface VersionCommentDraft {
    author: string;
    body: string;
}

export interface IssueDraft {
    title: string;
    body: string;
    type: "general" | "egress" | "lighting" | "hazard";
    severity: "low" | "medium" | "high" | "critical";
    status: ReviewIssueStatus;
    assignee: string;
    author: string;
}

export const DEFAULT_ISSUE_DRAFT: IssueDraft = {
    title: "",
    body: "",
    type: "general",
    severity: "medium",
    status: "open",
    assignee: "",
    author: "Reviewer",
};

export const DEFAULT_VERSION_COMMENT_DRAFT: VersionCommentDraft = {
    author: "Reviewer",
    body: "",
};

export function resolveSelectedAnchorLabel({
    cameraViews,
    pins,
    selectedPinId,
    selectedViewId,
}: {
    cameraViews: CameraView[];
    pins: SpatialPin[];
    selectedPinId: string | null;
    selectedViewId: string | null;
}) {
    const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
    if (selectedPin) {
        return `pin ${selectedPin.label}`;
    }

    const selectedView = cameraViews.find((view) => view.id === selectedViewId) ?? null;
    if (selectedView) {
        return `view ${selectedView.label}`;
    }

    return "select a pin or saved view to bind the issue";
}

export function resolveSelectedVersion(versions: SceneVersion[], selectedVersionId: string | null) {
    if (!selectedVersionId) {
        return null;
    }

    return versions.find((version) => version.version_id === selectedVersionId) ?? null;
}

export function resolveVersionCommentAnchor(selectedAnchorLabel: string) {
    return selectedAnchorLabel.startsWith("select a pin or saved view") ? "scene" : selectedAnchorLabel;
}
