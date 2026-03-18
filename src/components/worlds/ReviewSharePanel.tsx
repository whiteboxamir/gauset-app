"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type {
    CreateReviewShareResponse,
    ReviewShareCollectionSummary,
    ReviewShareReadiness,
    ReviewShareSummary,
} from "@/server/contracts/review-shares";
import type { ProjectWorldLink } from "@/server/contracts/projects";

import { EmptyState } from "@/components/platform/EmptyState";
import { copyTextToClipboard } from "@/lib/browserClipboard";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";

import { buildProjectReviewShareCreateRequest } from "./reviewShareRequest";

interface SceneVersion {
    version_id: string;
    saved_at: string;
    source?: string;
    comment_count?: number;
    summary?: {
        asset_count?: number;
        has_environment?: boolean;
    };
}

const EXPIRY_OPTIONS = [
    { label: "24 hours", value: 24 },
    { label: "7 days", value: 24 * 7 },
    { label: "30 days", value: 24 * 30 },
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatDate(value?: string | null, fallback = "Never") {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return dateFormatter.format(date);
}

function getShareStatusTone(status: ReviewShareSummary["status"]) {
    switch (status) {
        case "active":
            return "success";
        case "revoked":
            return "danger";
        case "expired":
            return "warning";
        default:
            return "neutral";
    }
}

function getExpiryTone(expiresAt: string) {
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) {
        return "danger";
    }
    if (remaining <= 24 * 60 * 60 * 1000) {
        return "warning";
    }
    return "neutral";
}

function getContentModeLabel(contentMode: ReviewShareSummary["contentMode"]) {
    return contentMode === "saved_version" ? "Version-locked" : "Inline package";
}

function getContentModeSummary(contentMode: ReviewShareSummary["contentMode"]) {
    return contentMode === "saved_version"
        ? "Pinned to a saved scene version. Later /mvp saves do not silently mutate this review link."
        : "Carries a frozen inline payload snapshot. It does not point at mutable project version history.";
}

function getDeliveryModeLabel(deliveryMode: ReviewShareSummary["deliveryMode"]) {
    return deliveryMode === "secure_link" ? "Signed link" : "Imported manual record";
}

function getDeliveryModeSummary(deliveryMode: ReviewShareSummary["deliveryMode"]) {
    return deliveryMode === "secure_link"
        ? "Access stays revocable and audited through the persisted platform proxy path."
        : "This row is historical delivery bookkeeping only. This panel does not mint manual handoff channels.";
}

function humanizeToken(value: string) {
    return value.replaceAll("_", " ").trim();
}

function getReadinessTone(state: ReviewShareReadiness["state"]) {
    switch (state) {
        case "ready":
            return "success";
        case "review_only":
            return "warning";
        case "blocked":
            return "danger";
        default:
            return "neutral";
    }
}

function getReadinessLabel(state: ReviewShareReadiness["state"]) {
    switch (state) {
        case "ready":
            return "Ready for secure review";
        case "review_only":
            return "Review-only posture";
        case "blocked":
            return "Share blocked";
        default:
            return "Unknown posture";
    }
}

export function ReviewSharePanel({
    projectId,
    worldLinks,
    canAccessMvp,
    canManageReviewShares,
    reviewShares,
    reviewShareSummary,
}: {
    projectId: string;
    worldLinks: ProjectWorldLink[];
    canAccessMvp: boolean;
    canManageReviewShares: boolean;
    reviewShares: ReviewShareSummary[];
    reviewShareSummary: ReviewShareCollectionSummary;
}) {
    const router = useRouter();
    const primaryWorld = useMemo(() => worldLinks.find((entry) => entry.isPrimary) ?? worldLinks[0] ?? null, [worldLinks]);
    const [selectedSceneId, setSelectedSceneId] = useState(primaryWorld?.sceneId ?? "");
    const [selectedVersionId, setSelectedVersionId] = useState("");
    const [versions, setVersions] = useState<SceneVersion[]>([]);
    const [expiresInHours, setExpiresInHours] = useState<number>(24 * 7);
    const [shareLabel, setShareLabel] = useState("");
    const [shareNote, setShareNote] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pendingShareId, setPendingShareId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<"create" | "copy" | "revoke" | null>(null);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);
    const [selectedReadiness, setSelectedReadiness] = useState<ReviewShareReadiness | null>(null);
    const [readinessError, setReadinessError] = useState("");
    const [isPending, startTransition] = useTransition();
    const createShareRequestRef = useRef<Promise<CreateReviewShareResponse> | null>(null);

    useEffect(() => {
        if (!selectedSceneId && primaryWorld?.sceneId) {
            setSelectedSceneId(primaryWorld.sceneId);
        }
    }, [primaryWorld?.sceneId, selectedSceneId]);

    useEffect(() => {
        if (!canAccessMvp || !selectedSceneId) {
            setVersions([]);
            setSelectedVersionId("");
            setSelectedReadiness(null);
            setReadinessError("");
            return;
        }

        let cancelled = false;
        const loadVersions = async () => {
            setIsLoadingVersions(true);
            setError("");
            setVersions([]);
            setSelectedVersionId("");
            try {
                const response = await fetch(`${MVP_API_BASE_URL}/scene/${selectedSceneId}/versions`, {
                    cache: "no-store",
                });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Version history unavailable (${response.status})`));
                }
                const payload = await response.json();
                if (!cancelled) {
                    const nextVersions = Array.isArray(payload.versions) ? (payload.versions as SceneVersion[]) : [];
                    setVersions(nextVersions);
                    setSelectedVersionId((previous) =>
                        nextVersions.some((version) => version.version_id === previous) ? previous : nextVersions[0]?.version_id ?? "",
                    );
                }
            } catch (loadError) {
                if (!cancelled) {
                    setVersions([]);
                    setSelectedVersionId("");
                    setError(loadError instanceof Error ? loadError.message : "Unable to load saved versions.");
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingVersions(false);
                }
            }
        };

        void loadVersions();
        return () => {
            cancelled = true;
        };
    }, [canAccessMvp, selectedSceneId]);

    useEffect(() => {
        if (!canAccessMvp || !selectedSceneId || !selectedVersionId) {
            setSelectedReadiness(null);
            setReadinessError("");
            setIsLoadingReadiness(false);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        const loadReadiness = async () => {
            setIsLoadingReadiness(true);
            setReadinessError("");
            try {
                const response = await fetch(
                    `/api/projects/${projectId}/review-shares/readiness?sceneId=${encodeURIComponent(selectedSceneId)}&versionId=${encodeURIComponent(selectedVersionId)}`,
                    {
                        cache: "no-store",
                        signal: controller.signal,
                    },
                );
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Version posture unavailable (${response.status})`));
                }

                const payload = (await response.json()) as ReviewShareReadiness;
                if (!cancelled) {
                    setSelectedReadiness(payload);
                }
            } catch (loadError) {
                if (!cancelled && !controller.signal.aborted) {
                    setSelectedReadiness(null);
                    setReadinessError(loadError instanceof Error ? loadError.message : "Unable to inspect version posture.");
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingReadiness(false);
                }
            }
        };

        void loadReadiness();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [canAccessMvp, projectId, selectedSceneId, selectedVersionId]);

    const selectedWorldLink = worldLinks.find((entry) => entry.sceneId === selectedSceneId) ?? primaryWorld;
    const selectedVersion = versions.find((entry) => entry.version_id === selectedVersionId) ?? versions[0] ?? null;
    const activeShares = reviewShares.filter((share) => share.status === "active");
    const historicalShares = reviewShares.filter((share) => share.status !== "active");
    const versionLockedShareCount = reviewShares.filter((share) => share.contentMode === "saved_version").length;
    const inlinePackageShareCount = reviewShares.filter((share) => share.contentMode === "inline_package").length;
    const manualDeliveryShareCount = reviewShares.filter((share) => share.deliveryMode === "manual").length;
    const signedDeliveryShareCount = reviewShares.length - manualDeliveryShareCount;
    const selectedVersionSummary = selectedVersion
        ? `${selectedVersion.version_id} · ${formatDate(selectedVersion.saved_at)}`
        : isLoadingVersions
          ? "Loading saved versions..."
          : "Save a version in /mvp before publishing a secure review link.";
    const createActionLabel =
        pendingAction === "create"
            ? "Signing link..."
            : selectedReadiness?.state === "review_only"
              ? "Create review-only link"
              : "Create secure review link";
    const selectedReadinessBlockers = selectedReadiness?.blockers.map(humanizeToken) ?? [];

    const createShare = () => {
        if (!selectedSceneId || !selectedVersion?.version_id) {
            setError("Save at least one scene version before creating a secure review link.");
            return;
        }

        if (createShareRequestRef.current) {
            return;
        }

        setPendingShareId(null);
        setPendingAction("create");
        setMessage("");
        setError("");
        const createShareRequest = (async () => {
            const shareResponse = await fetch("/api/review-shares", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(
                    buildProjectReviewShareCreateRequest({
                        projectId,
                        sceneId: selectedSceneId,
                        versionId: selectedVersion.version_id,
                        expiresInHours,
                        label: shareLabel,
                        note: shareNote,
                    }),
                ),
            });
            if (!shareResponse.ok) {
                throw new Error(await extractApiError(shareResponse, `Secure review share failed (${shareResponse.status})`));
            }

            return (await shareResponse.json()) as CreateReviewShareResponse;
        })();

        createShareRequestRef.current = createShareRequest;
        startTransition(async () => {
            try {
                const payload = await createShareRequest;
                setShareUrl(payload.shareUrl);
                setExpiresAt(payload.expiresAt);
                setShareLabel("");
                setShareNote("");

                try {
                    await copyTextToClipboard(payload.shareUrl);
                    setMessage(
                        payload.shareMode === "localhost_fallback"
                            ? "Local review link created and copied."
                            : "Secure review link created, persisted, and copied.",
                    );
                } catch {
                    setMessage(
                        payload.shareMode === "localhost_fallback"
                            ? "Local review link created."
                            : "Secure review link created and persisted.",
                    );
                }

                router.refresh();
            } catch (shareError) {
                setError(shareError instanceof Error ? shareError.message : "Unable to create secure review share.");
            } finally {
                createShareRequestRef.current = null;
                setPendingAction(null);
            }
        });
    };

    const copyShare = (share: ReviewShareSummary) => {
        const sharePath = share.sharePath;
        if (!sharePath) {
            setError("This review share URL is intentionally hidden for your current access level.");
            return;
        }

        setPendingShareId(share.id);
        setPendingAction("copy");
        setMessage("");
        setError("");
        startTransition(async () => {
            try {
                const absoluteUrl = new URL(sharePath, window.location.origin).toString();
                await copyTextToClipboard(absoluteUrl);
                await fetch(`/api/review-shares/${share.id}/copy`, {
                    method: "POST",
                });
                setMessage(`Copied ${share.label ?? share.id}.`);
            } catch (copyError) {
                setError(copyError instanceof Error ? copyError.message : "Unable to copy secure review share.");
            } finally {
                setPendingAction(null);
                setPendingShareId(null);
            }
        });
    };

    const revokeShare = (share: ReviewShareSummary) => {
        setPendingShareId(share.id);
        setPendingAction("revoke");
        setMessage("");
        setError("");
        startTransition(async () => {
            try {
                const response = await fetch(`/api/review-shares/${share.id}/revoke`, {
                    method: "POST",
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to revoke review share.");
                }
                setMessage(`Revoked ${share.label ?? share.id}.`);
                router.refresh();
            } catch (revokeError) {
                setError(revokeError instanceof Error ? revokeError.message : "Unable to revoke review share.");
            } finally {
                setPendingAction(null);
                setPendingShareId(null);
            }
        });
    };

    if (worldLinks.length === 0 && reviewShares.length === 0) {
        return (
            <EmptyState
                eyebrow="Review sharing"
                title="No linked world to share yet"
                body="Link a world to this project first, then create signed review links for specific saved versions with persisted history and revocation controls."
            />
        );
    }

    return (
        <section id="review-shares" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Secure review sharing</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Operator-grade review links</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        Signed review links now persist in the platform database, can be revoked immediately, and report real access history without broadening anonymous access to `/api/mvp`.
                    </p>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
                        If the signing secret or MVP entitlement is missing in the current environment, share creation fails explicitly instead of pretending review delivery is live.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={canAccessMvp ? "MVP access ready" : "MVP access blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    <StatusBadge label={`${reviewShareSummary.activeCount} active`} tone={reviewShareSummary.activeCount > 0 ? "success" : "neutral"} />
                    <StatusBadge label={`${reviewShareSummary.revokedCount} revoked`} tone={reviewShareSummary.revokedCount > 0 ? "danger" : "neutral"} />
                    <StatusBadge label={`${reviewShareSummary.expiredCount} expired`} tone={reviewShareSummary.expiredCount > 0 ? "warning" : "neutral"} />
                    <StatusBadge label={`${versionLockedShareCount} version-locked`} tone={versionLockedShareCount > 0 ? "info" : "neutral"} />
                    <StatusBadge label={`${inlinePackageShareCount} inline`} tone={inlinePackageShareCount > 0 ? "warning" : "neutral"} />
                </div>
            </div>

            {!canAccessMvp ? (
                <EmptyState
                    className="mt-5"
                    eyebrow="Entitlement"
                    title="World review sharing is blocked"
                    body="This account must have MVP access before it can mint or open secure review links."
                />
            ) : (
                <>
                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.05fr),minmax(320px,0.95fr)]">
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Create secure review link</p>
                                    <p className="mt-2 text-sm text-neutral-400">
                                        Choose a linked scene, lock to a saved version, and publish a revocable review share.
                                    </p>
                                </div>
                                {!canManageReviewShares ? <StatusBadge label="Read-only access" tone="warning" /> : null}
                            </div>

                            <div className="mt-5 grid gap-4">
                                <label className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Linked scene</span>
                                    <select
                                        value={selectedSceneId}
                                        onChange={(event) => setSelectedSceneId(event.target.value)}
                                        disabled={isPending || !canManageReviewShares || worldLinks.length === 0}
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:opacity-60"
                                    >
                                        {worldLinks.length === 0 ? (
                                            <option value="" className="bg-neutral-950 text-white">
                                                No linked worlds
                                            </option>
                                        ) : (
                                            worldLinks.map((worldLink) => (
                                                <option key={worldLink.id} value={worldLink.sceneId} className="bg-neutral-950 text-white">
                                                    {worldLink.sceneId} {worldLink.environmentLabel ? `· ${worldLink.environmentLabel}` : ""}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Saved version</span>
                                    <select
                                        value={selectedVersionId}
                                        onChange={(event) => setSelectedVersionId(event.target.value)}
                                        disabled={isPending || isLoadingVersions || versions.length === 0 || !canManageReviewShares}
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:opacity-60"
                                    >
                                        {versions.length === 0 ? (
                                            <option value="" className="bg-neutral-950 text-white">
                                                {isLoadingVersions ? "Loading versions..." : "No saved versions"}
                                            </option>
                                        ) : (
                                            versions.map((version) => (
                                                <option key={version.version_id} value={version.version_id} className="bg-neutral-950 text-white">
                                                    {version.version_id} · {version.saved_at}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    <p className="text-xs leading-5 text-neutral-500">
                                        Secure review links stay pinned to a saved version. If version history is unavailable, this panel blocks link creation instead of faking a live handoff.
                                    </p>
                                    <p className="text-xs leading-5 text-neutral-500">
                                        This project surface only mints version-locked shares from linked scenes. If inline packages appear here from another controlled flow, they stay
                                        labeled as inline payload truth instead of being treated like saved history.
                                    </p>
                                </label>

                                <div className="grid gap-4 lg:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Share label</span>
                                        <input
                                            value={shareLabel}
                                            onChange={(event) => setShareLabel(event.target.value)}
                                            placeholder="Design-partner v2 review"
                                            disabled={isPending || !canManageReviewShares}
                                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:opacity-60"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Link lifetime</span>
                                        <select
                                            value={String(expiresInHours)}
                                            onChange={(event) => setExpiresInHours(Number(event.target.value))}
                                            disabled={isPending || !canManageReviewShares}
                                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:opacity-60"
                                        >
                                            {EXPIRY_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value} className="bg-neutral-950 text-white">
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Operator note</span>
                                    <textarea
                                        value={shareNote}
                                        onChange={(event) => setShareNote(event.target.value)}
                                        placeholder="What the design partner should validate on this pass."
                                        disabled={isPending || !canManageReviewShares}
                                        rows={3}
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:opacity-60"
                                    />
                                </label>

                                {selectedVersion ? (
                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Selected version posture</p>
                                                <p className="mt-2 text-sm font-medium text-white">
                                                    {isLoadingReadiness
                                                        ? "Inspecting saved world truth..."
                                                        : selectedReadiness?.summary ?? "Saved version selected."}
                                                </p>
                                                <p className="mt-2 text-sm leading-6 text-neutral-400">
                                                    {isLoadingReadiness
                                                        ? "Checking whether this version is only safe for review or also clears downstream handoff blockers."
                                                        : readinessError || selectedReadiness?.detail || "Truth posture is unavailable right now."}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {isLoadingReadiness ? <StatusBadge label="Inspecting truth" tone="neutral" /> : null}
                                                {!isLoadingReadiness && selectedReadiness ? (
                                                    <StatusBadge label={getReadinessLabel(selectedReadiness.state)} tone={getReadinessTone(selectedReadiness.state)} />
                                                ) : null}
                                                {!isLoadingReadiness && !selectedReadiness && readinessError ? (
                                                    <StatusBadge label="Truth unavailable" tone="warning" />
                                                ) : null}
                                                {selectedReadiness?.truthSummary?.lane ? (
                                                    <StatusBadge label={humanizeToken(selectedReadiness.truthSummary.lane)} tone="neutral" />
                                                ) : null}
                                                {selectedReadiness?.truthSummary?.deliveryStatus ? (
                                                    <StatusBadge label={humanizeToken(selectedReadiness.truthSummary.deliveryStatus)} tone="neutral" />
                                                ) : null}
                                            </div>
                                        </div>

                                        {selectedReadinessBlockers.length > 0 ? (
                                            <p className="mt-3 text-xs leading-5 text-amber-200/80">Blockers: {selectedReadinessBlockers.join(", ")}</p>
                                        ) : null}
                                        {selectedReadiness?.truthSummary?.truthLabel ? (
                                            <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                Saved world truth: <span className="text-neutral-300">{selectedReadiness.truthSummary.truthLabel}</span>
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-5 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={createShare}
                                    disabled={
                                        isPending ||
                                        isLoadingVersions ||
                                        isLoadingReadiness ||
                                        !selectedSceneId ||
                                        !selectedVersion ||
                                        !canManageReviewShares ||
                                        selectedReadiness?.canCreate === false
                                    }
                                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {createActionLabel}
                                </button>
                                {shareUrl ? (
                                    <a
                                        href={shareUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                    >
                                        Open latest review
                                    </a>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Current share posture</p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Primary scene</p>
                                    <p className="mt-3 text-sm font-medium text-white">{selectedWorldLink?.sceneId ?? "No linked scene"}</p>
                                    <p className="mt-1 text-sm text-neutral-500">{selectedWorldLink?.environmentLabel ?? "No environment label"}</p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Selected anchor</p>
                                    <p className="mt-3 text-sm font-medium text-white">{selectedVersion ? "Version-locked" : "Awaiting save"}</p>
                                    <p className="mt-1 text-sm text-neutral-500">{selectedVersionSummary}</p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Latest persisted link</p>
                                    <p className="mt-3 text-sm font-medium text-white">{shareUrl ? "Ready" : "No new link this session"}</p>
                                    <p className="mt-1 text-sm text-neutral-500">
                                        {expiresAt ? `Expires ${formatDate(expiresAt)}` : "Create a share to publish the next version-locked review link."}
                                    </p>
                                </article>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Payload truth</p>
                                    <p className="mt-3 text-sm font-medium text-white">
                                        {versionLockedShareCount} version-locked / {inlinePackageShareCount} inline
                                    </p>
                                    <p className="mt-1 text-sm text-neutral-500">
                                        Version-locked rows stay bound to saved history. Inline rows stay explicit so operators do not confuse frozen payload snapshots with reopenable scene
                                        versions.
                                    </p>
                                </article>
                                <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Delivery history</p>
                                    <p className="mt-3 text-sm font-medium text-white">
                                        {signedDeliveryShareCount} signed / {manualDeliveryShareCount} imported manual
                                    </p>
                                    <p className="mt-1 text-sm text-neutral-500">
                                        Signed links stay revocable and auditable through the platform proxy. Manual rows remain labeled as historical records so this panel never implies
                                        live external access that is not actually being enforced.
                                    </p>
                                </article>
                            </div>

                            {selectedVersion ? (
                                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-300">
                                    <p className="font-medium text-white">{selectedVersion.version_id}</p>
                                    <p className="mt-1 text-neutral-500">{selectedVersion.saved_at}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <StatusBadge label={selectedVersion.source ?? "manual"} tone="neutral" />
                                        <StatusBadge
                                            label={
                                                selectedVersion.summary?.asset_count !== undefined
                                                    ? `${selectedVersion.summary.asset_count} assets`
                                                    : "Asset summary pending"
                                            }
                                            tone="info"
                                        />
                                        <StatusBadge
                                            label={selectedVersion.summary?.has_environment ? "Environment included" : "No environment"}
                                            tone={selectedVersion.summary?.has_environment ? "success" : "warning"}
                                        />
                                        <StatusBadge
                                            label={selectedReadiness ? getReadinessLabel(selectedReadiness.state) : "Version-locked output"}
                                            tone={selectedReadiness ? getReadinessTone(selectedReadiness.state) : "info"}
                                        />
                                    </div>
                                    {selectedReadiness?.detail ? <p className="mt-3 text-xs leading-5 text-neutral-500">{selectedReadiness.detail}</p> : null}
                                    {!selectedReadiness && readinessError ? <p className="mt-3 text-xs leading-5 text-amber-200/80">{readinessError}</p> : null}
                                </div>
                            ) : null}

                            {!canManageReviewShares ? (
                                <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                    You can audit persisted share history here, but only owners, editors, and reviewers can mint, reveal, copy, or revoke live links.
                                </p>
                            ) : null}
                        </div>
                    </div>

                    {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
                    {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Active shares</p>
                                    <h4 className="mt-2 text-base font-medium text-white">Live external review access</h4>
                                </div>
                                <StatusBadge label={`${activeShares.length} live`} tone={activeShares.length > 0 ? "success" : "neutral"} />
                            </div>

                            {activeShares.length === 0 ? (
                                <EmptyState
                                    className="mt-4 border-white/10 bg-black/20 p-6 shadow-none"
                                    eyebrow="Live links"
                                    title="No active review shares"
                                    body="Create the first persisted secure link from the panel above when this project is ready for external review."
                                />
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {activeShares.map((share) => (
                                        <article key={share.id} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                                            {/*
                                              Share history is visible to all project members, but only manage-role members
                                              receive freshly signed project review URLs from the server.
                                            */}
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-medium text-white">{share.label ?? share.id}</p>
                                                        <StatusBadge label={share.status} tone={getShareStatusTone(share.status)} />
                                                        <StatusBadge label={getContentModeLabel(share.contentMode)} tone="info" />
                                                        <StatusBadge label={getDeliveryModeLabel(share.deliveryMode)} tone="neutral" />
                                                        {share.truthSummary?.lane ? (
                                                            <StatusBadge label={share.truthSummary.lane.replaceAll("_", " ")} tone="neutral" />
                                                        ) : null}
                                                        {share.truthSummary?.deliveryStatus ? (
                                                            <StatusBadge label={share.truthSummary.deliveryStatus.replaceAll("_", " ")} tone="neutral" />
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-2 text-sm text-neutral-400">
                                                        {share.sceneId ?? "Scene pending"} {share.versionId ? `· ${share.versionId}` : "· Inline payload"}
                                                    </p>
                                                    {share.note ? <p className="mt-2 text-sm text-neutral-500">{share.note}</p> : null}
                                                    <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                        {getContentModeSummary(share.contentMode)} {getDeliveryModeSummary(share.deliveryMode)}
                                                    </p>
                                                    {share.truthSummary?.truthLabel ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                            Saved world truth: <span className="text-neutral-300">{share.truthSummary.truthLabel}</span>
                                                        </p>
                                                    ) : null}
                                                    {share.truthSummary?.blockers?.length ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                            Blockers: {share.truthSummary.blockers.join(", ")}
                                                        </p>
                                                    ) : null}
                                                    {share.truthSummary?.ingestRecordId ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">Ingest record: {share.truthSummary.ingestRecordId}</p>
                                                    ) : null}
                                                    {share.truthSummary?.downstreamTargetSummary ? (
                                                        <p className="mt-1 text-xs leading-5 text-neutral-500">{share.truthSummary.downstreamTargetSummary}</p>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <StatusBadge label={`Expires ${formatDate(share.expiresAt)}`} tone={getExpiryTone(share.expiresAt)} />
                                                    {canManageReviewShares && share.sharePath ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyShare(share)}
                                                                disabled={isPending && pendingShareId === share.id}
                                                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                                            >
                                                                {pendingAction === "copy" && pendingShareId === share.id ? "Copying..." : "Copy"}
                                                            </button>
                                                            <a
                                                                href={share.sharePath}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                                            >
                                                                Open
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => revokeShare(share)}
                                                                disabled={isPending && pendingShareId === share.id}
                                                                className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition-colors hover:border-rose-300/40 hover:bg-rose-500/20 disabled:opacity-60"
                                                            >
                                                                {pendingAction === "revoke" && pendingShareId === share.id ? "Revoking..." : "Revoke"}
                                                            </button>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Created by</p>
                                                    <p className="mt-2 text-sm text-white">{share.createdByLabel}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">{formatDate(share.createdAt)}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Last accessed</p>
                                                    <p className="mt-2 text-sm text-white">{share.lastAccessedAt ? formatDate(share.lastAccessedAt) : "No access yet"}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">Backed by persisted proxy access events.</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Token scope</p>
                                                    <p className="mt-2 text-sm text-white">{getContentModeLabel(share.contentMode)}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        {share.sceneId ? `Scene ${share.sceneId}` : "Storage-only scope"} · {getDeliveryModeLabel(share.deliveryMode)}
                                                    </p>
                                                </div>
                                            </div>

                                            {share.recentEvents.length > 0 ? (
                                                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Recent share events</p>
                                                    <div className="mt-3 space-y-2">
                                                        {share.recentEvents.map((event) => (
                                                            <div key={event.id} className="flex items-start justify-between gap-4 text-sm">
                                                                <p className="text-neutral-300">{event.summary}</p>
                                                                <p className="whitespace-nowrap text-xs text-neutral-500">{formatDate(event.createdAt)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Share history</p>
                                    <h4 className="mt-2 text-base font-medium text-white">Revoked and expired links</h4>
                                </div>
                                <StatusBadge label={`${historicalShares.length} archived`} tone={historicalShares.length > 0 ? "warning" : "neutral"} />
                            </div>

                            {historicalShares.length === 0 ? (
                                <EmptyState
                                    className="mt-4 border-white/10 bg-black/20 p-6 shadow-none"
                                    eyebrow="History"
                                    title="No archived shares yet"
                                    body="Revoked or expired links will accumulate here with their last known access state and audit trail."
                                />
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {historicalShares.map((share) => (
                                        <article key={share.id} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-medium text-white">{share.label ?? share.id}</p>
                                                        <StatusBadge label={share.status} tone={getShareStatusTone(share.status)} />
                                                        <StatusBadge label={getContentModeLabel(share.contentMode)} tone="info" />
                                                        <StatusBadge label={getDeliveryModeLabel(share.deliveryMode)} tone="neutral" />
                                                        {share.truthSummary?.lane ? (
                                                            <StatusBadge label={share.truthSummary.lane.replaceAll("_", " ")} tone="neutral" />
                                                        ) : null}
                                                        {share.truthSummary?.deliveryStatus ? (
                                                            <StatusBadge label={share.truthSummary.deliveryStatus.replaceAll("_", " ")} tone="neutral" />
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-2 text-sm text-neutral-400">
                                                        {share.sceneId ?? "Scene pending"} {share.versionId ? `· ${share.versionId}` : "· Inline payload"}
                                                    </p>
                                                    {share.note ? <p className="mt-2 text-sm text-neutral-500">{share.note}</p> : null}
                                                    <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                        {getContentModeSummary(share.contentMode)} {getDeliveryModeSummary(share.deliveryMode)}
                                                    </p>
                                                    {share.truthSummary?.truthLabel ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                            Saved world truth: <span className="text-neutral-300">{share.truthSummary.truthLabel}</span>
                                                        </p>
                                                    ) : null}
                                                    {share.truthSummary?.blockers?.length ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                                                            Blockers: {share.truthSummary.blockers.join(", ")}
                                                        </p>
                                                    ) : null}
                                                    {share.truthSummary?.ingestRecordId ? (
                                                        <p className="mt-2 text-xs leading-5 text-neutral-500">Ingest record: {share.truthSummary.ingestRecordId}</p>
                                                    ) : null}
                                                    {share.truthSummary?.downstreamTargetSummary ? (
                                                        <p className="mt-1 text-xs leading-5 text-neutral-500">{share.truthSummary.downstreamTargetSummary}</p>
                                                    ) : null}
                                                </div>
                                                <div className="text-right text-xs text-neutral-500">
                                                    <p>Created {formatDate(share.createdAt)}</p>
                                                    <p>{share.status === "revoked" ? `Revoked ${formatDate(share.revokedAt)}` : `Expired ${formatDate(share.expiresAt)}`}</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Created by</p>
                                                    <p className="mt-2 text-sm text-white">{share.createdByLabel}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">{share.lastAccessedAt ? `Last accessed ${formatDate(share.lastAccessedAt)}` : "No successful access recorded."}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Archived state</p>
                                                    <p className="mt-2 text-sm text-white">{share.status === "revoked" ? "Stopped by operator" : "Expired by policy"}</p>
                                                    <p className="mt-1 text-xs text-neutral-500">Further `?share=` access now fails immediately through the platform proxy.</p>
                                                </div>
                                            </div>

                                            {share.recentEvents.length > 0 ? (
                                                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Recent share events</p>
                                                    <div className="mt-3 space-y-2">
                                                        {share.recentEvents.map((event) => (
                                                            <div key={event.id} className="flex items-start justify-between gap-4 text-sm">
                                                                <p className="text-neutral-300">{event.summary}</p>
                                                                <p className="whitespace-nowrap text-xs text-neutral-500">{formatDate(event.createdAt)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
