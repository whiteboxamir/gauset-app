import type { CoverageHealth, OperatorCapacityState, OperatorCoverageStatus } from "@/server/contracts/coverage";
import type { CoordinationOperator, CoordinatedOperationalItem } from "@/server/contracts/coordination";

export function getCoverageHealthTone(health: CoverageHealth) {
    switch (health) {
        case "undercovered":
            return "warning";
        case "overloaded":
            return "danger";
        default:
            return "success";
    }
}

export function getCoverageStatusTone(status: OperatorCoverageStatus) {
    switch (status) {
        case "available":
            return "success";
        case "focused":
            return "info";
        case "away":
            return "warning";
        case "backup":
            return "neutral";
        default:
            return "neutral";
    }
}

export function getCapacityTone(state: OperatorCapacityState) {
    switch (state) {
        case "overloaded":
            return "danger";
        case "limited":
            return "warning";
        case "unavailable":
            return "warning";
        default:
            return "neutral";
    }
}

export function describeProjectedLoad({
    operator,
    item,
    currentOwnerUserId,
    nextOwnerUserId,
}: {
    operator: CoordinationOperator;
    item: Pick<CoordinatedOperationalItem, "severity">;
    currentOwnerUserId: string | null;
    nextOwnerUserId: string | null;
}) {
    let activeDelta = 0;
    let urgentDelta = 0;

    if (nextOwnerUserId && operator.userId === nextOwnerUserId && nextOwnerUserId !== currentOwnerUserId) {
        activeDelta += 1;
        if (item.severity === "urgent") {
            urgentDelta += 1;
        }
    }

    if (currentOwnerUserId && operator.userId === currentOwnerUserId && currentOwnerUserId !== nextOwnerUserId) {
        activeDelta -= 1;
        if (item.severity === "urgent") {
            urgentDelta -= 1;
        }
    }

    return {
        nextActive: operator.activeAssignmentCount + activeDelta,
        nextUrgent: operator.urgentAssignmentCount + urgentDelta,
    };
}
