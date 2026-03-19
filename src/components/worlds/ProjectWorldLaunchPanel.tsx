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
                if (cancelled) {
                    return;
                }
                setProviderCatalog(payload);
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

    const primaryButtonClassName =
        "rounded-[1.25rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.04)] px-4 py-4 text-left transition-colors hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60";

    const renderLaunchCard = ({
        label,
        body,
        href,
        disabled,
    }: {
        label: string;
        body: string;
        href: string;
        disabled: boolean;
    }) => {
        const content = (
            <>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-400">{body}</p>
            </>
        );

        if (disabled) {
            return (
                <button type="button" disabled className={primaryButtonClassName}>
                    {content}
                </button>
            );
        }

        return (
            <Link href={href} prefetch={false} className={primaryButtonClassName}>
                {content}
            </Link>
        );
    };

    return (
        <section id="project-world-launch" className="rounded-[1.85rem] border border-[var(--border-soft)] bg-[rgba(22,28,34,0.78)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#bfd6de]/78">Saved-world workflow</p>
                    <h3 className="mt-2 text-lg font-medium text-[var(--foreground)]">Build the world record</h3>
                    <p className="mt-3 text-sm leading-6 text-[#b8b1a7]">
                        Choose one source path, then keep the world bible, cast continuity, look development, and sequence notes attached to the saved project record.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={canAccessMvp ? "Saved-world launch ready" : "Saved-world launch blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    <StatusBadge label={resumeSceneId ? "Saved world linked" : "No saved world yet"} tone={resumeSceneId ? "info" : "neutral"} />
                    {providerError ? <StatusBadge label="Generation routing unavailable" tone="warning" /> : null}
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {renderLaunchCard({
                    label: "Import source frames",
                    body: "Bring in scout stills or reference frames for this world record.",
                    href: launchHref({ intent: "import", sourceKind: "upload" }),
                    disabled: !canAccessMvp,
                })}

                {renderLaunchCard({
                    label: "Capture set",
                    body: "Use overlapping frames to reconstruct the saved world.",
                    href: launchHref({ intent: "capture", sourceKind: "capture_session" }),
                    disabled: !canAccessMvp,
                })}

                {renderLaunchCard({
                    label: "Attach external world",
                    body: "Attach an outside world package to this project record.",
                    href: launchHref({ intent: "import", sourceKind: "external_world_package" }),
                    disabled: !canAccessMvp,
                })}

                {renderLaunchCard({
                    label: resumeSceneId ? "Reopen saved world" : "Reopen saved world unavailable",
                    body: "Reopen the same saved world instead of branching off.",
                    href: launchHref({ sceneId: resumeSceneId, sourceKind: "linked_scene_version" }),
                    disabled: !canAccessMvp || !resumeSceneId,
                })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
                <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d978f]">World bible</p>
                    <textarea
                        value={brief}
                        onChange={(event) => setBrief(event.target.value)}
                        rows={5}
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
                        rows={5}
                        placeholder="Look references, sequence direction, external links, and shot notes that should travel with the saved world."
                        className="mt-3 w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[#80796f] focus:border-[#bfd6de]/40"
                    />
                    <p className="mt-3 text-xs leading-5 text-neutral-400">Keep this attached to the world record so review and handoff stay consistent.</p>
                </section>
            </div>

            <details className="mt-5 rounded-[1.35rem] border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)]" open={showGenerationLane} onToggle={(event) => setShowGenerationLane((event.currentTarget as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--foreground)] marker:content-none">Generation, secondary</summary>
                <div className="space-y-4 border-t border-[var(--border-soft)] px-4 py-4">
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

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.03)] px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-[var(--foreground)]">Still generation</p>
                            <p className="mt-1 text-[11px] leading-5 text-neutral-400">Keep generation reachable, but secondary to the world record.</p>
                        </div>
                        {canAccessMvp ? (
                            <Link
                                href={launchHref({ intent: "generate", sourceKind: "provider_generated_still" })}
                                prefetch={false}
                                className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-white/25 hover:bg-white/[0.08]"
                            >
                                Open generation lane
                            </Link>
                        ) : (
                            <button type="button" disabled className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60">
                                Open generation lane
                            </button>
                        )}
                    </div>

                    <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(244,239,232,0.02)] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#9d978f]">Generation routing truth</p>
                        <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                            {providerStatusLabel} This lane only supplies a source still. It does not replace the saved-world record.
                        </p>
                        {providerError ? <p className="mt-2 text-[11px] leading-5 text-amber-200">Provider catalog note: {providerError}</p> : null}
                    </div>
                </div>
            </details>
        </section>
    );
}
