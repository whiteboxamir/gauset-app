import type { AuthSession } from "@/server/contracts/auth";
import type { ContinuitySnapshot, LaneHandoffMutation, LaneHandoffSummary } from "@/server/contracts/continuity";
import type { OperationsDomain } from "@/server/contracts/operations";

import { getEffectiveGovernancePolicyForStudio } from "@/server/platform/governance-policy";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import { getTeamRosterForSession } from "@/server/team/service";
import {
    deriveContinuityHealthSummary,
    findMissingContinuityHandoffDomainsForAwayMutation,
    deriveImplicitReviewByAt,
    deriveLaneContinuityEvaluation,
} from "@/server/platform/continuity-core";

import { deleteLaneHandoffRow, resolveLaneHandoffRows, upsertLaneHandoffRow, type LaneHandoffRow } from "./continuity-store";

type HandoffDomain = LaneHandoffRow["domain"];

const handoffDomains: HandoffDomain[] = ["workspace", "billing", "team", "support", "projects"];

function requireContinuityManager(session: AuthSession) {
    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    if (!session.activeStudioId || !activeStudio || !["owner", "admin"].includes(activeStudio.role)) {
        throw new Error("Continuity changes require owner or admin access.");
    }

    return {
        studioId: session.activeStudioId,
    };
}

function normalizeList(values: string[] | undefined) {
    return Array.from(
        new Set(
            (values ?? [])
                .map((value) => value.trim())
                .filter(Boolean)
                .slice(0, 8),
        ),
    );
}

function mapHandoffSummary({
    row,
    domain,
    coordinationSnapshot,
    staleHandoffHours,
    requireHandoffForAwayWithUrgentWork,
    updatedByLabel,
}: {
    row: LaneHandoffRow | null;
    domain: HandoffDomain;
    coordinationSnapshot: Awaited<ReturnType<typeof getCoordinationSnapshotForSession>>;
    staleHandoffHours: number;
    requireHandoffForAwayWithUrgentWork: boolean;
    updatedByLabel: string | null;
}): LaneHandoffSummary {
    const lane = coordinationSnapshot.coverage.lanes.find((entry) => entry.domain === domain);
    const urgentItems = coordinationSnapshot.actionCenter.urgent.filter((item) => item.domain === domain);
    const operators = coordinationSnapshot.coverage.operators.filter((operator) => operator.primaryDomains.includes(domain));
    const primaryOperator = row?.primary_operator_user_id ? operators.find((operator) => operator.userId === row.primary_operator_user_id) ?? null : null;
    const backupOperator = row?.backup_operator_user_id ? operators.find((operator) => operator.userId === row.backup_operator_user_id) ?? null : null;
    const awayUrgentOwner = urgentItems.find((item) => {
        const owner = item.assignee?.userId ? coordinationSnapshot.coverage.operators.find((operator) => operator.userId === item.assignee?.userId) ?? null : null;
        return owner?.coverageStatus === "away";
    });
    const effectiveReviewByAt = deriveImplicitReviewByAt({
        reviewByAt: row?.review_by_at ?? null,
        updatedAt: row?.updated_at ?? null,
        staleHandoffHours,
    });
    const realisticCoverageMatch =
        (!row?.primary_operator_user_id || Boolean(primaryOperator && primaryOperator.coverageStatus !== "away")) &&
        (!row?.backup_operator_user_id || Boolean(backupOperator));
    const evaluation = deriveLaneContinuityEvaluation({
        domain,
        summary: row?.summary ?? null,
        activeRisks: (row?.active_risks ?? []).filter(Boolean),
        nextActions: (row?.next_actions ?? []).filter(Boolean),
        reviewByAt: effectiveReviewByAt,
        primaryOperatorLabel: primaryOperator?.label ?? null,
        backupOperatorLabel: backupOperator?.label ?? null,
        policyStaleHandoffHours: staleHandoffHours,
        requiredForUrgentAway: requireHandoffForAwayWithUrgentWork,
        hasUrgentWork: urgentItems.length > 0,
        primaryOperatorAwayWithUrgentWork: Boolean(awayUrgentOwner),
        realisticCoverageMatch,
        now: Date.now(),
    });

    return {
        handoffId: row?.id ?? null,
        workspaceId: coordinationSnapshot.workspaceId,
        domain,
        summary: row?.summary ?? null,
        activeRisks: row?.active_risks?.filter(Boolean) ?? [],
        nextActions: row?.next_actions?.filter(Boolean) ?? [],
        primaryOperator: primaryOperator
            ? {
                  userId: primaryOperator.userId,
                  label: primaryOperator.label,
                  role: primaryOperator.role,
              }
            : null,
        backupOperator: backupOperator
            ? {
                  userId: backupOperator.userId,
                  label: backupOperator.label,
                  role: backupOperator.role,
              }
            : null,
        reviewByAt: effectiveReviewByAt,
        updatedAt: row?.updated_at ?? null,
        updatedByLabel,
        health: evaluation.health,
        stale: evaluation.stale,
        required: evaluation.required,
        reasons: evaluation.reasons.length > 0 ? evaluation.reasons : lane?.gapReason ? [lane.gapReason] : [],
        href: "/app/team#lane-handoffs",
    };
}

export async function getContinuitySnapshotForSession(session: AuthSession): Promise<ContinuitySnapshot> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return {
            generatedAt: new Date().toISOString(),
            workspaceId: session.activeStudioId,
            health: "stable",
            reasons: [],
            summary: {
                staleHandoffCount: 0,
                missingHandoffCount: 0,
                awayWithUrgentWorkCount: 0,
                mismatchedCoverageCount: 0,
                criticalLaneCount: 0,
            },
            alerts: [],
            handoffs: [],
        };
    }

    const [policy, coordinationSnapshot, handoffRows, roster] = await Promise.all([
        getEffectiveGovernancePolicyForStudio(session.activeStudioId),
        getCoordinationSnapshotForSession(session),
        resolveLaneHandoffRows(session.activeStudioId),
        getTeamRosterForSession(session),
    ]);
    const labelByUserId = new Map(roster.members.map((member) => [member.userId, member.displayName ?? member.email]));

    const handoffs = handoffDomains.map((domain) =>
        mapHandoffSummary({
            row: handoffRows.find((entry) => entry.domain === domain) ?? null,
            domain,
            coordinationSnapshot,
            staleHandoffHours: policy.staleHandoffHours,
            requireHandoffForAwayWithUrgentWork: policy.requireHandoffForAwayWithUrgentWork,
            updatedByLabel:
                labelByUserId.get(handoffRows.find((entry) => entry.domain === domain)?.updated_by_user_id ?? "") ?? null,
        }),
    );
    const continuityHealth = deriveContinuityHealthSummary(
        handoffs.map((handoff) => ({
            health: handoff.health,
            stale: handoff.stale,
            required: handoff.required,
            reasons: handoff.reasons,
        })),
    );

    return {
        generatedAt: new Date().toISOString(),
        workspaceId: session.activeStudioId,
        health: continuityHealth.health,
        reasons: continuityHealth.reasons,
        summary: continuityHealth.summary,
        alerts: handoffs
            .filter((handoff) => handoff.health !== "stable")
            .map((handoff) => ({
                id: `continuity:${handoff.domain}`,
                domain: handoff.domain,
                severity: handoff.health,
                title: `${handoff.domain} continuity is ${handoff.health}`,
                body: handoff.reasons[0] ?? "Lane continuity needs attention.",
                href: handoff.href,
            })),
        handoffs,
    };
}

export async function upsertLaneHandoffForSession({
    session,
    domain,
    mutation,
}: {
    session: AuthSession;
    domain: HandoffDomain;
    mutation: LaneHandoffMutation;
}) {
    const { studioId } = requireContinuityManager(session);
    const row = await upsertLaneHandoffRow({
        studioId,
        domain,
        summary: mutation.summary?.trim() || null,
        activeRisks: normalizeList(mutation.activeRisks),
        nextActions: normalizeList(mutation.nextActions),
        primaryOperatorUserId: mutation.primaryOperatorUserId ?? null,
        backupOperatorUserId: mutation.backupOperatorUserId ?? null,
        reviewByAt: mutation.reviewByAt ?? null,
        updatedByUserId: session.user.userId,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "lane_handoff",
        targetId: row?.id ?? `${studioId}:${domain}`,
        eventType: "continuity.handoff.updated",
        summary: `Updated ${domain} lane handoff.`,
        metadata: {
            domain,
            summary: mutation.summary?.trim() || null,
            primaryOperatorUserId: mutation.primaryOperatorUserId ?? null,
            backupOperatorUserId: mutation.backupOperatorUserId ?? null,
        },
    });
}

export async function clearLaneHandoffForSession({
    session,
    domain,
}: {
    session: AuthSession;
    domain: HandoffDomain;
}) {
    const { studioId } = requireContinuityManager(session);
    const deleted = await deleteLaneHandoffRow(studioId, domain);

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "lane_handoff",
        targetId: deleted?.id ?? `${studioId}:${domain}`,
        eventType: "continuity.handoff.cleared",
        summary: `Cleared ${domain} lane handoff.`,
        metadata: {
            domain,
        },
    });
}

export async function assertContinuityRequirementForAwayMutation({
    session,
    operatorUserId,
    domains,
}: {
    session: AuthSession;
    operatorUserId: string;
    domains: OperationsDomain[];
}) {
    if (!session.activeStudioId || !isPlatformDatabaseConfigured()) {
        return;
    }

    const [policy, continuitySnapshot, coordinationSnapshot] = await Promise.all([
        getEffectiveGovernancePolicyForStudio(session.activeStudioId),
        getContinuitySnapshotForSession(session),
        getCoordinationSnapshotForSession(session),
    ]);

    const urgentOwnedItems = coordinationSnapshot.actionCenter.urgent.filter((item) => item.assignee?.userId === operatorUserId);
    const missingDomains = findMissingContinuityHandoffDomainsForAwayMutation({
        requireHandoffForUrgentAway: policy.requireHandoffForAwayWithUrgentWork,
        coveredDomains: domains,
        urgentOwnedDomains: urgentOwnedItems.map((item) => item.domain),
        handoffs: continuitySnapshot.handoffs.map((handoff) => ({
            domain: handoff.domain,
            summary: handoff.summary,
        })),
    });

    if (missingDomains.length > 0) {
        throw new Error(
            `Urgent work cannot be moved to away without a lane handoff for ${missingDomains.join(", ")}. Update the lane handoff first.`,
        );
    }
}
