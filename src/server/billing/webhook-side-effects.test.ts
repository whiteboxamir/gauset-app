import assert from "node:assert/strict";
import test from "node:test";

import { settleStripeWebhookSideEffects } from "./webhook-side-effects.ts";

test("settleStripeWebhookSideEffects deduplicates studios and reports failed syncs without throwing", async () => {
    const seen: string[] = [];
    const result = await settleStripeWebhookSideEffects({
        affectedStudioIds: ["studio_a", "studio_b", "studio_a"],
        syncStudioMutation: async ({ studioId }) => {
            seen.push(studioId);
            if (studioId === "studio_b") {
                throw new Error("notification sync unavailable");
            }
        },
    });

    assert.deepEqual(seen, ["studio_a", "studio_b"]);
    assert.deepEqual(result.attemptedStudioIds, ["studio_a", "studio_b"]);
    assert.deepEqual(result.failedStudioIds, ["studio_b"]);
});

test("settleStripeWebhookSideEffects handles empty fanout sets", async () => {
    const result = await settleStripeWebhookSideEffects({
        affectedStudioIds: [],
        syncStudioMutation: async () => null,
    });

    assert.deepEqual(result.attemptedStudioIds, []);
    assert.deepEqual(result.failedStudioIds, []);
});
