import type { ReleaseReadinessState } from "@/server/contracts/release-readiness";

export function getReleaseReadinessTone(state: ReleaseReadinessState) {
    switch (state) {
        case "ready":
            return "success" as const;
        case "at_risk":
            return "warning" as const;
        case "blocked":
            return "danger" as const;
        default:
            return "neutral" as const;
    }
}

export function formatReleaseReadinessLabel(state: ReleaseReadinessState) {
    switch (state) {
        case "ready":
            return "Ready";
        case "at_risk":
            return "At Risk";
        case "blocked":
            return "Blocked";
        default:
            return state;
    }
}

export function compareReleaseReadinessStates(left: ReleaseReadinessState, right: ReleaseReadinessState) {
    const rank = {
        blocked: 0,
        at_risk: 1,
        ready: 2,
    } as const;

    return rank[left] - rank[right];
}
