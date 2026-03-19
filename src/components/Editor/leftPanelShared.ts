import type { JobType } from "@/app/mvp/_hooks/mvpWorkspaceIntakeShared";

export type LeftPanelPreviewWorkspaceNavigation = {
    eyebrow?: string;
    title: string;
    note: string;
    backLabel?: string;
    backToStartHref?: string | null;
    onBackToStart: () => void;
};

export function formatBandLabel(value?: string | null) {
    if (!value) return "";
    return value.replaceAll("_", " ");
}

export function formatScore(value?: number | null, digits = 1) {
    if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
    return value.toFixed(digits);
}

export function truncateLabel(value?: string | null, max = 52) {
    if (!value) return "";
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function formatJobTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "just now";
    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

export function resolveJobTypeLabel(type: JobType) {
    if (type === "environment") return "Preview";
    if (type === "reconstruction") return "Reconstruction";
    if (type === "generated_image") return "Generated Image";
    return "Asset";
}
