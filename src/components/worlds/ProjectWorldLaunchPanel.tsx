"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { ProviderCatalogResponse } from "@/lib/mvp-product";
import { StatusBadge } from "@/components/platform/StatusBadge";

const fallbackProviderOptions = [
    { id: "vertex_imagen", label: "Google Vertex Imagen" },
    { id: "runway", label: "Runway" },
    { id: "byteplus_seedream", label: "BytePlus Seedream" },
];

export function ProjectWorldLaunchPanel({
    projectId,
    canAccessMvp,
}: {
    projectId: string;
    canAccessMvp: boolean;
}) {
    const router = useRouter();
    const [brief, setBrief] = useState("");
    const [references, setReferences] = useState("");
    const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogResponse | null>(null);
    const [providerError, setProviderError] = useState<string | null>(null);
    const [selectedProviderId, setSelectedProviderId] = useState("");
    const [isPending, startTransition] = useTransition();

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

    useEffect(() => {
        if (!selectedProviderId && providerOptions.length > 0) {
            setSelectedProviderId(providerOptions[0].id);
        }
    }, [providerOptions, selectedProviderId]);

    const launchWorkspace = (intent: "generate" | "import" | "capture") => {
        startTransition(() => {
            const searchParams = new URLSearchParams({
                project: projectId,
                intent,
            });
            if (brief.trim()) {
                searchParams.set("brief", brief.trim());
            }
            if (references.trim()) {
                searchParams.set("refs", references.trim());
            }
            if (selectedProviderId) {
                searchParams.set("provider", selectedProviderId);
            }

            router.push(`/mvp?${searchParams.toString()}`);
        });
    };

    return (
        <section id="project-world-launch" className="rounded-[1.85rem] border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Project-bound world start</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Brief the world before opening the workspace</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-400">
                        Start from prompt, import, or capture with project context already attached. New worlds launched from here are expected to link back into this project instead of living as disconnected scene IDs.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={canAccessMvp ? "Workspace launch enabled" : "Workspace launch blocked"} tone={canAccessMvp ? "success" : "warning"} />
                    <StatusBadge
                        label={providerCatalog?.enabled === false ? "Provider lane checked in workspace" : "Curated provider set"}
                        tone="info"
                    />
                </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">World brief</span>
                    <textarea
                        value={brief}
                        onChange={(event) => setBrief(event.target.value)}
                        rows={5}
                        disabled={isPending}
                        placeholder="Example: restrained luxury hotel lobby, practical tungsten pools, wet pavement outside, eye-level camera, honest daytime reconstruction target"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </label>

                <div className="space-y-4">
                    <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">References and source notes</span>
                        <textarea
                            value={references}
                            onChange={(event) => setReferences(event.target.value)}
                            rows={5}
                            disabled={isPending}
                            placeholder="Paste notes, URLs, or shot constraints that should travel with the project launch context."
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Preferred provider</span>
                        <select
                            value={selectedProviderId}
                            onChange={(event) => setSelectedProviderId(event.target.value)}
                            disabled={isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                        >
                            {providerOptions.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <button
                    type="button"
                    disabled={!canAccessMvp || isPending}
                    onClick={() => launchWorkspace("generate")}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Opening..." : "Open prompt workflow"}
                </button>
                <button
                    type="button"
                    disabled={!canAccessMvp || isPending}
                    onClick={() => launchWorkspace("import")}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Open import workflow
                </button>
                <button
                    type="button"
                    disabled={!canAccessMvp || isPending}
                    onClick={() => launchWorkspace("capture")}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Open capture workflow
                </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] leading-5 text-neutral-400">
                Worlds launched from here open `/mvp` with project context, brief context, and provider preference already attached. Review links stay review-only; named delivery happens separately from the linked-world handoff action once a saved version exists.
                {providerError ? <p className="mt-2 text-amber-200">Provider catalog note: {providerError}</p> : null}
            </div>
        </section>
    );
}
