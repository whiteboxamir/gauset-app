"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ProviderCatalogResponse } from "@/lib/mvp-product";
import { StatusBadge } from "@/components/platform/StatusBadge";

const fallbackProviderOptions = [
    { id: "vertex_imagen", label: "Google Vertex Imagen" },
    { id: "runway", label: "Runway" },
    { id: "byteplus_seedream", label: "BytePlus Seedream" },
];

function buildLaunchPath({
    projectId,
    brief,
    references,
    providerId,
    intent,
    sourceKind,
    sceneId,
}: {
    projectId: string;
    brief: string;
    references: string;
    providerId: string;
    intent?: "generate" | "import" | "capture";
    sourceKind?: string;
    sceneId?: string | null;
}) {
    const searchParams = new URLSearchParams({
        project: projectId,
    });

    if (sceneId) {
        searchParams.set("scene", sceneId);
    }
    if (intent) {
        searchParams.set("intent", intent);
    }
    if (sourceKind) {
        searchParams.set("source_kind", sourceKind);
    }
    if (!sceneId) {
        searchParams.set("entry", "workspace");
    }
    if (brief.trim()) {
        searchParams.set("brief", brief.trim());
    }
    if (references.trim()) {
        searchParams.set("refs", references.trim());
    }
    if (providerId) {
        searchParams.set("provider", providerId);
    }

    return sceneId ? `/mvp?${searchParams.toString()}` : `/mvp/preview?${searchParams.toString()}`;
}

export function ProjectWorldLaunchPanel({
    projectId,
    canAccessMvp,
    resumeSceneId = null,
}: {
    projectId: string;
    canAccessMvp: boolean;
    resumeSceneId?: string | null;
}) {
    const [brief, setBrief] = useState("");
    const [references, setReferences] = useState("");
    const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogResponse | null>(null);
    const [providerError, setProviderError] = useState<string | null>(null);
    const [selectedProviderId, setSelectedProviderId] = useState("");
    const [showGenerationLane, setShowGenerationLane] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void fetch("/api/mvp/providers", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Provider catalog unavailable (${response.status})`);
                }
                return (await response.json()) as ProviderCatalogResponse;
            })
            .then((payload) => {
                if (!cancelled) {
                    setProviderCatalog(payload);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setProviderError(error instanceof Error ? error.message : "Provider catalog unavailable.");
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const providerOptions = useMemo(() => {
        const liveProviders = (providerCatalog?.providers ?? [])
            .filter((provider) => provider.media_kind === "image")
            .map((provider) => ({
                id: provider.id,
                label: provider.available ? provider.label : `${provider.label} (availability checked in workspace)`,
            }));
        return liveProviders.length > 0 ? liveProviders : fallbackProviderOptions;
    }, [providerCatalog]);

    const providerStatusLabel = providerError
        ? "Generation provider routing unavailable."
        : providerCatalog
          ? `${providerOptions.length} provider route${providerOptions.length === 1 ? "" : "s"} checked.`
          : "Checking generation provider routes.";

    useEffect(() => {
        if (!selectedProviderId && providerOptions.length > 0) {
            setSelectedProviderId(providerOptions[0].id);
        }
    }, [providerOptions, selectedProviderId]);

    const launchHref = ({
        intent,
        sourceKind,
        sceneId = null,
    }: {
        intent?: "generate" | "import" | "capture";
        sourceKind?: string;
        sceneId?: string | null;
    }) => {
        return buildLaunchPath({
            projectId,
            brief,
            references,
            providerId: selectedProviderId,
            intent,
            sourceKind,
            sceneId,
        });
    };

    const launchCardClassName = (tone: "primary" | "secondary") =>
        tone === "primary"
            ? "rounded-[1.4rem] border border-[#bfd6de]/24 bg-[linear-gradient(180deg,rgba(191,214,222,0.14),rgba(244,239,232,0.04))] px-4 py-4 text-left transition-colors hover:border-[#bfd6de]/38 hover:bg-[linear-gradient(180deg,rgba(191,214,222,0.18),rgba(244,239,232,0.06))] disabled:cursor-not-allowed disabled:opacity-60"
            : "rounded-[1.3rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-4 text-left transition-colors hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60";

    const renderLaunchCard = ({
        label,
        body,
        href,
        disabled,
        tone = "secondary",
    }: {
        label: string;
        body: string;
        href: string;
        disabled: boolean;
        tone?: "primary" | "secondary";
    }) => {
        const content = (
            <>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-400">{body}</p>
            </>
        );

        if (disabled) {
            return (
                <button type="button" disabled className={launchCardClassName(tone)}>
                    {content}
                </button>
            );
        }

        return (
            <Link href={href} prefetch={false} className={launchCardClassName(tone)}>
                {content}
            </Link>
        );
    };

    return (
        <section id="project-world-launch" className="rounded-[1.95rem] border border-[var(--border-soft)] bg-[rgba(22,28,34,0.78)] p-5">
            <div className="grid gap-5 xl:grid-cols-[1.18fr,0.82fr]">
                <div className="rounded-[1.55rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-2xl">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#bfd6de]/78">Saved-world workflow</p>
                            <h3 className="mt-2 text-xl font-medium text-[var(--foreground)]">Build the world record</h3>
                            <p className="mt-3 text-sm leading-6 text-[#b8b1a7]">
                                Choose one source path first. Continuity memory, review posture, and handoff stay attached to the same saved project record after the first save.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge label={canAccessMvp ? "Launch ready" : "Launch blocked"} tone={canAccessMvp ? "success" : "warning"} />
                            <StatusBadge label={resumeSceneId ? "Saved world linked" : "Awaiting first saved world"} tone={resumeSceneId ? "info" : "neutral"} />
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">Primary source path</p>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            {renderLaunchCard({
                                label: "Import source frames",
                                body: "Bring in scout stills or reference frames and start the saved world from real material.",
                                href: launchHref({ intent: "import", sourceKind: "upload" }),
                                disabled: !canAccessMvp,
                                tone: "primary",
                            })}
                            {renderLaunchCard({
                                label: "Capture set",
                                body: "Use overlapping views to reconstruct the same persistent world with more faithful spatial coverage.",
                                href: launchHref({ intent: "capture", sourceKind: "capture_session" }),
                                disabled: !canAccessMvp,
                                tone: "primary",
                            })}
                        </div>
                    </div>

                    <div className="mt-5 rounded-[1.35rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.025)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="max-w-2xl">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d978f]">Secondary paths</p>
                                <p className="mt-2 text-xs leading-5 text-neutral-400">
                                    Use these only when the source world already exists elsewhere or when you need to return to the same saved record.
                                </p>
                            </div>
                            {providerError ? <StatusBadge label="Generation routing unavailable" tone="warning" /> : null}
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {renderLaunchCard({
                                label: "Attach external world",
                                body: "Bring an outside world package into this project record without changing the main front-door workflow.",
                                href: launchHref({ intent: "import", sourceKind: "external_world_package" }),
                                disabled: !canAccessMvp,
                            })}
                            {renderLaunchCard({
                                label: resumeSceneId ? "Reopen saved world" : "Reopen saved world unavailable",
                                body: "Return to the same saved world instead of branching into a new workspace.",
                                href: launchHref({ sceneId: resumeSceneId, sourceKind: "linked_scene_version" }),
                                disabled: !canAccessMvp || !resumeSceneId,
                            })}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <section className="rounded-[1.45rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d978f]">Continuity intake</p>
                        <p className="mt-2 text-sm leading-6 text-[#b8b1a7]">
                            Thin notes entered here travel with the first saved world instead of living in a disposable prompt.
                        </p>
                    </section>

                    <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d978f]">World bible</p>
                        <textarea
                            value={brief}
                            onChange={(event) => setBrief(event.target.value)}
                            rows={4}
                            placeholder="Continuity, cast, blocking, and location notes that should stay with the world."
                            className="mt-3 w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[#80796f] focus:border-[#bfd6de]/40"
                        />
                        <p className="mt-3 text-xs leading-5 text-neutral-400">Use this for the durable project memory that should follow the saved world.</p>
                    </section>

                    <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d978f]">Cast, look, and shot continuity</p>
                        <textarea
                            value={references}
                            onChange={(event) => setReferences(event.target.value)}
                            rows={4}
                            placeholder="Look references, sequence direction, external links, and shot notes that should travel with the saved world."
                            className="mt-3 w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[#80796f] focus:border-[#bfd6de]/40"
                        />
                        <p className="mt-3 text-xs leading-5 text-neutral-400">Keep this attached to the world record so review and handoff stay consistent.</p>
                    </section>
                </div>
            </div>

            <details className="mt-5 rounded-[1.25rem] border border-white/8 bg-white/[0.015]" open={showGenerationLane} onToggle={(event) => setShowGenerationLane((event.currentTarget as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d978f]">Generation, secondary</p>
                            <p className="mt-1 text-xs leading-5 text-neutral-500">Keep prompt-generated stills available without competing with the source path above.</p>
                        </div>
                        <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-400">Reveal</span>
                    </div>
                </summary>
                <div className="space-y-4 border-t border-white/8 px-4 py-4">
                    <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[#9d978f]">Preferred provider</span>
                        <select
                            value={selectedProviderId}
                            onChange={(event) => setSelectedProviderId(event.target.value)}
                            className="w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[#bfd6de]/40"
                        >
                            {providerOptions.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[rgba(244,239,232,0.02)] px-4 py-3">
                        <div className="max-w-xl">
                            <p className="text-sm font-medium text-[var(--foreground)]">Source still generation</p>
                            <p className="mt-1 text-[11px] leading-5 text-neutral-400">
                                {providerStatusLabel} This lane only supplies a source still. It does not replace the saved-world record.
                            </p>
                        </div>
                        {canAccessMvp ? (
                            <Link
                                href={launchHref({ intent: "generate", sourceKind: "provider_generated_still" })}
                                prefetch={false}
                                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                            >
                                Open generation lane
                            </Link>
                        ) : (
                            <button type="button" disabled className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60">
                                Open generation lane
                            </button>
                        )}
                    </div>

                    {providerError ? <p className="text-[11px] leading-5 text-amber-200">Provider catalog note: {providerError}</p> : null}
                </div>
            </details>
        </section>
    );
}
