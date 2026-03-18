import { expect, test } from "@playwright/test";

import { ensureSeededOwnerBaseline, establishOwnerPlatformSession, revokeOtherPlatformSessions } from "./support/auth";
import { canRunAuthenticatedPlatformE2E, getAuthenticatedPlatformE2EBlocker, platformE2EEnv } from "./support/env";
import { billingPortalButton, securityRevokeOthersButton, teamInviteEmailInput, teamInviteRoleSelect, teamInviteSubmit } from "./support/selectors";

test.describe("authenticated platform certification", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(!canRunAuthenticatedPlatformE2E(), getAuthenticatedPlatformE2EBlocker());

    test("renders authenticated billing, team, and security shells", async ({ context, page }) => {
        await establishOwnerPlatformSession(context);
        await ensureSeededOwnerBaseline(context);

        await page.goto("/app/team", { waitUntil: "domcontentloaded" });
        await expect(page.getByText("Expand the workspace cleanly")).toBeVisible();
        await expect(page.getByText("Studio roster")).toBeVisible();

        await page.goto("/app/billing", { waitUntil: "domcontentloaded" });
        await expect(page.getByText("Design-partner billing")).toBeVisible();
        await expect(billingPortalButton(page)).toBeVisible();

        await page.goto("/app/settings/security", { waitUntil: "domcontentloaded" });
        await expect(page.getByText("Current device and other active sessions")).toBeVisible();
        await expect(securityRevokeOthersButton(page)).toBeVisible();
    });

    test("certifies billing APIs and team invitation lifecycle", async ({ context, page }) => {
        await establishOwnerPlatformSession(context);
        const baseline = await ensureSeededOwnerBaseline(context);
        const currentPlanCode = baseline.billing?.plan?.code ?? platformE2EEnv.planCode;
        const checkoutPlanCode = currentPlanCode === "studio_monthly" ? "studio_yearly" : "studio_monthly";

        const portalResponse = await context.request.post(`${platformE2EEnv.baseUrl}/api/billing/portal`, {
            data: {},
        });
        const portalPayload = (await portalResponse.json()) as { id?: string; url?: string; message?: string };
        expect(portalResponse.ok(), portalPayload.message || "Billing portal route failed.").toBeTruthy();
        expect(portalPayload.url, "Billing portal route should return a Stripe portal URL.").toContain("billing.stripe.com");

        const checkoutResponse = await context.request.post(`${platformE2EEnv.baseUrl}/api/billing/checkout`, {
            data: {
                planCode: checkoutPlanCode,
            },
        });
        const checkoutPayload = (await checkoutResponse.json()) as {
            approvalRequired?: boolean;
            url?: string;
            message?: string;
        };
        expect(checkoutResponse.ok(), checkoutPayload.message || "Checkout route failed.").toBeTruthy();
        expect(
            Boolean(checkoutPayload.approvalRequired) || typeof checkoutPayload.url === "string",
            "Checkout should either queue approval or return a Stripe checkout URL.",
        ).toBe(true);

        const inviteEmail = `platform-cert-${Date.now()}@example.com`;
        await page.goto("/app/team", { waitUntil: "domcontentloaded" });
        await teamInviteEmailInput(page).fill(inviteEmail);
        await teamInviteRoleSelect(page).selectOption("member");
        await expect(teamInviteSubmit(page)).toBeEnabled();
        const inviteResponsePromise = page.waitForResponse(
            (response) => response.url().includes("/api/team/invitations") && response.request().method() === "POST",
        );
        await teamInviteSubmit(page).click();
        const inviteResponse = await inviteResponsePromise;
        const invitePayload = (await inviteResponse.json()) as {
            success?: boolean;
            message?: string;
        };
        expect(inviteResponse.ok(), invitePayload.message || "Invite creation failed.").toBeTruthy();
        expect(invitePayload.success).toBe(true);

        await expect(
            page.getByTestId("team-invite-message").or(page.getByText(inviteEmail)),
        ).toBeVisible();
        await expect(page.getByText(inviteEmail)).toBeVisible();

        const inviteCard = page.locator("article").filter({ hasText: inviteEmail }).last();
        await inviteCard.getByRole("button", { name: "Revoke" }).click();
        await expect(page.getByText(`Invitation revoked for ${inviteEmail}.`)).toBeVisible();
    });

    test("revokes a secondary tracked platform session", async ({ browser, context, page }) => {
        await establishOwnerPlatformSession(context);
        await ensureSeededOwnerBaseline(context);
        await revokeOtherPlatformSessions(context);

        const otherContext = await browser.newContext({
            baseURL: platformE2EEnv.baseUrl,
            ignoreHTTPSErrors: true,
        });

        try {
            await establishOwnerPlatformSession(otherContext);

            await page.goto("/app/settings/security", { waitUntil: "domcontentloaded" });
            await page.reload({ waitUntil: "domcontentloaded" });
            await expect(page.getByText("1 other active")).toBeVisible();

            await securityRevokeOthersButton(page).click();
            await expect(page.getByText("Revoked 1 other tracked session.")).toBeVisible();

            const otherSessionResponse = await otherContext.request.get(`${platformE2EEnv.baseUrl}/api/auth/session`);
            const otherSessionPayload = (await otherSessionResponse.json()) as { session?: unknown };
            expect(otherSessionPayload.session).toBeNull();
        } finally {
            await otherContext.close();
        }
    });
});
