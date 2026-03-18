import { z } from "zod";

import { inviteStatusValues, studioMembershipStatusValues, studioRoleValues } from "@/types/platform/common";

export const teamMemberSchema = z.object({
    membershipId: z.string().uuid(),
    userId: z.string().uuid(),
    studioId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1).nullable(),
    role: z.enum(studioRoleValues),
    status: z.enum(studioMembershipStatusValues),
    seatKind: z.enum(["paid", "observer", "internal"]),
    joinedAt: z.string().datetime({ offset: true }).nullable(),
});

export const teamInvitationSchema = z.object({
    invitationId: z.string().uuid(),
    studioId: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(studioRoleValues),
    status: z.enum(inviteStatusValues),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    invitedAt: z.string().datetime({ offset: true }),
});

export const teamStudioSummarySchema = z.object({
    studioId: z.string().uuid(),
    studioName: z.string().min(1),
    slug: z.string().min(1),
    billingEmail: z.string().email().nullable(),
    role: z.enum(studioRoleValues),
    seatCount: z.number().int().nonnegative(),
    pendingInvitationCount: z.number().int().nonnegative(),
    canManageMembers: z.boolean(),
    canInviteMembers: z.boolean(),
});

export const teamRosterSchema = z.object({
    studio: teamStudioSummarySchema.nullable(),
    members: z.array(teamMemberSchema),
    invitations: z.array(teamInvitationSchema),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;
export type TeamStudioSummary = z.infer<typeof teamStudioSummarySchema>;
export type TeamRoster = z.infer<typeof teamRosterSchema>;
