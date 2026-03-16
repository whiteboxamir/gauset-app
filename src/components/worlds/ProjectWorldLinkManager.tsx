"use client";

import { useState, useTransition } from "react";

import { OpenWorkspaceButton } from "@/components/worlds/OpenWorkspaceButton";
import { WorldLinkLifecycleSummary } from "@/components/worlds/WorldLinkLifecycleSummary";
import { extractApiError } from "@/lib/mvp-api";
import type { ProjectDetail, ProjectWorldLink } from "@/server/projects/types";
import { deliveryPostureValues, laneTruthKindValues, worldSourceKindValues } from "@/server/projects/types";

const defaultSourceKind = worldSourceKindValues[0];
const defaultLaneKind = laneTruthKindValues[0];
const defaultDeliveryPosture = deliveryPostureValues[0];

export function ProjectWorldLinkManager({
    projectId,
    initialWorldLinks,
}: {
    projectId: string;
    initialWorldLinks: ProjectWorldLink[];
}) {
    const [worldLinks, setWorldLinks] = useState(initialWorldLinks);
    const [sceneId, setSceneId] = useState("");
    const [environmentLabel, setEnvironmentLabel] = useState("");
    const [sourceKind, setSourceKind] = useState<(typeof worldSourceKindValues)[number]>(defaultSourceKind);
    const [sourceLabel, setSourceLabel] = useState("");
    const [laneKind, setLaneKind] = useState<(typeof laneTruthKindValues)[number]>(defaultLaneKind);
    const [laneLabel, setLaneLabel] = useState("");
    const [deliveryPosture, setDeliveryPosture] = useState<(typeof deliveryPostureValues)[number]>(defaultDeliveryPosture);
    const [deliveryLabel, setDeliveryLabel] = useState("");
    const [deliverySummary, setDeliverySummary] = useState("");
    const [makePrimary, setMakePrimary] = useState(initialWorldLinks.length === 0);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/projects/${projectId}/world-links`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            sceneId,
                            environmentLabel,
                            makePrimary,
                            worldTruth: {
                                sourceKind,
                                sourceLabel,
                                laneKind,
                                laneLabel,
                                deliveryPosture,
                                deliveryLabel,
                                deliverySummary,
                            },
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(await extractApiError(response, `World link update failed (${response.status})`));
                    }

                    const payload = (await response.json()) as ProjectDetail;
                    setWorldLinks(payload.worldLinks);
                    setMessage(`Recorded world ownership for ${sceneId}.`);
                    setSceneId("");
                    setEnvironmentLabel("");
                    setSourceLabel("");
                    setLaneLabel("");
                    setDeliveryLabel("");
                    setDeliverySummary("");
                    setMakePrimary(false);
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to update project world links.");
                }
            })();
        });
    };

    return (
        <section className="space-y-5 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Project world links</p>
                    <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">Link worlds with explicit source, lane, and delivery posture.</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">
                        Refreshing a link updates truth metadata on the project-owned bridge. Reopen still requires the underlying <code className="text-white">scene_id</code> to
                        already belong to this project.
                    </p>
                </div>
                {worldLinks[0] ? <OpenWorkspaceButton projectId={projectId} sceneId={worldLinks[0].sceneId} label="Reopen latest linked world" variant="secondary" /> : null}
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Scene ID</span>
                    <input
                        value={sceneId}
                        onChange={(event) => setSceneId(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="scene_..."
                        required
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Environment label</span>
                    <input
                        value={environmentLabel}
                        onChange={(event) => setEnvironmentLabel(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Warehouse night exterior"
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">World source</span>
                    <select
                        value={sourceKind}
                        onChange={(event) => setSourceKind(event.target.value as (typeof worldSourceKindValues)[number])}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        {worldSourceKindValues.map((value) => (
                            <option key={value} value={value} className="bg-neutral-950">
                                {value}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Source label</span>
                    <input
                        value={sourceLabel}
                        onChange={(event) => setSourceLabel(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Uploaded scout still"
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Lane truth</span>
                    <select
                        value={laneKind}
                        onChange={(event) => setLaneKind(event.target.value as (typeof laneTruthKindValues)[number])}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        {laneTruthKindValues.map((value) => (
                            <option key={value} value={value} className="bg-neutral-950">
                                {value}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Lane label</span>
                    <input
                        value={laneLabel}
                        onChange={(event) => setLaneLabel(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Preview lane"
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Delivery posture</span>
                    <select
                        value={deliveryPosture}
                        onChange={(event) => setDeliveryPosture(event.target.value as (typeof deliveryPostureValues)[number])}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        {deliveryPostureValues.map((value) => (
                            <option key={value} value={value} className="bg-neutral-950">
                                {value}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-xs font-medium text-neutral-400">Delivery label</span>
                    <input
                        value={deliveryLabel}
                        onChange={(event) => setDeliveryLabel(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Review-ready"
                    />
                </label>

                <label className="space-y-2 md:col-span-2">
                    <span className="text-xs font-medium text-neutral-400">Delivery summary</span>
                    <textarea
                        value={deliverySummary}
                        onChange={(event) => setDeliverySummary(event.target.value)}
                        className="min-h-24 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                        placeholder="Explain what makes this link preview-only, review-ready, or world-class ready."
                    />
                </label>

                <label className="flex items-center gap-3 text-sm text-neutral-300">
                    <input type="checkbox" checked={makePrimary} onChange={(event) => setMakePrimary(event.target.checked)} />
                    Make this the primary reopen path for the project
                </label>

                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Saving world link..." : "Save world link"}
                    </button>
                    {message ? <p className="text-sm text-neutral-400">{message}</p> : null}
                </div>
            </form>

            <div className="space-y-4">
                {worldLinks.length > 0 ? (
                    worldLinks.map((worldLink) => <WorldLinkLifecycleSummary key={worldLink.id} worldLink={worldLink} />)
                ) : (
                    <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-400">
                        No linked worlds yet. Add the first project-owned scene before trying to reopen through the workspace shell.
                    </div>
                )}
            </div>
        </section>
    );
}
