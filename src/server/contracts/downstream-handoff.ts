import { z } from "zod";

export const downstreamHandoffContractName = "downstream-handoff/v1" as const;

export const downstreamHandoffTargetSystemValues = ["generic_downstream", "unreal_engine"] as const;
export const downstreamHandoffTargetProfileValues = ["generic_scene_package/v1", "unreal_scene_package/v1"] as const;
export const downstreamHandoffDeliveryStatusValues = ["blocked", "ready", "ready_for_downstream"] as const;

export const downstreamHandoffTargetSchema = z.object({
    system: z.enum(downstreamHandoffTargetSystemValues),
    profile: z.enum(downstreamHandoffTargetProfileValues),
    label: z.string().min(1),
    engine_version: z.string().min(1).nullable().optional(),
    coordinate_system: z.string().min(1).nullable().optional(),
    unit_scale: z.string().min(1).nullable().optional(),
}).catchall(z.unknown());

export const downstreamHandoffSourceSchema = z.object({
    ingest_contract: z.string().min(1).nullable(),
    ingest_record_id: z.string().min(1).nullable(),
    project_id: z.string().min(1).nullable(),
    scene_id: z.string().min(1),
    version_id: z.string().min(1),
}).catchall(z.unknown());

export const downstreamHandoffReviewSchema = z.object({
    approval_state: z.string().min(1).nullable(),
    version_locked: z.boolean(),
    share_ready: z.boolean(),
    share_mode: z.string().min(1).nullable(),
}).catchall(z.unknown());

export const downstreamHandoffTruthSchema = z.object({
    source_kind: z.string().min(1).nullable(),
    lane: z.string().min(1).nullable(),
    truth_label: z.string().min(1).nullable(),
    lane_truth: z.string().min(1).nullable(),
    production_readiness: z.string().min(1).nullable(),
    blockers: z.array(z.string().min(1)),
}).catchall(z.unknown());

export const downstreamHandoffPayloadSchema = z.object({
    label: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
    files: z.union([
        z.record(z.string(), z.string().min(1)),
        z.array(
            z.object({
                path: z.string().min(1),
                kind: z.string().min(1),
            }).catchall(z.unknown()),
        ),
    ]),
    entrypoints: z.record(z.string(), z.string().min(1)).optional(),
}).catchall(z.unknown());

export const downstreamHandoffDeliverySchema = z.object({
    status: z.enum(downstreamHandoffDeliveryStatusValues),
    checked_at: z.string().datetime({ offset: true }),
    checked_by: z.string().min(1).nullable(),
    requirements: z.array(
        z.union([
            z.string().min(1),
            z.object({
                key: z.string().min(1),
                passed: z.boolean(),
            }).catchall(z.unknown()),
        ]),
    ),
}).catchall(z.unknown());

export const downstreamHandoffManifestSchema = z.object({
    contract: z.literal(downstreamHandoffContractName),
    manifest_id: z.string().min(1),
    target: downstreamHandoffTargetSchema,
    source: downstreamHandoffSourceSchema,
    scene_document: z.unknown(),
    compatibility_scene_graph: z.unknown(),
    review: downstreamHandoffReviewSchema,
    truth: downstreamHandoffTruthSchema,
    payload: downstreamHandoffPayloadSchema,
    delivery: downstreamHandoffDeliverySchema,
}).catchall(z.unknown());

export type DownstreamHandoffTargetSystem = (typeof downstreamHandoffTargetSystemValues)[number];
export type DownstreamHandoffTargetProfile = (typeof downstreamHandoffTargetProfileValues)[number];
export type DownstreamHandoffManifest = z.infer<typeof downstreamHandoffManifestSchema>;
