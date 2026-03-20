export type ContinuityCoreHealth = "stable" | "drifting" | "critical";
export type ContinuityCoreDomain = "workspace" | "billing" | "team" | "support" | "projects";

export interface ContinuityLaneInput {
    domain: ContinuityCoreDomain;
    summary: string | null;
    activeRisks: string[];
    nextActions: string[];
    reviewByAt: string | null;
    primaryOperatorLabel: string | null;
    backupOperatorLabel: string | null;
    policyStaleHandoffHours: number;
    requiredForUrgentAway: boolean;
    hasUrgentWork: boolean;
    primaryOperatorAwayWithUrgentWork: boolean;
    realisticCoverageMatch: boolean;
    now: number;
}

export interface ContinuityLaneEvaluation {
    health: ContinuityCoreHealth;
    stale: boolean;
    required: boolean;
    reasons: string[];
}

export interface ContinuityAwayMutationRequirementInput {
    requireHandoffForUrgentAway: boolean;
    coveredDomains: ContinuityCoreDomain[];
    urgentOwnedDomains: ContinuityCoreDomain[];
    handoffs: Array<{
        domain: ContinuityCoreDomain;
        summary: string | null;
    }>;
}

export function deriveImplicitReviewByAt({
    reviewByAt,
    updatedAt,
    staleHandoffHours,
}: {
    reviewByAt: string | null;
    updatedAt: string | null;
    staleHandoffHours: number;
}) {
    if (reviewByAt) {
        return reviewByAt;
    }

    if (!updatedAt) {
        return null;
    }

    const updatedAtTimestamp = Date.parse(updatedAt);
    if (Number.isNaN(updatedAtTimestamp)) {
        return null;
    }

    return new Date(updatedAtTimestamp + staleHandoffHours * 60 * 60 * 1000).toISOString();
}

export function deriveLaneContinuityEvaluation(input: ContinuityLaneInput): ContinuityLaneEvaluation {
    const reasons: string[] = [];
    const reviewByTimestamp = input.reviewByAt ? Date.parse(input.reviewByAt) : Number.NaN;
    const stale =
        (input.reviewByAt && !Number.isNaN(reviewByTimestamp) && reviewByTimestamp <= input.now) ||
        (!input.reviewByAt && Boolean(input.summary) && input.activeRisks.length + input.nextActions.length > 0);

    if (!input.summary?.trim()) {
        reasons.push("No handoff summary recorded.");
    }
    if (!input.primaryOperatorLabel) {
        reasons.push("Primary operator is missing.");
    }
    if (!input.backupOperatorLabel) {
        reasons.push("Backup operator is missing.");
    }
    if (stale) {
        reasons.push("The handoff review window is stale.");
    }
    if (!input.realisticCoverageMatch) {
        reasons.push("Documented ownership no longer matches realistic lane coverage.");
    }
    if (input.requiredForUrgentAway && input.hasUrgentWork && !input.summary?.trim()) {
        reasons.push("Urgent work requires a handoff before the lane can safely go away.");
    }
    if (input.primaryOperatorAwayWithUrgentWork) {
        reasons.push("Urgent work is still attached to an away operator.");
    }

    const health: ContinuityCoreHealth =
        input.primaryOperatorAwayWithUrgentWork || (!input.realisticCoverageMatch && input.hasUrgentWork) || (input.requiredForUrgentAway && input.hasUrgentWork && !input.summary?.trim())
            ? "critical"
            : reasons.length > 0
              ? "drifting"
              : "stable";

    return {
        health,
        stale,
        required: input.requiredForUrgentAway && input.hasUrgentWork,
        reasons,
    };
}

export function findMissingContinuityHandoffDomainsForAwayMutation(
    input: ContinuityAwayMutationRequirementInput,
): ContinuityCoreDomain[] {
    if (!input.requireHandoffForUrgentAway) {
        return [];
    }

    return Array.from(
        new Set(
            input.urgentOwnedDomains
                .filter((domain) => input.coveredDomains.includes(domain))
                .filter((domain) => {
                    const handoff = input.handoffs.find((entry) => entry.domain === domain) ?? null;
                    return !handoff?.summary?.trim();
                }),
        ),
    );
}

export function deriveContinuityHealthSummary(evaluations: ContinuityLaneEvaluation[]) {
    const staleHandoffCount = evaluations.filter((entry) => entry.stale).length;
    const missingHandoffCount = evaluations.filter((entry) => entry.reasons.some((reason) => reason === "No handoff summary recorded.")).length;
    const awayWithUrgentWorkCount = evaluations.filter((entry) => entry.reasons.some((reason) => reason === "Urgent work is still attached to an away operator.")).length;
    const mismatchedCoverageCount = evaluations.filter((entry) =>
        entry.reasons.some((reason) => reason === "Documented ownership no longer matches realistic lane coverage."),
    ).length;
    const criticalLaneCount = evaluations.filter((entry) => entry.health === "critical").length;

    const reasons = Array.from(
        new Set(
            evaluations.flatMap((entry) => {
                if (entry.health === "critical") {
                    return entry.reasons;
                }
                return entry.reasons.slice(0, 1);
            }),
        ),
    );

    const health: ContinuityCoreHealth =
        criticalLaneCount > 0 ? "critical" : staleHandoffCount > 0 || missingHandoffCount > 0 || mismatchedCoverageCount > 0 ? "drifting" : "stable";

    return {
        health,
        reasons,
        summary: {
            staleHandoffCount,
            missingHandoffCount,
            awayWithUrgentWorkCount,
            mismatchedCoverageCount,
            criticalLaneCount,
        },
    };
}
