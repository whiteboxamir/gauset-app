export type BillingSurfaceTone = "success" | "warning" | "info" | "neutral";

export interface BillingSurfacePlanLike {
    code: string;
    name: string;
    billingProvider: "stripe" | "manual";
    interval: "month" | "year" | "custom";
    isDesignPartner: boolean;
    priceCents: number;
}

export interface MvpAccessPosture {
    label: string;
    tone: BillingSurfaceTone;
    description: string;
}

function planRank(plan: BillingSurfacePlanLike) {
    if (plan.isDesignPartner) return 0;
    if (plan.billingProvider === "manual") return 1;
    if (plan.interval === "month") return 2;
    if (plan.interval === "year") return 3;
    return 4;
}

export function mergeBillingSurfacePlans<T extends BillingSurfacePlanLike>(
    basePlans: T[],
    extraPlans: Array<T | null | undefined> = [],
) {
    const merged = new Map<string, T>();
    for (const plan of [...basePlans, ...extraPlans]) {
        if (!plan?.code) continue;
        merged.set(plan.code, plan);
    }

    return Array.from(merged.values()).sort((left, right) => {
        const rankDelta = planRank(left) - planRank(right);
        if (rankDelta !== 0) {
            return rankDelta;
        }
        if (left.priceCents !== right.priceCents) {
            return left.priceCents - right.priceCents;
        }
        return left.name.localeCompare(right.name);
    });
}

export function deriveMvpAccessPosture({
    gateEnabled,
    misconfigured = false,
    anonymousAllowed,
    effectiveAccess,
    planAccess,
}: {
    gateEnabled: boolean;
    misconfigured?: boolean;
    anonymousAllowed: boolean;
    effectiveAccess: boolean;
    planAccess: boolean;
}): MvpAccessPosture {
    if (misconfigured) {
        return {
            label: "Gate misconfigured",
            tone: "warning",
            description:
                "The MVP billing gate was explicitly enabled before auth, database, and billing prerequisites were all operational, so access should fail closed until the rollout is fixed.",
        };
    }

    if (!gateEnabled) {
        return {
            label: "Gate bypassed",
            tone: "neutral",
            description: "The MVP billing gate is off in this environment, so billing status is informative rather than blocking.",
        };
    }

    if (anonymousAllowed) {
        return {
            label: "Anonymous MVP enabled",
            tone: "info",
            description: "The MVP gate is on, but anonymous entry is currently allowed, so billing does not block access.",
        };
    }

    if (effectiveAccess && planAccess) {
        return {
            label: "Granted by plan",
            tone: "success",
            description: "The recorded billing plan currently grants MVP access to this workspace.",
        };
    }

    if (effectiveAccess && !planAccess) {
        return {
            label: "Granted by override",
            tone: "info",
            description: "Runtime access is currently open through an override or admin path, not the recorded billing plan alone.",
        };
    }

    if (!effectiveAccess && planAccess) {
        return {
            label: "Plan includes access",
            tone: "warning",
            description: "The plan includes MVP access, but the current runtime gate is not passing this session yet.",
        };
    }

    return {
        label: "Billing action required",
        tone: "warning",
        description: "This session does not currently satisfy the MVP billing gate.",
    };
}
