import { z } from "zod";

import { authProviderSchema, onboardingStateSchema } from "@/server/contracts/auth";
import { studioRoleValues } from "@/types/platform/common";

import { notificationPreferencesSchema, type NotificationPreferences } from "./notifications";
import { securityOverviewSchema, type SecurityOverview } from "./security";

export const userProfileSettingsSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1).nullable(),
    avatarUrl: z.string().url().nullable(),
    jobTitle: z.string().min(1).nullable(),
    timezone: z.string().min(1),
    onboardingState: onboardingStateSchema,
    providers: z.array(authProviderSchema),
});

export const studioWorkspaceSummarySchema = z.object({
    studioId: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    billingEmail: z.string().email().nullable(),
    supportEmail: z.string().email().nullable(),
    accentColor: z.string().min(1).nullable(),
    websiteUrl: z.string().url().nullable(),
    role: z.enum(studioRoleValues),
    seatCount: z.number().int().nonnegative(),
    pendingInvitationCount: z.number().int().nonnegative(),
});

export const accessibleStudioSummarySchema = z.object({
    studioId: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(studioRoleValues),
    planCode: z.string().min(1).nullable(),
    isActive: z.boolean(),
});

export const accountSettingsSnapshotSchema = z.object({
    profile: userProfileSettingsSchema,
    activeStudio: studioWorkspaceSummarySchema.nullable(),
    accessibleStudios: z.array(accessibleStudioSummarySchema),
    notifications: notificationPreferencesSchema,
    security: securityOverviewSchema,
});

export const studioWorkspaceStateSchema = z.object({
    activeStudio: studioWorkspaceSummarySchema.nullable(),
    accessibleStudios: z.array(accessibleStudioSummarySchema),
});

export type UserProfileSettings = z.infer<typeof userProfileSettingsSchema>;
export type StudioWorkspaceSummary = z.infer<typeof studioWorkspaceSummarySchema>;
export type AccessibleStudioSummary = z.infer<typeof accessibleStudioSummarySchema>;
export type AccountSettingsSnapshot = z.infer<typeof accountSettingsSnapshotSchema>;
export type StudioWorkspaceState = z.infer<typeof studioWorkspaceStateSchema>;

export type { NotificationPreferences, SecurityOverview };
