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
    const [isPending, startTransition] = useTransition();

    const submitLink = () => {
        setError(null);
        setMessage(null);
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
                setMessage("World linked to this project. Reopen tracking and review controls now run through the project layer.");
                router.refresh();
            } catch (worldLinkError) {
                setError(worldLinkError instanceof Error ? worldLinkError.message : "Unable to link world.");
            }
        });
    };

    const markOpened = (linkedSceneId: string) => {
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}/world-links`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        sceneId: linkedSceneId,
                        markOpened: true,
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to mark world as opened.");
                }
                setMessage(`Recorded reopen activity for linked scene ${linkedSceneId}.`);
                router.refresh();
            } catch (openError) {
                setError(openError instanceof Error ? openError.message : "Unable to record activity.");
            }
        });
    };

    const downloadHandoff = (linkedSceneId: string, target: "generic" | "unreal") => {
        setError(null);
        setMessage(null);
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
                        ? `${manifest.target.label} exported from saved version ${manifest.source.version_id}.`
                        : `${manifest.target.label} exported with blockers from saved version ${manifest.source.version_id}.`,
                );
            } catch (handoffError) {
                setError(handoffError instanceof Error ? handoffError.message : "Unable to generate handoff manifest.");
            }
        });
    };

    return (
        <section id="world-links" className="space-y-5">
            <div className="rounded-[1.85rem] border border-white/10 bg-black/30 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">World links</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Attach or reopen real worlds inside the project layer</h3>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            Linking a scene here records project ownership in the platform layer. Conflicting links are rejected so this page cannot bypass existing scene ownership or membership truth.
                        </p>
                        <p className="mt-2 text-sm leading-7 text-neutral-500">
                            Opening a linked world from this panel records the revisit automatically. The named handoff actions below emit explicit downstream manifests from saved versions instead of pretending that review-share export is a delivery artifact.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={`${worldLinks.length} linked`} tone={worldLinks.length > 0 ? "success" : "neutral"} />
                        <StatusBadge label={canAccessMvp ? "Workspace shell available" : "Workspace shell blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,1fr,auto]">
                    <input
                        value={sceneId}
                        onChange={(event) => setSceneId(event.target.value)}
                        placeholder="scene_34dc4347"
                        disabled={isPending}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                    <input
                        value={environmentLabel}
                        onChange={(event) => setEnvironmentLabel(event.target.value)}
                        placeholder="Hero lobby preview"
                        disabled={isPending}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                    <button
                        type="button"
                        onClick={submitLink}
                        disabled={isPending || !sceneId.trim()}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Working..." : "Link world"}
                    </button>
                </div>

                <label className="mt-4 inline-flex items-center gap-3 text-sm text-neutral-400">
                    <input
                        type="checkbox"
                        checked={makePrimary}
                        onChange={(event) => setMakePrimary(event.target.checked)}
                        disabled={isPending}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    Set as primary world link
                </label>

                {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
                {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
            </div>

            {worldLinks.length === 0 ? (
                <EmptyState
                    eyebrow="Linked worlds"
                    title="No worlds linked yet"
                    body="Add the first real scene ID above to turn this project into a durable world home. Project-specific workspace launch stays disabled until that link exists."
                />
            ) : (
                <div className="space-y-3">
                    {worldLinks.map((worldLink) => (
                        <article key={worldLink.id} className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
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
                                    <OpenWorkspaceButton
                                        projectId={projectId}
                                        sceneId={worldLink.sceneId}
                                        label={canAccessMvp ? "Open workspace shell" : "Workspace shell unavailable"}
                                        disabled={!canAccessMvp}
                                        variant="secondary"
                                    />
                                    <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() => markOpened(worldLink.sceneId)}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                    >
                                        Record external reopen
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() => downloadHandoff(worldLink.sceneId, "generic")}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                    >
                                        Generic handoff
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() => downloadHandoff(worldLink.sceneId, "unreal")}
                                        className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-50 transition-colors hover:border-cyan-200/30 hover:bg-cyan-400/15 disabled:opacity-60"
                                    >
                                        Unreal handoff
                                    </button>
                                </div>
                            </div>

                            <WorldLinkLifecycleSummary
                                sceneId={worldLink.sceneId}
                                fallbackLabel={worldLink.environmentLabel}
                                canAccessMvp={canAccessMvp}
                                truthSummary={worldLink.truthSummary}
                            />
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
