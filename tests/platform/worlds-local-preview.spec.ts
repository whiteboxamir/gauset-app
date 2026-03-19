import { expect, test } from "@playwright/test";

import { platformE2EEnv } from "./support/env";
import { projectCardByName, projectChooseSourcePathLink, projectRecordLink } from "./support/selectors";

const sampleProjectId = "11111111-1111-4111-8111-111111111111";
const BASE = platformE2EEnv.baseUrl;

async function expectScrollable(page) {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 360 });
    await page.waitForTimeout(100);

    const scrollRegion = page.getByTestId("app-shell-scroll-region");
    await expect(scrollRegion).toBeVisible();

    const metrics = await scrollRegion.evaluate((scrollingElement) => {
        return {
            scrollHeight: scrollingElement.scrollHeight,
            clientHeight: scrollingElement.clientHeight,
            scrollTop: scrollingElement.scrollTop,
        };
    });

    expect(metrics.scrollTop).toBe(0);
    await expect
        .poll(
            async () =>
                await page.evaluate(() => ({
                    body: window.scrollY,
                    html: document.documentElement.scrollTop,
                })),
            { timeout: 5_000 },
        )
        .toEqual({ body: 0, html: 0 });

    if (metrics.scrollHeight > metrics.clientHeight) {
        await scrollRegion.evaluate((scrollingElement) => {
            scrollingElement.scrollTo(0, scrollingElement.scrollHeight);
        });

        await expect
            .poll(async () => await scrollRegion.evaluate((scrollingElement) => scrollingElement.scrollTop), { timeout: 5_000 })
            .toBeGreaterThan(0);
    } else {
        expect(metrics.scrollHeight).toBe(metrics.clientHeight);
    }

    await expect
        .poll(
            async () =>
                await page.evaluate(() => ({
                    body: window.scrollY,
                    html: document.documentElement.scrollTop,
                })),
            { timeout: 5_000 },
        )
        .toEqual({ body: 0, html: 0 });

    if (originalViewport) {
        await page.setViewportSize(originalViewport);
    }
}

test.describe("focused local preview journey", () => {
    test("generic preview keeps the intro, but project starts skip it", async ({ page }) => {
        await page.goto(`${BASE}/mvp/preview`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("button", { name: "Open demo world" })).toBeVisible();
        await expect(page.getByRole("link", { name: /Continue to world start/i })).toHaveCount(0);

        await page.goto(`${BASE}/app/worlds`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Local preview" })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Build one world\. Save it once\. Then direct it\./i })).toBeVisible();
        const backlotCard = projectCardByName(page, "Backlot Scout");
        await projectChooseSourcePathLink(backlotCard).click();

        await expect(page).toHaveURL(new RegExp(`/app/worlds/${sampleProjectId}#project-world-launch$`));
        await expect(page.locator("#project-world-launch")).toBeVisible();

        await page.getByRole("link", { name: "Import source frames" }).click();

        await expect(page).toHaveURL(new RegExp(`/mvp/preview\\?`));
        await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
        await expect(page).toHaveURL(/source_kind=upload/);
        await expect(page).toHaveURL(/entry=workspace/);
        await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible();
        await expect(page.getByText(/^Project launch$/)).toBeVisible();
        await expect(page.getByRole("link", { name: /Continue to world start/i })).toHaveCount(0);
    });

    test("world library preview routes into project preview instead of the auth wall", async ({ page }) => {
        await page.goto(`${BASE}/app/worlds`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Local preview" })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Build one world\. Save it once\. Then direct it\./i })).toBeVisible();
        await expectScrollable(page);

        const backlotCard = projectCardByName(page, "Backlot Scout");
        await expect(projectRecordLink(backlotCard)).toBeVisible();
        await expect(projectChooseSourcePathLink(backlotCard)).toBeVisible();

        await projectRecordLink(backlotCard).click();
        await expect(page).toHaveURL(new RegExp(`/app/worlds/${sampleProjectId}$`));
        await expect(page.getByRole("heading", { name: "Backlot Scout" })).toBeVisible();
    });

    test("project preview anchors resolve to real sections", async ({ page }) => {
        await page.goto(`${BASE}/app/worlds/${sampleProjectId}`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Backlot Scout" })).toBeVisible();
        await expectScrollable(page);

        await page.getByRole("link", { name: "Build world record" }).click();
        await expect(page.locator("#project-world-launch")).toBeVisible();

        await expect(page.getByText("Project record state", { exact: true })).toBeVisible();
        await expect(page.getByText("World-first checklist")).toBeVisible();

        await expect(page.getByRole("button", { name: "Reopen saved world unavailable" })).toBeDisabled();
    });

    test("project launch buttons route into the focused workspace shell", async ({ page }) => {
        const launchCases = [
            { label: "Import source frames", sourceKind: "upload" },
            { label: "Capture set", sourceKind: "capture_session" },
            { label: "Attach external world", sourceKind: "external_world_package" },
        ];

        for (const launchCase of launchCases) {
            await page.goto(`${BASE}/app/worlds/${sampleProjectId}`, { waitUntil: "domcontentloaded" });
            await expect(page.getByRole("heading", { name: "Backlot Scout" })).toBeVisible();

            await page.getByRole("link", { name: launchCase.label }).click();
            await expect(page).toHaveURL(new RegExp(`/mvp/preview\\?`));
            await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
            await expect(page).toHaveURL(new RegExp(`source_kind=${launchCase.sourceKind}`));
            await expect(page).toHaveURL(/entry=workspace/);
            await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible();
            await expect(page.getByRole("link", { name: /Continue to world start/i })).toHaveCount(0);
        }
    });

    test("advanced generation stays secondary but still routes cleanly", async ({ page }) => {
        await page.goto(`${BASE}/app/worlds/${sampleProjectId}`, { waitUntil: "domcontentloaded" });

        await page.locator("summary").filter({ hasText: /Generation, secondary/ }).click();
        await expect(page.getByRole("link", { name: "Open generation lane" })).toBeVisible();

        await page.getByRole("link", { name: "Open generation lane" }).click();
        await expect(page).toHaveURL(new RegExp(`/mvp/preview\\?`));
        await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
        await expect(page).toHaveURL(/source_kind=provider_generated_still/);
        await expect(page).toHaveURL(/entry=workspace/);
        await expect(page.getByRole("link", { name: "Open demo world" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Continue to world start" })).toHaveCount(0);
    });

    test("project-led preview lands directly in the focused workspace and can return to the project", async ({ page }) => {
        await page.goto(`${BASE}/mvp/preview?project=${sampleProjectId}&source_kind=upload`, { waitUntil: "domcontentloaded" });

        await expect(page).toHaveURL(new RegExp(`/mvp/preview\\?project=${sampleProjectId}&source_kind=upload(?:&entry=workspace)?$`));
        await expect(page.getByText(/^Project launch$/)).toBeVisible();
        await expect(page.getByText("Import scout stills", { exact: true })).toBeVisible();
        await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible();
        await expect(page.getByText("Preview-safe route")).toHaveCount(0);
        await expect(page.getByText("Project-linked world start", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("No source chosen yet")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Open demo world/i })).toHaveCount(0);

        await page.getByTestId("mvp-preview-back-to-start").click();
        await expect(page).toHaveURL(new RegExp(`/app/worlds/${sampleProjectId}#project-world-launch$`));
        await expect(page.locator("#project-world-launch")).toBeVisible();
    });
});
