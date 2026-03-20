import { z } from "zod";

import type { AuthSession } from "@/server/contracts/auth";
import type {
    AccessReviewDecision,
    ApprovalRequestType,
    GovernanceAccessReviewEntry,
    GovernanceAccessReviewSnapshot,
    GovernanceApprovalRequest,
    GovernanceAttentionItem,
    GovernanceDomain,
    GovernancePolicy,
    GovernanceSeverity,
    GovernanceSnapshot,
    GovernanceStatus,
} from "@/server/contracts/governance";
import type { TeamInvitation, TeamMember } from "@/server/contracts/team";

import { getBillingOverviewForSession } from "@/server/billing/summary";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert, restSelect, restUpdate } from "@/server/db/rest";
import {
    defaultGovernancePolicy,
    describeGovernancePolicyRelaxation,
    getEffectiveGovernancePolicyForStudio,
    isGovernancePolicyRelaxation,
    isGovernancePolicyWeakerThanBaseline,
    mergeGovernancePolicy,
    persistGovernancePolicyForStudio,
} from "@/server/platform/governance-policy";
import { formatFreshnessLabel, hoursSince } from "@/server/platform/attention";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import { getProjectOperationsForSession } from "@/server/projects/operations";
import { listSupportThreadsForSession } from "@/server/support/service";

interface ApprovalRequestRow {
    id: string;
    request_key: string;
    studio_id: string;
    request_type: ApprovalRequestType;
    request_payload: Record<string, unknown> | null;
    summary: string;
    detail: string | null;
    href: string;
    requested_by_user_id: string | null;
    status: "pending" | "approved" | "rejected" | "executed" | "canceled";
    decision_note: string | null;
    decided_by_user_id: string | null;
    decided_at: string | null;
    executed_at: string | null;
    created_at: string;
}

interface AccessReviewRow {
    id: string;
    studio_id: string;
    status: "open" | "completed";
    opened_by_user_id: string | null;
    completed_by_user_id: string | null;
    completed_at: string | null;
    created_at: string;
}

interface AccessReviewEntryRow {
    id: string;
    review_id: string;
    studio_id: string;
    subject_type: "membership" | "invitation";
    subject_id: string;
    decision: AccessReviewDecision | null;
    note: string | null;
    decided_by_user_id: string | null;
    decided_at: string | null;
    created_at: string;
}

interface ProfileLabelRow {
    id: string;
    email: string;
    display_name: string | null;
}

type GovernanceRequestResult =
    | {
          mode: "requested";
          approvalRequest: GovernanceApprovalRequest;
      }
    | {
          mode: "updated";
          policy: GovernancePolicy;
      };

type MutableApprovalAction = "approve" | "reject" | "cancel";

const accessReviewDueHours = 24 * 30;
const accessReviewUrgentHours = 24 * 45;
const approvalUrgentHours = 24;

const adminInvitePayloadSchema = z.object({
    email: z.string().email(),
    role: z.literal("admin"),
    origin: z.string().min(1),
});

const roleChangePayloadSchema = z.object({
    membershipId: z.string().uuid(),
    role: z.literal("admin"),
    status: z.enum(["active", "invited", "suspended"]).nullable(),
    seatKind: z.enum(["paid", "observer", "internal"]).nullable(),
});

const billingCheckoutPayloadSchema = z.object({
    planCode: z.string().min(1),
    origin: z.string().min(1),
    successPath: z.string().min(1),
    cancelPath: z.string().min(1),
});

const policyChangePayloadSchema = z.object({
    nextPolicy: z.object({
        staleInviteHours: z.number().int(),
        staleSupportHours: z.number().int(),
        staleProjectHours: z.number().int(),
        staleHandoffHours: z.number().int(),
        maxSnoozeHours: z.number().int(),
        maxActiveItemsPerAvailableOperator: z.number().int(),
        maxUrgentItemsPerAvailableOperator: z.number().int(),
        urgentOwnershipDriftHours: z.number().int(),
        requireAdminInviteApproval: z.boolean(),
        requireElevatedRoleChangeApproval: z.boolean(),
        requireSensitiveBillingApproval: z.boolean(),
        requirePolicyChangeApproval: z.boolean(),
        requireHandoffForAwayWithUrgentWork: z.boolean(),
    }),
});

function getEmptyAccessReviewSnapshot(): GovernanceAccessReviewSnapshot {
    return {
        reviewId: null,
        status: "none",
        openedAt: null,
        openedByLabel: null,
        completedAt: null,
        completedByLabel: null,
        dueLabel: "No review started",
        undecidedCount: 0,
        entries: [],
    };
}

function getEmptyGovernanceSnapshot(): GovernanceSnapshot {
    return {
        policy: defaultGovernancePolicy,
        overallStatus: "aligned",
        pendingApprovalCount: 0,
        exceptionCount: 0,
        items: [],
        pendingRequests: [],
        recentRequests: [],
        accessReview: getEmptyAccessReviewSnapshot(),
    };
}

function getActiveStudioRole(session: AuthSession) {
    return session.studios.find((studio) => studio.studioId === session.activeStudioId)?.role ?? null;
}

function requireGovernanceStudio(session: AuthSession) {
    if (!session.activeStudioId) {
        throw new Error("An active workspace is required.");
    }

    return {
        studioId: session.activeStudioId,
        role: getActiveStudioRole(session),
    };
}

function requireGovernanceOperator(session: AuthSession) {
    const context = requireGovernanceStudio(session);
    if (!context.role || !["owner", "admin"].includes(context.role)) {
        throw new Error("Governance changes require owner or admin access.");
    }
    return context;
}

function requireBillingOperator(session: AuthSession) {
    const context = requireGovernanceStudio(session);
    if (!context.role || !["owner", "admin", "finance"].includes(context.role)) {
        throw new Error("Billing changes require owner, admin, or finance access.");
    }
    return context;
}

function formatRequesterLabel(session: AuthSession) {
    return session.user.displayName ?? session.user.email;
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

function getRequestDomain(requestType: ApprovalRequestType): GovernanceDomain {
    switch (requestType) {
        case "billing_checkout":
            return "billing";
        case "admin_invitation":
        case "membership_role_change":
            return "team";
        case "policy_change":
            return "workspace";
        default:
            return "workspace";
    }
}

function createGovernanceItem({
    id,
    domain,
    severity,
    title,
    summary,
    remediation,
    href,
    createdAt,
    now,
}: {
    id: string;
    domain: GovernanceDomain;
    severity: GovernanceSeverity;
    title: string;
    summary: string;
    remediation: string;
    href: string;
    createdAt?: string | null;
    now: number;
}): GovernanceAttentionItem {
    return {
        id,
        domain,
        severity,
        title,
        summary,
        remediation,
        href,
        freshnessLabel: formatFreshnessLabel(createdAt ?? null, now, severity === "urgent" ? "Urgent" : "Watching"),
    };
}

async function resolveApprovalRequestRows(studioId: string, limit = 12) {
    return restSelect<ApprovalRequestRow[]>("studio_approval_requests", {
        select:
            "id,request_key,studio_id,request_type,request_payload,summary,detail,href,requested_by_user_id,status,decision_note,decided_by_user_id,decided_at,executed_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "created_at.desc",
            limit: String(limit),
        },
    });
}

async function resolveApprovalRequestById(studioId: string, requestId: string) {
    const rows = await restSelect<ApprovalRequestRow[]>("studio_approval_requests", {
        select:
            "id,request_key,studio_id,request_type,request_payload,summary,detail,href,requested_by_user_id,status,decision_note,decided_by_user_id,decided_at,executed_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            id: `eq.${requestId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolvePendingApprovalRequestByKey(studioId: string, requestKey: string) {
    const rows = await restSelect<ApprovalRequestRow[]>("studio_approval_requests", {
        select:
            "id,request_key,studio_id,request_type,request_payload,summary,detail,href,requested_by_user_id,status,decision_note,decided_by_user_id,decided_at,executed_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            request_key: `eq.${requestKey}`,
            status: "eq.pending",
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveAccessReviewRows(studioId: string, limit = 4) {
    return restSelect<AccessReviewRow[]>("studio_access_reviews", {
        select: "id,studio_id,status,opened_by_user_id,completed_by_user_id,completed_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "created_at.desc",
            limit: String(limit),
        },
    });
}

async function resolveAccessReviewById(studioId: string, reviewId: string) {
    const rows = await restSelect<AccessReviewRow[]>("studio_access_reviews", {
        select: "id,studio_id,status,opened_by_user_id,completed_by_user_id,completed_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            id: `eq.${reviewId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveAccessReviewEntries(reviewId: string) {
    return restSelect<AccessReviewEntryRow[]>("studio_access_review_entries", {
        select: "id,review_id,studio_id,subject_type,subject_id,decision,note,decided_by_user_id,decided_at,created_at",
        filters: {
            review_id: `eq.${reviewId}`,
            order: "created_at.asc",
        },
    });
}

async function resolveAccessReviewEntry(studioId: string, reviewId: string, entryId: string) {
    const rows = await restSelect<AccessReviewEntryRow[]>("studio_access_review_entries", {
        select: "id,review_id,studio_id,subject_type,subject_id,decision,note,decided_by_user_id,decided_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            review_id: `eq.${reviewId}`,
            id: `eq.${entryId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

function mapApprovalRequest({
    row,
    labels,
    canManage,
}: {
    row: ApprovalRequestRow;
    labels: Map<string, string>;
    canManage: boolean;
}): GovernanceApprovalRequest {
    return {
        requestId: row.id,
        requestKey: row.request_key,
        requestType: row.request_type,
        status: row.status,
        summary: row.summary,
        detail: row.detail,
        href: row.href,
        requestedAt: row.created_at,
        requestedByUserId: row.requested_by_user_id,
        requestedByLabel: row.requested_by_user_id ? labels.get(row.requested_by_user_id) ?? "Unknown operator" : "Unknown operator",
        decidedAt: row.decided_at,
        decidedByUserId: row.decided_by_user_id,
        decidedByLabel: row.decided_by_user_id ? labels.get(row.decided_by_user_id) ?? "Unknown operator" : null,
        decisionNote: row.decision_note,
        canApprove: canManage && row.status === "pending",
        canReject: canManage && row.status === "pending",
        canCancel: canManage && row.status === "pending",
    };
}

function mapAccessReviewEntry({
    row,
    members,
    invitations,
    policy,
    now,
}: {
    row: AccessReviewEntryRow;
    members: TeamMember[];
    invitations: TeamInvitation[];
    policy: GovernancePolicy;
    now: number;
}): GovernanceAccessReviewEntry {
    if (row.subject_type === "membership") {
        const member = members.find((entry) => entry.membershipId === row.subject_id) ?? null;
        return {
            entryId: row.id,
            subjectType: "membership",
            subjectId: row.subject_id,
            label: member?.displayName ?? member?.email ?? "Removed member",
            secondaryLabel: member ? `${member.role} · ${member.status}` : null,
            elevated: member ? member.role === "owner" || member.role === "admin" : false,
            stale: false,
            decision: row.decision,
            note: row.note,
        };
    }

    const invitation = invitations.find((entry) => entry.invitationId === row.subject_id) ?? null;
    const invitationAge = hoursSince(invitation?.invitedAt ?? null, now);
    return {
        entryId: row.id,
        subjectType: "invitation",
        subjectId: row.subject_id,
        label: invitation?.email ?? "Removed invitation",
        secondaryLabel: invitation ? `${invitation.role} invite` : null,
        elevated: invitation ? invitation.role === "owner" || invitation.role === "admin" : false,
        stale: invitationAge !== null && invitationAge >= policy.staleInviteHours,
        decision: row.decision,
        note: row.note,
    };
}

function getAccessReviewSnapshot({
    rows,
    entries,
    labels,
    members,
    invitations,
    policy,
    now,
}: {
    rows: AccessReviewRow[];
    entries: AccessReviewEntryRow[];
    labels: Map<string, string>;
    members: TeamMember[];
    invitations: TeamInvitation[];
    policy: GovernancePolicy;
    now: number;
}): GovernanceAccessReviewSnapshot {
    const openReview = rows.find((row) => row.status === "open") ?? null;
    const latestCompletedReview = rows.find((row) => row.status === "completed") ?? null;

    if (openReview) {
        const reviewEntries = entries
            .filter((entry) => entry.review_id === openReview.id)
            .map((entry) =>
                mapAccessReviewEntry({
                    row: entry,
                    members,
                    invitations,
                    policy,
                    now,
                }),
            );

        return {
            reviewId: openReview.id,
            status: "open",
            openedAt: openReview.created_at,
            openedByLabel: openReview.opened_by_user_id ? labels.get(openReview.opened_by_user_id) ?? "Unknown operator" : null,
            completedAt: null,
            completedByLabel: null,
            dueLabel: formatFreshnessLabel(openReview.created_at, now, "Opened"),
            undecidedCount: reviewEntries.filter((entry) => !entry.decision).length,
            entries: reviewEntries,
        };
    }

    if (latestCompletedReview) {
        return {
            reviewId: latestCompletedReview.id,
            status: "completed",
            openedAt: latestCompletedReview.created_at,
            openedByLabel: latestCompletedReview.opened_by_user_id ? labels.get(latestCompletedReview.opened_by_user_id) ?? "Unknown operator" : null,
            completedAt: latestCompletedReview.completed_at,
            completedByLabel: latestCompletedReview.completed_by_user_id
                ? labels.get(latestCompletedReview.completed_by_user_id) ?? "Unknown operator"
                : null,
            dueLabel: formatFreshnessLabel(latestCompletedReview.completed_at, now, "Reviewed"),
            undecidedCount: 0,
            entries: [],
        };
    }

    return getEmptyAccessReviewSnapshot();
}

async function createApprovalRequest({
    session,
    requestKey,
    requestType,
    payload,
    summary,
    detail,
    href,
}: {
    session: AuthSession;
    requestKey: string;
    requestType: ApprovalRequestType;
    payload: Record<string, unknown>;
    summary: string;
    detail: string | null;
    href: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const { studioId } = requireGovernanceStudio(session);
    const existing = await resolvePendingApprovalRequestByKey(studioId, requestKey);
    const labels = new Map([[session.user.userId, formatRequesterLabel(session)]]);

    if (existing) {
        return mapApprovalRequest({
            row: existing,
            labels,
            canManage: true,
        });
    }

    const inserted = await restInsert<ApprovalRequestRow[]>("studio_approval_requests", {
        request_key: requestKey,
        studio_id: studioId,
        request_type: requestType,
        request_payload: payload,
        summary,
        detail,
        href,
        requested_by_user_id: session.user.userId,
        status: "pending",
    });

    const row = inserted[0] ?? null;
    if (!row) {
        throw new Error("Unable to create approval request.");
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_approval_request",
        targetId: row.id,
        eventType: "governance.approval_request.created",
        summary,
        metadata: {
            requestKey,
            requestType,
        },
    });

    return mapApprovalRequest({
        row,
        labels,
        canManage: true,
    });
}

async function executeApprovalRequest({
    session,
    row,
}: {
    session: AuthSession;
    row: ApprovalRequestRow;
}) {
    switch (row.request_type) {
        case "admin_invitation": {
            const payload = adminInvitePayloadSchema.parse(row.request_payload ?? {});
            const { inviteStudioMemberForSession } = await import("@/server/team/service");
            const result = await inviteStudioMemberForSession({
                session,
                email: payload.email,
                role: payload.role,
                origin: payload.origin,
                skipGovernanceApproval: true,
            });

            return {
                redirectUrl: null as string | null,
                metadata: result.mode === "invited" ? { deliveryMode: result.deliveryMode } : {},
            };
        }
        case "membership_role_change": {
            const payload = roleChangePayloadSchema.parse(row.request_payload ?? {});
            const { updateStudioMemberForSession } = await import("@/server/team/service");
            await updateStudioMemberForSession({
                session,
                membershipId: payload.membershipId,
                role: payload.role,
                status: payload.status ?? undefined,
                seatKind: payload.seatKind ?? undefined,
                skipGovernanceApproval: true,
            });

            return {
                redirectUrl: null as string | null,
                metadata: {},
            };
        }
        case "billing_checkout": {
            const payload = billingCheckoutPayloadSchema.parse(row.request_payload ?? {});
            const { createCheckoutSessionForPlan } = await import("@/server/billing/checkout");
            const result = await createCheckoutSessionForPlan({
                session,
                planCode: payload.planCode,
                origin: payload.origin,
                successPath: payload.successPath,
                cancelPath: payload.cancelPath,
                skipGovernanceApproval: true,
            });

            if (result.mode !== "checkout") {
                throw new Error("Billing approval execution did not produce a checkout session.");
            }

            return {
                redirectUrl: result.url,
                metadata: {
                    checkoutId: result.id,
                },
            };
        }
        case "policy_change": {
            const payload = policyChangePayloadSchema.parse(row.request_payload ?? {});
            await persistGovernancePolicyForStudio(requireGovernanceStudio(session).studioId, payload.nextPolicy);

            return {
                redirectUrl: null as string | null,
                metadata: {},
            };
        }
        default:
            throw new Error("Unsupported approval request type.");
    }
}

export async function requestAdminInviteApprovalForSession({
    session,
    email,
    role,
    origin,
}: {
    session: AuthSession;
    email: string;
    role: TeamInvitation["role"];
    origin: string;
}) {
    requireGovernanceOperator(session);
    const policy = await getEffectiveGovernancePolicyForStudio(session.activeStudioId);
    if (role !== "admin" || !policy.requireAdminInviteApproval) {
        return null;
    }

    return createApprovalRequest({
        session,
        requestKey: `admin-invitation:${email.trim().toLowerCase()}`,
        requestType: "admin_invitation",
        payload: {
            email: email.trim().toLowerCase(),
            role,
            origin,
        },
        summary: `Admin invitation for ${email.trim().toLowerCase()} requires approval.`,
        detail: "Approving this request will issue the elevated studio invitation from the team surface.",
        href: "/app/team",
    });
}

export async function requestMemberRoleApprovalForSession({
    session,
    membershipId,
    currentRole,
    nextRole,
    status,
    seatKind,
    subjectLabel,
}: {
    session: AuthSession;
    membershipId: string;
    currentRole: TeamMember["role"];
    nextRole: TeamMember["role"] | undefined;
    status: TeamMember["status"] | undefined;
    seatKind: TeamMember["seatKind"] | undefined;
    subjectLabel: string;
}) {
    requireGovernanceOperator(session);
    const policy = await getEffectiveGovernancePolicyForStudio(session.activeStudioId);
    if (currentRole === "admin" || nextRole !== "admin" || !policy.requireElevatedRoleChangeApproval) {
        return null;
    }

    return createApprovalRequest({
        session,
        requestKey: `membership-role:${membershipId}:admin`,
        requestType: "membership_role_change",
        payload: {
            membershipId,
            role: nextRole,
            status: status ?? null,
            seatKind: seatKind ?? null,
        },
        summary: `Admin promotion for ${subjectLabel} requires approval.`,
        detail: "Approving this request will apply the elevated workspace role change from the team roster.",
        href: "/app/team",
    });
}

export async function requestBillingCheckoutApprovalForSession({
    session,
    planCode,
    origin,
    successPath,
    cancelPath,
}: {
    session: AuthSession;
    planCode: string;
    origin: string;
    successPath: string;
    cancelPath: string;
}) {
    requireBillingOperator(session);
    const policy = await getEffectiveGovernancePolicyForStudio(session.activeStudioId);
    if (!policy.requireSensitiveBillingApproval) {
        return null;
    }

    return createApprovalRequest({
        session,
        requestKey: `billing-checkout:${planCode}`,
        requestType: "billing_checkout",
        payload: {
            planCode,
            origin,
            successPath,
            cancelPath,
        },
        summary: `Plan change to ${planCode} requires approval.`,
        detail: "Approving this request will open the live billing checkout session.",
        href: "/app/billing",
    });
}

export async function updateGovernancePolicyForSession({
    session,
    patch,
    skipApproval = false,
}: {
    session: AuthSession;
    patch: Partial<GovernancePolicy>;
    skipApproval?: boolean;
}): Promise<GovernanceRequestResult> {
    const { studioId } = requireGovernanceOperator(session);
    const currentPolicy = await getEffectiveGovernancePolicyForStudio(studioId);
    const nextPolicy = mergeGovernancePolicy(currentPolicy, patch);

    if (!skipApproval && currentPolicy.requirePolicyChangeApproval && isGovernancePolicyRelaxation(currentPolicy, nextPolicy)) {
        const relaxationChanges = describeGovernancePolicyRelaxation(currentPolicy, nextPolicy);
        const approvalRequest = await createApprovalRequest({
            session,
            requestKey: "policy-change",
            requestType: "policy_change",
            payload: {
                nextPolicy,
            },
            summary: "Governance policy relaxation requires approval.",
            detail:
                relaxationChanges.length > 0
                    ? `This change would ${relaxationChanges.join(", ")}.`
                    : "This change would relax current governance controls.",
            href: "/app/settings/governance",
        });

        return {
            mode: "requested",
            approvalRequest,
        };
    }

    await persistGovernancePolicyForStudio(studioId, nextPolicy);
    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_governance_policy",
        targetId: studioId,
        eventType: "governance.policy.updated",
        summary: "Updated workspace governance policy.",
        metadata: {
            policy: nextPolicy,
        },
    });

    return {
        mode: "updated",
        policy: nextPolicy,
    };
}

export async function updateApprovalRequestForSession({
    session,
    requestId,
    action,
    decisionNote,
}: {
    session: AuthSession;
    requestId: string;
    action: MutableApprovalAction;
    decisionNote?: string | null;
}) {
    const { studioId } = requireGovernanceOperator(session);
    const row = await resolveApprovalRequestById(studioId, requestId);
    if (!row) {
        throw new Error("Approval request not found.");
    }
    if (row.status !== "pending") {
        throw new Error("Only pending approval requests can be updated.");
    }

    if (action === "approve") {
        const execution = await executeApprovalRequest({
            session,
            row,
        });

        await restUpdate(
            "studio_approval_requests",
            {
                status: "executed",
                decision_note: decisionNote?.trim() || null,
                decided_by_user_id: session.user.userId,
                decided_at: new Date().toISOString(),
                executed_at: new Date().toISOString(),
            },
            {
                id: `eq.${requestId}`,
            },
        );

        await logPlatformAuditEvent({
            actorUserId: session.user.userId,
            actorType: "user",
            studioId,
            targetType: "studio_approval_request",
            targetId: requestId,
            eventType: "governance.approval_request.executed",
            summary: row.summary,
            metadata: {
                requestType: row.request_type,
            },
        });

        return {
            redirectUrl: execution.redirectUrl,
        };
    }

    await restUpdate(
        "studio_approval_requests",
        {
            status: action === "reject" ? "rejected" : "canceled",
            decision_note: decisionNote?.trim() || null,
            decided_by_user_id: action === "reject" ? session.user.userId : null,
            decided_at: action === "reject" ? new Date().toISOString() : null,
        },
        {
            id: `eq.${requestId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_approval_request",
        targetId: requestId,
        eventType: action === "reject" ? "governance.approval_request.rejected" : "governance.approval_request.canceled",
        summary: row.summary,
        metadata: {
            requestType: row.request_type,
        },
    });

    return {
        redirectUrl: null,
    };
}

export async function startAccessReviewForSession(session: AuthSession) {
    const { studioId } = requireGovernanceOperator(session);
    const existing = (await resolveAccessReviewRows(studioId, 1)).find((row) => row.status === "open") ?? null;
    if (existing) {
        return existing.id;
    }

    const { getTeamRosterForSession } = await import("@/server/team/service");
    const roster = await getTeamRosterForSession(session);
    const reviewRows = await restInsert<AccessReviewRow[]>("studio_access_reviews", {
        studio_id: studioId,
        status: "open",
        opened_by_user_id: session.user.userId,
    });
    const review = reviewRows[0] ?? null;
    if (!review) {
        throw new Error("Unable to start access review.");
    }

    const entryPayload = [
        ...roster.members
            .filter((member) => member.status === "active")
            .map((member) => ({
                review_id: review.id,
                studio_id: studioId,
                subject_type: "membership",
                subject_id: member.membershipId,
            })),
        ...roster.invitations
            .filter((invitation) => invitation.status === "pending")
            .map((invitation) => ({
                review_id: review.id,
                studio_id: studioId,
                subject_type: "invitation",
                subject_id: invitation.invitationId,
            })),
    ];

    if (entryPayload.length > 0) {
        await restInsert("studio_access_review_entries", entryPayload);
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_access_review",
        targetId: review.id,
        eventType: "governance.access_review.started",
        summary: "Started a workspace access review.",
    });

    return review.id;
}

export async function recordAccessReviewDecisionForSession({
    session,
    reviewId,
    entryId,
    decision,
    note,
}: {
    session: AuthSession;
    reviewId: string;
    entryId: string;
    decision: AccessReviewDecision;
    note?: string | null;
}) {
    const { studioId } = requireGovernanceOperator(session);
    const review = await resolveAccessReviewById(studioId, reviewId);
    if (!review || review.status !== "open") {
        throw new Error("Open access review not found.");
    }

    const entry = await resolveAccessReviewEntry(studioId, reviewId, entryId);
    if (!entry) {
        throw new Error("Access review entry not found.");
    }

    await restUpdate(
        "studio_access_review_entries",
        {
            decision,
            note: note?.trim() || null,
            decided_by_user_id: session.user.userId,
            decided_at: new Date().toISOString(),
        },
        {
            id: `eq.${entryId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_access_review_entry",
        targetId: entryId,
        eventType: "governance.access_review.entry_recorded",
        summary: `Recorded access review decision: ${decision}.`,
        metadata: {
            subjectType: entry.subject_type,
            subjectId: entry.subject_id,
        },
    });
}

export async function completeAccessReviewForSession({
    session,
    reviewId,
}: {
    session: AuthSession;
    reviewId: string;
}) {
    const { studioId } = requireGovernanceOperator(session);
    const review = await resolveAccessReviewById(studioId, reviewId);
    if (!review || review.status !== "open") {
        throw new Error("Open access review not found.");
    }

    const entries = await resolveAccessReviewEntries(reviewId);
    if (entries.some((entry) => !entry.decision)) {
        throw new Error("Every access review entry needs a decision before completion.");
    }

    await restUpdate(
        "studio_access_reviews",
        {
            status: "completed",
            completed_by_user_id: session.user.userId,
            completed_at: new Date().toISOString(),
        },
        {
            id: `eq.${reviewId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_access_review",
        targetId: reviewId,
        eventType: "governance.access_review.completed",
        summary: "Completed a workspace access review.",
    });
}

export async function getGovernanceSnapshotForSession(session: AuthSession): Promise<GovernanceSnapshot> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return getEmptyGovernanceSnapshot();
    }

    const { studioId } = requireGovernanceStudio(session);
    const canManage = ["owner", "admin"].includes(getActiveStudioRole(session) ?? "");
    const now = Date.now();
    const { getTeamRosterForSession } = await import("@/server/team/service");
    const [policy, roster, supportThreads, projectRisks, billingOverview, approvalRows, reviewRows] = await Promise.all([
        getEffectiveGovernancePolicyForStudio(studioId),
        getTeamRosterForSession(session),
        listSupportThreadsForSession(session),
        getProjectOperationsForSession(session),
        getBillingOverviewForSession(session),
        resolveApprovalRequestRows(studioId, 16),
        resolveAccessReviewRows(studioId, 4),
    ]);

    const openReview = reviewRows.find((row) => row.status === "open") ?? null;
    const reviewEntries = openReview ? await resolveAccessReviewEntries(openReview.id) : [];
    const labels = await resolveProfileLabels([
        ...approvalRows.map((row) => row.requested_by_user_id),
        ...approvalRows.map((row) => row.decided_by_user_id),
        ...reviewRows.map((row) => row.opened_by_user_id),
        ...reviewRows.map((row) => row.completed_by_user_id),
    ]);

    const mappedRequests = approvalRows.map((row) =>
        mapApprovalRequest({
            row,
            labels,
            canManage,
        }),
    );
    const pendingRequests = mappedRequests.filter((row) => row.status === "pending");
    const recentRequests = mappedRequests.filter((row) => row.status !== "pending").slice(0, 6);
    const accessReview = getAccessReviewSnapshot({
        rows: reviewRows,
        entries: reviewEntries,
        labels,
        members: roster.members,
        invitations: roster.invitations,
        policy,
        now,
    });

    const items: GovernanceAttentionItem[] = [];

    for (const request of pendingRequests) {
        const requestAge = hoursSince(request.requestedAt, now);
        items.push(
            createGovernanceItem({
                id: `request:${request.requestId}`,
                domain: getRequestDomain(request.requestType),
                severity: requestAge !== null && requestAge >= approvalUrgentHours ? "urgent" : "watch",
                title: request.summary,
                summary: request.detail ?? "This request is waiting for an owner or admin decision.",
                remediation: "Open the governance queue to approve, reject, or cancel the request.",
                href: "/app/settings/governance#approvals",
                createdAt: request.requestedAt,
                now,
            }),
        );
    }

    if (isGovernancePolicyWeakerThanBaseline(policy)) {
        items.push(
            createGovernanceItem({
                id: "policy:baseline-drift",
                domain: "workspace",
                severity: "watch",
                title: "Workspace policy is weaker than the governance baseline",
                summary: "At least one workspace threshold or approval guardrail is looser than the recommended baseline.",
                remediation: "Review workspace governance policy and tighten any exception-heavy settings.",
                href: "/app/settings/governance#policy",
                now,
            }),
        );
    }

    const activeElevatedMembers = roster.members.filter(
        (member) => member.status === "active" && (member.role === "owner" || member.role === "admin"),
    );
    if (activeElevatedMembers.length <= 1) {
        items.push(
            createGovernanceItem({
                id: "team:single-elevated-operator",
                domain: "team",
                severity: "watch",
                title: "Only one elevated operator can govern this workspace",
                summary: "A single owner/admin is covering approval and governance duty, which increases continuity risk.",
                remediation: "Review whether another trusted operator should hold admin access or be explicitly reviewed.",
                href: "/app/team",
                now,
            }),
        );
    }

    const staleAdminInvites = roster.invitations.filter((invitation) => {
        const age = hoursSince(invitation.invitedAt, now);
        return invitation.status === "pending" && invitation.role === "admin" && age !== null && age >= policy.staleInviteHours;
    });
    if (staleAdminInvites.length > 0) {
        items.push(
            createGovernanceItem({
                id: "team:stale-admin-invites",
                domain: "team",
                severity: "watch",
                title: "Pending elevated invites are aging out",
                summary:
                    staleAdminInvites.length === 1
                        ? "A pending admin invitation has exceeded the current workspace threshold."
                        : `${staleAdminInvites.length} pending admin invitations have exceeded the current workspace threshold.`,
                remediation: "Reassess whether these elevated invites should be approved, resent, or revoked.",
                href: "/app/team",
                createdAt: staleAdminInvites[0]?.invitedAt ?? null,
                now,
            }),
        );
    }

    const latestReviewTimestamp = accessReview.status === "open" ? accessReview.openedAt : accessReview.completedAt;
    const reviewAge = hoursSince(latestReviewTimestamp, now);
    if (accessReview.status === "none") {
        items.push(
            createGovernanceItem({
                id: "review:none",
                domain: "team",
                severity: "watch",
                title: "No access review has been recorded yet",
                summary: "Elevated roles, active operators, and pending invitations have not been reviewed from the governance layer.",
                remediation: "Start the first access review from governance settings.",
                href: "/app/settings/governance#access-review",
                now,
            }),
        );
    } else if (accessReview.status === "open" && accessReview.undecidedCount > 0) {
        items.push(
            createGovernanceItem({
                id: "review:open",
                domain: "team",
                severity: reviewAge !== null && reviewAge >= accessReviewUrgentHours ? "urgent" : "watch",
                title: "Access review is still open",
                summary: `${accessReview.undecidedCount} access review ${accessReview.undecidedCount === 1 ? "entry is" : "entries are"} still undecided.`,
                remediation: "Record the remaining decisions and complete the review.",
                href: "/app/settings/governance#access-review",
                createdAt: accessReview.openedAt,
                now,
            }),
        );
    } else if (reviewAge !== null && reviewAge >= accessReviewDueHours) {
        items.push(
            createGovernanceItem({
                id: "review:overdue",
                domain: "team",
                severity: reviewAge >= accessReviewUrgentHours ? "urgent" : "watch",
                title: "Access review is overdue",
                summary: "The last recorded workspace access review is beyond the expected governance cadence.",
                remediation: "Run another access review for memberships and invitations.",
                href: "/app/settings/governance#access-review",
                createdAt: latestReviewTimestamp,
                now,
            }),
        );
    }

    const staleSupportThreads = supportThreads.filter((thread) => {
        if (!(thread.status === "open" || thread.status === "pending")) {
            return false;
        }

        const age = hoursSince(thread.latestMessageAt ?? thread.createdAt, now);
        return age !== null && age >= policy.staleSupportHours;
    });
    if (staleSupportThreads.length > 0) {
        items.push(
            createGovernanceItem({
                id: "support:stale",
                domain: "support",
                severity: staleSupportThreads.some((thread) => thread.priority === "urgent") ? "urgent" : "watch",
                title: "Support threads are breaching workspace policy",
                summary:
                    staleSupportThreads.length === 1
                        ? "An open support thread has exceeded the current governance threshold."
                        : `${staleSupportThreads.length} open support threads have exceeded the current governance threshold.`,
                remediation: "Route ownership in support and close or respond before the policy breach grows.",
                href: "/app/support",
                createdAt: staleSupportThreads[0]?.latestMessageAt ?? staleSupportThreads[0]?.createdAt ?? null,
                now,
            }),
        );
    }

    const staleProjects = projectRisks.filter((project) =>
        project.reasons.some((reason) => reason.startsWith("No recent activity")),
    );
    if (staleProjects.length > 0) {
        items.push(
            createGovernanceItem({
                id: "projects:stale",
                domain: "projects",
                severity: staleProjects.some((project) => project.riskLevel === "urgent") ? "urgent" : "watch",
                title: "Project operating posture is drifting",
                summary:
                    staleProjects.length === 1
                        ? "A project has exceeded the current stale-project governance threshold."
                        : `${staleProjects.length} projects have exceeded the current stale-project governance threshold.`,
                remediation: "Review project ownership, link missing worlds, and clear stale review-share posture.",
                href: "/app/dashboard",
                createdAt: staleProjects[0]?.lastActivityAt ?? null,
                now,
            }),
        );
    }

    if (policy.requireSensitiveBillingApproval && !billingOverview.summary.subscription) {
        items.push(
            createGovernanceItem({
                id: "billing:approval-enabled",
                domain: "billing",
                severity: "watch",
                title: "Billing changes require approval in this workspace",
                summary: "Plan changes are approval-gated, but the workspace still has no active subscription on record.",
                remediation: "Use the governance queue when the next billing action needs to be approved.",
                href: "/app/billing",
                now,
            }),
        );
    }

    const dedupedItems = Array.from(
        new Map(items.map((item) => [item.id, item])).values(),
    ).sort((left, right) => {
        const rank = {
            urgent: 0,
            watch: 1,
        } as const;
        return rank[left.severity] - rank[right.severity];
    });

    const overallStatus: GovernanceStatus =
        pendingRequests.length > 0 || dedupedItems.some((item) => item.severity === "urgent")
            ? "blocked"
            : dedupedItems.length > 0
              ? "attention"
              : "aligned";

    return {
        policy,
        overallStatus,
        pendingApprovalCount: pendingRequests.length,
        exceptionCount: dedupedItems.length,
        items: dedupedItems,
        pendingRequests,
        recentRequests,
        accessReview,
    };
}
