import { z } from "zod";

export const releaseReadinessStateValues = ["ready", "at_risk", "blocked"] as const;
export const releaseReadinessScopeValues = ["workspace", "project"] as const;
export const releaseReadinessDomainValues = [
    "workspace",
    "billing",
    "team",
    "support",
    "projects",
    "governance",
    "coverage",
    "continuity",
] as const;
export const releaseCapabilityValues = ["ship", "share", "review", "operate"] as const;

export const releaseReadinessStateSchema = z.enum(releaseReadinessStateValues);
export const releaseReadinessScopeSchema = z.enum(releaseReadinessScopeValues);
export const releaseReadinessDomainSchema = z.enum(releaseReadinessDomainValues);
export const releaseCapabilitySchema = z.enum(releaseCapabilityValues);

export const releaseGateSchema = z.object({
    gateKey: z.string().min(1),
    domain: releaseReadinessDomainSchema,
    state: releaseReadinessStateSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    detail: z.string().min(1),
    href: z.string().min(1),
    routeLabel: z.string().min(1),
    ownerLabel: z.string().min(1),
    signalKey: z.string().min(1).nullable(),
});

export const releaseCapabilityStatusSchema = z.object({
    capability: releaseCapabilitySchema,
    state: releaseReadinessStateSchema,
    summary: z.string().min(1),
});

export const releaseReadinessSnapshotSchema = z.object({
    scope: releaseReadinessScopeSchema,
    scopeId: z.string().min(1).nullable(),
    scopeLabel: z.string().min(1),
    state: releaseReadinessStateSchema,
    summary: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
    readyGateCount: z.number().int().nonnegative(),
    atRiskGateCount: z.number().int().nonnegative(),
    blockedGateCount: z.number().int().nonnegative(),
    capabilities: z.array(releaseCapabilityStatusSchema),
    gates: z.array(releaseGateSchema),
});

export type ReleaseReadinessState = z.infer<typeof releaseReadinessStateSchema>;
export type ReleaseReadinessScope = z.infer<typeof releaseReadinessScopeSchema>;
export type ReleaseReadinessDomain = z.infer<typeof releaseReadinessDomainSchema>;
export type ReleaseCapability = z.infer<typeof releaseCapabilitySchema>;
export type ReleaseGate = z.infer<typeof releaseGateSchema>;
export type ReleaseCapabilityStatus = z.infer<typeof releaseCapabilityStatusSchema>;
export type ReleaseReadinessSnapshot = z.infer<typeof releaseReadinessSnapshotSchema>;
