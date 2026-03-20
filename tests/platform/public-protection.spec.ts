import { expect, test } from "@playwright/test";

import { platformE2EEnv } from "./support/env";

test("redirects anonymous platform page access to login", async ({ page }) => {
    const protectedRoutes = ["/app/team", "/app/billing", "/app/settings/security"];

    for (const route of protectedRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForURL((url) => url.toString().includes(`/auth/login?next=${encodeURIComponent(route)}`));
        await expect(page.getByRole("heading", { name: "Log in to Gauset" })).toBeVisible();
    }
});

test("rejects anonymous platform APIs with 401", async ({ request }) => {
    const protectedApis = ["/api/billing/summary", "/api/team/roster", "/api/account/security/sessions"];

    for (const route of protectedApis) {
        const response = await request.get(`${platformE2EEnv.baseUrl}${route}`);
        expect(response.status(), `${route} should reject anonymous access.`).toBe(401);
    }
});

test("rejects anonymous platform write actions with 401", async ({ request }) => {
    const protectedWrites = [
        {
            method: "POST",
            route: "/api/billing/portal",
            data: {},
        },
        {
            method: "POST",
            route: "/api/billing/checkout",
            data: {
                planCode: "studio_monthly",
            },
        },
        {
            method: "POST",
            route: "/api/team/invitations",
            data: {
                email: "anon-platform-cert@example.com",
                role: "member",
            },
        },
        {
            method: "PATCH",
            route: "/api/team/invitations",
            data: {
                invitationId: "00000000-0000-0000-0000-000000000000",
                action: "revoke",
            },
        },
        {
            method: "POST",
            route: "/api/account/security/revoke-others",
        },
        {
            method: "DELETE",
            route: "/api/account/security/sessions/00000000-0000-0000-0000-000000000000",
        },
    ];

    for (const entry of protectedWrites) {
        const response = await request.fetch(`${platformE2EEnv.baseUrl}${entry.route}`, {
            method: entry.method,
            data: entry.data,
        });
        expect(response.status(), `${entry.method} ${entry.route} should reject anonymous access.`).toBe(401);
    }
});
