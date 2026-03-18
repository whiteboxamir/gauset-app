import type { InviteStatus, StudioMembershipStatus, StudioRole } from "./common";

export interface TeamMember {
    membershipId: string;
    userId: string;
    studioId: string;
    email: string;
    displayName: string | null;
    role: StudioRole;
    status: StudioMembershipStatus;
    seatKind: "paid" | "observer" | "internal";
    joinedAt: string | null;
}

export interface TeamInvitation {
    invitationId: string;
    studioId: string;
    email: string;
    role: StudioRole;
    status: InviteStatus;
    expiresAt: string | null;
    invitedAt: string;
}

export interface TeamStudioSummary {
    studioId: string;
    studioName: string;
    slug: string;
    billingEmail: string | null;
    role: StudioRole;
    seatCount: number;
    pendingInvitationCount: number;
    canManageMembers: boolean;
    canInviteMembers: boolean;
}

export interface TeamRoster {
    studio: TeamStudioSummary | null;
    members: TeamMember[];
    invitations: TeamInvitation[];
}
