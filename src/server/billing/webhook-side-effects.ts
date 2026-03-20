export async function settleStripeWebhookSideEffects({
    affectedStudioIds,
    syncStudioMutation,
}: {
    affectedStudioIds: string[];
    syncStudioMutation: (input: { studioId: string; actorUserId: null; actorType: "system" }) => Promise<unknown>;
}) {
    const uniqueStudioIds = Array.from(new Set(affectedStudioIds.filter((studioId) => studioId.trim().length > 0)));
    const settlements = await Promise.allSettled(
        uniqueStudioIds.map((studioId) =>
            syncStudioMutation({
                studioId,
                actorUserId: null,
                actorType: "system",
            }),
        ),
    );

    return {
        attemptedStudioIds: uniqueStudioIds,
        failedStudioIds: uniqueStudioIds.filter((_, index) => settlements[index]?.status === "rejected"),
    };
}
