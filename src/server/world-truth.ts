import type { WorldTruthSummary } from "@/server/contracts/world-truth";

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized ? normalized : null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean)
        : [];
}

function findPrimarySplat(sceneDocument: Record<string, unknown> | null) {
    const splats = asRecord(sceneDocument?.splats);
    if (!splats) {
        return null;
    }

    for (const entry of Object.values(splats)) {
        const splat = asRecord(entry);
        if (splat) {
            return splat;
        }
    }

    return null;
}

export function deriveWorldTruthSummary({
    sceneId,
    versionId,
    sceneDocument,
    sceneGraph,
    fallbackLabel,
}: {
    sceneId?: string | null;
    versionId?: string | null;
    sceneDocument?: unknown;
    sceneGraph?: unknown;
    fallbackLabel?: string | null;
}): WorldTruthSummary | null {
    const sceneDocumentRecord = asRecord(sceneDocument);
    const sceneGraphRecord = asRecord(sceneGraph);
    const environment = asRecord(sceneGraphRecord?.environment);
    const environmentMetadata = asRecord(environment?.metadata);
    const primarySplat = findPrimarySplat(sceneDocumentRecord);
    const splatMetadata = asRecord(primarySplat?.metadata);
    const reviewRecord = asRecord(sceneDocumentRecord?.review);
    const reviewApproval = asRecord(reviewRecord?.approval);
    const worldSource = asRecord(environmentMetadata?.world_source) ?? asRecord(splatMetadata?.world_source);
    const sourceProvenance = asRecord(environmentMetadata?.source_provenance) ?? asRecord(splatMetadata?.source_provenance);
    const laneMetadata = asRecord(environmentMetadata?.lane_metadata) ?? asRecord(splatMetadata?.lane_metadata);
    const handoffManifest = asRecord(environmentMetadata?.handoff_manifest) ?? asRecord(splatMetadata?.handoff_manifest);
    const handoffTarget = asRecord(handoffManifest?.target);
    const delivery = asRecord(environmentMetadata?.delivery) ?? asRecord(splatMetadata?.delivery);
    const lane = readString(environment?.lane) ?? readString(environmentMetadata?.lane) ?? readString(splatMetadata?.lane);
    const truthLabel = readString(environmentMetadata?.truth_label) ?? readString(splatMetadata?.truth_label);
    const sourceKind =
        readString(worldSource?.kind) ??
        readString(sourceProvenance?.source_kind) ??
        readString(sourceProvenance?.kind) ??
        (lane === "preview" ? "single_image_preview" : lane === "reconstruction" ? "reconstruction_scene" : null);
    const sourceLabel =
        readString(asRecord(worldSource?.primary_source)?.label) ??
        readString(sourceProvenance?.label) ??
        readString(environment?.sourceLabel) ??
        readString(environment?.label) ??
        readString(primarySplat?.name) ??
        readString(fallbackLabel) ??
        readString(sceneId);
    const ingestRecordId =
        readString(worldSource?.ingest_record_id) ??
        readString(sourceProvenance?.source_id) ??
        readString(sourceProvenance?.image_id) ??
        readString(environmentMetadata?.ingest_record_id) ??
        readString(splatMetadata?.ingest_record_id);
    const blockers = Array.from(
        new Set([
            ...readStringArray(laneMetadata?.blockers),
            ...readStringArray(handoffManifest?.blockers),
            ...readStringArray(delivery?.blockers),
            ...(lane === "preview" ? ["preview_not_reconstruction"] : []),
            ...(readString(reviewApproval?.state) === "approved" ? [] : ["review_not_approved"]),
            ...(readString(versionId) ? [] : ["version_not_locked"]),
        ]),
    );
    const deliveryStatus =
        readString(delivery?.status) ??
        readString(handoffManifest?.status) ??
        (blockers.length > 0 ? "blocked" : lane === "reconstruction" ? "ready_for_review" : lane === "preview" ? "preview_only" : null);
    const downstreamTargetLabel =
        readString(handoffManifest?.target_label) ??
        readString(handoffTarget?.label) ??
        (handoffManifest || delivery ? "Unreal handoff manifest" : null);
    const downstreamTargetSummary =
        readString(handoffManifest?.summary) ??
        readString(delivery?.summary) ??
        (downstreamTargetLabel ? `Delivery target: ${downstreamTargetLabel}.` : null);

    if (
        !sourceKind &&
        !sourceLabel &&
        !ingestRecordId &&
        !versionId &&
        !lane &&
        !truthLabel &&
        !deliveryStatus &&
        blockers.length === 0 &&
        !downstreamTargetLabel &&
        !downstreamTargetSummary
    ) {
        return null;
    }

    return {
        sourceKind,
        sourceLabel,
        ingestRecordId,
        latestVersionId: readString(versionId),
        lane,
        truthLabel,
        deliveryStatus,
        blockers,
        downstreamTargetLabel,
        downstreamTargetSummary,
    };
}

export function flattenWorldTruthSummary(summary: WorldTruthSummary | null | undefined) {
    return {
        sourceKind: summary?.sourceKind ?? null,
        ingestRecordId: summary?.ingestRecordId ?? null,
        latestVersionId: summary?.latestVersionId ?? null,
        lane: summary?.lane ?? null,
        blockers: summary?.blockers ?? [],
        deliveryStatus: summary?.deliveryStatus ?? null,
        downstreamTargetSummary: summary?.downstreamTargetSummary ?? null,
    };
}
