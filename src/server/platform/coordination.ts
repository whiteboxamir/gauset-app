import type { BillingOverview } from "@/server/contracts/billing";
import type {
    CoordinationMutation,
    CoordinationOperator,
    CoordinationSnapshot,
    CoordinationUserReference,
    CoordinatedOperationalItem,
    CoordinationViewer,
    CoordinationWorkload,
} from "@/server/contracts/coordination";
import type { AuthSession } from "@/server/contracts/auth";
import type { OperationsDomain, OperationsSnapshot, OperationsStatus, ProjectOperationalRisk } from "@/server/contracts/operations";
import type { GovernancePolicy } from "@/server/contracts/governance";
import type { TeamRoster } from "@/server/contracts/team";
import type { SupportThreadSummary } from "@/server/contracts/support";

import { getBillingOverviewForSession } from "@/server/billing/summary";
import { getTeamRosterForSession } from "@/server/team/service";
import { getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect, restUpsert } from "@/server/db/rest";
import { formatAgeLabel, formatFreshnessLabel, hoursSince } from "@/server/platform/attention";
import { defaultGovernancePolicy, getEffectiveGovernancePolicyForStudio } from "@/server/platform/governance-policy";
import { getProjectOperationsForSession } from "@/server/projects/operations";
import { listSupportThreadsForSession } from "@/server/support/service";
import { logPlatformAuditEvent } from "@/server/platform/audit";

import { coordinationItemKeys } from "./coordination-keys";
import { createEmptyCoverageSnapshot, deriveCoverageSnapshot, resolveCoverageOverlayRows } from "./coverage";

interface CoordinationRow {
    studio_id: string;
    item_key: string;
    assignee_user_id: string | null;
    status: "open" | "in_progress" | "snoozed" | "resolved";
    snoozed_until: string | null;
    resolution_note: string | null;
    resolved_at: string | null;
    resolved_by_user_id: string | null;
    created_at: string;
    updated_at: string;
}

interface ProfileLabelRow {
    id: string;
    email: string;
    display_name: string | null;
}

type WorkspaceState = Awaited<ReturnType<typeof getStudioWorkspaceStateForSession>>;

type LiveOperationalItem = {
    itemKey: string;
    severity: CoordinatedOperationalItem["severity"];
    domain: OperationsDomain;
    title: string;
    summary: string;
    remediation: string;
    href: string;
    createdAt: string | null;
    ageLabel: string;
    freshnessLabel: string;
    entityType: CoordinatedOperationalItem["entityType"];
    entityId: string | null;
    entityLabel: string | null;
    sortAt: number;
};

type ActiveOperatorIdentity = Pick<CoordinationOperator, "userId" | "label" | "email" | "role" | "active" | "isCurrentUser">;

const DOMAINS: Array<{ domain: OperationsDomain; label: string }> = [
    { domain: "workspace", label: "Workspace" },
    { domain: "billing", label: "Billing" },
    { domain: "team", label: "Team" },
    { domain: "support", label: "Support" },
    { domain: "projects", label: "Projects" },
];

const RECENTLY_RESOLVED_WINDOW_HOURS = 24 * 5;

function getViewer(session: AuthSession): CoordinationViewer {
    const role = session.studios.find((studio) => studio.studioId === session.activeStudioId)?.role ?? null;
    return {
        userId: session.user.userId,
        role,
        canManageAssignments: Boolean(role && ["owner", "admin"].includes(role)),
    };
}

function getStatusRank(status: OperationsStatus) {
    return {
        urgent: 0,
        watch: 1,
        stable: 2,
    }[status];
}

function getCoordinationStatusRank(status: CoordinatedOperationalItem["status"]) {
    return {
        open: 0,
        in_progress: 1,
        snoozed: 2,
        resolved: 3,
    }[status];
}

function toSortAt(value: string | null | undefined) {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function createLiveItem({
    itemKey,
    severity,
    domain,
    title,
    summary,
    remediation,
    href,
    createdAt,
    freshnessAt,
    now,
    entityType = null,
    entityId = null,
    entityLabel = null,
}: {
    itemKey: string;
    severity: LiveOperationalItem["severity"];
    domain: OperationsDomain;
    title: string;
    summary: string;
    remediation: string;
    href: string;
    createdAt: string | null;
    freshnessAt?: string | null;
    now: number;
    entityType?: LiveOperationalItem["entityType"];
    entityId?: string | null;
    entityLabel?: string | null;
}): LiveOperationalItem {
    return {
        itemKey,
        severity,
        domain,
        title,
        summary,
        remediation,
        href,
        createdAt,
        ageLabel: formatAgeLabel(createdAt, now),
        freshnessLabel: formatFreshnessLabel(freshnessAt ?? createdAt, now),
        entityType,
        entityId,
        entityLabel,
        sortAt: toSortAt(freshnessAt ?? createdAt),
    };
}

function createEmptyOperationsSnapshot(): OperationsSnapshot {
    return {
        overallStatus: "stable",
        urgentCount: 0,
        watchCount: 0,
        resolvedCount: 0,
        domains: DOMAINS.map(({ domain, label }) => ({
            domain,
            label,
            status: "stable",
            openCount: 0,
        })),
        actionCenter: {
            urgent: [],
            watch: [],
            resolved: [],
        },
        projectRisks: [],
    };
}

function createEmptyCoordinationSnapshot(session: AuthSession): CoordinationSnapshot {
    const coverage = createEmptyCoverageSnapshot({
        workspaceId: session.activeStudioId,
    });

    return {
        generatedAt: new Date().toISOString(),
        workspaceId: session.activeStudioId,
        viewer: getViewer(session),
        operators: [],
        workload: {
            attentionState: "stable",
            coverageHealth: coverage.health,
            activeItemCount: 0,
            unownedItemCount: 0,
            unownedUrgentItemCount: 0,
            unavailableOwnerItemCount: 0,
            snoozedItemCount: 0,
            inProgressItemCount: 0,
            recentlyResolvedCount: 0,
            overloadedOperatorCount: 0,
            staleInProgressCount: 0,
            undercoveredLaneCount: 0,
            maxSnoozeHours: defaultGovernancePolicy.maxSnoozeHours,
        },
        operations: createEmptyOperationsSnapshot(),
        coverage,
        actionCenter: {
            urgent: [],
            watch: [],
            resolved: [],
        },
    };
}

async function resolveProfileLabels(userIds: Array<string | null | undefined>) {
    const ids = Array.from(new Set(userIds.filter((value): value is string => Boolean(value))));
    if (ids.length === 0) {
        return new Map<string, string>();
    }

    const rows = await restSelect<ProfileLabelRow[]>("profiles", {
        select: "id,email,display_name",
        filters: {
            id: `in.(${ids.join(",")})`,
        },
    });

    return new Map(rows.map((row) => [row.id, row.display_name ?? row.email]));
}

function resolveUserReference({
    userId,
    operatorMap,
    profileLabels,
}: {
    userId: string | null;
    operatorMap: Map<string, ActiveOperatorIdentity>;
    profileLabels: Map<string, string>;
}): CoordinationUserReference | null {
    if (!userId) {
        return null;
    }

    const operator = operatorMap.get(userId);
    if (operator) {
        return {
            userId: operator.userId,
            label: operator.label,
            role: operator.role,
            active: true,
        };
    }

    const label = profileLabels.get(userId);
    if (!label) {
        return null;
    }

    return {
        userId,
        label,
        role: null,
        active: false,
    };
}

function getEffectiveItemStatus(row: CoordinationRow | null, now: number): CoordinatedOperationalItem["status"] {
    if (!row) {
        return "open";
    }

    if (row.status !== "snoozed") {
        return row.status;
    }

    const snoozedUntil = row.snoozed_until ? Date.parse(row.snoozed_until) : Number.NaN;
    if (Number.isNaN(snoozedUntil) || snoozedUntil <= now) {
        return "open";
    }

    return "snoozed";
}

function deriveLiveOperationalItems({
    workspaceState,
    billingOverview,
    roster,
    supportThreads,
    projectRisks,
    policy,
    now,
}: {
    workspaceState: WorkspaceState;
    billingOverview: BillingOverview;
    roster: TeamRoster;
    supportThreads: SupportThreadSummary[];
    projectRisks: ProjectOperationalRisk[];
    policy: GovernancePolicy;
    now: number;
}) {
    const items: LiveOperationalItem[] = [];
    const activeStudio = workspaceState.activeStudio;
    const subscription = billingOverview.summary.subscription;
    const latestInvoice = billingOverview.summary.latestInvoice;
    const activeMembers = roster.members.filter((member) => member.status === "active");
    const staleInvites = roster.invitations.filter((invitation) => {
        const ageHours = hoursSince(invitation.invitedAt, now);
        return ageHours !== null && ageHours >= policy.staleInviteHours && invitation.status === "pending";
    });

    if (activeStudio && !activeStudio.billingEmail) {
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.workspaceBillingContact(),
                severity: "watch",
                domain: "workspace",
                title: "Billing contact missing",
                summary: "The active workspace has no billing contact email, so invoice and provisioning follow-up has no clear owner.",
                remediation: "Set the studio billing email from profile settings.",
                href: "/app/settings/profile",
                createdAt: null,
                now,
                entityType: "workspace",
                entityId: activeStudio.studioId,
                entityLabel: activeStudio.name,
            }),
        );
    }

    if (activeStudio && !activeStudio.supportEmail) {
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.workspaceSupportContact(),
                severity: "watch",
                domain: "workspace",
                title: "Support routing email missing",
                summary: "Support contact data is incomplete for the active workspace.",
                remediation: "Add the studio support email from profile settings.",
                href: "/app/settings/profile",
                createdAt: null,
                now,
                entityType: "workspace",
                entityId: activeStudio.studioId,
                entityLabel: activeStudio.name,
            }),
        );
    }

    if (!subscription) {
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.billingNoSubscription(),
                severity: "watch",
                domain: "billing",
                title: "No active subscription recorded",
                summary: "The workspace has no current billing subscription, so plan posture and invoice follow-up stay manual.",
                remediation: "Review billing controls and attach or provision a plan.",
                href: "/app/billing",
                createdAt: null,
                now,
                entityType: "workspace",
                entityId: activeStudio?.studioId ?? null,
                entityLabel: activeStudio?.name ?? null,
            }),
        );
    } else if (["past_due", "unpaid", "incomplete"].includes(subscription.status)) {
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.billingSubscription(subscription.id),
                severity: "urgent",
                domain: "billing",
                title: "Billing requires intervention",
                summary: `Subscription status is ${subscription.status}. Platform access and seat posture may drift until billing is resolved.`,
                remediation: "Open billing and resolve the subscription state or portal issue immediately.",
                href: "/app/billing",
                createdAt: subscription.currentPeriodEndsAt ?? subscription.trialEndsAt ?? null,
                freshnessAt: subscription.currentPeriodEndsAt ?? subscription.trialEndsAt ?? null,
                now,
                entityType: "subscription",
                entityId: subscription.id,
                entityLabel: subscription.plan.name,
            }),
        );
    }

    if (latestInvoice && latestInvoice.status === "open") {
        const dueHours = latestInvoice.dueAt ? hoursSince(latestInvoice.dueAt, now) : null;
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.billingInvoice(latestInvoice.id),
                severity: dueHours !== null && dueHours > 0 ? "urgent" : "watch",
                domain: "billing",
                title: dueHours !== null && dueHours > 0 ? "Invoice is past due" : "Invoice is still open",
                summary: `Latest invoice ${latestInvoice.number ?? latestInvoice.id.slice(0, 8)} remains ${latestInvoice.status}.`,
                remediation: "Open billing to reconcile the invoice or route payment through the portal.",
                href: "/app/billing",
                createdAt: latestInvoice.dueAt ?? latestInvoice.issuedAt,
                freshnessAt: latestInvoice.dueAt ?? latestInvoice.issuedAt,
                now,
                entityType: "invoice",
                entityId: latestInvoice.id,
                entityLabel: latestInvoice.number ?? latestInvoice.id.slice(0, 8),
            }),
        );
    }

    if (activeMembers.length <= 1) {
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.teamOperatorCoverage(),
                severity: "watch",
                domain: "team",
                title: "Only one active operator is mounted",
                summary: "The workspace depends on a single active operator, which creates handoff and continuity risk.",
                remediation: "Invite a second operator or promote an existing teammate into the workspace.",
                href: "/app/team",
                createdAt: activeMembers[0]?.joinedAt ?? null,
                freshnessAt: activeMembers[0]?.joinedAt ?? null,
                now,
                entityType: "workspace",
                entityId: activeStudio?.studioId ?? null,
                entityLabel: activeStudio?.name ?? null,
            }),
        );
    }

    if (staleInvites.length > 0) {
        const oldestInvite = staleInvites
            .slice()
            .sort((left, right) => Date.parse(left.invitedAt) - Date.parse(right.invitedAt))[0];
        items.push(
            createLiveItem({
                itemKey: coordinationItemKeys.teamStaleInvites(),
                severity: "watch",
                domain: "team",
                title: "Pending invites have gone stale",
                summary:
                    staleInvites.length === 1
                        ? `${oldestInvite?.email ?? "One invite"} has been waiting longer than the team freshness threshold.`
                        : `${staleInvites.length} pending invitations have been waiting longer than the team freshness threshold.`,
                remediation: "Resend or revoke old invites so the seat plan reflects current intent.",
                href: "/app/team",
                createdAt: oldestInvite?.invitedAt ?? null,
                freshnessAt: oldestInvite?.invitedAt ?? null,
                now,
            }),
        );
    }

    supportThreads
        .filter((thread) => thread.status === "open" || thread.status === "pending")
        .forEach((thread) => {
            const activityAt = thread.latestMessageAt ?? thread.createdAt;
            const ageHours = hoursSince(activityAt, now);
            const isStale = ageHours !== null && ageHours >= policy.staleSupportHours;
            const isUrgent = thread.priority === "urgent";
            if (!isUrgent && !isStale) {
                return;
            }

            items.push(
                createLiveItem({
                    itemKey: coordinationItemKeys.supportThread(thread.threadId),
                    severity: isUrgent ? "urgent" : "watch",
                    domain: "support",
                    title: isUrgent ? "Urgent support thread is still open" : "Support thread is aging without a response",
                    summary: isUrgent
                        ? `Thread "${thread.subject}" still needs operator coverage${isStale ? " and is beyond the support freshness threshold." : "."}`
                        : `Thread "${thread.subject}" has been idle beyond the support freshness threshold.`,
                    remediation: "Open support and reply, re-prioritize, or resolve the thread from the support surface.",
                    href: `/app/support/${thread.threadId}`,
                    createdAt: activityAt,
                    freshnessAt: activityAt,
                    now,
                    entityType: "support_thread",
                    entityId: thread.threadId,
                    entityLabel: thread.subject,
                }),
            );
        });

    projectRisks
        .filter((project) => project.riskLevel !== "stable")
        .forEach((project) => {
            const hasReviewRisk = project.activeReviewShareCount > 0;
            const hasWorldLinkGap = !project.hasWorldLink;
            const hasStaleActivity = project.reasons.some((reason) => reason.startsWith("No recent activity"));

            let title = `${project.name} needs project attention`;
            let remediation = "Open the project surface and resolve the next operational blocker.";
            if (hasReviewRisk && project.riskLevel === "urgent") {
                title = "Live review access is attached to a risky project";
                remediation = "Review the project risk item and revoke or update live review access where needed.";
            } else if (hasWorldLinkGap) {
                title = "Project still has no linked world";
                remediation = "Open the project surface and link the missing world so ownership is complete.";
            } else if (hasStaleActivity) {
                title = "Project has gone stale";
                remediation = "Review the project surface, close dead work, or resume ownership on the active item.";
            }

            items.push(
                createLiveItem({
                    itemKey: coordinationItemKeys.projectRisk(project.projectId),
                    severity: project.riskLevel === "urgent" ? "urgent" : "watch",
                    domain: "projects",
                    title,
                    summary: `${project.name} · ${project.reasons.join(" · ")}`,
                    remediation,
                    href: project.href,
                    createdAt: project.lastActivityAt,
                    freshnessAt: project.lastActivityAt,
                    now,
                    entityType: "project",
                    entityId: project.projectId,
                    entityLabel: project.name,
                }),
            );
        });

    return items;
}

function buildResolvedFallbackItem({
    row,
    workspaceState,
    billingOverview,
    roster,
    supportThreads,
    projectRisks,
    now,
}: {
    row: CoordinationRow;
    workspaceState: WorkspaceState;
    billingOverview: BillingOverview;
    roster: TeamRoster;
    supportThreads: SupportThreadSummary[];
    projectRisks: ProjectOperationalRisk[];
    now: number;
}) {
    const resolvedAt = row.resolved_at ?? row.updated_at;
    const activeStudio = workspaceState.activeStudio;

    const createResolvedItem = ({
        domain,
        title,
        summary,
        remediation,
        href,
        createdAt,
        entityType = null,
        entityId = null,
        entityLabel = null,
    }: {
        domain: OperationsDomain;
        title: string;
        summary: string;
        remediation: string;
        href: string;
        createdAt: string | null;
        entityType?: LiveOperationalItem["entityType"];
        entityId?: string | null;
        entityLabel?: string | null;
    }): LiveOperationalItem => ({
        itemKey: row.item_key,
        severity: "resolved",
        domain,
        title,
        summary,
        remediation,
        href,
        createdAt,
        ageLabel: formatAgeLabel(createdAt, now),
        freshnessLabel: formatFreshnessLabel(resolvedAt, now, "Resolved"),
        entityType,
        entityId,
        entityLabel,
        sortAt: toSortAt(resolvedAt),
    });

    if (row.item_key === coordinationItemKeys.workspaceBillingContact()) {
        return createResolvedItem({
            domain: "workspace",
            title: "Billing contact is mounted",
            summary: "Workspace billing ownership is now explicit in profile settings.",
            remediation: "Keep studio billing contact data current from profile settings.",
            href: "/app/settings/profile",
            createdAt: row.created_at,
            entityType: "workspace",
            entityId: activeStudio?.studioId ?? null,
            entityLabel: activeStudio?.name ?? null,
        });
    }

    if (row.item_key === coordinationItemKeys.workspaceSupportContact()) {
        return createResolvedItem({
            domain: "workspace",
            title: "Support routing is configured",
            summary: "Support contact data is now present for the active workspace.",
            remediation: "Keep studio support routing current from profile settings.",
            href: "/app/settings/profile",
            createdAt: row.created_at,
            entityType: "workspace",
            entityId: activeStudio?.studioId ?? null,
            entityLabel: activeStudio?.name ?? null,
        });
    }

    if (row.item_key === coordinationItemKeys.billingNoSubscription()) {
        return createResolvedItem({
            domain: "billing",
            title: "Billing subscription is mounted",
            summary: "The workspace now has an active subscription on record.",
            remediation: "Keep the billing control center current as plan posture changes.",
            href: "/app/billing",
            createdAt: row.created_at,
            entityType: "workspace",
            entityId: activeStudio?.studioId ?? null,
            entityLabel: activeStudio?.name ?? null,
        });
    }

    if (row.item_key.startsWith("billing:subscription:")) {
        const subscription = billingOverview.summary.subscription;
        return createResolvedItem({
            domain: "billing",
            title: "Billing intervention closed",
            summary: subscription ? `${subscription.plan.name} is no longer in an intervention state.` : "Subscription posture no longer needs intervention.",
            remediation: "Keep the billing control center current as subscription state changes.",
            href: "/app/billing",
            createdAt: subscription?.currentPeriodEndsAt ?? subscription?.trialEndsAt ?? row.created_at,
            entityType: "subscription",
            entityId: subscription?.id ?? row.item_key.split(":")[2] ?? null,
            entityLabel: subscription?.plan.name ?? null,
        });
    }

    if (row.item_key.startsWith("billing:invoice:")) {
        const invoiceId = row.item_key.split(":")[2] ?? null;
        const invoice = [billingOverview.summary.latestInvoice, ...billingOverview.summary.recentInvoices]
            .filter(Boolean)
            .find((entry) => entry?.id === invoiceId);
        return createResolvedItem({
            domain: "billing",
            title: "Invoice follow-up closed",
            summary: invoice ? `Invoice ${invoice.number ?? invoice.id.slice(0, 8)} no longer needs billing follow-up.` : "Invoice follow-up no longer needs billing attention.",
            remediation: "Keep the billing ledger and invoice posture current from the billing surface.",
            href: "/app/billing",
            createdAt: invoice?.dueAt ?? invoice?.issuedAt ?? row.created_at,
            entityType: "invoice",
            entityId: invoice?.id ?? invoiceId,
            entityLabel: invoice?.number ?? null,
        });
    }

    if (row.item_key === coordinationItemKeys.teamOperatorCoverage()) {
        return createResolvedItem({
            domain: "team",
            title: "Operator coverage improved",
            summary: "The workspace now has broader operator coverage across the team surface.",
            remediation: "Keep seat ownership and elevated access current from team settings.",
            href: "/app/team",
            createdAt: roster.members.find((member) => member.status === "active")?.joinedAt ?? row.created_at,
        });
    }

    if (row.item_key === coordinationItemKeys.teamStaleInvites()) {
        return createResolvedItem({
            domain: "team",
            title: "Stale invitations were cleared",
            summary: "Pending invitation drift is no longer above the team freshness threshold.",
            remediation: "Keep invitation posture current from the team surface.",
            href: "/app/team",
            createdAt: roster.invitations[0]?.invitedAt ?? row.created_at,
        });
    }

    if (row.item_key.startsWith("support:thread:")) {
        const threadId = row.item_key.split(":")[2] ?? null;
        const thread = supportThreads.find((entry) => entry.threadId === threadId);
        return createResolvedItem({
            domain: "support",
            title: "Support thread loop was closed",
            summary: thread ? `Thread "${thread.subject}" no longer needs attention in the support surface.` : "A support thread no longer needs operator coverage.",
            remediation: "Open the support surface if the thread needs follow-up later.",
            href: thread ? `/app/support/${thread.threadId}` : "/app/support",
            createdAt: thread?.latestMessageAt ?? thread?.createdAt ?? row.created_at,
            entityType: "support_thread",
            entityId: thread?.threadId ?? threadId,
            entityLabel: thread?.subject ?? null,
        });
    }

    if (row.item_key.startsWith("projects:project:")) {
        const projectId = row.item_key.split(":")[2] ?? null;
        const project = projectRisks.find((entry) => entry.projectId === projectId);
        return createResolvedItem({
            domain: "projects",
            title: "Project risk was closed",
            summary: project ? `${project.name} no longer needs active project-risk coordination.` : "A project risk no longer needs active coordination.",
            remediation: "Open the project route if the operating posture changes again.",
            href: project?.href ?? (projectId ? `/app/worlds/${projectId}` : "/app/worlds"),
            createdAt: project?.lastActivityAt ?? row.created_at,
            entityType: "project",
            entityId: project?.projectId ?? projectId,
            entityLabel: project?.name ?? null,
        });
    }

    return createResolvedItem({
        domain: "workspace",
        title: "Operational loop was closed",
        summary: "A coordination item was resolved and is still inside the recent-resolution window.",
        remediation: "Open the dashboard action center if this operating issue needs to be reopened.",
        href: "/app/dashboard#action-center",
        createdAt: row.created_at,
    });
}

function summarizeDomains(items: CoordinatedOperationalItem[]) {
    return DOMAINS.map(({ domain, label }) => {
        const domainItems = items.filter((item) => item.domain === domain);
        const status: OperationsStatus = domainItems.some((item) => item.severity === "urgent")
            ? "urgent"
            : domainItems.length > 0
              ? "watch"
              : "stable";

        return {
            domain,
            label,
            status,
            openCount: domainItems.length,
        };
    });
}

function stripOperationalItems(items: CoordinatedOperationalItem[]) {
    return items.map(({ itemKey, entityType, entityId, entityLabel, status, isLive, assignee, snoozedUntil, resolutionNote, resolvedAt, resolvedBy, coordinationCreatedAt, coordinationUpdatedAt, ...item }) => ({
        id: itemKey,
        ...item,
    }));
}

function toCoverageItemInput(item: CoordinatedOperationalItem) {
    const severity: "urgent" | "watch" = item.severity === "urgent" ? "urgent" : "watch";

    return {
        itemKey: item.itemKey,
        title: item.title,
        href: item.href,
        domain: item.domain,
        severity,
        status: item.status === "open" || item.status === "in_progress" || item.status === "snoozed" ? item.status : "open",
        assignee: item.assignee
            ? {
                  userId: item.assignee.userId,
                  label: item.assignee.label,
                  role: item.assignee.role,
                  active: item.assignee.active,
              }
            : null,
        coordinationUpdatedAt: item.coordinationUpdatedAt,
        createdAt: item.createdAt,
    };
}

function toCoverageResolvedItemInput(item: CoordinatedOperationalItem) {
    return {
        itemKey: item.itemKey,
        assignee: item.assignee
            ? {
                  userId: item.assignee.userId,
                  label: item.assignee.label,
                  role: item.assignee.role,
                  active: item.assignee.active,
              }
            : null,
    };
}

function buildWorkload({
    items,
    coverage,
    policy,
}: {
    items: CoordinatedOperationalItem[];
    coverage: CoordinationSnapshot["coverage"];
    policy: GovernancePolicy;
}) {
    let unownedItemCount = 0;
    let snoozedItemCount = 0;
    let inProgressItemCount = 0;

    items.forEach((item) => {
        const ownedByActiveOperator = Boolean(item.assignee?.active);
        if (!ownedByActiveOperator) {
            unownedItemCount += 1;
        }
        if (item.status === "snoozed") {
            snoozedItemCount += 1;
        }
        if (item.status === "in_progress") {
            inProgressItemCount += 1;
        }
    });

    const attentionState: CoordinationWorkload["attentionState"] =
        items.length === 0 ? "stable" : unownedItemCount > 0 ? "unowned" : coverage.summary.overloadedOperatorCount > 0 ? "overloaded" : "stable";

    return {
        operators: coverage.operators,
        workload: {
            attentionState,
            coverageHealth: coverage.health,
            activeItemCount: items.length,
            unownedItemCount,
            unownedUrgentItemCount: coverage.summary.unownedUrgentItemCount,
            unavailableOwnerItemCount: coverage.summary.unavailableOwnerItemCount,
            snoozedItemCount,
            inProgressItemCount,
            recentlyResolvedCount: 0,
            overloadedOperatorCount: coverage.summary.overloadedOperatorCount,
            staleInProgressCount: coverage.summary.staleInProgressCount,
            undercoveredLaneCount: coverage.summary.undercoveredLaneCount,
            maxSnoozeHours: policy.maxSnoozeHours,
        },
    };
}

function viewerCanOperateItem({
    viewer,
    item,
}: {
    viewer: CoordinationViewer;
    item: CoordinatedOperationalItem;
}) {
    return viewer.canManageAssignments || !item.assignee || !item.assignee.active || item.assignee.userId === viewer.userId;
}

function requireActiveStudioContext(session: AuthSession) {
    const viewer = getViewer(session);
    if (!session.activeStudioId || !viewer.role) {
        throw new Error("An active workspace is required.");
    }

    return {
        studioId: session.activeStudioId,
        viewer,
    };
}

async function resolveCoordinationItemForMutation(session: AuthSession, itemKey: string) {
    const snapshot = await getCoordinationSnapshotForSession(session);
    const item = [...snapshot.actionCenter.urgent, ...snapshot.actionCenter.watch, ...snapshot.actionCenter.resolved].find((entry) => entry.itemKey === itemKey) ?? null;

    if (!item) {
        throw new Error("Coordination item not found.");
    }

    return {
        snapshot,
        item,
    };
}

async function upsertCoordinationRow({
    studioId,
    itemKey,
    payload,
}: {
    studioId: string;
    itemKey: string;
    payload: Record<string, unknown>;
}) {
    const rows = await restUpsert<CoordinationRow[]>(
        "studio_coordination_items",
        {
            studio_id: studioId,
            item_key: itemKey,
            ...payload,
        },
        {
            onConflict: "studio_id,item_key",
        },
    );

    return rows[0] ?? null;
}

async function logCoordinationAudit({
    session,
    item,
    eventType,
    summary,
    metadata,
}: {
    session: AuthSession;
    item: CoordinatedOperationalItem;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "studio_coordination_item",
        targetId: item.itemKey,
        eventType,
        summary,
        metadata: {
            domain: item.domain,
            title: item.title,
            href: item.href,
            entityType: item.entityType,
            entityId: item.entityId,
            entityLabel: item.entityLabel,
            ...metadata,
        },
    });
}

export async function getCoordinationSnapshotForSession(session: AuthSession): Promise<CoordinationSnapshot> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return createEmptyCoordinationSnapshot(session);
    }

    const now = Date.now();
    const [policy, workspaceState, billingOverview, roster, supportThreads, projectRisks, coordinationRows, coverageRows] = await Promise.all([
        getEffectiveGovernancePolicyForStudio(session.activeStudioId),
        getStudioWorkspaceStateForSession(session),
        getBillingOverviewForSession(session),
        getTeamRosterForSession(session),
        listSupportThreadsForSession(session),
        getProjectOperationsForSession(session),
        restSelect<CoordinationRow[]>("studio_coordination_items", {
            select:
                "studio_id,item_key,assignee_user_id,status,snoozed_until,resolution_note,resolved_at,resolved_by_user_id,created_at,updated_at",
            filters: {
                studio_id: `eq.${session.activeStudioId}`,
                order: "updated_at.desc",
                limit: "240",
            },
        }),
        resolveCoverageOverlayRows(session.activeStudioId),
    ]);

    const viewer = getViewer(session);
    const liveItems = deriveLiveOperationalItems({
        workspaceState,
        billingOverview,
        roster,
        supportThreads,
        projectRisks,
        policy,
        now,
    });
    const liveKeys = new Set(liveItems.map((item) => item.itemKey));
    const activeOperators = roster.members
        .filter((member) => member.status === "active")
        .map((member) => ({
            userId: member.userId,
            label: member.displayName ?? member.email,
            email: member.email,
            role: member.role,
            active: true,
            isCurrentUser: member.userId === session.user.userId,
        }));
    const operatorMap = new Map(activeOperators.map((operator) => [operator.userId, operator]));
    const profileLabels = await resolveProfileLabels(
        coordinationRows.flatMap((row) => [row.assignee_user_id, row.resolved_by_user_id]),
    );
    const rowMap = new Map(coordinationRows.map((row) => [row.item_key, row]));

    const openItems = liveItems.map((liveItem): CoordinatedOperationalItem => {
        const row = rowMap.get(liveItem.itemKey) ?? null;
        return {
            ...liveItem,
            status: getEffectiveItemStatus(row, now),
            isLive: true,
            assignee: resolveUserReference({
                userId: row?.assignee_user_id ?? null,
                operatorMap,
                profileLabels,
            }),
            snoozedUntil: row?.snoozed_until ?? null,
            resolutionNote: row?.resolution_note?.trim() ? row.resolution_note : null,
            resolvedAt: row?.resolved_at ?? null,
            resolvedBy: resolveUserReference({
                userId: row?.resolved_by_user_id ?? null,
                operatorMap,
                profileLabels,
            }),
            coordinationCreatedAt: row?.created_at ?? null,
            coordinationUpdatedAt: row?.updated_at ?? null,
        };
    });

    const resolvedItems = coordinationRows
        .filter((row) => row.status === "resolved" && !liveKeys.has(row.item_key))
        .filter((row) => {
            const ageHours = hoursSince(row.resolved_at ?? row.updated_at, now);
            return ageHours !== null && ageHours <= RECENTLY_RESOLVED_WINDOW_HOURS;
        })
        .map((row): CoordinatedOperationalItem => {
            const fallback = buildResolvedFallbackItem({
                row,
                workspaceState,
                billingOverview,
                roster,
                supportThreads,
                projectRisks,
                now,
            });

            return {
                ...fallback,
                status: "resolved",
                isLive: false,
                assignee: resolveUserReference({
                    userId: row.assignee_user_id,
                    operatorMap,
                    profileLabels,
                }),
                snoozedUntil: row.snoozed_until,
                resolutionNote: row.resolution_note?.trim() ? row.resolution_note : null,
                resolvedAt: row.resolved_at ?? row.updated_at,
                resolvedBy: resolveUserReference({
                    userId: row.resolved_by_user_id,
                    operatorMap,
                    profileLabels,
                }),
                coordinationCreatedAt: row.created_at,
                coordinationUpdatedAt: row.updated_at,
            };
        })
        .sort((left, right) => toSortAt(right.resolvedAt ?? right.coordinationUpdatedAt) - toSortAt(left.resolvedAt ?? left.coordinationUpdatedAt));

    const urgentItems = openItems
        .filter((item) => item.severity === "urgent")
        .sort((left, right) => {
            const statusOrder = getCoordinationStatusRank(left.status) - getCoordinationStatusRank(right.status);
            if (statusOrder !== 0) {
                return statusOrder;
            }
            if (left.coordinationUpdatedAt !== right.coordinationUpdatedAt) {
                return toSortAt(left.createdAt) - toSortAt(right.createdAt);
            }
            return left.title.localeCompare(right.title);
        });
    const watchItems = openItems
        .filter((item) => item.severity === "watch")
        .sort((left, right) => {
            const statusOrder = getCoordinationStatusRank(left.status) - getCoordinationStatusRank(right.status);
            if (statusOrder !== 0) {
                return statusOrder;
            }
            if (left.coordinationUpdatedAt !== right.coordinationUpdatedAt) {
                return toSortAt(left.createdAt) - toSortAt(right.createdAt);
            }
            return left.title.localeCompare(right.title);
        });
    const coverage = deriveCoverageSnapshot({
        workspaceId: session.activeStudioId,
        now,
        policy,
        coverageRows,
        operators: activeOperators,
        items: [...urgentItems, ...watchItems].map(toCoverageItemInput),
        resolvedItems: resolvedItems.map(toCoverageResolvedItemInput),
    });

    const { operators, workload } = buildWorkload({
        items: [...urgentItems, ...watchItems],
        coverage,
        policy,
    });

    const domains = summarizeDomains([...urgentItems, ...watchItems]);
    const overallStatus = domains.slice().sort((left, right) => getStatusRank(left.status) - getStatusRank(right.status))[0]?.status ?? "stable";
    const operations: OperationsSnapshot = {
        overallStatus,
        urgentCount: urgentItems.length,
        watchCount: watchItems.length,
        resolvedCount: resolvedItems.length,
        domains,
        actionCenter: {
            urgent: stripOperationalItems(urgentItems),
            watch: stripOperationalItems(watchItems),
            resolved: stripOperationalItems(resolvedItems),
        },
        projectRisks,
    };

    return {
        generatedAt: new Date(now).toISOString(),
        workspaceId: session.activeStudioId,
        viewer,
        operators,
        workload: {
            ...workload,
            recentlyResolvedCount: resolvedItems.length,
        },
        operations,
        coverage,
        actionCenter: {
            urgent: urgentItems,
            watch: watchItems,
            resolved: resolvedItems,
        },
    };
}

export async function updateCoordinationItemForSession({
    session,
    itemKey,
    mutation,
}: {
    session: AuthSession;
    itemKey: string;
    mutation: Extract<CoordinationMutation, { action: "update" }>;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    if (!viewer.canManageAssignments) {
        throw new Error("Manual coordination updates require owner or admin access.");
    }

    const { snapshot, item } = await resolveCoordinationItemForMutation(session, itemKey);
    const assigneeUserId = mutation.assigneeUserId ?? item.assignee?.userId ?? null;
    if (assigneeUserId && !snapshot.operators.some((operator) => operator.userId === assigneeUserId)) {
        throw new Error("Assigned operator must be an active workspace member.");
    }

    const nextStatus = mutation.status ?? (typeof mutation.snoozeHours === "number" ? "snoozed" : item.status);
    if (!item.isLive && nextStatus !== "resolved") {
        throw new Error("Only live coordination items can be reopened or reassigned.");
    }
    if (nextStatus === "snoozed" && typeof mutation.snoozeHours !== "number") {
        throw new Error("Snoozed items require a snooze window.");
    }
    if (typeof mutation.snoozeHours === "number" && mutation.snoozeHours > snapshot.workload.maxSnoozeHours) {
        throw new Error(`Snoozes are capped at ${snapshot.workload.maxSnoozeHours} hours by workspace policy.`);
    }

    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
        assignee_user_id: assigneeUserId,
        status: nextStatus,
        snoozed_until: nextStatus === "snoozed" && typeof mutation.snoozeHours === "number" ? new Date(Date.now() + mutation.snoozeHours * 60 * 60 * 1000).toISOString() : null,
        resolution_note: nextStatus === "resolved" ? mutation.resolutionNote?.trim() || null : null,
        resolved_at: nextStatus === "resolved" ? nowIso : null,
        resolved_by_user_id: nextStatus === "resolved" ? session.user.userId : null,
    };

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload,
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.updated",
        summary: `Updated coordination item: ${item.title}.`,
        metadata: {
            fromStatus: item.status,
            toStatus: nextStatus,
            assigneeUserId,
            snoozedUntil: payload.snoozed_until ?? null,
        },
    });
}

export async function claimCoordinationItemForSession({
    session,
    itemKey,
}: {
    session: AuthSession;
    itemKey: string;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    const { item } = await resolveCoordinationItemForMutation(session, itemKey);

    if (!item.isLive) {
        throw new Error("Only live coordination items can be claimed.");
    }
    if (item.assignee?.active && item.assignee.userId !== viewer.userId && !viewer.canManageAssignments) {
        throw new Error("This coordination item is already owned by another operator.");
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: session.user.userId,
            status: "in_progress",
            snoozed_until: null,
            resolution_note: null,
            resolved_at: null,
            resolved_by_user_id: null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.claimed",
        summary: `Claimed coordination item: ${item.title}.`,
        metadata: {
            assigneeUserId: session.user.userId,
        },
    });
}

export async function assignCoordinationItemForSession({
    session,
    itemKey,
    assigneeUserId,
}: {
    session: AuthSession;
    itemKey: string;
    assigneeUserId: string | null;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    if (!viewer.canManageAssignments) {
        throw new Error("Assignments require owner or admin access.");
    }

    const { snapshot, item } = await resolveCoordinationItemForMutation(session, itemKey);
    if (!item.isLive) {
        throw new Error("Only live coordination items can be assigned.");
    }
    if (assigneeUserId && !snapshot.operators.some((operator) => operator.userId === assigneeUserId)) {
        throw new Error("Assigned operator must be an active workspace member.");
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: assigneeUserId,
            status: item.status,
            snoozed_until: item.status === "snoozed" ? item.snoozedUntil : null,
            resolution_note: item.status === "resolved" ? item.resolutionNote : null,
            resolved_at: item.status === "resolved" ? item.resolvedAt : null,
            resolved_by_user_id: item.status === "resolved" ? item.resolvedBy?.userId ?? session.user.userId : null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.assigned",
        summary: `${assigneeUserId ? "Assigned" : "Cleared owner on"} coordination item: ${item.title}.`,
        metadata: {
            assigneeUserId,
        },
    });
}

function resolveSuggestedRebalanceCandidate(snapshot: CoordinationSnapshot, itemKey: string) {
    return snapshot.coverage.rebalanceCandidates.find((candidate) => candidate.itemKey === itemKey) ?? null;
}

async function persistSuggestedAssignee({
    session,
    studioId,
    item,
    assigneeUserId,
    suggestedReason,
}: {
    session: AuthSession;
    studioId: string;
    item: CoordinatedOperationalItem;
    assigneeUserId: string;
    suggestedReason: string;
}) {
    await upsertCoordinationRow({
        studioId,
        itemKey: item.itemKey,
        payload: {
            assignee_user_id: assigneeUserId,
            status: item.status,
            snoozed_until: item.status === "snoozed" ? item.snoozedUntil : null,
            resolution_note: null,
            resolved_at: null,
            resolved_by_user_id: null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.rebalanced",
        summary: `Applied a suggested assignee for coordination item: ${item.title}.`,
        metadata: {
            assigneeUserId,
            suggestedReason,
        },
    });
}

export async function applySuggestedAssigneeForSession({
    session,
    itemKey,
}: {
    session: AuthSession;
    itemKey: string;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    if (!viewer.canManageAssignments) {
        throw new Error("Rebalancing requires owner or admin access.");
    }

    const { snapshot, item } = await resolveCoordinationItemForMutation(session, itemKey);
    if (!item.isLive) {
        throw new Error("Only live coordination items can be rebalanced.");
    }

    const candidate = resolveSuggestedRebalanceCandidate(snapshot, itemKey);
    const suggestion = candidate?.suggestedAssignee ?? null;
    if (!suggestion) {
        throw new Error("No suggested assignee is currently available for this item.");
    }
    if (!snapshot.operators.some((operator) => operator.userId === suggestion.userId)) {
        throw new Error("Suggested assignee is no longer active on this workspace.");
    }

    await persistSuggestedAssignee({
        session,
        studioId,
        item,
        assigneeUserId: suggestion.userId,
        suggestedReason: suggestion.reason,
    });
}

export async function handoffSuggestedCoverageForOperatorForSession({
    session,
    ownerUserId,
}: {
    session: AuthSession;
    ownerUserId: string;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    if (!viewer.canManageAssignments) {
        throw new Error("Batch handoff requires owner or admin access.");
    }

    const snapshot = await getCoordinationSnapshotForSession(session);
    const handoffCandidates = snapshot.coverage.rebalanceCandidates.filter(
        (candidate) => candidate.ownerUserId === ownerUserId && candidate.suggestedAssignee,
    );

    if (handoffCandidates.length === 0) {
        throw new Error("No suggested handoffs are currently available for that operator.");
    }

    const liveItemMap = new Map(
        [...snapshot.actionCenter.urgent, ...snapshot.actionCenter.watch]
            .filter((item) => item.isLive)
            .map((item) => [item.itemKey, item]),
    );

    let appliedCount = 0;
    for (const candidate of handoffCandidates) {
        const suggestion = candidate.suggestedAssignee;
        const item = liveItemMap.get(candidate.itemKey) ?? null;
        if (!suggestion || !item) {
            continue;
        }
        if (!snapshot.operators.some((operator) => operator.userId === suggestion.userId)) {
            continue;
        }

        await persistSuggestedAssignee({
            session,
            studioId,
            item,
            assigneeUserId: suggestion.userId,
            suggestedReason: suggestion.reason,
        });
        appliedCount += 1;
    }

    if (appliedCount === 0) {
        throw new Error("Suggested handoffs were no longer available by the time the action executed.");
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "studio_operator_coverage",
        targetId: ownerUserId,
        eventType: "coverage.operator.handoff_applied",
        summary: `Applied ${appliedCount} suggested handoff${appliedCount === 1 ? "" : "s"} for one operator.`,
        metadata: {
            ownerUserId,
            appliedCount,
            itemKeys: handoffCandidates.map((candidate) => candidate.itemKey),
        },
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "lane_handoff",
        targetId: ownerUserId,
        eventType: "continuity.reassignment.applied",
        summary: `Applied ${appliedCount} continuity-driven reassignment${appliedCount === 1 ? "" : "s"}.`,
        metadata: {
            ownerUserId,
            appliedCount,
            itemKeys: handoffCandidates.map((candidate) => candidate.itemKey),
        },
    });

    return {
        appliedCount,
    };
}

export async function snoozeCoordinationItemForSession({
    session,
    itemKey,
    snoozeHours,
}: {
    session: AuthSession;
    itemKey: string;
    snoozeHours: number;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    const { snapshot, item } = await resolveCoordinationItemForMutation(session, itemKey);

    if (!item.isLive) {
        throw new Error("Only live coordination items can be snoozed.");
    }
    if (!viewerCanOperateItem({ viewer, item })) {
        throw new Error("Only the current owner or an admin can snooze this coordination item.");
    }
    if (snoozeHours > snapshot.workload.maxSnoozeHours) {
        throw new Error(`Snoozes are capped at ${snapshot.workload.maxSnoozeHours} hours by workspace policy.`);
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: item.assignee?.userId ?? session.user.userId,
            status: "snoozed",
            snoozed_until: new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString(),
            resolution_note: null,
            resolved_at: null,
            resolved_by_user_id: null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.snoozed",
        summary: `Snoozed coordination item: ${item.title}.`,
        metadata: {
            snoozeHours,
        },
    });
}

export async function unsnoozeCoordinationItemForSession({
    session,
    itemKey,
}: {
    session: AuthSession;
    itemKey: string;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    const { item } = await resolveCoordinationItemForMutation(session, itemKey);

    if (!item.isLive) {
        throw new Error("Only live coordination items can be unsnoozed.");
    }
    if (!viewerCanOperateItem({ viewer, item })) {
        throw new Error("Only the current owner or an admin can unsnooze this coordination item.");
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: item.assignee?.userId ?? null,
            status: "open",
            snoozed_until: null,
            resolution_note: null,
            resolved_at: null,
            resolved_by_user_id: null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.unsnoozed",
        summary: `Unsnoozed coordination item: ${item.title}.`,
    });
}

export async function resolveCoordinationItemForSession({
    session,
    itemKey,
    resolutionNote,
}: {
    session: AuthSession;
    itemKey: string;
    resolutionNote?: string | null;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    const { item } = await resolveCoordinationItemForMutation(session, itemKey);

    if (!item.isLive) {
        throw new Error("Only live coordination items can be resolved.");
    }
    if (!viewerCanOperateItem({ viewer, item })) {
        throw new Error("Only the current owner or an admin can resolve this coordination item.");
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: item.assignee?.userId ?? session.user.userId,
            status: "resolved",
            snoozed_until: null,
            resolution_note: resolutionNote?.trim() || null,
            resolved_at: new Date().toISOString(),
            resolved_by_user_id: session.user.userId,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.resolved",
        summary: `Resolved coordination item: ${item.title}.`,
        metadata: {
            resolutionNote: resolutionNote?.trim() || null,
        },
    });
}

export async function reopenCoordinationItemForSession({
    session,
    itemKey,
}: {
    session: AuthSession;
    itemKey: string;
}) {
    const { studioId, viewer } = requireActiveStudioContext(session);
    const { item } = await resolveCoordinationItemForMutation(session, itemKey);

    if (!item.isLive) {
        throw new Error("This coordination item can only be reopened if the live condition still exists.");
    }
    if (!viewerCanOperateItem({ viewer, item })) {
        throw new Error("Only the current owner or an admin can reopen this coordination item.");
    }

    await upsertCoordinationRow({
        studioId,
        itemKey,
        payload: {
            assignee_user_id: item.assignee?.userId ?? null,
            status: "open",
            snoozed_until: null,
            resolution_note: null,
            resolved_at: null,
            resolved_by_user_id: null,
        },
    });

    await logCoordinationAudit({
        session,
        item,
        eventType: "coordination.item.reopened",
        summary: `Reopened coordination item: ${item.title}.`,
    });
}
