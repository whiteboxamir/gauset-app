import type { AuthSession } from "@/server/contracts/auth";
import type {
    CoverageAssigneeSuggestion,
    CoverageAttentionItem,
    CoverageOperatorMutation,
    CoverageOperatorSummary,
    CoverageSnapshot,
    OperatorCapacityState,
    OperatorCoverageStatus,
} from "@/server/contracts/coverage";
import type { GovernancePolicy } from "@/server/contracts/governance";
import type { OperationsDomain } from "@/server/contracts/operations";
import type { StudioRole } from "@/types/platform/common";

import { defaultGovernancePolicy } from "@/server/platform/governance-policy";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect, restUpsert } from "@/server/db/rest";
import { getTeamRosterForSession } from "@/server/team/service";
import { hoursSince } from "@/server/platform/attention";
import { logPlatformAuditEvent } from "@/server/platform/audit";

interface CoverageRow {
    studio_id: string;
    user_id: string;
    coverage_status: OperatorCoverageStatus;
    effective_until: string | null;
    note: string | null;
    covers_workspace: boolean;
    covers_billing: boolean;
    covers_team: boolean;
    covers_support: boolean;
    covers_projects: boolean;
    max_active_items_override: number | null;
    max_urgent_items_override: number | null;
    created_at: string;
    updated_at: string;
}

interface CoverageOperatorInput {
    userId: string;
    label: string;
    email: string;
    role: StudioRole | null;
    active: boolean;
    isCurrentUser: boolean;
}

interface CoverageItemOwner {
    userId: string;
    label: string;
    role: StudioRole | null;
    active: boolean;
}

interface CoverageItemInput {
    itemKey: string;
    title: string;
    href: string;
    domain: OperationsDomain;
    severity: "urgent" | "watch";
    status: "open" | "in_progress" | "snoozed";
    assignee: CoverageItemOwner | null;
    coordinationUpdatedAt: string | null;
    createdAt: string | null;
}

interface CoverageResolvedItemInput {
    itemKey: string;
    assignee: CoverageItemOwner | null;
}

const DOMAIN_LABELS: Array<{ domain: OperationsDomain; label: string }> = [
    { domain: "workspace", label: "Workspace" },
    { domain: "billing", label: "Billing" },
    { domain: "team", label: "Team" },
    { domain: "support", label: "Support" },
    { domain: "projects", label: "Projects" },
];

function defaultPrimaryDomains(role: StudioRole | null): OperationsDomain[] {
    switch (role) {
        case "owner":
            return ["workspace", "billing", "team", "support", "projects"];
        case "admin":
            return ["workspace", "team", "support", "projects"];
        case "finance":
            return ["workspace", "billing"];
        case "member":
        default:
            return ["projects", "support"];
    }
}

function domainsToColumns(domains: OperationsDomain[]) {
    const set = new Set(domains);
    return {
        covers_workspace: set.has("workspace"),
        covers_billing: set.has("billing"),
        covers_team: set.has("team"),
        covers_support: set.has("support"),
        covers_projects: set.has("projects"),
    };
}

function rowToDomains(row: CoverageRow | null, role: StudioRole | null) {
    if (!row) {
        return defaultPrimaryDomains(role);
    }

    const domains = DOMAIN_LABELS.filter(({ domain }) => {
        switch (domain) {
            case "workspace":
                return row.covers_workspace;
            case "billing":
                return row.covers_billing;
            case "team":
                return row.covers_team;
            case "support":
                return row.covers_support;
            case "projects":
                return row.covers_projects;
            default:
                return false;
        }
    }).map(({ domain }) => domain);

    return domains;
}

function getEffectiveCoverageStatus(row: CoverageRow | null, now: number): OperatorCoverageStatus {
    const effectiveUntil = row?.effective_until ? Date.parse(row.effective_until) : Number.NaN;
    if (row?.effective_until && !Number.isNaN(effectiveUntil) && effectiveUntil <= now) {
        return "available";
    }
    return row?.coverage_status ?? "available";
}

function getEffectiveUntil(row: CoverageRow | null, now: number) {
    const effectiveUntil = row?.effective_until ? Date.parse(row.effective_until) : Number.NaN;
    if (row?.effective_until && !Number.isNaN(effectiveUntil) && effectiveUntil <= now) {
        return null;
    }
    return row?.effective_until ?? null;
}

function getEffectiveNote(row: CoverageRow | null, now: number) {
    return getEffectiveUntil(row, now) ? row?.note?.trim() || null : row?.effective_until ? null : row?.note?.trim() || null;
}

function adjustCapacityForStatus({
    base,
    status,
}: {
    base: number;
    status: OperatorCoverageStatus;
}) {
    if (status === "away") {
        return 0;
    }
    if (status === "focused") {
        return Math.max(1, Math.ceil(base / 2));
    }
    return base;
}

function getAvailabilityRank({
    status,
    primaryMatch,
    urgent,
}: {
    status: OperatorCoverageStatus;
    primaryMatch: boolean;
    urgent: boolean;
}) {
    if (status === "available") {
        return 0;
    }
    if (status === "backup") {
        return 1;
    }
    if (status === "focused") {
        return urgent && primaryMatch ? 2 : 3;
    }
    return 9;
}

function getCapacityState({
    status,
    activeAssignmentCount,
    urgentAssignmentCount,
    maxActiveItems,
    maxUrgentItems,
}: {
    status: OperatorCoverageStatus;
    activeAssignmentCount: number;
    urgentAssignmentCount: number;
    maxActiveItems: number;
    maxUrgentItems: number;
}): OperatorCapacityState {
    if (status === "away") {
        return "unavailable";
    }
    if ((maxActiveItems > 0 && activeAssignmentCount > maxActiveItems) || (maxUrgentItems > 0 && urgentAssignmentCount > maxUrgentItems)) {
        return "overloaded";
    }
    if (
        (maxActiveItems > 0 && activeAssignmentCount >= Math.max(1, Math.ceil(maxActiveItems * 0.8))) ||
        (maxUrgentItems > 0 && urgentAssignmentCount >= Math.max(1, Math.ceil(maxUrgentItems * 0.8)))
    ) {
        return "limited";
    }
    return "balanced";
}

function normalizeReason(text: string) {
    return text.trim();
}

function buildSuggestionReason({
    operator,
    domain,
    primaryMatch,
}: {
    operator: CoverageOperatorSummary;
    domain: OperationsDomain;
    primaryMatch: boolean;
}) {
    const laneLabel = primaryMatch ? `Primary ${domain} lane` : `Secondary ${domain} lane`;
    return `${laneLabel} · ${operator.coverageStatus} · ${operator.activeAssignmentCount}/${Math.max(operator.maxActiveItems, 1)} active`;
}

function buildAttentionItem({
    item,
    laneStatus,
    reason,
    owner,
    suggestedAssignee,
    staleInProgress,
}: {
    item: CoverageItemInput;
    laneStatus: "covered" | "undercovered";
    reason: string;
    owner: CoverageOperatorSummary | null;
    suggestedAssignee: CoverageAssigneeSuggestion | null;
    staleInProgress: boolean;
}): CoverageAttentionItem {
    return {
        itemKey: item.itemKey,
        title: item.title,
        href: item.href,
        domain: item.domain,
        severity: item.severity,
        ownerUserId: item.assignee?.userId ?? null,
        ownerLabel: item.assignee?.label ?? null,
        ownerStatus: item.assignee ? owner?.coverageStatus ?? null : null,
        ownerCapacityState: item.assignee ? owner?.capacityState ?? null : null,
        laneStatus,
        staleInProgress,
        reason: normalizeReason(reason),
        suggestedAssignee,
    };
}

function requireCoverageManager(session: AuthSession) {
    const activeStudio = session.studios.find((studio) => studio.studioId === session.activeStudioId) ?? null;
    if (!session.activeStudioId || !activeStudio || !["owner", "admin"].includes(activeStudio.role)) {
        throw new Error("Coverage changes require owner or admin access.");
    }

    return {
        studioId: session.activeStudioId,
    };
}

async function resolveCoverageRow(studioId: string, userId: string) {
    const rows = await restSelect<CoverageRow[]>("studio_operator_coverage", {
        select:
            "studio_id,user_id,coverage_status,effective_until,note,covers_workspace,covers_billing,covers_team,covers_support,covers_projects,max_active_items_override,max_urgent_items_override,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            user_id: `eq.${userId}`,
            limit: "1",
        },
    });

    return rows[0] ?? null;
}

async function upsertCoverageRow({
    studioId,
    userId,
    payload,
}: {
    studioId: string;
    userId: string;
    payload: Record<string, unknown>;
}) {
    await restUpsert(
        "studio_operator_coverage",
        {
            studio_id: studioId,
            user_id: userId,
            ...payload,
        },
        {
            onConflict: "studio_id,user_id",
        },
    );
}

function createDerivedOperator({
    operator,
    row,
    policy,
    now,
}: {
    operator: CoverageOperatorInput;
    row: CoverageRow | null;
    policy: GovernancePolicy;
    now: number;
}): CoverageOperatorSummary {
    const coverageStatus = getEffectiveCoverageStatus(row, now);
    const maxActiveItemsOverride = row?.max_active_items_override ?? null;
    const maxUrgentItemsOverride = row?.max_urgent_items_override ?? null;
    const baseActiveItems = maxActiveItemsOverride ?? policy.maxActiveItemsPerAvailableOperator;
    const baseUrgentItems = maxUrgentItemsOverride ?? policy.maxUrgentItemsPerAvailableOperator;
    const maxActiveItems = adjustCapacityForStatus({
        base: baseActiveItems,
        status: coverageStatus,
    });
    const maxUrgentItems = adjustCapacityForStatus({
        base: baseUrgentItems,
        status: coverageStatus,
    });

    return {
        ...operator,
        coverageStatus,
        capacityState: coverageStatus === "away" ? "unavailable" : "balanced",
        effectiveUntil: getEffectiveUntil(row, now),
        note: getEffectiveNote(row, now),
        primaryDomains: rowToDomains(row, operator.role),
        maxActiveItems,
        maxUrgentItems,
        maxActiveItemsOverride,
        maxUrgentItemsOverride,
        activeAssignmentCount: 0,
        openAssignmentCount: 0,
        inProgressAssignmentCount: 0,
        snoozedAssignmentCount: 0,
        resolvedAssignmentCount: 0,
        urgentAssignmentCount: 0,
        staleInProgressCount: 0,
        unavailableOwnedItemCount: 0,
        loadPercent: 0,
        urgentLoadPercent: 0,
        canTakeNewWork: coverageStatus !== "away",
        canTakeUrgentWork: coverageStatus !== "away",
    };
}

function pickSuggestedAssignee({
    item,
    operatorMap,
}: {
    item: CoverageItemInput;
    operatorMap: Map<string, CoverageOperatorSummary>;
}) {
    const candidates = Array.from(operatorMap.values()).filter((operator) => operator.coverageStatus !== "away");
    const preferredCandidates = candidates.filter((operator) => operator.userId !== item.assignee?.userId);
    const pool = preferredCandidates.length > 0 ? preferredCandidates : candidates;
    const nonOverloaded = pool.filter((operator) => operator.capacityState !== "overloaded");
    const sortedPool = (nonOverloaded.length > 0 ? nonOverloaded : pool).sort((left, right) => {
        const leftPrimary = left.primaryDomains.includes(item.domain);
        const rightPrimary = right.primaryDomains.includes(item.domain);
        const availabilityOrder =
            getAvailabilityRank({
                status: left.coverageStatus,
                primaryMatch: leftPrimary,
                urgent: item.severity === "urgent",
            }) -
            getAvailabilityRank({
                status: right.coverageStatus,
                primaryMatch: rightPrimary,
                urgent: item.severity === "urgent",
            });
        if (availabilityOrder !== 0) {
            return availabilityOrder;
        }

        if (leftPrimary !== rightPrimary) {
            return leftPrimary ? -1 : 1;
        }

        if (left.activeAssignmentCount !== right.activeAssignmentCount) {
            return left.activeAssignmentCount - right.activeAssignmentCount;
        }

        if (left.urgentAssignmentCount !== right.urgentAssignmentCount) {
            return left.urgentAssignmentCount - right.urgentAssignmentCount;
        }

        return left.label.localeCompare(right.label);
    });

    const selected = sortedPool[0] ?? null;
    if (!selected || selected.userId === item.assignee?.userId) {
        return null;
    }

    return {
        userId: selected.userId,
        label: selected.label,
        role: selected.role,
        status: selected.coverageStatus,
        reason: buildSuggestionReason({
            operator: selected,
            domain: item.domain,
            primaryMatch: selected.primaryDomains.includes(item.domain),
        }),
    } satisfies CoverageAssigneeSuggestion;
}

export function createEmptyCoverageSnapshot({
    generatedAt = new Date().toISOString(),
    workspaceId = null,
    policy = defaultGovernancePolicy,
}: {
    generatedAt?: string;
    workspaceId?: string | null;
    policy?: GovernancePolicy;
} = {}): CoverageSnapshot {
    return {
        generatedAt,
        workspaceId,
        health: "stable",
        policy: {
            maxActiveItemsPerAvailableOperator: policy.maxActiveItemsPerAvailableOperator,
            maxUrgentItemsPerAvailableOperator: policy.maxUrgentItemsPerAvailableOperator,
            urgentOwnershipDriftHours: policy.urgentOwnershipDriftHours,
        },
        summary: {
            availableOperatorCount: 0,
            focusedOperatorCount: 0,
            awayOperatorCount: 0,
            backupOperatorCount: 0,
            overloadedOperatorCount: 0,
            undercoveredLaneCount: 0,
            unownedUrgentItemCount: 0,
            unavailableOwnerItemCount: 0,
            staleInProgressCount: 0,
            rebalanceCandidateCount: 0,
            reasons: ["Coverage is aligned with current policy thresholds."],
        },
        operators: [],
        lanes: DOMAIN_LABELS.map(({ domain, label }) => ({
            domain,
            label,
            status: "covered",
            coveredOperatorCount: 0,
            availableOperatorCount: 0,
            focusedOperatorCount: 0,
            backupOperatorCount: 0,
            activeItemCount: 0,
            urgentItemCount: 0,
            unownedUrgentItemCount: 0,
            unavailableOwnerItemCount: 0,
            staleInProgressCount: 0,
            gapReason: null,
        })),
        unownedUrgentItems: [],
        unavailableOwnerItems: [],
        staleInProgressItems: [],
        rebalanceCandidates: [],
    };
}

export function deriveCoverageSnapshot({
    workspaceId,
    now,
    policy,
    coverageRows,
    operators,
    items,
    resolvedItems,
}: {
    workspaceId: string | null;
    now: number;
    policy: GovernancePolicy;
    coverageRows: CoverageRow[];
    operators: CoverageOperatorInput[];
    items: CoverageItemInput[];
    resolvedItems: CoverageResolvedItemInput[];
}): CoverageSnapshot {
    const coverageRowMap = new Map(coverageRows.map((row) => [row.user_id, row]));
    const derivedOperators = operators.map((operator) =>
        createDerivedOperator({
            operator,
            row: coverageRowMap.get(operator.userId) ?? null,
            policy,
            now,
        }),
    );
    const operatorMap = new Map(derivedOperators.map((operator) => [operator.userId, operator]));

    const staleItemKeys = new Set<string>();
    items.forEach((item) => {
        const operator = item.assignee?.active ? operatorMap.get(item.assignee.userId) ?? null : null;
        if (operator) {
            operator.activeAssignmentCount += 1;
            if (item.status === "open") {
                operator.openAssignmentCount += 1;
            }
            if (item.status === "in_progress") {
                operator.inProgressAssignmentCount += 1;
            }
            if (item.status === "snoozed") {
                operator.snoozedAssignmentCount += 1;
            }
            if (item.severity === "urgent") {
                operator.urgentAssignmentCount += 1;
            }
        }

        const staleHours = hoursSince(item.coordinationUpdatedAt ?? item.createdAt, now);
        if (item.status === "in_progress" && staleHours !== null && staleHours >= policy.urgentOwnershipDriftHours) {
            staleItemKeys.add(item.itemKey);
            if (operator) {
                operator.staleInProgressCount += 1;
            }
        }
    });

    resolvedItems.forEach((item) => {
        if (!item.assignee?.active) {
            return;
        }
        const operator = operatorMap.get(item.assignee.userId) ?? null;
        if (operator) {
            operator.resolvedAssignmentCount += 1;
        }
    });

    derivedOperators.forEach((operator) => {
        operator.capacityState = getCapacityState({
            status: operator.coverageStatus,
            activeAssignmentCount: operator.activeAssignmentCount,
            urgentAssignmentCount: operator.urgentAssignmentCount,
            maxActiveItems: operator.maxActiveItems,
            maxUrgentItems: operator.maxUrgentItems,
        });
        operator.loadPercent = operator.maxActiveItems > 0 ? operator.activeAssignmentCount / operator.maxActiveItems : operator.activeAssignmentCount > 0 ? 1 : 0;
        operator.urgentLoadPercent =
            operator.maxUrgentItems > 0 ? operator.urgentAssignmentCount / operator.maxUrgentItems : operator.urgentAssignmentCount > 0 ? 1 : 0;
        operator.canTakeNewWork = operator.coverageStatus !== "away" && operator.capacityState !== "overloaded";
        operator.canTakeUrgentWork = operator.coverageStatus !== "away" && operator.urgentAssignmentCount < Math.max(1, operator.maxUrgentItems);
    });

    const unavailableOwnerItemsRaw = items.filter((item) => {
        if (!item.assignee) {
            return false;
        }
        if (!item.assignee.active) {
            return true;
        }
        const operator = operatorMap.get(item.assignee.userId) ?? null;
        return operator?.coverageStatus === "away";
    });

    unavailableOwnerItemsRaw.forEach((item) => {
        if (!item.assignee?.active) {
            return;
        }
        const operator = operatorMap.get(item.assignee.userId) ?? null;
        if (operator) {
            operator.unavailableOwnedItemCount += 1;
        }
    });

    const laneMap = new Map(
        DOMAIN_LABELS.map(({ domain, label }) => {
            const laneOperators = derivedOperators.filter((operator) => operator.primaryDomains.includes(domain));
            const coveredOperators = laneOperators.filter((operator) => operator.coverageStatus !== "away");
            const laneItems = items.filter((item) => item.domain === domain);
            const urgentLaneItems = laneItems.filter((item) => item.severity === "urgent");
            const laneUnavailableOwnerCount = unavailableOwnerItemsRaw.filter((item) => item.domain === domain).length;
            const laneStaleCount = laneItems.filter((item) => staleItemKeys.has(item.itemKey)).length;

            return [
                domain,
                {
                    domain,
                    label,
                    status: coveredOperators.length > 0 ? ("covered" as const) : ("undercovered" as const),
                    coveredOperatorCount: coveredOperators.length,
                    availableOperatorCount: laneOperators.filter((operator) => operator.coverageStatus === "available").length,
                    focusedOperatorCount: laneOperators.filter((operator) => operator.coverageStatus === "focused").length,
                    backupOperatorCount: laneOperators.filter((operator) => operator.coverageStatus === "backup").length,
                    activeItemCount: laneItems.length,
                    urgentItemCount: urgentLaneItems.length,
                    unownedUrgentItemCount: urgentLaneItems.filter((item) => !item.assignee).length,
                    unavailableOwnerItemCount: laneUnavailableOwnerCount,
                    staleInProgressCount: laneStaleCount,
                    gapReason:
                        coveredOperators.length > 0 ? null : `No ${label.toLowerCase()} operator is currently marked available, focused, or backup.`,
                },
            ] as const;
        }),
    );

    const buildSuggestedAssignee = (item: CoverageItemInput) =>
        pickSuggestedAssignee({
            item,
            operatorMap,
        });

    const unownedUrgentItems = items
        .filter((item) => item.severity === "urgent" && !item.assignee)
        .map((item) =>
            buildAttentionItem({
                item,
                laneStatus: laneMap.get(item.domain)?.status ?? "covered",
                reason: "Urgent item has no active owner.",
                owner: null,
                suggestedAssignee: buildSuggestedAssignee(item),
                staleInProgress: staleItemKeys.has(item.itemKey),
            }),
        );

    const unavailableOwnerItems = unavailableOwnerItemsRaw.map((item) =>
        buildAttentionItem({
            item,
            laneStatus: laneMap.get(item.domain)?.status ?? "covered",
            reason: item.assignee?.active ? `${item.assignee.label} is marked away on this workspace.` : `${item.assignee?.label ?? "Current owner"} is no longer an active operator.`,
            owner: item.assignee?.active ? operatorMap.get(item.assignee.userId) ?? null : null,
            suggestedAssignee: buildSuggestedAssignee(item),
            staleInProgress: staleItemKeys.has(item.itemKey),
        }),
    );

    const staleInProgressItems = items
        .filter((item) => staleItemKeys.has(item.itemKey))
        .map((item) =>
            buildAttentionItem({
                item,
                laneStatus: laneMap.get(item.domain)?.status ?? "covered",
                reason: `In-progress item has gone ${policy.urgentOwnershipDriftHours}h without a coordination update.`,
                owner: item.assignee?.active ? operatorMap.get(item.assignee.userId) ?? null : null,
                suggestedAssignee: buildSuggestedAssignee(item),
                staleInProgress: true,
            }),
        );

    const overloadedOwnerItems = items
        .filter((item) => {
            if (!item.assignee?.active) {
                return false;
            }
            const operator = operatorMap.get(item.assignee.userId) ?? null;
            return operator?.capacityState === "overloaded";
        })
        .map((item) =>
            buildAttentionItem({
                item,
                laneStatus: laneMap.get(item.domain)?.status ?? "covered",
                reason: `${item.assignee?.label ?? "Current owner"} is above current capacity policy for this workspace.`,
                owner: item.assignee?.active ? operatorMap.get(item.assignee.userId) ?? null : null,
                suggestedAssignee: buildSuggestedAssignee(item),
                staleInProgress: staleItemKeys.has(item.itemKey),
            }),
        );

    const rebalanceCandidates = Array.from(
        new Map(
            [...unownedUrgentItems, ...unavailableOwnerItems, ...staleInProgressItems, ...overloadedOwnerItems].map((item) => [item.itemKey, item]),
        ).values(),
    );

    const lanes = DOMAIN_LABELS.map(({ domain }) => laneMap.get(domain)).filter(
        (lane): lane is CoverageSnapshot["lanes"][number] => Boolean(lane),
    );
    const overloadedOperatorCount = derivedOperators.filter((operator) => operator.capacityState === "overloaded").length;
    const undercoveredLaneCount = lanes.filter((lane) => lane?.status === "undercovered").length;
    const summaryReasons: string[] = [];

    if (unownedUrgentItems.length > 0) {
        summaryReasons.push(`${unownedUrgentItems.length} urgent item${unownedUrgentItems.length === 1 ? "" : "s"} have no owner.`);
    }
    if (unavailableOwnerItems.length > 0) {
        summaryReasons.push(`${unavailableOwnerItems.length} item${unavailableOwnerItems.length === 1 ? "" : "s"} are owned by unavailable operators.`);
    }
    if (undercoveredLaneCount > 0) {
        summaryReasons.push(`${undercoveredLaneCount} lane${undercoveredLaneCount === 1 ? "" : "s"} have no current effective coverage.`);
    }
    if (overloadedOperatorCount > 0) {
        summaryReasons.push(`${overloadedOperatorCount} operator${overloadedOperatorCount === 1 ? "" : "s"} are over capacity.`);
    }
    if (staleInProgressItems.length > 0) {
        summaryReasons.push(`${staleInProgressItems.length} in-progress item${staleInProgressItems.length === 1 ? "" : "s"} have gone stale.`);
    }

    const health: CoverageSnapshot["health"] =
        unownedUrgentItems.length > 0 || unavailableOwnerItems.length > 0 || undercoveredLaneCount > 0
            ? "undercovered"
            : overloadedOperatorCount > 0 || staleInProgressItems.length > 0
              ? "overloaded"
              : "stable";

    return {
        generatedAt: new Date(now).toISOString(),
        workspaceId,
        health,
        policy: {
            maxActiveItemsPerAvailableOperator: policy.maxActiveItemsPerAvailableOperator,
            maxUrgentItemsPerAvailableOperator: policy.maxUrgentItemsPerAvailableOperator,
            urgentOwnershipDriftHours: policy.urgentOwnershipDriftHours,
        },
        summary: {
            availableOperatorCount: derivedOperators.filter((operator) => operator.coverageStatus === "available").length,
            focusedOperatorCount: derivedOperators.filter((operator) => operator.coverageStatus === "focused").length,
            awayOperatorCount: derivedOperators.filter((operator) => operator.coverageStatus === "away").length,
            backupOperatorCount: derivedOperators.filter((operator) => operator.coverageStatus === "backup").length,
            overloadedOperatorCount,
            undercoveredLaneCount,
            unownedUrgentItemCount: unownedUrgentItems.length,
            unavailableOwnerItemCount: unavailableOwnerItems.length,
            staleInProgressCount: staleInProgressItems.length,
            rebalanceCandidateCount: rebalanceCandidates.length,
            reasons: summaryReasons.length > 0 ? summaryReasons : ["Coverage is aligned with current policy thresholds."],
        },
        operators: derivedOperators,
        lanes,
        unownedUrgentItems,
        unavailableOwnerItems,
        staleInProgressItems,
        rebalanceCandidates,
    };
}

export async function resolveCoverageOverlayRows(studioId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return [] as CoverageRow[];
    }

    return restSelect<CoverageRow[]>("studio_operator_coverage", {
        select:
            "studio_id,user_id,coverage_status,effective_until,note,covers_workspace,covers_billing,covers_team,covers_support,covers_projects,max_active_items_override,max_urgent_items_override,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "updated_at.desc",
            limit: "120",
        },
    });
}

export async function updateOperatorCoverageForSession({
    session,
    userId,
    mutation,
}: {
    session: AuthSession;
    userId: string;
    mutation: CoverageOperatorMutation;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const { studioId } = requireCoverageManager(session);
    const roster = await getTeamRosterForSession(session);
    const member = roster.members.find((entry) => entry.userId === userId && entry.status === "active") ?? null;
    if (!member) {
        throw new Error("Coverage can only be managed for active workspace operators.");
    }

    const currentRow = await resolveCoverageRow(studioId, userId);
    const currentDomains = rowToDomains(currentRow, member.role);

    if (mutation.action === "set") {
        const primaryDomains = mutation.primaryDomains ?? currentDomains;
        if (mutation.status === "away") {
            const { assertContinuityRequirementForAwayMutation } = await import("./continuity");
            await assertContinuityRequirementForAwayMutation({
                session,
                operatorUserId: userId,
                domains: primaryDomains,
            });
        }

        await upsertCoverageRow({
            studioId,
            userId,
            payload: {
                coverage_status: mutation.status,
                effective_until: mutation.effectiveUntil ?? currentRow?.effective_until ?? null,
                note: mutation.note?.trim() || null,
                ...domainsToColumns(primaryDomains),
                max_active_items_override:
                    mutation.maxActiveItemsOverride === undefined
                        ? currentRow?.max_active_items_override ?? null
                        : mutation.maxActiveItemsOverride,
                max_urgent_items_override:
                    mutation.maxUrgentItemsOverride === undefined
                        ? currentRow?.max_urgent_items_override ?? null
                        : mutation.maxUrgentItemsOverride,
            },
        });

        await logPlatformAuditEvent({
            actorUserId: session.user.userId,
            actorType: "user",
            studioId,
            targetType: "studio_operator_coverage",
            targetId: userId,
            eventType: "coverage.operator.updated",
            summary: `Updated coverage for ${member.displayName ?? member.email}.`,
            metadata: {
                status: mutation.status,
                primaryDomains,
                effectiveUntil: mutation.effectiveUntil ?? null,
                maxActiveItemsOverride: mutation.maxActiveItemsOverride ?? currentRow?.max_active_items_override ?? null,
                maxUrgentItemsOverride: mutation.maxUrgentItemsOverride ?? currentRow?.max_urgent_items_override ?? null,
            },
        });

        return;
    }

    if (mutation.action === "clear") {
        await upsertCoverageRow({
            studioId,
            userId,
            payload: {
                coverage_status: "available",
                effective_until: null,
                note: null,
                ...domainsToColumns(defaultPrimaryDomains(member.role)),
                max_active_items_override: null,
                max_urgent_items_override: null,
            },
        });

        await logPlatformAuditEvent({
            actorUserId: session.user.userId,
            actorType: "user",
            studioId,
            targetType: "studio_operator_coverage",
            targetId: userId,
            eventType: "coverage.operator.cleared",
            summary: `Cleared explicit coverage overrides for ${member.displayName ?? member.email}.`,
        });

        return;
    }

    await upsertCoverageRow({
        studioId,
        userId,
        payload: {
            coverage_status: currentRow?.coverage_status ?? "available",
            effective_until: new Date().toISOString(),
            note: currentRow?.note ?? null,
            ...domainsToColumns(currentDomains),
            max_active_items_override: currentRow?.max_active_items_override ?? null,
            max_urgent_items_override: currentRow?.max_urgent_items_override ?? null,
        },
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId,
        targetType: "studio_operator_coverage",
        targetId: userId,
        eventType: "coverage.operator.expired",
        summary: `Expired the temporary coverage state for ${member.displayName ?? member.email}.`,
    });
}
