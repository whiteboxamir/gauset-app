import type { AuthSession } from "@/server/contracts/auth";
import type { ProjectReadinessCard } from "@/server/contracts/projects";
import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

import { getBillingOverviewForSession } from "@/server/billing/summary";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";
import { getReviewShareDashboardSummaryForSession } from "@/server/review-shares/service";
import { listSupportThreadsForSession } from "@/server/support/service";
import { getTeamRosterForSession } from "@/server/team/service";

import { getDashboardSnapshotForSession } from "./service";
import { getWorkspaceReleaseReadinessForSession, listProjectReadinessCardsForSession } from "./readiness";

interface StudioRow {
    id: string;
    billing_email: string | null;
}

interface StudioBrandingRow {
    studio_id: string;
    support_email: string | null;
}

interface AuditActivityRow {
    id: string;
    target_type: string;
    target_id: string;
    event_type: string;
    summary: string;
    created_at: string;
}

export type ActivationDomainStatus = "ready" | "attention" | "blocked";
export type ActivationActionStatus = "done" | "next" | "blocked";
export type ActivationFeedSource = "audit" | "project";

export interface ActivationDomain {
    id: "account" | "billing" | "team" | "worlds" | "review_shares" | "support";
    label: string;
    status: ActivationDomainStatus;
    summary: string;
    detail: string;
    href: string;
}

export interface ActivationAction {
    id: "create_studio" | "create_project" | "link_world" | "create_share" | "invite_teammate" | "confirm_billing" | "open_support";
    title: string;
    description: string;
    href: string;
    status: ActivationActionStatus;
}

export interface ActivationFeedEntry {
    id: string;
    source: ActivationFeedSource;
    contextLabel: string;
    eventType: string;
    summary: string;
    createdAt: string;
    href: string;
}

export interface DashboardResumeLink {
    projectId: string;
    projectName: string;
    sceneId: string;
    environmentLabel: string | null;
    openedAt: string | null;
}

export interface DesignPartnerDashboardSnapshot {
    hasActiveStudio: boolean;
    partnerLabel: string;
    planName: string | null;
    planCode: string | null;
    overallScore: number;
    readyCount: number;
    totalCount: number;
    domains: ActivationDomain[];
    actions: ActivationAction[];
    projectCount: number;
    activeProjectCount: number;
    worldLinkedCount: number;
    teamSeatCount: number;
    pendingInvitationCount: number;
    activeReviewShareCount: number;
    totalReviewShareCount: number;
    supportThreadCount: number;
    openSupportThreadCount: number;
    billingReady: boolean;
    billingStatus: string | null;
    supportEmail: string | null;
    billingEmail: string | null;
    activationFeed: ActivationFeedEntry[];
    releaseReadiness: ReleaseReadinessSnapshot;
    resumeLink: DashboardResumeLink | null;
    recentProjects: ProjectReadinessCard[];
    recentActivity: Awaited<ReturnType<typeof getDashboardSnapshotForSession>>["recentActivity"];
}

async function resolveStudioContacts(session: AuthSession) {
    if (!session.activeStudioId || !isPlatformDatabaseConfigured()) {
        return {
            billingEmail: null,
            supportEmail: null,
        };
    }

    const [studios, brandings] = await Promise.all([
        restSelect<StudioRow[]>("studios", {
            select: "id,billing_email",
            filters: {
                id: `eq.${session.activeStudioId}`,
                limit: "1",
            },
        }),
        restSelect<StudioBrandingRow[]>("studio_branding", {
            select: "studio_id,support_email",
            filters: {
                studio_id: `eq.${session.activeStudioId}`,
                limit: "1",
            },
        }),
    ]);

    return {
        billingEmail: studios[0]?.billing_email ?? null,
        supportEmail: brandings[0]?.support_email ?? null,
    };
}

function getAuditEventHref(event: AuditActivityRow) {
    if (event.event_type.startsWith("team.")) {
        return "/app/team";
    }
    if (event.event_type.startsWith("support.")) {
        return event.target_type === "support_thread" ? `/app/support/${event.target_id}` : "/app/support";
    }
    if (event.event_type.startsWith("billing.")) {
        return "/app/billing";
    }
    if (
        event.event_type.startsWith("account.") ||
        event.event_type.startsWith("studio.") ||
        event.event_type.startsWith("auth.invite")
    ) {
        return "/app/settings/profile";
    }

    return "/app/dashboard";
}

function getAuditContextLabel(event: AuditActivityRow) {
    if (event.event_type.startsWith("team.")) {
        return "Team";
    }
    if (event.event_type.startsWith("support.")) {
        return "Support";
    }
    if (event.event_type.startsWith("billing.")) {
        return "Billing";
    }
    if (event.event_type.startsWith("studio.")) {
        return "Workspace";
    }
    if (event.event_type.startsWith("auth.invite")) {
        return "Invite";
    }

    return "Account";
}

export async function getDesignPartnerDashboardForSession(session: AuthSession): Promise<DesignPartnerDashboardSnapshot> {
    const [dashboard, billingOverview, roster, supportThreads, reviewShareSummary, studioContacts, releaseReadiness, readinessProjects] = await Promise.all([
        getDashboardSnapshotForSession(session),
        getBillingOverviewForSession(session),
        getTeamRosterForSession(session),
        listSupportThreadsForSession(session),
        getReviewShareDashboardSummaryForSession(session),
        resolveStudioContacts(session),
        getWorkspaceReleaseReadinessForSession(session),
        listProjectReadinessCardsForSession(session),
    ]);

    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    const hasActiveStudio = Boolean(activeStudio);
    const partnerLabel = activeStudio?.studioName ?? session.user.displayName ?? session.user.email;
    const subscriptionStatus = billingOverview.summary.subscription?.status ?? null;
    const billingReady = Boolean(
        hasActiveStudio &&
            billingOverview.summary.subscription &&
            (subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "past_due"),
    );
    const teamReady = Boolean(hasActiveStudio && roster.studio && (roster.members.length > 1 || roster.invitations.length > 0));
    const worldsReady = Boolean(hasActiveStudio && dashboard.projectCount > 0 && dashboard.worldLinkedCount > 0);
    const shareReady = Boolean(hasActiveStudio && reviewShareSummary.activeCount > 0);
    const supportReady = Boolean(hasActiveStudio && (studioContacts.supportEmail || studioContacts.billingEmail || supportThreads.length > 0));
    const accountReady = Boolean(hasActiveStudio && session.user.onboardingState === "active" && session.entitlements.canAccessMvp);
    const auditRows =
        isPlatformDatabaseConfigured()
            ? await restSelect<AuditActivityRow[]>("audit_events", {
                  select: "id,target_type,target_id,event_type,summary,created_at",
                  filters: session.activeStudioId
                      ? {
                            studio_id: `eq.${session.activeStudioId}`,
                            order: "created_at.desc",
                            limit: "8",
                        }
                      : {
                            actor_user_id: `eq.${session.user.userId}`,
                            order: "created_at.desc",
                            limit: "8",
                        },
              })
            : [];
    const activationFeed: ActivationFeedEntry[] = [
        ...auditRows.map((event) => ({
            id: `audit:${event.id}`,
            source: "audit" as const,
            contextLabel: getAuditContextLabel(event),
            eventType: event.event_type,
            summary: event.summary,
            createdAt: event.created_at,
            href: getAuditEventHref(event),
        })),
        ...dashboard.recentActivity.map((event) => ({
            id: `project:${event.id}`,
            source: "project" as const,
            contextLabel:
                readinessProjects.find((project) => project.projectId === event.projectId)?.name ??
                "Project activity",
            eventType: event.eventType,
            summary: event.summary,
            createdAt: event.createdAt,
            href: `/app/worlds/${event.projectId}`,
        })),
    ]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 12);
    const projectCount = hasActiveStudio ? dashboard.projectCount : 0;
    const activeProjectCount = hasActiveStudio ? dashboard.activeProjectCount : 0;
    const worldLinkedCount = hasActiveStudio ? dashboard.worldLinkedCount : 0;
    const activeReviewShareCount = hasActiveStudio ? reviewShareSummary.activeCount : 0;
    const totalReviewShareCount = hasActiveStudio ? reviewShareSummary.totalCount : 0;
    const launchableProjects = readinessProjects.filter((project) => project.primarySceneId);
    const resumeProject =
        launchableProjects
            .filter((project) => project.lastWorldOpenedAt)
            .sort((left, right) => Date.parse(right.lastWorldOpenedAt ?? "") - Date.parse(left.lastWorldOpenedAt ?? ""))[0] ??
        launchableProjects[0] ??
        null;
    const resumeLink =
        resumeProject && resumeProject.primarySceneId
            ? {
                  projectId: resumeProject.projectId,
                  projectName: resumeProject.name,
                  sceneId: resumeProject.primarySceneId,
                  environmentLabel: resumeProject.primaryEnvironmentLabel,
                  openedAt: resumeProject.lastWorldOpenedAt,
              }
            : null;

    const domains: ActivationDomain[] = [
        {
            id: "account",
            label: "Account entitlement",
            status: accountReady ? "ready" : hasActiveStudio ? (session.entitlements.canAccessMvp ? "attention" : "blocked") : "blocked",
            summary: accountReady
                ? "Ready for partner activation"
                : hasActiveStudio
                  ? "Entitlements or onboarding still need attention"
                  : "Create or activate a workspace first",
            detail: hasActiveStudio
                ? session.entitlements.canAccessMvp
                    ? `User state is ${session.user.onboardingState}. MVP entitlement is provisioned.`
                    : "MVP access is not provisioned for the active workspace yet."
                : "Account activation becomes real only after a studio is created or an invite is finalized.",
            href: hasActiveStudio ? "/app/settings/profile" : "/app/dashboard#studio-bootstrap",
        },
        {
            id: "billing",
            label: "Billing readiness",
            status: billingReady ? (subscriptionStatus === "past_due" ? "attention" : "ready") : "blocked",
            summary: billingReady
                ? `${billingOverview.summary.plan?.name ?? "Provisioned plan"} is attached`
                : hasActiveStudio
                  ? "Provisioning or billing confirmation is still pending"
                  : "No active workspace is mounted for billing",
            detail: hasActiveStudio
                ? billingOverview.summary.subscription
                    ? `Subscription status: ${billingOverview.summary.subscription.status}. Portal ${billingOverview.portalReady ? "is" : "is not"} ready.`
                    : "No active billing subscription is recorded for the active studio."
                : "Billing activation starts once the first studio workspace exists.",
            href: hasActiveStudio ? "/app/billing" : "/app/dashboard#studio-bootstrap",
        },
        {
            id: "team",
            label: "Team readiness",
            status: teamReady ? "ready" : hasActiveStudio && roster.studio?.canInviteMembers ? "attention" : "blocked",
            summary: teamReady
                ? `${roster.members.length} seats active or in flight`
                : hasActiveStudio
                  ? "Activation still depends on teammate handoff coverage"
                  : "No workspace roster is attached to this account",
            detail: roster.studio
                ? `${roster.members.length} members active and ${roster.invitations.length} invitations pending.`
                : "Create or accept a studio workspace to unlock seats and invitations.",
            href: hasActiveStudio ? "/app/team" : "/app/dashboard#studio-bootstrap",
        },
        {
            id: "worlds",
            label: "World and project readiness",
            status: worldsReady ? "ready" : hasActiveStudio && dashboard.projectCount > 0 ? "attention" : "blocked",
            summary: worldsReady
                ? `${dashboard.worldLinkedCount} linked worlds across ${dashboard.projectCount} projects`
                : hasActiveStudio && dashboard.projectCount > 0
                  ? "Projects exist, but world linkage is still incomplete"
                  : hasActiveStudio
                    ? "No project ownership surface is live yet"
                    : "Workspace activation must land before studio-owned projects",
            detail: hasActiveStudio
                ? `${dashboard.activeProjectCount} active projects and ${dashboard.worldLinkedCount} linked worlds are currently tracked.`
                : "Create a workspace first, then use the existing project controls to establish ownership.",
            href: hasActiveStudio ? "/app/worlds" : "/app/dashboard#studio-bootstrap",
        },
        {
            id: "review_shares",
            label: "Review-share readiness",
            status: shareReady ? "ready" : worldsReady ? "attention" : "blocked",
            summary: shareReady
                ? `${reviewShareSummary.activeCount} live secure review links`
                : worldsReady
                  ? "Worlds are linked, but no live secure share is active"
                  : hasActiveStudio
                    ? "World linkage must land before review distribution"
                    : "Workspace activation and world linkage must land before review distribution",
            detail: hasActiveStudio
                ? `${reviewShareSummary.totalCount} persisted review shares tracked, ${reviewShareSummary.expiredCount} expired, ${reviewShareSummary.revokedCount} revoked.`
                : "Review share distribution stays blocked until a studio workspace is active.",
            href: hasActiveStudio && dashboard.recentProjects[0] ? `/app/worlds/${dashboard.recentProjects[0].projectId}` : "/app/dashboard#studio-bootstrap",
        },
        {
            id: "support",
            label: "Support and contact readiness",
            status: supportReady ? "ready" : hasActiveStudio ? "attention" : "blocked",
            summary: supportReady
                ? "Partner contact paths are live"
                : hasActiveStudio
                  ? "Support routing still needs an operating path"
                  : "Support stays blocked until a workspace exists",
            detail: hasActiveStudio
                ? `${supportThreads.length} support threads, billing contact ${studioContacts.billingEmail ? "set" : "missing"}, support contact ${studioContacts.supportEmail ? "set" : "missing"}.`
                : "Workspace creation unlocks studio-scoped support threads, project context, and routing.",
            href: hasActiveStudio ? "/app/support" : "/app/dashboard#studio-bootstrap",
        },
    ];

    const actions: ActivationAction[] = hasActiveStudio
        ? [
              {
                  id: "create_studio",
                  title: "Workspace active",
                  description: `${activeStudio?.studioName ?? "Studio"} is mounted as the current workspace.`,
                  href: "/app/settings/profile",
                  status: "done",
              },
              {
                  id: "create_project",
                  title: "Create first project",
                  description: dashboard.projectCount > 0 ? "Project ownership is already established." : "Stand up the first platform-owned project surface.",
                  href: "/app/worlds",
                  status: dashboard.projectCount > 0 ? "done" : "next",
              },
              {
                  id: "link_world",
                  title: "Link a world",
                  description: dashboard.worldLinkedCount > 0 ? "A scene is already linked to a project." : "Attach a real scene_id to a managed project.",
                  href: dashboard.recentProjects[0] ? `/app/worlds/${dashboard.recentProjects[0].projectId}` : "/app/worlds",
                  status: dashboard.worldLinkedCount > 0 ? "done" : dashboard.projectCount > 0 ? "next" : "blocked",
              },
              {
                  id: "create_share",
                  title: "Create a secure review share",
                  description: reviewShareSummary.activeCount > 0 ? "At least one persisted external review link is live." : "Publish the first revocable review link from a project world.",
                  href: dashboard.recentProjects[0] ? `/app/worlds/${dashboard.recentProjects[0].projectId}` : "/app/worlds",
                  status: reviewShareSummary.activeCount > 0 ? "done" : worldsReady ? "next" : "blocked",
              },
              {
                  id: "invite_teammate",
                  title: "Invite a teammate",
                  description:
                      roster.members.length > 1 || roster.invitations.length > 0
                          ? "Partner handoff coverage exists in the team surface."
                          : "Invite a second operator into the studio workspace.",
                  href: "/app/team",
                  status:
                      roster.members.length > 1 || roster.invitations.length > 0
                          ? "done"
                          : roster.studio?.canInviteMembers
                            ? "next"
                            : "blocked",
              },
              {
                  id: "confirm_billing",
                  title: "Confirm billing/provisioning",
                  description: billingReady
                      ? `${billingOverview.summary.plan?.name ?? "Provisioned plan"} is active for the studio.`
                      : "Review the active plan, portal state, and provisioning posture.",
                  href: "/app/billing",
                  status: billingReady ? "done" : "next",
              },
              {
                  id: "open_support",
                  title: "Open support",
                  description:
                      supportThreads.length > 0
                          ? "A support thread already exists with studio context."
                          : "Open a partner support thread before the next external review cycle.",
                  href: "/app/support",
                  status: supportThreads.length > 0 ? "done" : "next",
              },
          ]
        : [
              {
                  id: "create_studio",
                  title: "Create the first workspace",
                  description: "Provision the first studio, owner seat, branding shell, and active workspace selection from this dashboard.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "next",
              },
              {
                  id: "create_project",
                  title: "Create first project",
                  description: "Project ownership stays blocked until a studio workspace is active.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
              {
                  id: "link_world",
                  title: "Link a world",
                  description: "World linkage opens after workspace activation and project creation.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
              {
                  id: "create_share",
                  title: "Create a secure review share",
                  description: "Review distribution depends on the workspace, project, and world layers landing first.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
              {
                  id: "invite_teammate",
                  title: "Invite a teammate",
                  description: "Seats and invitations appear once the first workspace is active.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
              {
                  id: "confirm_billing",
                  title: "Confirm billing/provisioning",
                  description: "Billing can be confirmed only after a studio workspace exists.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
              {
                  id: "open_support",
                  title: "Open support",
                  description: "Support threads stay studio-scoped in the platform lane.",
                  href: "/app/dashboard#studio-bootstrap",
                  status: "blocked",
              },
          ];

    const readyCount = domains.filter((domain) => domain.status === "ready").length;

    return {
        hasActiveStudio,
        partnerLabel,
        planName: billingOverview.summary.plan?.name ?? null,
        planCode: billingOverview.summary.plan?.code ?? activeStudio?.planCode ?? null,
        overallScore: Math.round((readyCount / domains.length) * 100),
        readyCount,
        totalCount: domains.length,
        domains,
        actions,
        projectCount,
        activeProjectCount,
        worldLinkedCount,
        teamSeatCount: roster.members.length,
        pendingInvitationCount: roster.invitations.length,
        activeReviewShareCount,
        totalReviewShareCount,
        supportThreadCount: supportThreads.length,
        openSupportThreadCount: supportThreads.filter((thread) => thread.status === "open" || thread.status === "pending").length,
        billingReady,
        billingStatus: subscriptionStatus,
        supportEmail: studioContacts.supportEmail,
        billingEmail: studioContacts.billingEmail,
        activationFeed,
        releaseReadiness,
        resumeLink,
        recentProjects: readinessProjects.slice(0, 6),
        recentActivity: dashboard.recentActivity,
    };
}
