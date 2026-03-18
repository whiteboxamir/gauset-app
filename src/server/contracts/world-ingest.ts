import { z } from "zod";

export const worldIngestContractName = "world-ingest/v1" as const;

export const worldIngestSourceKindValues = [
    "upload",
    "provider_generated_still",
    "capture_session",
    "demo_world",
    "linked_scene_version",
    "external_world_package",
    "third_party_world_model_output",
] as const;

export const worldIngestProductionReadinessValues = ["blocked", "review_only", "handoff_ready", "production_ready"] as const;

export const worldIngestSourceSchema = z.object({
    kind: z.enum(worldIngestSourceKindValues),
    label: z.string().min(1),
    vendor: z.string().min(1).nullable(),
    captured_at: z.string().datetime({ offset: true }).nullable(),
    source_uri: z.string().min(1).nullable(),
    origin: z.string().min(1).nullable().optional(),
    ingest_channel: z.string().min(1).nullable().optional(),
}).catchall(z.unknown());

export const worldIngestPackageSchema = z.object({
    media_type: z.string().min(1).nullable(),
    checksum_sha256: z.string().min(1).nullable(),
    entrypoints: z.record(z.string(), z.string().min(1)),
    files: z.record(z.string(), z.string().min(1)),
}).catchall(z.unknown());

export const worldIngestWorkspaceBindingSchema = z.object({
    project_id: z.string().min(1).nullable(),
    scene_id: z.string().min(1).nullable(),
});

export const worldIngestVersioningSchema = z.object({
    version_id: z.string().min(1).nullable().optional(),
    latest_version_id: z.string().min(1).nullable().optional(),
    version_locked: z.boolean().optional(),
    version_required: z.boolean().optional(),
    share_mode: z.string().min(1).nullable().optional(),
}).catchall(z.unknown());

export const worldIngestWorkflowSchema = z.object({
    workspace_path: z.string().min(1).nullable(),
    review_path: z.string().min(1).nullable(),
    share_path: z.string().min(1).nullable().optional(),
    save_ready: z.boolean(),
    review_ready: z.boolean(),
    share_ready: z.boolean(),
}).catchall(z.unknown());

export const worldIngestTruthSchema = z.object({
    lane: z.string().min(1).nullable(),
    truth_label: z.string().min(1).nullable(),
    lane_truth: z.string().min(1).nullable(),
    production_readiness: z.string().min(1),
    blockers: z.array(z.string().min(1)),
}).catchall(z.unknown());

export const worldIngestRecordSchema = z.object({
    contract: z.literal(worldIngestContractName),
    ingest_id: z.string().min(1),
    status: z.literal("accepted"),
    source: worldIngestSourceSchema,
    package: worldIngestPackageSchema.default({
        media_type: null,
        checksum_sha256: null,
        entrypoints: {},
        files: {},
    }),
    scene_document: z.unknown().nullable(),
    compatibility_scene_graph: z.unknown().nullable(),
    workspace_binding: worldIngestWorkspaceBindingSchema,
    versioning: worldIngestVersioningSchema,
    workflow: worldIngestWorkflowSchema,
    truth: worldIngestTruthSchema,
}).catchall(z.unknown());

export type WorldIngestSourceKind = (typeof worldIngestSourceKindValues)[number];
export type WorldIngestProductionReadiness = (typeof worldIngestProductionReadinessValues)[number];
export type WorldIngestRecord = z.infer<typeof worldIngestRecordSchema>;
