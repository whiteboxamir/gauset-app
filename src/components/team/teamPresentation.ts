import type { TeamInvitation, TeamMember } from "@/server/contracts/team";

export type TeamBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export const teamRoleCopy: Record<TeamMember["role"], { label: string; description: string }> = {
    owner: {
        label: "Owner",
        description: "Primary workspace owner. Ownership transfer is intentionally blocked from this surface.",
    },
    admin: {
        label: "Admin",
        description: "Use for a second operator who needs team, governance, and workspace controls.",
    },
    finance: {
        label: "Finance",
        description: "Use when billing ownership, invoice follow-up, or renewal posture needs a named operator.",
    },
    member: {
        label: "Member",
        description: "Default collaborator seat for day-to-day project, support, and workspace participation.",
    },
};

export function getInvitationFreshness({
    invitation,
    staleInviteHours,
    now = Date.now(),
}: {
    invitation: TeamInvitation;
    staleInviteHours: number;
    now?: number;
}) {
    if (invitation.status !== "pending") {
        return null;
    }

    const expiresAt = invitation.expiresAt ? Date.parse(invitation.expiresAt) : Number.NaN;
    if (!Number.isNaN(expiresAt)) {
        if (expiresAt <= now) {
            return {
                label: "Expired locally",
                tone: "danger" as TeamBadgeTone,
                detail: "This invite has passed its recorded expiry window and should be refreshed or revoked.",
            };
        }

        const hoursUntilExpiry = (expiresAt - now) / (60 * 60 * 1000);
        if (hoursUntilExpiry <= 24) {
            return {
                label: "Expires soon",
                tone: "warning" as TeamBadgeTone,
                detail: "The invite is within its last 24 hours and may need a resend to avoid drift.",
            };
        }
    }

    const invitedAt = Date.parse(invitation.invitedAt);
    if (!Number.isNaN(invitedAt)) {
        const ageHours = (now - invitedAt) / (60 * 60 * 1000);
        if (ageHours >= staleInviteHours) {
            return {
                label: "Stale",
                tone: "warning" as TeamBadgeTone,
                detail: `This invite has been pending longer than the ${staleInviteHours}-hour workspace threshold.`,
            };
        }
    }

    return null;
}
