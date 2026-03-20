"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { DownstreamHandoffManifest } from "@/server/contracts/downstream-handoff";
import type { ProjectWorldLink } from "@/server/contracts/projects";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";
import { WorldLinkLifecycleSummary } from "@/components/worlds/WorldLinkLifecycleSummary";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return dateFormatter.format(parsed);
}

function asErrorMessage(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function humanizeToken(value: string) {
    return value.replaceAll("_", " ").replaceAll("-", " ").trim();
}

function deriveHandoffState(worldLink: ProjectWorldLink, canAccessMvp: boolean) {
    const latestVersionId = worldLink.latestVersionId ?? worldLink.truthSummary?.latestVersionId ?? null;
    const blockers = worldLink.blockers?.length ? worldLink.blockers : (worldLink.truthSummary?.blockers ?? []);
    const normalizedBlockers = blockers.map(humanizeToken);
    const deliveryStatus = worldLink.deliveryStatus ?? worldLink.truthSummary?.deliveryStatus ?? null;
    const downstreamTargetSummary = worldLink.downstreamTargetSummary ?? worldLink.truthSummary?.downstreamTargetSummary ?? null;

    if (!canAccessMvp) {
        return {
            canExport: false,
            tone: "warning" as const,
            statusLabel: "Handoff hidden",
            versionLabel: "Access blocked",
            summary: "This account cannot inspect or export saved-world handoff from the project record until MVP access is available.",
            blockers: [] as string[],
        };
    }

    if (!latestVersionId) {
        return {
            canExport: false,
            tone: "warning" as const,
            statusLabel: "Awaiting first saved version",
            versionLabel: "No saved version",
            summary: "This panel only exports from a saved world version. Save the linked world once in the workspace before attempting handoff.",
            blockers: [] as string[],
        };
    }

    if (deliveryStatus === "blocked" || normalizedBlockers.length > 0) {
        return {
            canExport: false,
            tone: "warning" as const,
            statusLabel: "Handoff blocked",
            versionLabel: `Latest version ${latestVersionId}`,
            summary: normalizedBlockers.length > 0
                ? `Latest saved version ${latestVersionId} is blocked for downstream handoff. Clear the saved-world blockers first.`
                : `Latest saved version ${latestVersionId} is not currently cleared for downstream handoff.`,
            blockers: normalizedBlockers,
        };
    }

    return {
        canExport: true,
        tone: "success" as const,
        statusLabel: "Latest-version export only",
        versionLabel: `Latest version ${latestVersionId}`,
        summary:
            downstreamTargetSummary ??
            `This panel exports the latest saved version only: ${latestVersionId}. Version choice is not available here; pick another version in the workspace before returning if you need a different handoff anchor.`,
        blockers: [] as string[],
    };
}

export function ProjectWorldLinkManager({
    projectId,
    worldLinks,
    canAccessMvp,
}: {
    projectId: string;
    worldLinks: ProjectWorldLink[];
    canAccessMvp: boolean;
}) {
    const router = useRouter();
    const [sceneId, setSceneId] = useState("");
    const [environmentLabel, setEnvironmentLabel] = useState("");
    const [makePrimary, setMakePrimary] = useState(worldLinks.length === 0);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<"link" | "handoff-generic" | "handoff-unreal" | null>(null);
    const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const isBusy = isPending || pendingAction !== null;

    const submitLink = () => {
        setError(null);
        setMessage(null);
        setPendingAction("link");
        setPendingSceneId(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}/world-links`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        sceneId,
                        environmentLabel: environmentLabel || undefined,
                        makePrimary,
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to link world.");
                }
                setSceneId("");
                setEnvironmentLabel("");
                setMakePrimary(false);
                setMessage("Saved world linked to this project record. Review and handoff now resolve through the same durable source.");
                router.refresh();
            } catch (worldLinkError) {
                setError(worldLinkError instanceof Error ? worldLinkError.message : "Unable to link world.");
            } finally {
                setPendingAction(null);
                setPendingSceneId(null);
            }
        });
    };

    const downloadHandoff = (linkedSceneId: string, target: "generic" | "unreal") => {
        setError(null);
        setMessage(null);
        setPendingAction(target === "generic" ? "handoff-generic" : "handoff-unreal");
        setPendingSceneId(linkedSceneId);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}/world-links/${encodeURIComponent(linkedSceneId)}/handoff?target=${target}`, {
                    cache: "no-store",
                });
                const payload = (await response.json()) as DownstreamHandoffManifest | { message?: unknown };
                const manifest = response.ok && "contract" in payload ? payload : null;
                if (!manifest) {
                    throw new Error(asErrorMessage("message" in payload ? payload.message : undefined, "Unable to generate handoff manifest."));
                }

                const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${linkedSceneId}-${manifest.source.version_id}-${target}-handoff.json`;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                URL.revokeObjectURL(url);

                setMessage(
                    manifest.delivery.status === "ready"
                        ? `${manifest.target.label} manifest exported from saved version ${manifest.source.version_id}.`
                        : `${manifest.target.label} manifest exported with blockers from saved version ${manifest.source.version_id}.`,
                );
            } catch (handoffError) {
                setError(handoffError instanceof Error ? handoffError.message : "Unable to generate handoff manifest.");
            } finally {
                setPendingAction(null);
                setPendingSceneId(null);
            }
        });
    };
    const progressLabel =
        pendingAction === "link"
            ? "Attaching the saved world to this project record."
            : pendingAction === "handoff-generic"
              ? `Exporting the generic downstream manifest${pendingSceneId ? ` for ${pendingSceneId}` : ""}.`
              : pendingAction === "handoff-unreal"
                ? `Exporting the Unreal downstream manifest${pendingSceneId ? ` for ${pendingSceneId}` : ""}.`
                : "";

    return (
        <section id="world-links" className="space-y-5" data-testid="world-links-manager">
            <div className="rounded-[1.85rem] border border-white/10 bg-black/30 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Project world registry</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Attach, reopen, and hand off saved worlds from the project record</h3>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            Attach an existing saved world to the project record here. Conflicting links are rejected so this surface cannot bypass ownership or membership truth.
                        </p>
                        <p className="mt-2 text-sm leading-7 text-neutral-500">
                            Reopen actions write history from the actual open path. Handoff exports emit explicit version-locked manifests instead of pretending that review-link export is a delivery artifact.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={`${worldLinks.length} linked`} tone={worldLinks.length > 0 ? "success" : "neutral"} />
                        <StatusBadge label={canAccessMvp ? "Saved-world access available" : "Saved-world access blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    </div>
                </div>

                {progressLabel ? (
                    <div className="mt-5 rounded-2xl border border-sky-400/18 bg-sky-500/[0.07] px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-sky-100/80">Registry progress</p>
                        <p className="mt-2 text-sm leading-6 text-sky-50">{progressLabel}</p>
                        <div className="mt-3 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-300/70" />
                        </div>
                    </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,1fr,auto]">
                    <input
                        value={sceneId}
                        onChange={(event) => setSceneId(event.target.value)}
                        placeholder="scene_34dc4347"
                        disabled={isBusy}
                        data-testid="world-link-scene-id-input"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                    <input
                        value={environmentLabel}
                        onChange={(event) => setEnvironmentLabel(event.target.value)}
                        placeholder="Hero lobby preview"
                        disabled={isBusy}
                        data-testid="world-link-environment-label-input"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                    <button
                        type="button"
                        onClick={submitLink}
                        disabled={isBusy || !sceneId.trim()}
                        data-testid="world-link-attach-button"
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {pendingAction === "link" ? "Attaching world..." : "Attach saved world"}
                    </button>
                </div>

                <label className="mt-4 inline-flex items-center gap-3 text-sm text-neutral-400">
                    <input
                        type="checkbox"
                        checked={makePrimary}
                        onChange={(event) => setMakePrimary(event.target.checked)}
                        disabled={isBusy}
                        data-testid="world-link-primary-checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    Set as primary world record
                </label>

                {message ? (
                    <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" data-testid="world-link-manager-message">
                        {message}
                    </p>
                ) : null}
                {error ? (
                    <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" data-testid="world-link-manager-error">
                        {error}
                    </p>
                ) : null}
            </div>

            {worldLinks.length === 0 ? (
                <EmptyState
                    eyebrow="Linked worlds"
                    title="No worlds linked yet"
                    body="Add the first real scene ID above to turn this project into a durable world home. Project-specific workspace launch stays disabled until that link exists."
                />
            ) : (
                <div className="space-y-3">
                    {worldLinks.map((worldLink) => {
                        const handoffState = deriveHandoffState(worldLink, canAccessMvp);
                        const isGenericPending = pendingAction === "handoff-generic" && pendingSceneId === worldLink.sceneId;
                        const isUnrealPending = pendingAction === "handoff-unreal" && pendingSceneId === worldLink.sceneId;
                        const exportDisabled = isBusy || !handoffState.canExport;

                        return (
                        <article
                            key={worldLink.id}
                            className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4"
                            data-testid={`world-link-row-${worldLink.sceneId}`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-white">{worldLink.sceneId}</p>
                                        {worldLink.isPrimary ? <StatusBadge label="Primary" tone="success" /> : null}
                                    </div>
                                    <p className="mt-2 text-sm text-neutral-400">{worldLink.environmentLabel ?? "No environment label"}</p>
                                    <p className="mt-2 text-xs text-neutral-500">Linked {formatDate(worldLink.createdAt)}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div data-testid={`world-link-open-${worldLink.sceneId}`}>
                                        <OpenWorkspaceButton
                                            projectId={projectId}
                                            sceneId={worldLink.sceneId}
                                            label={canAccessMvp ? "Open saved world" : "Saved-world access unavailable"}
                                            disabled={!canAccessMvp}
                                            variant="secondary"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        disabled={exportDisabled}
                                        onClick={() => downloadHandoff(worldLink.sceneId, "generic")}
                                        data-testid={`world-link-export-generic-${worldLink.sceneId}`}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                    >
                                        {isGenericPending ? "Exporting generic handoff..." : "Export generic manifest"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={exportDisabled}
                                        onClick={() => downloadHandoff(worldLink.sceneId, "unreal")}
                                        data-testid={`world-link-export-unreal-${worldLink.sceneId}`}
                                        className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-50 transition-colors hover:border-cyan-200/30 hover:bg-cyan-400/15 disabled:opacity-60"
                                    >
                                        {isUnrealPending ? "Exporting Unreal handoff..." : "Export Unreal manifest"}
                                    </button>
                                </div>
                            </div>

                            <div
                                className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
                                data-testid={`world-link-handoff-state-${worldLink.sceneId}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="max-w-3xl">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Handoff truth</p>
                                        <p className="mt-2 text-sm font-medium text-white">{handoffState.statusLabel}</p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-400">{handoffState.summary}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge label={handoffState.versionLabel} tone={handoffState.canExport ? "info" : "warning"} />
                                        <StatusBadge label={handoffState.statusLabel} tone={handoffState.tone} />
                                    </div>
                                </div>
                                {handoffState.blockers.length > 0 ? (
                                    <p className="mt-3 text-xs leading-5 text-amber-200/80" data-testid={`world-link-handoff-blockers-${worldLink.sceneId}`}>
                                        Blockers: {handoffState.blockers.join(", ")}
                                    </p>
                                ) : null}
                                <p className="mt-3 text-xs leading-5 text-neutral-500" data-testid={`world-link-open-note-${worldLink.sceneId}`}>
                                    Opening the saved world records reopen history automatically. There is no separate manual reopen action here.
                                </p>
                            </div>

                            <WorldLinkLifecycleSummary
                                sceneId={worldLink.sceneId}
                                fallbackLabel={worldLink.environmentLabel}
                                canAccessMvp={canAccessMvp}
                                truthSummary={worldLink.truthSummary}
                            />
                        </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
