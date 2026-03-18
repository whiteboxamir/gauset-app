"use client";

import { formatTimestamp, type SaveState, type SceneVersion } from "@/app/mvp/_hooks/mvpWorkspaceSessionShared";
import type { ReviewIssueSeverity } from "@/lib/mvp-workspace";

export { formatTimestamp };
export type { SaveState, SceneVersion };

export type RightPanelActivityTone = "neutral" | "info" | "success" | "warning";

export interface RightPanelActivityEntry {
    id: string;
    at: string;
    label: string;
    detail: string;
    tone: RightPanelActivityTone;
}

export interface RightPanelChangeSummary {
    persistent: string[];
    sceneDirection: string[];
}

export const statusClassName = (state: SaveState) => {
    if (state === "saved") return "border-emerald-900/40 bg-emerald-950/30 text-emerald-300";
    if (state === "saving") return "border-blue-900/40 bg-blue-950/30 text-blue-300";
    if (state === "recovered") return "border-amber-900/40 bg-amber-950/30 text-amber-200";
    if (state === "error") return "border-rose-900/40 bg-rose-950/30 text-rose-300";
    return "border-neutral-800 bg-neutral-900/70 text-neutral-300";
};

export const formatQualityBand = (value?: string | null) => {
    if (!value) return "";
    return value.replaceAll("_", " ");
};

export const formatApprovalState = (value?: string | null) => {
    if (!value) return "draft";
    return value.replaceAll("_", " ");
};

export const formatMetric = (value?: number | null, digits = 1) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
    return value.toFixed(digits);
};

export const issueSeverityClass = (severity: ReviewIssueSeverity) => {
    if (severity === "critical") return "border-rose-500/30 bg-rose-950/30 text-rose-200";
    if (severity === "high") return "border-amber-500/30 bg-amber-950/30 text-amber-200";
    if (severity === "low") return "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";
    return "border-sky-500/30 bg-sky-950/30 text-sky-200";
};

export const activityToneClass = (tone: RightPanelActivityTone) => {
    if (tone === "info") return "border-sky-500/20 bg-sky-950/20";
    if (tone === "success") return "border-emerald-500/20 bg-emerald-950/20";
    if (tone === "warning") return "border-amber-500/20 bg-amber-950/20";
    return "border-neutral-800 bg-neutral-950/60";
};

type AssetLike = {
    id?: string;
    asset_id?: string;
    name?: string;
};

export const assetLibraryKey = (asset: AssetLike, fallback?: string | number) => {
    if (typeof asset?.id === "string" && asset.id) return asset.id;
    if (typeof asset?.asset_id === "string" && asset.asset_id) return asset.asset_id;
    if (typeof asset?.name === "string" && asset.name) return asset.name;
    return fallback !== undefined ? String(fallback) : "";
};

export function buildLibraryAssetCounts(sceneAssets: AssetLike[]) {
    const counts = new Map<string, number>();
    sceneAssets.forEach((asset, index) => {
        const key = assetLibraryKey(asset, index);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
}

export function resolveNextLocalAsset<T extends AssetLike>(assetsList: T[], libraryAssetCounts: Map<string, number>) {
    return assetsList.find((asset, index) => (libraryAssetCounts.get(assetLibraryKey(asset, index)) ?? 0) === 0) ?? assetsList[0] ?? null;
}
