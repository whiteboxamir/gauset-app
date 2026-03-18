import { z } from "zod";

import { studioRoleValues } from "@/types/platform/common";

import { entitlementSummarySchema } from "./billing";

export const onboardingStateSchema = z.enum(["invited", "active", "suspended", "closed"]);
export const authProviderSchema = z.enum(["magic_link", "google", "sso", "admin"]);

export const sessionUserSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1).nullable(),
    avatarUrl: z.string().url().nullable(),
    onboardingState: onboardingStateSchema,
});

export const sessionStudioSchema = z.object({
    studioId: z.string().uuid(),
    studioName: z.string().min(1),
    role: z.enum(studioRoleValues),
    planCode: z.string().min(1).nullable(),
});

export const authSessionSchema = z.object({
    user: sessionUserSchema,
    studios: z.array(sessionStudioSchema),
    activeStudioId: z.string().uuid().nullable(),
    providers: z.array(authProviderSchema),
    platformSessionId: z.string().min(1).nullable(),
    platformSessionTracked: z.boolean(),
    entitlements: entitlementSummarySchema,
});

export const authGuardResultSchema = z.object({
    session: authSessionSchema.nullable(),
    redirectTo: z.string().min(1).nullable(),
    reason: z.enum(["anonymous", "missing_entitlement", "missing_membership", "suspended"]).nullable(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthGuardResult = z.infer<typeof authGuardResultSchema>;
