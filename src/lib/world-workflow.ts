import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import { serializeSceneDocumentToNormalizedPersistedSceneGraph } from "@/lib/scene-graph/workspaceAdapter.ts";
import {
    downstreamHandoffContractName,
    downstreamHandoffManifestSchema,
    type DownstreamHandoffManifest,
    type DownstreamHandoffTargetProfile,
    type DownstreamHandoffTargetSystem,
} from "@/server/contracts/downstream-handoff";
import { worldIngestContractName, worldIngestRecordSchema, type WorldIngestRecord, type WorldIngestSourceKind } from "@/server/contracts/world-ingest";

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

function readProjectId(value: unknown) {
    const normalized = readString(value);
    return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function buildDeterministicId(prefix: string, ...parts: Array<string | null | undefined>) {
    const normalized = parts
        .map((part) => readString(part))
        .filter(Boolean)
        .join("_")
        .replace(/[^a-z0-9_/-]+/gi, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized ? `${prefix}_${normalized}` : `${prefix}_unbound`;
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

function resolveSceneDocument(sceneDocument: unknown, sceneGraph: unknown) {
    const sceneDocumentRecord = asRecord(sceneDocument);
    if (sceneDocumentRecord && sceneDocumentRecord.version === 2) {
        return sceneDocumentRecord;
    }

    return asRecord(asRecord(sceneGraph)?.__scene_document_v2);
}

function resolveEnvironmentMetadata(sceneDocument: Record<string, unknown> | null, sceneGraph: unknown) {
    const sceneGraphRecord = asRecord(sceneGraph);
    const primarySplat = findPrimarySplat(sceneDocument);
    const environment = asRecord(sceneGraphRecord?.environment);
    return {
        primarySplat,
        sceneGraphRecord,
        splatMetadata: asRecord(primarySplat?.metadata),
        environmentMetadata: asRecord(environment?.metadata),
        environment,
    };
}

function deriveSourceKind({
    lane,
    worldSource,
    sourceProvenance,
    sceneId,
}: {
    lane: string | null;
    worldSource: Record<string, unknown> | null;
    sourceProvenance: Record<string, unknown> | null;
    sceneId: string | null;
}): WorldIngestSourceKind {
    const explicit =
        readString(worldSource?.kind) ??
        readString(sourceProvenance?.kind) ??
        readString(sourceProvenance?.source_kind);
    if (explicit === "provider_generated_still") return "provider_generated_still";
    if (explicit === "capture_session" || explicit === "capture_set") return "capture_session";
    if (explicit === "demo_world") return "demo_world";
    if (explicit === "linked_scene_version") return "linked_scene_version";
    if (explicit === "external_world_package") return "external_world_package";
    if (explicit === "third_party_world_model_output") return "third_party_world_model_output";
    if (explicit === "upload" || explicit === "uploaded_still") return "upload";
    if (sceneId) return "linked_scene_version";
    if (lane === "reconstruction") return "capture_session";
    return "upload";
}

function inferProductionReadiness(lane: string | null, blockers: string[], delivery: Record<string, unknown> | null) {
    const explicitReadiness = readString(delivery?.readiness);
    if (explicitReadiness === "production_ready") {
        return "production_ready" as const;
    }
    if (explicitReadiness === "handoff_ready") {
        return "handoff_ready" as const;
    }
    if (blockers.length > 0) {
        return lane === "preview" ? ("review_only" as const) : ("blocked" as const);
    }
    if (lane === "reconstruction") {
        return "handoff_ready" as const;
    }
    if (lane === "preview") {
        return "review_only" as const;
    }
    return "blocked" as const;
}

function resolvePackageFiles({
    projectId,
    sceneId,
    metadata,
    environment,
    sceneGraph,
}: {
    projectId: string | null;
    sceneId: string | null;
    metadata: Record<string, unknown> | null;
    environment: Record<string, unknown> | null;
    sceneGraph: Record<string, unknown> | null;
}) {
    const urls = asRecord(environment?.urls);
    const files: Record<string, string> = {};
    const setFile = (key: string, value: unknown) => {
        const normalized = readString(value);
        if (normalized) {
            files[key] = normalized;
        }
    };

    setFile("viewer", urls?.viewer);
    setFile("splats", urls?.splats);
    setFile("cameras", urls?.cameras);
    setFile("metadata", urls?.metadata ?? metadata?.metadata_url);
    setFile("preview_projection", urls?.preview_projection);

    if (!files.metadata && sceneId) {
        files.metadata = `/storage/scenes/${sceneId}/environment/metadata.json`;
    }
    if (!files.splats && sceneId) {
        files.splats = `/storage/scenes/${sceneId}/environment/splats.ply`;
    }
    if (!files.cameras && sceneId) {
        files.cameras = `/storage/scenes/${sceneId}/environment/cameras.json`;
    }
    if (!files.viewer && sceneId) {
        files.viewer = `/storage/scenes/${sceneId}/environment`;
    }

    const entrypoints: Record<string, string> = {};
    if (sceneId) {
        const baseParams = new URLSearchParams();
        baseParams.set("scene", sceneId);
        if (projectId) {
            baseParams.set("project", projectId);
        }
        entrypoints.workspace = `/mvp?${baseParams.toString()}`;
        entrypoints.review = `/mvp/review?scene=${encodeURIComponent(sceneId)}`;
    }
    if (files.metadata) {
        entrypoints.metadata = files.metadata;
    }

    if (Object.keys(files).length === 0 && sceneGraph) {
        const environmentRecord = asRecord(sceneGraph.environment);
        const environmentUrls = asRecord(environmentRecord?.urls);
        setFile("viewer", environmentUrls?.viewer);
        setFile("splats", environmentUrls?.splats);
        setFile("cameras", environmentUrls?.cameras);
        setFile("metadata", environmentUrls?.metadata);
    }

    return { files, entrypoints };
}

export function readWorldIngestRecord(value: unknown): WorldIngestRecord | null {
    const parsed = worldIngestRecordSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function readDownstreamHandoffManifest(value: unknown): DownstreamHandoffManifest | null {
    const parsed = downstreamHandoffManifestSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function deriveWorldIngestRecord({
    sceneId,
    versionId,
    projectId,
    sceneDocument,
    sceneGraph,
    fallbackLabel,
}: {
    sceneId?: string | null;
    versionId?: string | null;
    projectId?: string | null;
    sceneDocument?: unknown;
    sceneGraph?: unknown;
    fallbackLabel?: string | null;
}): WorldIngestRecord | null {
    const normalizedSceneDocument = resolveSceneDocument(sceneDocument, sceneGraph);
    const { primarySplat, environmentMetadata, splatMetadata, environment, sceneGraphRecord } = resolveEnvironmentMetadata(normalizedSceneDocument, sceneGraph);
    const candidateRecord =
        readWorldIngestRecord(environmentMetadata?.ingest_record) ??
        readWorldIngestRecord(splatMetadata?.ingest_record) ??
        readWorldIngestRecord(environmentMetadata?.ingestRecord) ??
        readWorldIngestRecord(splatMetadata?.ingestRecord);

    if (candidateRecord) {
        const persistedProjectId = candidateRecord.workspace_binding.project_id;
        const persistedSceneId = candidateRecord.workspace_binding.scene_id;
        const persistedVersionId = candidateRecord.versioning.version_id;
        return {
            ...candidateRecord,
            scene_document: candidateRecord.scene_document ?? normalizedSceneDocument ?? null,
            compatibility_scene_graph: candidateRecord.compatibility_scene_graph ?? sceneGraphRecord ?? null,
            workspace_binding: {
                ...candidateRecord.workspace_binding,
                project_id: persistedProjectId ?? readProjectId(projectId),
                scene_id: persistedSceneId ?? readString(sceneId),
            },
            versioning: {
                version_id: persistedVersionId ?? readString(versionId),
                version_locked: Boolean(persistedVersionId ?? readString(versionId)),
            },
        };
    }

    const worldSource = asRecord(environmentMetadata?.world_source) ?? asRecord(splatMetadata?.world_source);
    const sourceProvenance = asRecord(environmentMetadata?.source_provenance) ?? asRecord(splatMetadata?.source_provenance);
    const laneMetadata = asRecord(environmentMetadata?.lane_metadata) ?? asRecord(splatMetadata?.lane_metadata);
    const delivery = asRecord(environmentMetadata?.delivery) ?? asRecord(splatMetadata?.delivery);
    const normalizedSceneId = readString(sceneId) ?? readString(primarySplat?.sceneId) ?? readString(environment?.id);
    const normalizedVersionId = readString(versionId);
    const lane = readString(environment?.lane) ?? readString(environmentMetadata?.lane) ?? readString(splatMetadata?.lane);
    const sourceKind = deriveSourceKind({
        lane,
        worldSource,
        sourceProvenance,
        sceneId: normalizedSceneId,
    });
    const sourceLabel =
        readString(asRecord(worldSource?.primary_source)?.label) ??
        readString(sourceProvenance?.label) ??
        readString(environment?.sourceLabel) ??
        readString(environment?.label) ??
        readString(primarySplat?.name) ??
        readString(fallbackLabel) ??
        normalizedSceneId;
    const blockers = Array.from(
        new Set([
            ...readStringArray(laneMetadata?.blockers),
            ...readStringArray(delivery?.blocking_issues),
            ...(lane === "preview" ? ["preview_not_reconstruction"] : []),
        ]),
    );
    const { files, entrypoints } = resolvePackageFiles({
        projectId: readProjectId(projectId),
        sceneId: normalizedSceneId,
        metadata: environmentMetadata ?? splatMetadata,
        environment,
        sceneGraph: sceneGraphRecord,
    });

    if (!sourceLabel && !normalizedSceneId && !lane && Object.keys(files).length === 0) {
        return null;
    }

    const truthLabel =
        readString(environmentMetadata?.truth_label) ??
        readString(splatMetadata?.truth_label) ??
        readString(laneMetadata?.summary) ??
        (lane ? `${lane} workflow` : null);

    return {
        contract: worldIngestContractName,
        ingest_id:
            readString(worldSource?.ingest_record_id) ??
            readString(sourceProvenance?.source_id) ??
            buildDeterministicId("ingest", normalizedSceneId, normalizedVersionId, lane ?? sourceKind),
        status: "accepted",
        source: {
            kind: sourceKind,
            label: sourceLabel ?? "Untitled world source",
            vendor: readString(sourceProvenance?.provider) ?? readString(sourceProvenance?.vendor),
            captured_at: readString(environmentMetadata?.captured_at) ?? readString(splatMetadata?.captured_at),
            source_uri:
                readString(environmentMetadata?.input_image) ??
                readString(splatMetadata?.input_image) ??
                readString(sourceProvenance?.url) ??
                readString(sourceProvenance?.filepath) ??
                files.metadata ??
                null,
            origin: readString(sourceProvenance?.origin) ?? readString(worldSource?.origin),
            ingest_channel: readString(sourceProvenance?.ingest_channel) ?? readString(worldSource?.ingest_channel),
        },
        package: {
            media_type: "application/x-gauset-scene-document+json",
            checksum_sha256: readString(environmentMetadata?.checksum_sha256) ?? readString(splatMetadata?.checksum_sha256),
            entrypoints,
            files,
        },
        scene_document: normalizedSceneDocument ?? null,
        compatibility_scene_graph: sceneGraphRecord ?? null,
        workspace_binding: {
            project_id: readProjectId(projectId),
            scene_id: normalizedSceneId,
        },
        versioning: {
            version_id: normalizedVersionId,
            version_locked: Boolean(normalizedVersionId),
        },
        workflow: {
            workspace_path: entrypoints.workspace ?? null,
            review_path: entrypoints.review ?? null,
            share_path: normalizedSceneId && normalizedVersionId ? `/mvp/review?scene=${encodeURIComponent(normalizedSceneId)}&version=${encodeURIComponent(normalizedVersionId)}` : null,
            save_ready: Boolean(normalizedSceneId || normalizedSceneDocument),
            review_ready: Boolean(normalizedSceneId || normalizedSceneDocument),
            share_ready: Boolean(normalizedSceneId && normalizedVersionId),
        },
        truth: {
            lane,
            truth_label: truthLabel,
            lane_truth: readString(laneMetadata?.lane_truth) ?? readString(laneMetadata?.truth) ?? readString(environmentMetadata?.lane_truth) ?? readString(splatMetadata?.lane_truth),
            production_readiness: inferProductionReadiness(lane, blockers, delivery),
            blockers,
        },
    };
}

function deriveHandoffTarget(targetSystem: DownstreamHandoffTargetSystem, targetProfile: DownstreamHandoffTargetProfile) {
    if (targetSystem === "unreal_engine" || targetProfile === "unreal_scene_package/v1") {
        return {
            system: "unreal_engine" as const,
            profile: "unreal_scene_package/v1" as const,
            label: "Unreal scene package",
            engine_version: "5.x",
            coordinate_system: "left_handed_z_up",
            unit_scale: "centimeter",
        };
    }

    return {
        system: "generic_downstream" as const,
        profile: "generic_scene_package/v1" as const,
        label: "Generic scene package",
    };
}

export function buildDownstreamHandoffManifest({
    projectId,
    sceneId,
    versionId,
    sceneDocument,
    sceneGraph,
    ingestRecord,
    checkedBy,
    targetSystem,
    targetProfile,
}: {
    projectId?: string | null;
    sceneId: string;
    versionId: string;
    sceneDocument: SceneDocumentV2;
    sceneGraph?: unknown;
    ingestRecord?: WorldIngestRecord | null;
    checkedBy?: string | null;
    targetSystem: DownstreamHandoffTargetSystem;
    targetProfile: DownstreamHandoffTargetProfile;
}) {
    const compatibilitySceneGraph =
        asRecord(sceneGraph) ?? serializeSceneDocumentToNormalizedPersistedSceneGraph(sceneDocument);
    const normalizedProjectId = readProjectId(projectId);
    const normalizedVersionId = readString(versionId);
    if (!normalizedVersionId) {
        throw new Error("A saved version is required before downstream handoff.");
    }

    const resolvedIngestRecord =
        ingestRecord ??
        deriveWorldIngestRecord({
            sceneId,
            versionId: normalizedVersionId,
            projectId: normalizedProjectId,
            sceneDocument,
            sceneGraph: compatibilitySceneGraph,
        });
    const persistedProjectId = resolvedIngestRecord?.workspace_binding.project_id ?? null;
    const persistedSceneId = resolvedIngestRecord?.workspace_binding.scene_id ?? null;
    const persistedVersionId = resolvedIngestRecord?.versioning.version_id ?? null;
    if (persistedSceneId && persistedSceneId !== sceneId) {
        throw new Error("Saved world binding does not match the requested scene.");
    }
    if (normalizedProjectId && persistedProjectId && persistedProjectId !== normalizedProjectId) {
        throw new Error("Saved world binding does not match the requested project.");
    }
    if (persistedVersionId && persistedVersionId !== normalizedVersionId) {
        throw new Error("Saved world version does not match the requested handoff version.");
    }

    const versionLocked = Boolean(resolvedIngestRecord?.versioning.version_locked && (persistedVersionId ?? normalizedVersionId));
    if (!versionLocked) {
        throw new Error("A version-locked saved world is required before downstream handoff.");
    }
    const shareReady = Boolean(resolvedIngestRecord?.workflow.share_ready);
    if (!shareReady) {
        throw new Error("A version-locked review/share state is required before downstream handoff.");
    }

    const reviewRecord = asRecord(sceneDocument.review);
    const reviewApproval = asRecord(reviewRecord?.approval);
    const approvalState = readString(reviewApproval?.state);
    const reviewApprovalState = approvalState ?? "draft";
    const blockers = Array.from(
        new Set([
            ...(resolvedIngestRecord?.truth.blockers ?? []),
            ...(reviewApprovalState === "approved" ? [] : ["review_not_approved"]),
        ]),
    );
    const deliveryStatus = blockers.length > 0 ? "blocked" : "ready";
    const target = deriveHandoffTarget(targetSystem, targetProfile);
    const manifest = {
        contract: downstreamHandoffContractName,
        manifest_id: buildDeterministicId("handoff", sceneId, versionId, target.profile),
        target,
        source: {
            ingest_contract: resolvedIngestRecord?.contract ?? null,
            ingest_record_id: resolvedIngestRecord?.ingest_id ?? null,
            project_id: persistedProjectId ?? normalizedProjectId,
            scene_id: sceneId,
            version_id: normalizedVersionId,
        },
        scene_document: sceneDocument,
        compatibility_scene_graph: compatibilitySceneGraph,
        review: {
            approval_state: reviewApprovalState,
            version_locked: versionLocked,
            share_ready: shareReady,
            share_mode: "saved_version",
        },
        truth: {
            source_kind: resolvedIngestRecord?.source.kind ?? null,
            lane: resolvedIngestRecord?.truth.lane ?? null,
            truth_label: resolvedIngestRecord?.truth.truth_label ?? null,
            lane_truth: resolvedIngestRecord?.truth.lane_truth ?? null,
            production_readiness: resolvedIngestRecord?.truth.production_readiness ?? null,
            blockers,
        },
        payload: {
            label: target.label,
            summary:
                deliveryStatus === "ready"
                    ? `${target.label} is version-anchored and ready for downstream delivery.`
                    : `${target.label} is blocked until review and workflow gates are cleared.`,
            files: resolvedIngestRecord?.package.files ?? {},
            entrypoints: resolvedIngestRecord?.package.entrypoints ?? {},
        },
        delivery: {
            status: deliveryStatus,
            checked_at: new Date().toISOString(),
            checked_by: readString(checkedBy),
            requirements: blockers.length > 0 ? blockers : ["version_locked", "review_approved"],
        },
    } satisfies DownstreamHandoffManifest;

    return downstreamHandoffManifestSchema.parse(manifest);
}
