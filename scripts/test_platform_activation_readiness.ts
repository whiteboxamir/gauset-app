import assert from "node:assert/strict";

import { getPlatformActivationReadiness } from "../src/server/platform/activation-readiness.ts";

const emptySnapshot = await getPlatformActivationReadiness({
    env: {},
});

assert.equal(emptySnapshot.status, "blocked");
assert.equal(emptySnapshot.activationStatus, "blocked");
assert.equal(emptySnapshot.auth.status, "blocked");
assert.match(emptySnapshot.auth.summary, /Supabase auth cannot issue or validate sessions/i);
assert.equal(emptySnapshot.database.status, "blocked");
assert.equal(emptySnapshot.billing.status, "blocked");
assert.equal(emptySnapshot.integration.status, "blocked");
assert.equal(emptySnapshot.rollout.status, "blocked");
assert.match(emptySnapshot.actions.join(" "), /GAUSET_ENABLE_PLATFORM_MVP_GATE disabled/i);
assert.equal(
    emptySnapshot.capabilities.find((capability) => capability.capability === "auth")?.classification,
    "implemented_but_not_operational",
);
assert.equal(
    emptySnapshot.capabilities.find((capability) => capability.capability === "staging_and_platform_activation")?.classification,
    "regression_risk_area",
);

const directUrlOnlySnapshot = await getPlatformActivationReadiness({
    env: {
        DATABASE_URL: "postgres://app:secret@db.example.com:5432/gauset",
        PLATFORM_ADMIN_DATABASE_URL: "postgres://admin:secret@db.example.com:5432/gauset",
    },
});

assert.equal(directUrlOnlySnapshot.database.status, "blocked");
assert.match(directUrlOnlySnapshot.database.warnings.join(" "), /Supabase REST/i);

const partialSnapshot = await getPlatformActivationReadiness({
    env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
    },
});

assert.equal(partialSnapshot.auth.status, "ready");
assert.equal(partialSnapshot.database.status, "ready");
assert.equal(partialSnapshot.billing.status, "blocked");
assert.equal(partialSnapshot.integration.status, "blocked");
assert.equal(partialSnapshot.rollout.status, "blocked");

const readySnapshot = await getPlatformActivationReadiness({
    env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
    },
});

assert.equal(readySnapshot.status, "ready");
assert.equal(readySnapshot.activationStatus, "partial");
assert.equal(readySnapshot.auth.status, "ready");
assert.equal(readySnapshot.database.status, "ready");
assert.equal(readySnapshot.billing.status, "ready");
assert.equal(readySnapshot.integration.status, "ready");
assert.equal(readySnapshot.migrations.status, "ready");
assert.equal(readySnapshot.rollout.status, "partial");
assert.match(readySnapshot.rollout.summary, /gate is intentionally still off pending a live-cert thread/i);
assert.equal(
    readySnapshot.capabilities.find((capability) => capability.capability === "entitlements_and_gated_mvp_access")?.classification,
    "intentionally_unavailable",
);
assert.equal(
    readySnapshot.capabilities.find((capability) => capability.capability === "billing")?.classification,
    "implemented_and_verified",
);

console.log("Platform activation readiness checks passed.");
