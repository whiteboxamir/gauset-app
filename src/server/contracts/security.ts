import { z } from "zod";

import { studioRoleValues } from "@/types/platform/common";

import { authProviderSchema, onboardingStateSchema } from "./auth";

export const accessReasonKeyValues = [
    "mvp_access",
    "seat_invites",
    "priority_support",
    "governance_manage",
    "coverage_manage",
    "billing_actions",
] as const;

export const accessReasonKeySchema = z.enum(accessReasonKeyValues);

export const securityEventSchema = z.object({
    id: z.string().uuid(),
    actorType: z.enum(["user", "admin", "system"]),
    eventType: z.string().min(1),
    summary: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
});

export const platformSessionRecordSchema = z.object({
    sessionId: z.string().min(1),
    userId: z.string().uuid(),
    provider: authProviderSchema,
    label: z.string().min(1),
    authenticatedAt: z.string().datetime({ offset: true }),
    lastSeenAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    revokedReason: z.string().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    isCurrent: z.boolean(),
    manageable: z.boolean(),
    legacy: z.boolean(),
});

export const accessReasonSummarySchema = z.object({
    key: accessReasonKeySchema,
    label: z.string().min(1),
    granted: z.boolean(),
    summary: z.string().min(1),
    reasons: z.array(z.string().min(1)),
    href: z.string().min(1),
});

export const securityOverviewSchema = z.object({
    email: z.string().email(),
    onboardingState: onboardingStateSchema,
    providers: z.array(authProviderSchema),
    activeStudioName: z.string().min(1).nullable(),
    activeStudioRole: z.enum(studioRoleValues).nullable(),
    planCode: z.string().min(1).nullable(),
    canInviteSeats: z.boolean(),
    canAccessMvp: z.boolean(),
    canUsePrioritySupport: z.boolean(),
    legacySessionDetected: z.boolean(),
    currentSession: platformSessionRecordSchema.nullable(),
    otherSessions: z.array(platformSessionRecordSchema),
    accessReasons: z.array(accessReasonSummarySchema),
    recentEvents: z.array(securityEventSchema),
});

export type AccessReasonKey = z.infer<typeof accessReasonKeySchema>;
export type SecurityEvent = z.infer<typeof securityEventSchema>;
export type PlatformSessionRecord = z.infer<typeof platformSessionRecordSchema>;
export type AccessReasonSummary = z.infer<typeof accessReasonSummarySchema>;
export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
