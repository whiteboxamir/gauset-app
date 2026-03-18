"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";
import { describeEnvironment } from "@/lib/mvp-product";
import type { WorldTruthSummary } from "@/server/contracts/world-truth";

import { StatusBadge } from "@/components/platform/StatusBadge";

type BadgeTone = NonNullable<ComponentProps<typeof StatusBadge>["tone"]>;

interface SceneVersionRecord {
    version_id?: string;
    saved_at?: string;
    source?: string;
    summary?: {
        has_environment?: boolean;
    };
}

interface LifecycleTruth {
    state: "loading" | "ready" | "blocked" | "missing" | "error";
    sourceLabel: string;
    sourceSummary: string;
    laneLabel: string;
    laneTone: BadgeTone;
    laneSummary: string;
    deliveryLabel: string;
    deliveryTone: BadgeTone;
    deliverySummary: string;
    versionId: string | null;
    savedAt: string | null;
    versionSummary: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

function formatDate(value?: string | null, fallback = "Not yet recorded") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return dateFormatter.format(parsed);
}

function readString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
    return typeof value === "boolean" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function humanizeToken(value: string) {
    return value.replaceAll("_", " ").replaceAll("-", " ").trim();
}

function buildDefaultTruth({
    sceneId,
    fallbackLabel,
    state,
    laneLabel,
    laneTone,
    laneSummary,
    deliveryLabel,
    deliveryTone,
    deliverySummary,
}: {
    sceneId: string;
    fallbackLabel?: string | null;
    state: LifecycleTruth["state"];
    laneLabel: string;
    laneTone: BadgeTone;
    laneSummary: string;
    deliveryLabel: string;
    deliveryTone: BadgeTone;
    deliverySummary: string;
}) {
    const sourceLabel = fallbackLabel?.trim() || sceneId;
    return {
        state,
        sourceLabel,
        sourceSummary: `The project owns the durable link to MVP scene ${sceneId}. This surface does not reassign scene ownership.`,
        laneLabel,
        laneTone,
        laneSummary,
        deliveryLabel,
        deliveryTone,
        deliverySummary,
        versionId: null,
        savedAt: null,
        versionSummary: "No saved world anchor is recorded yet.",
    } satisfies LifecycleTruth;
}

function readEnvironmentFromVersionPayload(payload: unknown) {
    const record = asRecord(payload);
    const sceneGraph = asRecord(record?.scene_graph);
    return asRecord(sceneGraph?.environment);
}

function deriveSourceTruth({
    sceneId,
    fallbackLabel,
    environment,
}: {
    sceneId: string;
    fallbackLabel?: string | null;
    environment: Record<string, unknown> | null;
}) {
    const metadata = asRecord(environment?.metadata);
    const capture = asRecord(metadata?.capture);
    const sourceLabel = readString(environment?.sourceLabel) ?? readString(environment?.label) ?? fallbackLabel?.trim() ?? sceneId;
    const frameCount = readNumber(metadata?.frame_count) ?? readNumber(capture?.frame_count);
    const captureMode = readString(metadata?.capture_mode) ?? readString(capture?.capture_mode);
    const lane = readString(environment?.lane) ?? readString(metadata?.lane);
    const isDemo =
        sourceLabel.toLowerCase().includes("demo") ||
        String(readString(environment?.statusLabel) ?? "")
            .toLowerCase()
            .includes("demo");

    if (isDemo) {
        return {
            label: sourceLabel,
            summary: "This world is coming from a demo/reference lane rather than a partner-owned capture or production handoff.",
        };
    }

    if ((frameCount !== null && frameCount > 1) || captureMode || lane === "reconstruction") {
        return {
            label: sourceLabel,
            summary:
                frameCount !== null && frameCount > 1
                    ? `Saved world truth points at a multi-image capture path with ${frameCount} recorded frames.`
                    : "Saved world truth points at a capture-set or reconstruction path rather than a single preview image.",
        };
    }

    if (lane === "preview" || readString(metadata?.reference_image) || readString(metadata?.input_image)) {
        return {
            label: sourceLabel,
            summary: "Saved world truth points at a single-image preview path. Treat it as scout output, not faithful reconstruction.",
        };
    }

    return {
        label: sourceLabel,
        summary: `The project owns the durable platform link to MVP scene ${sceneId}. This label comes from linked world or saved environment metadata.`,
    };
}

function deriveLaneTruth(environment: Record<string, unknown> | null) {
    if (!environment) {
        return {
            label: "No saved environment",
            tone: "warning" as const,
            summary: "A scene link exists, but the latest saved version does not currently expose environment truth.",
        };
    }

    const metadata = asRecord(environment.metadata);
    const description = describeEnvironment(environment);
    const worldClassReady = Boolean(readBoolean(asRecord(metadata?.release_gates)?.world_class_ready));

    if (description.lane === "preview") {
        return {
            label: "Preview lane",
            tone: "warning" as const,
            summary: description.detail || description.note || "The saved world is still in the preview lane.",
        };
    }

    if (description.lane === "reconstruction") {
        return {
            label: worldClassReady ? "Benchmarked reconstruction" : "Hybrid reconstruction",
            tone: worldClassReady ? ("success" as const) : ("info" as const),
            summary: description.detail || description.note || "The saved world is in the reconstruction lane.",
        };
    }

    return {
        label: description.label,
        tone: "info" as const,
        summary: description.detail || description.note || "The saved world exists, but its lane is not explicitly classified.",
    };
}

function deriveDeliveryTruth(environment: Record<string, unknown> | null) {
    if (!environment) {
        return {
            label: "No delivery signal",
            tone: "neutral" as const,
            summary: "No saved environment means there is no trustworthy delivery posture to report yet.",
        };
    }

    const metadata = asRecord(environment.metadata);
    const delivery = asRecord(metadata?.delivery);
    const releaseGates = asRecord(metadata?.release_gates);
    const lane = readString(environment.lane) ?? readString(metadata?.lane);
    const deliveryLabel = readString(delivery?.label);
    const deliverySummary = readString(delivery?.summary);
    const releaseSummary = readString(releaseGates?.summary);
    const worldClassReady = Boolean(readBoolean(releaseGates?.world_class_ready) || readBoolean(releaseGates?.hero_ready));
    const reconstructionStatus = readString(metadata?.reconstruction_status);

    if (worldClassReady) {
        return {
            label: deliveryLabel ?? "World-class ready",
            tone: "success" as const,
            summary: deliverySummary ?? releaseSummary ?? "Saved environment has cleared its release gates for serious downstream delivery.",
        };
    }

    if (lane === "preview") {
        return {
            label: deliveryLabel ?? "Preview only",
            tone: "warning" as const,
            summary:
                deliverySummary ??
                releaseSummary ??
                "This world stays in a preview posture. It is not a faithful reconstruction or a production-ready delivery.",
        };
    }

    if (lane === "reconstruction") {
        return {
            label: deliveryLabel ?? "Review-ready only",
            tone: reconstructionStatus?.includes("diagnostic") ? ("warning" as const) : ("info" as const),
            summary:
                deliverySummary ??
                releaseSummary ??
                "This reconstruction is useful for review, but the saved metadata does not clear it as production-ready yet.",
        };
    }

    return {
        label: deliveryLabel ?? "Delivery unclassified",
        tone: "neutral" as const,
        summary: deliverySummary ?? releaseSummary ?? "A saved environment exists, but it does not expose an explicit delivery posture yet.",
    };
}

function useLifecycleTruth({
    sceneId,
    fallbackLabel,
    canAccessMvp,
}: {
    sceneId: string;
    fallbackLabel?: string | null;
    canAccessMvp: boolean;
}) {
    const blockedTruth = useMemo(
        () =>
            buildDefaultTruth({
                sceneId,
                fallbackLabel,
                state: "blocked",
                laneLabel: "MVP access blocked",
                laneTone: "warning",
                laneSummary: "This workspace cannot inspect saved world lane truth until MVP access is available for the current account.",
                deliveryLabel: "Delivery hidden",
                deliveryTone: "neutral",
                deliverySummary: "Project ownership is still enforced, but saved delivery posture cannot be inspected from this session.",
            }),
        [fallbackLabel, sceneId],
    );
    const [truth, setTruth] = useState<LifecycleTruth>(
        canAccessMvp
            ? buildDefaultTruth({
                  sceneId,
                  fallbackLabel,
                  state: "loading",
                  laneLabel: "Loading lane truth",
                  laneTone: "neutral",
                  laneSummary: "Inspecting the latest saved world metadata for source, lane, and delivery posture.",
                  deliveryLabel: "Loading delivery",
                  deliveryTone: "neutral",
                  deliverySummary: "Inspecting saved world delivery posture.",
              })
            : blockedTruth,
    );

    useEffect(() => {
        if (!canAccessMvp) {
            setTruth(blockedTruth);
            return;
        }

        let cancelled = false;

        async function load() {
            setTruth(
                buildDefaultTruth({
                    sceneId,
                    fallbackLabel,
                    state: "loading",
                    laneLabel: "Loading lane truth",
                    laneTone: "neutral",
                    laneSummary: "Inspecting the latest saved world metadata for source, lane, and delivery posture.",
                    deliveryLabel: "Loading delivery",
                    deliveryTone: "neutral",
                    deliverySummary: "Inspecting saved world delivery posture.",
                }),
            );

            try {
                const versionsResponse = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions`, {
                    cache: "no-store",
                });
                if (!versionsResponse.ok) {
                    throw new Error(await extractApiError(versionsResponse, `Scene history unavailable (${versionsResponse.status})`));
                }

                const versionsPayload = (await versionsResponse.json()) as { versions?: SceneVersionRecord[] };
                const latestVersion = Array.isArray(versionsPayload.versions) ? versionsPayload.versions[0] ?? null : null;

                if (!latestVersion?.version_id) {
                    if (!cancelled) {
                        setTruth({
                            ...buildDefaultTruth({
                                sceneId,
                                fallbackLabel,
                                state: "missing",
                                laneLabel: "No saved version",
                                laneTone: "warning",
                                laneSummary: "This scene is linked to the project, but it has not been saved into durable MVP version history yet.",
                                deliveryLabel: "Awaiting first save",
                                deliveryTone: "neutral",
                                deliverySummary: "Delivery posture stays unknown until the linked world has at least one saved version.",
                            }),
                            versionSummary: "Link exists, but no saved version anchor is recorded for this world yet.",
                        });
                    }
                    return;
                }

                const versionResponse = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${latestVersion.version_id}`, {
                    cache: "no-store",
                });
                if (!versionResponse.ok) {
                    throw new Error(await extractApiError(versionResponse, `Version detail unavailable (${versionResponse.status})`));
                }

                const versionPayload = (await versionResponse.json()) as Record<string, unknown>;
                const environment = readEnvironmentFromVersionPayload(versionPayload);
                const sourceTruth = deriveSourceTruth({
                    sceneId,
                    fallbackLabel,
                    environment,
                });
                const laneTruth = deriveLaneTruth(environment);
                const deliveryTruth = deriveDeliveryTruth(environment);

                if (!cancelled) {
                    setTruth({
                        state: "ready",
                        sourceLabel: sourceTruth.label,
                        sourceSummary: sourceTruth.summary,
                        laneLabel: laneTruth.label,
                        laneTone: laneTruth.tone,
                        laneSummary: laneTruth.summary,
                        deliveryLabel: deliveryTruth.label,
                        deliveryTone: deliveryTruth.tone,
                        deliverySummary: deliveryTruth.summary,
                        versionId: latestVersion.version_id,
                        savedAt: readString(latestVersion.saved_at),
                        versionSummary: environment
                            ? `Latest saved anchor ${latestVersion.version_id} from ${formatDate(readString(latestVersion.saved_at))}.`
                            : latestVersion.summary?.has_environment === false
                              ? `Latest saved anchor ${latestVersion.version_id} has no environment payload.`
                              : `Latest saved anchor ${latestVersion.version_id} is recorded, but environment truth is incomplete.`,
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setTruth({
                        ...buildDefaultTruth({
                            sceneId,
                            fallbackLabel,
                            state: "error",
                            laneLabel: "Truth unavailable",
                            laneTone: "warning",
                            laneSummary: "Saved world inspection failed, so the platform layer is not inventing lane truth.",
                            deliveryLabel: "Delivery unknown",
                            deliveryTone: "neutral",
                            deliverySummary: "Project ownership and reopen rules still apply even when saved world metadata cannot be inspected.",
                        }),
                        versionSummary: error instanceof Error ? humanizeToken(error.message) : "Unable to inspect saved world metadata right now.",
                    });
                }
            }
        }

        void load();

        return () => {
            cancelled = true;
        };
    }, [blockedTruth, canAccessMvp, fallbackLabel, sceneId]);

    return truth;
}

export function WorldLinkLifecycleSummary({
    sceneId,
    fallbackLabel,
    canAccessMvp,
    truthSummary,
    compact = false,
}: {
    sceneId: string;
    fallbackLabel?: string | null;
    canAccessMvp: boolean;
    truthSummary?: WorldTruthSummary | null;
    compact?: boolean;
}) {
    const truth = useLifecycleTruth({
        sceneId,
        fallbackLabel,
        canAccessMvp,
    });

    if (compact) {
        return (
            <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">World lifecycle truth</p>
                        <p className="mt-2 text-sm font-medium text-white">{truth.sourceLabel}</p>
                        <p className="mt-1 text-xs text-neutral-500">{truth.versionSummary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={truth.laneLabel} tone={truth.laneTone} />
                        <StatusBadge label={truth.deliveryLabel} tone={truth.deliveryTone} />
                    </div>
                </div>
                <p className="mt-3 text-sm text-neutral-400">{truth.laneSummary}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">{truth.deliverySummary}</p>
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">Saved world truth</p>
                    <p className="mt-2 text-sm font-medium text-white">{truth.sourceLabel}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-400">{truth.sourceSummary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={truth.laneLabel} tone={truth.laneTone} />
                    <StatusBadge label={truth.deliveryLabel} tone={truth.deliveryTone} />
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Lane truth</p>
                    <p className="mt-2 text-sm text-white">{truth.laneLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{truth.laneSummary}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Delivery posture</p>
                    <p className="mt-2 text-sm text-white">{truth.deliveryLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{truth.deliverySummary}</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Latest saved anchor</p>
                    <p className="mt-2 text-sm text-white">{truth.versionId ?? "No saved version"}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {truth.savedAt ? `Saved ${formatDate(truth.savedAt)}` : truth.versionSummary}
                    </p>
                </article>
            </div>

            {canAccessMvp && (truthSummary?.sourceKind || truthSummary?.ingestRecordId || truthSummary?.downstreamTargetSummary || truthSummary?.blockers?.length) ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Ingest truth</p>
                        <p className="mt-2 text-sm text-white">
                            {truthSummary.sourceKind ? truthSummary.sourceKind.replaceAll("_", " ") : "Source kind unavailable"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {truthSummary.ingestRecordId
                                ? `Ingest record ${truthSummary.ingestRecordId}`
                                : "No ingest record is attached to the latest saved world yet."}
                        </p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Downstream handoff</p>
                        <p className="mt-2 text-sm text-white">{truthSummary.downstreamTargetLabel ?? "No downstream target"}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {truthSummary.downstreamTargetSummary ?? "No downstream handoff summary is recorded on the latest saved world."}
                        </p>
                    </article>
                </div>
            ) : null}

            {canAccessMvp && truthSummary?.blockers?.length ? (
                <p className="mt-4 text-xs leading-5 text-amber-200/80">Blockers: {truthSummary.blockers.join(", ")}</p>
            ) : null}

            <p className="mt-4 text-xs leading-5 text-neutral-500">
                Project reopen and review controls stay on the platform-owned link. The underlying <code className="text-white">scene_id</code> still belongs to MVP.
            </p>
        </div>
    );
}
