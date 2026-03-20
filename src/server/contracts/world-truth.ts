import { z } from "zod";

export const worldTruthSummarySchema = z.object({
    sourceKind: z.string().min(1).nullable(),
    sourceLabel: z.string().min(1).nullable(),
    ingestRecordId: z.string().min(1).nullable(),
    handoffManifestId: z.string().min(1).nullable().optional(),
    latestVersionId: z.string().min(1).nullable(),
    lane: z.string().min(1).nullable(),
    truthLabel: z.string().min(1).nullable(),
    deliveryStatus: z.string().min(1).nullable(),
    productionReadiness: z.string().min(1).nullable().optional(),
    reviewApprovalState: z.string().min(1).nullable().optional(),
    versionLocked: z.boolean().optional(),
    blockers: z.array(z.string().min(1)),
    downstreamTargetLabel: z.string().min(1).nullable(),
    downstreamTargetSystem: z.string().min(1).nullable().optional(),
    downstreamTargetProfile: z.string().min(1).nullable().optional(),
    downstreamTargetSummary: z.string().min(1).nullable(),
});

export type WorldTruthSummary = z.infer<typeof worldTruthSummarySchema>;
