"use client";

import { useEffect, useState, useTransition } from "react";

import { extractApiError } from "@/lib/mvp-api";
import type { ProjectWorldLink } from "@/server/projects/types";
import type { ProjectReviewSharesResponse, ReviewShareSummary } from "@/server/review-shares/types";
import {
    describeReviewShareContentMode,
    describeReviewShareDeliveryMode,
    formatReviewShareContentMode,
    formatReviewShareDeliveryMode,
    formatReviewShareStatus,
    reviewShareContentModeValues,
    reviewShareDeliveryModeValues,
} from "@/server/review-shares/types";

function formatTimestamp(value?: string | null) {
    if (!value) {
        return "Not yet";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    });
}

async function copyToClipboard(value: string) {
    if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
    }
    await navigator.clipboard.writeText(value);
}

export function ReviewSharePanel({
    projectId,
    worldLinks,
}: {
    projectId: string;
    worldLinks: ProjectWorldLink[];
}) {
    const [shares, setShares] = useState<ReviewShareSummary[]>([]);
    const [summary, setSummary] = useState<ProjectReviewSharesResponse["summary"]>({
        totalCount: 0,
        activeCount: 0,
        revokedCount: 0,
        expiredCount: 0,
    });
    const [sceneId, setSceneId] = useState(worldLinks[0]?.sceneId ?? "");
    const [contentMode, setContentMode] = useState<(typeof reviewShareContentModeValues)[number]>("saved_version");
    const [versionId, setVersionId] = useState("");
    const [payload, setPayload] = useState("");
    const [label, setLabel] = useState("");
    const [note, setNote] = useState("");
    const [deliveryMode, setDeliveryMode] = useState<(typeof reviewShareDeliveryModeValues)[number]>("secure_link");
    const [expiresInHours, setExpiresInHours] = useState(72);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setSceneId((current) => current || worldLinks[0]?.sceneId || "");
    }, [worldLinks]);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}/review-shares`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Review shares unavailable (${response.status})`));
                }

                const payloadResponse = (await response.json()) as ProjectReviewSharesResponse;
                if (!cancelled) {
                    setShares(payloadResponse.shares);
                    setSummary(payloadResponse.summary);
                }
            } catch (error) {
                if (!cancelled) {
                    setMessage(error instanceof Error ? error.message : "Unable to load review shares.");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const handleCreateShare = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch("/api/review-shares", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            projectId,
                            sceneId,
                            contentMode,
                            versionId: contentMode === "saved_version" ? versionId : undefined,
                            payload: contentMode === "inline_package" ? payload : undefined,
                            label,
                            note,
                            deliveryMode,
                            expiresInHours,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(await extractApiError(response, `Review share creation failed (${response.status})`));
                    }

                    const share = (await response.json()) as ReviewShareSummary;
                    setShares((current) => [share, ...current.filter((entry) => entry.id !== share.id)]);
                    setSummary((current) => ({
                        ...current,
                        totalCount: current.totalCount + 1,
                        activeCount: current.activeCount + 1,
                    }));
                    setMessage(
                        share.deliveryMode === "secure_link"
                            ? "Created a secure review share. Copy the access URL to distribute it."
                            : "Created a manual review share. Copy the direct review URL carefully because revocation cannot pull back existing copies.",
                    );
                    setVersionId("");
                    setPayload("");
                    setLabel("");
                    setNote("");
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to create the review share.");
                }
            })();
        });
    };

    const handleCopy = (share: ReviewShareSummary) => {
        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/review-shares/${share.id}/copy`, {
                        method: "POST",
                    });

                    if (!response.ok) {
                        throw new Error(await extractApiError(response, `Review share copy failed (${response.status})`));
                    }

                    const nextShare = (await response.json()) as ReviewShareSummary;
                    const distributionUrl = nextShare.accessUrl ?? nextShare.manualReviewUrl;
                    if (!distributionUrl) {
                        throw new Error("No distribution URL is available for this review share.");
                    }

                    await copyToClipboard(distributionUrl);
                    setShares((current) => current.map((entry) => (entry.id === nextShare.id ? nextShare : entry)));
                    setMessage(`Copied ${distributionUrl} to the clipboard.`);
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to copy the review share.");
                }
            })();
        });
    };

    const handleRevoke = (share: ReviewShareSummary) => {
        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/review-shares/${share.id}/revoke`, {
                        method: "POST",
                    });

                    if (!response.ok) {
                        throw new Error(await extractApiError(response, `Review share revoke failed (${response.status})`));
                    }

                    const nextShare = (await response.json()) as ReviewShareSummary;
                    setShares((current) => current.map((entry) => (entry.id === nextShare.id ? nextShare : entry)));
                    setSummary((current) => ({
                        ...current,
                        activeCount: Math.max(0, current.activeCount - 1),
                        revokedCount: current.revokedCount + 1,
                    }));
                    setMessage(
                        nextShare.deliveryMode === "manual"
                            ? "Revoked the share record. Previously copied manual review URLs remain live."
                            : "Revoked the secure review share.",
                    );
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to revoke the review share.");
                }
            })();
        });
    };

    return (
        <section className="space-y-5 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <div className="max-w-3xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Review distribution</p>
                <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">Keep review-share payload mode and version lock explicit.</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-300">
                    Version-locked shares stay attached to a saved MVP version. Inline payload shares stay explicit about being frozen snapshots, not durable reopenable scene
                    history.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Total shares</p>
                    <p className="mt-3 text-2xl font-medium text-white">{summary.totalCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Active</p>
                    <p className="mt-3 text-2xl font-medium text-white">{summary.activeCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Revoked</p>
                    <p className="mt-3 text-2xl font-medium text-white">{summary.revokedCount}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Expired</p>
                    <p className="mt-3 text-2xl font-medium text-white">{summary.expiredCount}</p>
                </article>
            </div>

            <form onSubmit={handleCreateShare} className="grid gap-4 rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Linked scene</span>
                    <select
                        value={sceneId}
                        onChange={(event) => setSceneId(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        required
                    >
                        {worldLinks.map((worldLink) => (
                            <option key={worldLink.id} value={worldLink.sceneId} className="bg-neutral-950">
                                {worldLink.environmentLabel ?? worldLink.sceneId}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Payload mode</span>
                    <select
                        value={contentMode}
                        onChange={(event) => setContentMode(event.target.value as (typeof reviewShareContentModeValues)[number])}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        {reviewShareContentModeValues.map((value) => (
                            <option key={value} value={value} className="bg-neutral-950">
                                {formatReviewShareContentMode(value)}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs leading-5 text-neutral-500">{describeReviewShareContentMode(contentMode)}</p>
                </label>

                {contentMode === "saved_version" ? (
                    <label className="space-y-2">
                        <span className="text-xs font-medium text-neutral-400">Version ID</span>
                        <input
                            value={versionId}
                            onChange={(event) => setVersionId(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                            placeholder="version_..."
                            required
                        />
                    </label>
                ) : (
                    <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-medium text-neutral-400">Encoded inline payload</span>
                        <textarea
                            value={payload}
                            onChange={(event) => setPayload(event.target.value)}
                            className="min-h-24 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                            placeholder="Base64 review payload from the MVP export flow"
                            required
                        />
                    </label>
                )}

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Delivery mode</span>
                    <select
                        value={deliveryMode}
                        onChange={(event) => setDeliveryMode(event.target.value as (typeof reviewShareDeliveryModeValues)[number])}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        {reviewShareDeliveryModeValues.map((value) => (
                            <option key={value} value={value} className="bg-neutral-950">
                                {formatReviewShareDeliveryMode(value)}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs leading-5 text-neutral-500">{describeReviewShareDeliveryMode(deliveryMode)}</p>
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Expires in hours</span>
                    <input
                        value={expiresInHours}
                        onChange={(event) => setExpiresInHours(Number(event.target.value))}
                        type="number"
                        min={1}
                        max={24 * 30}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Label</span>
                    <input
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Client review drop"
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Note</span>
                    <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Mention blockers or delivery posture"
                    />
                </label>

                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={isPending || worldLinks.length === 0}
                        className="rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Creating review share..." : "Create review share"}
                    </button>
                    {message ? <p className="text-sm text-neutral-400">{message}</p> : null}
                </div>
            </form>

            <div className="space-y-4">
                {shares.length > 0 ? (
                    shares.map((share) => (
                        <article key={share.id} className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="max-w-3xl">
                                    <div className="flex flex-wrap gap-2">
                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-neutral-200">
                                            {formatReviewShareStatus(share.status)}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-neutral-200">
                                            {formatReviewShareContentMode(share.contentMode)}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-neutral-200">
                                            {formatReviewShareDeliveryMode(share.deliveryMode)}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm font-medium text-white">{share.label ?? share.id}</p>
                                    <p className="mt-1 text-xs leading-5 text-neutral-400">
                                        Scene {share.sceneId}
                                        {share.versionId ? ` · Locked to ${share.versionId}` : " · Inline payload snapshot"}
                                        {share.payloadDigest ? ` · Digest ${share.payloadDigest}` : ""}
                                    </p>
                                    <p className="mt-2 text-xs leading-5 text-neutral-500">{share.worldTruth.deliverySummary}</p>
                                    {share.note ? <p className="mt-2 text-xs leading-5 text-neutral-500">{share.note}</p> : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {(share.accessUrl ?? share.manualReviewUrl) && share.status === "active" ? (
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => handleCopy(share)}
                                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                        >
                                            Copy {share.deliveryMode === "secure_link" ? "secure link" : "manual URL"}
                                        </button>
                                    ) : null}
                                    {share.status === "active" ? (
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => handleRevoke(share)}
                                            className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 transition-colors hover:bg-amber-400/15"
                                        >
                                            Revoke
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 text-xs text-neutral-500 sm:grid-cols-3">
                                <div>
                                    <p className="font-medium text-neutral-300">Issued</p>
                                    <p className="mt-1">{formatTimestamp(share.issuedAt)}</p>
                                </div>
                                <div>
                                    <p className="font-medium text-neutral-300">Expires</p>
                                    <p className="mt-1">{formatTimestamp(share.expiresAt)}</p>
                                </div>
                                <div>
                                    <p className="font-medium text-neutral-300">Last accessed</p>
                                    <p className="mt-1">{formatTimestamp(share.lastAccessedAt)}</p>
                                </div>
                            </div>
                        </article>
                    ))
                ) : (
                    <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-400">
                        No active review shares yet. Pick a linked scene, decide whether it is version-locked or an inline payload, and publish the delivery mode explicitly.
                    </div>
                )}
            </div>
        </section>
    );
}
