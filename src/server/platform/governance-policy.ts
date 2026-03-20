import type { GovernancePolicy } from "@/server/contracts/governance";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect, restUpsert } from "@/server/db/rest";

interface GovernancePolicyRow {
    studio_id: string;
    stale_invite_hours: number;
    stale_support_hours: number;
    stale_project_hours: number;
    stale_handoff_hours: number;
    max_snooze_hours: number;
    max_active_items_per_available_operator: number;
    max_urgent_items_per_available_operator: number;
    urgent_ownership_drift_hours: number;
    require_admin_invite_approval: boolean;
    require_elevated_role_change_approval: boolean;
    require_sensitive_billing_approval: boolean;
    require_policy_change_approval: boolean;
    require_handoff_for_away_with_urgent_work: boolean;
}

export const defaultGovernancePolicy: GovernancePolicy = {
    staleInviteHours: 24 * 7,
    staleSupportHours: 24 * 3,
    staleProjectHours: 24 * 14,
    staleHandoffHours: 24,
    maxSnoozeHours: 24 * 7,
    maxActiveItemsPerAvailableOperator: 5,
    maxUrgentItemsPerAvailableOperator: 2,
    urgentOwnershipDriftHours: 6,
    requireAdminInviteApproval: true,
    requireElevatedRoleChangeApproval: true,
    requireSensitiveBillingApproval: false,
    requirePolicyChangeApproval: true,
    requireHandoffForAwayWithUrgentWork: true,
};

function mapPolicyRow(row: GovernancePolicyRow | null): GovernancePolicy {
    if (!row) {
        return defaultGovernancePolicy;
    }

    return {
        staleInviteHours: row.stale_invite_hours,
        staleSupportHours: row.stale_support_hours,
        staleProjectHours: row.stale_project_hours,
        staleHandoffHours: row.stale_handoff_hours,
        maxSnoozeHours: row.max_snooze_hours,
        maxActiveItemsPerAvailableOperator: row.max_active_items_per_available_operator,
        maxUrgentItemsPerAvailableOperator: row.max_urgent_items_per_available_operator,
        urgentOwnershipDriftHours: row.urgent_ownership_drift_hours,
        requireAdminInviteApproval: row.require_admin_invite_approval,
        requireElevatedRoleChangeApproval: row.require_elevated_role_change_approval,
        requireSensitiveBillingApproval: row.require_sensitive_billing_approval,
        requirePolicyChangeApproval: row.require_policy_change_approval,
        requireHandoffForAwayWithUrgentWork: row.require_handoff_for_away_with_urgent_work,
    };
}

function mapPolicyPayload(policy: GovernancePolicy) {
    return {
        stale_invite_hours: policy.staleInviteHours,
        stale_support_hours: policy.staleSupportHours,
        stale_project_hours: policy.staleProjectHours,
        stale_handoff_hours: policy.staleHandoffHours,
        max_snooze_hours: policy.maxSnoozeHours,
        max_active_items_per_available_operator: policy.maxActiveItemsPerAvailableOperator,
        max_urgent_items_per_available_operator: policy.maxUrgentItemsPerAvailableOperator,
        urgent_ownership_drift_hours: policy.urgentOwnershipDriftHours,
        require_admin_invite_approval: policy.requireAdminInviteApproval,
        require_elevated_role_change_approval: policy.requireElevatedRoleChangeApproval,
        require_sensitive_billing_approval: policy.requireSensitiveBillingApproval,
        require_policy_change_approval: policy.requirePolicyChangeApproval,
        require_handoff_for_away_with_urgent_work: policy.requireHandoffForAwayWithUrgentWork,
    };
}

export function mergeGovernancePolicy(current: GovernancePolicy, patch: Partial<GovernancePolicy>): GovernancePolicy {
    return {
        staleInviteHours: patch.staleInviteHours ?? current.staleInviteHours,
        staleSupportHours: patch.staleSupportHours ?? current.staleSupportHours,
        staleProjectHours: patch.staleProjectHours ?? current.staleProjectHours,
        staleHandoffHours: patch.staleHandoffHours ?? current.staleHandoffHours,
        maxSnoozeHours: patch.maxSnoozeHours ?? current.maxSnoozeHours,
        maxActiveItemsPerAvailableOperator:
            patch.maxActiveItemsPerAvailableOperator ?? current.maxActiveItemsPerAvailableOperator,
        maxUrgentItemsPerAvailableOperator:
            patch.maxUrgentItemsPerAvailableOperator ?? current.maxUrgentItemsPerAvailableOperator,
        urgentOwnershipDriftHours: patch.urgentOwnershipDriftHours ?? current.urgentOwnershipDriftHours,
        requireAdminInviteApproval: patch.requireAdminInviteApproval ?? current.requireAdminInviteApproval,
        requireElevatedRoleChangeApproval: patch.requireElevatedRoleChangeApproval ?? current.requireElevatedRoleChangeApproval,
        requireSensitiveBillingApproval: patch.requireSensitiveBillingApproval ?? current.requireSensitiveBillingApproval,
        requirePolicyChangeApproval: patch.requirePolicyChangeApproval ?? current.requirePolicyChangeApproval,
        requireHandoffForAwayWithUrgentWork:
            patch.requireHandoffForAwayWithUrgentWork ?? current.requireHandoffForAwayWithUrgentWork,
    };
}

export function isGovernancePolicyRelaxation(current: GovernancePolicy, next: GovernancePolicy) {
    return (
        next.staleInviteHours > current.staleInviteHours ||
        next.staleSupportHours > current.staleSupportHours ||
        next.staleProjectHours > current.staleProjectHours ||
        next.staleHandoffHours > current.staleHandoffHours ||
        next.maxSnoozeHours > current.maxSnoozeHours ||
        next.maxActiveItemsPerAvailableOperator > current.maxActiveItemsPerAvailableOperator ||
        next.maxUrgentItemsPerAvailableOperator > current.maxUrgentItemsPerAvailableOperator ||
        next.urgentOwnershipDriftHours > current.urgentOwnershipDriftHours ||
        (!next.requireAdminInviteApproval && current.requireAdminInviteApproval) ||
        (!next.requireElevatedRoleChangeApproval && current.requireElevatedRoleChangeApproval) ||
        (!next.requireSensitiveBillingApproval && current.requireSensitiveBillingApproval) ||
        (!next.requirePolicyChangeApproval && current.requirePolicyChangeApproval) ||
        (!next.requireHandoffForAwayWithUrgentWork && current.requireHandoffForAwayWithUrgentWork)
    );
}

export function isGovernancePolicyWeakerThanBaseline(policy: GovernancePolicy) {
    return isGovernancePolicyRelaxation(defaultGovernancePolicy, policy);
}

export function describeGovernancePolicyRelaxation(current: GovernancePolicy, next: GovernancePolicy) {
    const changes: string[] = [];

    if (next.staleInviteHours > current.staleInviteHours) {
        changes.push(`stale invite threshold to ${Math.round(next.staleInviteHours / 24)}d`);
    }
    if (next.staleSupportHours > current.staleSupportHours) {
        changes.push(`stale support threshold to ${Math.round(next.staleSupportHours / 24)}d`);
    }
    if (next.staleProjectHours > current.staleProjectHours) {
        changes.push(`stale project threshold to ${Math.round(next.staleProjectHours / 24)}d`);
    }
    if (next.staleHandoffHours > current.staleHandoffHours) {
        changes.push(`stale handoff threshold to ${next.staleHandoffHours}h`);
    }
    if (next.maxSnoozeHours > current.maxSnoozeHours) {
        changes.push(`max snooze window to ${Math.round(next.maxSnoozeHours / 24)}d`);
    }
    if (next.maxActiveItemsPerAvailableOperator > current.maxActiveItemsPerAvailableOperator) {
        changes.push(`max active load per operator to ${next.maxActiveItemsPerAvailableOperator}`);
    }
    if (next.maxUrgentItemsPerAvailableOperator > current.maxUrgentItemsPerAvailableOperator) {
        changes.push(`max urgent load per operator to ${next.maxUrgentItemsPerAvailableOperator}`);
    }
    if (next.urgentOwnershipDriftHours > current.urgentOwnershipDriftHours) {
        changes.push(`urgent ownership drift threshold to ${next.urgentOwnershipDriftHours}h`);
    }
    if (!next.requireAdminInviteApproval && current.requireAdminInviteApproval) {
        changes.push("disable admin invite approval");
    }
    if (!next.requireElevatedRoleChangeApproval && current.requireElevatedRoleChangeApproval) {
        changes.push("disable elevated role approval");
    }
    if (!next.requireSensitiveBillingApproval && current.requireSensitiveBillingApproval) {
        changes.push("disable billing action approval");
    }
    if (!next.requirePolicyChangeApproval && current.requirePolicyChangeApproval) {
        changes.push("disable policy change approval");
    }
    if (!next.requireHandoffForAwayWithUrgentWork && current.requireHandoffForAwayWithUrgentWork) {
        changes.push("disable away-with-urgent-work handoff requirement");
    }

    return changes;
}

export async function getEffectiveGovernancePolicyForStudio(studioId: string | null): Promise<GovernancePolicy> {
    if (!isPlatformDatabaseConfigured() || !studioId) {
        return defaultGovernancePolicy;
    }

    const rows = await restSelect<GovernancePolicyRow[]>("studio_governance_policies", {
        select:
            "studio_id,stale_invite_hours,stale_support_hours,stale_project_hours,stale_handoff_hours,max_snooze_hours,max_active_items_per_available_operator,max_urgent_items_per_available_operator,urgent_ownership_drift_hours,require_admin_invite_approval,require_elevated_role_change_approval,require_sensitive_billing_approval,require_policy_change_approval,require_handoff_for_away_with_urgent_work",
        filters: {
            studio_id: `eq.${studioId}`,
            limit: "1",
        },
    });

    return mapPolicyRow(rows[0] ?? null);
}

export async function persistGovernancePolicyForStudio(studioId: string, policy: GovernancePolicy) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    await restUpsert(
        "studio_governance_policies",
        {
            studio_id: studioId,
            ...mapPolicyPayload(policy),
        },
        {
            onConflict: "studio_id",
        },
    );
}
