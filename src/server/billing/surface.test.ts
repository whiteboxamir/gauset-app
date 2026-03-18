import assert from "node:assert/strict";
import test from "node:test";

import type { BillingSurfacePlanLike } from "./surface.ts";
import { deriveMvpAccessPosture, mergeBillingSurfacePlans } from "./surface.ts";

test("mergeBillingSurfacePlans keeps the invite-only design partner plan visible and de-duplicates by code", () => {
    const plans = mergeBillingSurfacePlans<BillingSurfacePlanLike>(
        [
            {
                code: "studio_yearly",
                name: "Studio Yearly",
                billingProvider: "stripe",
                interval: "year",
                isDesignPartner: false,
                priceCents: 238800,
            },
            {
                code: "studio_monthly",
                name: "Studio Monthly",
                billingProvider: "stripe",
                interval: "month",
                isDesignPartner: false,
                priceCents: 24900,
            },
        ] satisfies BillingSurfacePlanLike[],
        [
            {
                code: "design_partner_beta",
                name: "Design Partner Beta",
                billingProvider: "manual",
                interval: "custom",
                isDesignPartner: true,
                priceCents: 0,
            },
            {
                code: "studio_monthly",
                name: "Studio Monthly",
                billingProvider: "stripe",
                interval: "month",
                isDesignPartner: false,
                priceCents: 24900,
            },
        ] satisfies BillingSurfacePlanLike[],
    );

    assert.deepEqual(
        plans.map((plan) => plan.code),
        ["design_partner_beta", "studio_monthly", "studio_yearly"],
    );
});

test("deriveMvpAccessPosture reports override access distinctly from plan-backed access", () => {
    const overrideAccess = deriveMvpAccessPosture({
        gateEnabled: true,
        anonymousAllowed: false,
        effectiveAccess: true,
        planAccess: false,
    });
    assert.equal(overrideAccess.label, "Granted by override");

    const blockedAccess = deriveMvpAccessPosture({
        gateEnabled: true,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });
    assert.equal(blockedAccess.label, "Billing action required");
});

test("deriveMvpAccessPosture reports bypassed environments truthfully", () => {
    const bypassed = deriveMvpAccessPosture({
        gateEnabled: false,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });

    assert.equal(bypassed.label, "Gate bypassed");
    assert.match(bypassed.description, /informative rather than blocking/i);
});

test("deriveMvpAccessPosture reports misconfigured gate rollouts distinctly", () => {
    const misconfigured = deriveMvpAccessPosture({
        gateEnabled: false,
        misconfigured: true,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });

    assert.equal(misconfigured.label, "Gate misconfigured");
    assert.match(misconfigured.description, /fail closed/i);
});
