import type { CoverageSnapshot, OperatorCoverageStatus } from "@/server/contracts/coverage";

export function describeCoverageStatus(status: OperatorCoverageStatus) {
    switch (status) {
        case "available":
            return "Ready for new ownership and normal queue flow.";
        case "focused":
            return "Protected for heads-down work. Still visible, but lower priority for new items.";
        case "away":
            return "Should not be carrying fresh ownership until the window expires or is cleared.";
        case "backup":
            return "Available as a reserve operator when the primary lane thins out.";
        default:
            return "Coverage state is set for this operator.";
    }
}

export function describeCoverageNarrative(coverage: CoverageSnapshot) {
    const firstGap = coverage.lanes.find((lane) => lane.status === "undercovered") ?? null;

    if (coverage.summary.unownedUrgentItemCount > 0) {
        return {
            title: "Urgent work is waiting without an owner",
            body:
                coverage.summary.unownedUrgentItemCount === 1
                    ? "The workspace is undercovered because one urgent coordination item is unowned right now."
                    : `The workspace is undercovered because ${coverage.summary.unownedUrgentItemCount} urgent coordination items are unowned right now.`,
            primaryLabel: "Open action center",
            primaryHref: "/app/dashboard#action-center",
            secondaryLabel: "Tune team coverage",
            secondaryHref: "/app/team",
        };
    }

    if (coverage.summary.unavailableOwnerItemCount > 0) {
        return {
            title: "Ownership is stuck behind unavailable operators",
            body:
                coverage.summary.unavailableOwnerItemCount === 1
                    ? "One active coordination item is still owned by an operator who is marked away or no longer active on this workspace."
                    : `${coverage.summary.unavailableOwnerItemCount} active coordination items are still owned by operators who are marked away or no longer active on this workspace.`,
            primaryLabel: "Rebalance ownership",
            primaryHref: "/app/dashboard#action-center",
            secondaryLabel: "Open team coverage",
            secondaryHref: "/app/team",
        };
    }

    if (coverage.summary.undercoveredLaneCount > 0) {
        return {
            title: firstGap ? `${firstGap.label} has no effective coverage` : "One or more lanes have no effective coverage",
            body: firstGap?.gapReason ?? "At least one operating lane has no available, focused, or backup operator mounted right now.",
            primaryLabel: "Open team coverage",
            primaryHref: "/app/team",
            secondaryLabel: "Review dashboard queue",
            secondaryHref: "/app/dashboard#action-center",
        };
    }

    if (coverage.summary.overloadedOperatorCount > 0) {
        return {
            title: "Load is concentrated on too few operators",
            body:
                coverage.summary.overloadedOperatorCount === 1
                    ? "One operator is above the current capacity policy and should be relieved before more urgent work lands."
                    : `${coverage.summary.overloadedOperatorCount} operators are above the current capacity policy and should be relieved before more urgent work lands.`,
            primaryLabel: "Review rebalance candidates",
            primaryHref: "/app/team",
            secondaryLabel: "Open action center",
            secondaryHref: "/app/dashboard#action-center",
        };
    }

    if (coverage.summary.staleInProgressCount > 0) {
        return {
            title: "In-progress work is drifting without updates",
            body:
                coverage.summary.staleInProgressCount === 1
                    ? `One in-progress item has exceeded the ${coverage.policy.urgentOwnershipDriftHours}h ownership-drift threshold.`
                    : `${coverage.summary.staleInProgressCount} in-progress items have exceeded the ${coverage.policy.urgentOwnershipDriftHours}h ownership-drift threshold.`,
            primaryLabel: "Open action center",
            primaryHref: "/app/dashboard#action-center",
            secondaryLabel: "Open team coverage",
            secondaryHref: "/app/team",
        };
    }

    return {
        title: "Coverage is stable",
        body: "Available operators, lane ownership, and current workload are aligned with the workspace policy right now.",
        primaryLabel: "Open team coverage",
        primaryHref: "/app/team",
        secondaryLabel: "Open action center",
        secondaryHref: "/app/dashboard#action-center",
    };
}
