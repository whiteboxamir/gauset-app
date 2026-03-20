import { expect, test } from "@playwright/test";

import { ensureSeededOwnerBaseline, establishOwnerPlatformSession } from "./support/auth";
import { canRunAuthenticatedPlatformE2E, getAuthenticatedPlatformE2EBlocker } from "./support/env";

const expectMvpGate = (() => {
    const raw = (process.env.GAUSET_PLATFORM_EXPECT_MVP_GATE ?? "").trim().toLowerCase();
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
})();

test("handles anonymous /mvp access on the deployed stack", async ({ page }) => {
    const response = await page.goto("/mvp", { waitUntil: "domcontentloaded" });
    const gated = await page
        .waitForURL(/\/auth\/login\?next=%2Fmvp/, {
            timeout: 3_000,
        })
        .then(() => true)
        .catch(() => false);
    expect(page.url()).not.toContain("/app/billing?checkout=required");
    if (expectMvpGate !== null) {
        expect(gated, `Expected GAUSET_PLATFORM_EXPECT_MVP_GATE=${expectMvpGate ? "1" : "0"}.`).toBe(expectMvpGate);
    }

    if (gated) {
        await expect(page).toHaveURL(/\/auth\/login\?next=%2Fmvp/);
        await expect(page.getByRole("heading", { name: "Log in to Gauset" })).toBeVisible();
        return;
    }

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/mvp(?:$|[?#])/);
    expect(page.url()).not.toContain("/auth/login");
});

test.describe("entitled /mvp access", () => {
    test.skip(!canRunAuthenticatedPlatformE2E(), getAuthenticatedPlatformE2EBlocker());

    test("allows the seeded entitled owner through /mvp", async ({ context, page }) => {
        await establishOwnerPlatformSession(context);
        await ensureSeededOwnerBaseline(context);

        const response = await page.goto("/mvp", { waitUntil: "domcontentloaded" });
        expect(response?.ok()).toBeTruthy();
        await expect(page).toHaveURL(/\/mvp(?:$|[?#])/);
        expect(page.url()).not.toContain("/app/billing?checkout=required");
    });
});
