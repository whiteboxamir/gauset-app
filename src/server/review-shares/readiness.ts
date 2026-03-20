import type { ReviewShareReadiness, ReviewShareTruthSummary } from "@/server/contracts/review-shares";

function humanizeToken(value: string) {
    return value.replaceAll("_", " ").trim();
}

function joinHumanizedTokens(values: string[]) {
    const labels = values.map(humanizeToken);
    if (labels.length <= 1) {
        return labels[0] ?? "";
    }
    if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
    }
    return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function createBlockedReadiness({
    sceneId,
    versionId,
    summary,
    detail,
    truthSummary = null,
}: {
    sceneId: string;
    versionId: string;
    summary: string;
    detail: string;
    truthSummary?: ReviewShareTruthSummary | null;
}): ReviewShareReadiness {
    return {
        state: "blocked",
        canCreate: false,
        sceneId,
        versionId,
        summary,
        detail,
        blockers: truthSummary?.blockers ?? [],
        truthSummary,
    };
}

export function deriveReviewShareReadiness({
    sceneId,
    versionId,
    versionResolved,
    truthSummary,
}: {
    sceneId: string;
    versionId: string;
    versionResolved: boolean;
    truthSummary?: ReviewShareTruthSummary | null;
}): ReviewShareReadiness {
    if (!versionResolved) {
        return createBlockedReadiness({
            sceneId,
            versionId,
            summary: "Saved version is unavailable.",
            detail: "Secure review links stay blocked until this version exists in MVP history and the backend can load it.",
            truthSummary,
        });
    }

    if (!truthSummary) {
        return {
            state: "review_only",
            canCreate: true,
            sceneId,
            versionId,
            summary: "Version is locked, but share truth is incomplete.",
            detail: "This review link will stay pinned to the saved version, but lane and downstream handoff posture could not be derived from the saved payload.",
            blockers: [],
            truthSummary: null,
        };
    }

    const blockers = truthSummary.blockers ?? [];
    const deliveryStatus = truthSummary.deliveryStatus ?? null;
    const hasReviewOnlyPosture =
        blockers.length > 0 || deliveryStatus === "blocked" || deliveryStatus === "preview_only";

    if (hasReviewOnlyPosture) {
        const blockerSummary =
            blockers.length > 0
                ? `Downstream handoff is still blocked by ${joinHumanizedTokens(blockers)}.`
                : deliveryStatus === "preview_only"
                  ? "This saved world is still a preview-only output, not a production-ready handoff."
                  : "This saved world has not cleared its downstream delivery posture yet.";

        return {
            state: "review_only",
            canCreate: true,
            sceneId,
            versionId,
            summary: "Share is safe for review, not downstream handoff.",
            detail: blockerSummary,
            blockers,
            truthSummary,
        };
    }

    return {
        state: "ready",
        canCreate: true,
        sceneId,
        versionId,
        summary: "Version is locked and ready for secure review sharing.",
        detail:
            deliveryStatus === "ready_for_downstream"
                ? "Saved truth currently clears downstream delivery posture as well as secure review sharing."
                : "Saved truth supports serious version-locked review without active handoff blockers.",
        blockers,
        truthSummary,
    };
}
