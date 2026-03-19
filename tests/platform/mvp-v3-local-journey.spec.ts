import { expect, test, type Page } from "@playwright/test";

import { platformE2EEnv } from "./support/env";

const BASE = platformE2EEnv.baseUrl;
const sampleProjectId = "11111111-1111-4111-8111-111111111111";
const envImage = "/Users/amirboz/gauset-app/backend/ml-sharp/data/teaser.jpg";
const envImageName = "teaser.jpg";

async function uploadSource(page: Page) {
    await expect(page.getByText(/^Import scout stills$/)).toBeVisible();
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const importTrigger = page.getByText(/^Bring in scout stills$/).first();
        await importTrigger.click();
        const fileInput = page.locator('input[type="file"]').first();
        await expect(fileInput).toHaveCount(1);
        await fileInput.setInputFiles(envImage);
        await page.getByText("Upload in progress").waitFor({ state: "visible", timeout: 5_000 }).catch(() => null);

        try {
            await expect
                .poll(
                    async () => {
                        const trayCount = await page.getByTestId("mvp-capture-tray").count();
                        const fileLabelCount = await page.getByText(envImageName, { exact: true }).count();
                        return trayCount > 0 || fileLabelCount > 0 ? 1 : 0;
                    },
                    { timeout: 60_000 },
                )
                .toBeGreaterThan(0);
            return;
        } catch (error) {
            if (attempt === 2) {
                throw error;
            }
            await page.waitForTimeout(1_000);
        }
    }
}

async function buildWorldPreview(page: Page) {
    await page.getByRole("button", { name: /Build (world preview|first world)/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120_000 })
        .toMatch(/ready:\s+scene_/i);
}

async function openProjectWorldStart(page: Page) {
    await page.goto(`${BASE}/mvp/preview?project=${sampleProjectId}&source_kind=upload&ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible();
    await expect(page.getByText(/^Import scout stills$/)).toBeVisible();
}

async function createSavedWorld(page: Page) {
    await openProjectWorldStart(page);
    await uploadSource(page);
    await buildWorldPreview(page);
    await page.getByRole("button", { name: /^Save first version$/ }).click();
    await expect(page.getByRole("button", { name: /^Studio view off$/ })).toBeVisible({ timeout: 20_000 });
}

async function fillContinuityRecord(page: Page) {
    await page.getByTestId("mvp-world-bible").fill("Backlot alley stays wet after rain. Alley signage never changes between shots.");
    await page.getByTestId("mvp-cast-continuity").fill("Mina keeps the green coat, left-hand flashlight, and camera-right eyeline.");
    await page.getByTestId("mvp-look-development").fill("Cool sodium-vapor palette with cyan spill, low camera height, and restrained contrast.");
    await page.getByTestId("mvp-shot-plan").fill("1. Wide establish. 2. Tracking approach. 3. Reverse close-up. 4. Insert on wet pavement.");
}

test.describe("v3 project-bound local journey", () => {
    test.describe.configure({ timeout: 150_000 });

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
        });
    });

    test("project-led world build stays unsaved until the explicit first save", async ({ page }) => {
        await openProjectWorldStart(page);
        await uploadSource(page);
        await buildWorldPreview(page);

        await expect(page.getByText("Project-linked world start")).toBeVisible();
        await expect(page.getByRole("button", { name: /^Save first version$/ })).toBeVisible();
        await expect(page.getByText("Review share locked until save")).toBeVisible();
        await expect(page.getByText("Handoff locked until save")).toBeVisible();
        await expect(page.getByRole("button", { name: /Studio view on|Studio view off/i })).toHaveCount(0);
        await expect(page.getByText("Version History")).toHaveCount(0);

        await page.waitForTimeout(2_500);

        await expect(page.getByRole("button", { name: /^Save first version$/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /Studio view on|Studio view off/i })).toHaveCount(0);
        await expect(page.getByText("Version History")).toHaveCount(0);
    });

    test("first manual save unlocks review, version history, and studio controls without changing route", async ({ page }) => {
        await createSavedWorld(page);
        await expect(page.getByText("Version History")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Review and handoff" })).toBeVisible();
        await expect(page).toHaveURL(/\/mvp\?/);
        await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
        await expect(page).toHaveURL(/scene=scene_/);

        await page.getByRole("button", { name: /^Studio view off$/ }).click();
        await expect(page.getByRole("button", { name: /^Studio view on$/ })).toBeVisible();
        await expect(page).toHaveURL(/\/mvp\?/);
        await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
        await expect(page).toHaveURL(/scene=scene_/);
    });

    test("continuity memory saves with the world and survives reopen", async ({ page }) => {
        test.setTimeout(300_000);
        await openProjectWorldStart(page);
        await uploadSource(page);
        await buildWorldPreview(page);
        await fillContinuityRecord(page);

        await expect(page.getByText("Will anchor on first save")).toBeVisible();
        await page.getByRole("button", { name: /^Save first version$/ }).click();
        await expect(page.getByText("Attached to saved world")).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(/\/mvp\?/);
        await expect(page).toHaveURL(new RegExp(`project=${sampleProjectId}`));
        await expect(page).toHaveURL(/scene=scene_/);

        await page.reload({ waitUntil: "domcontentloaded" });

        await expect(page.getByTestId("mvp-world-bible")).toHaveValue(/Backlot alley stays wet after rain/i);
        await expect(page.getByTestId("mvp-cast-continuity")).toHaveValue(/green coat/i);
        await expect(page.getByTestId("mvp-look-development")).toHaveValue(/sodium-vapor palette/i);
        await expect(page.getByTestId("mvp-shot-plan")).toHaveValue(/Wide establish/i);
    });

    test("saved-world viewer controls stay interactive after the first save", async ({ page }) => {
        await createSavedWorld(page);

        await expect(page.getByRole("button", { name: /^Save framing$/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Add note$/ })).toBeVisible();

        await page.getByRole("button", { name: /^Save framing$/ }).click();
        await expect(page.getByTestId("mvp-viewer-selection-tray")).toContainText(/Selected view/i);
        await expect(page.getByTestId("mvp-viewer-selection-tray")).toContainText(/View 1/i);

        const compactHudButton = page.locator('button').filter({ hasText: "Compact HUD" }).first();
        await expect(compactHudButton).toBeVisible();
        await compactHudButton.click();
        const controlsButton = page.locator('button').filter({ hasText: "Controls" }).first();
        await expect(controlsButton).toBeVisible();

        await controlsButton.click();
        await expect(compactHudButton).toBeVisible();

        await page.getByRole("button", { name: /^Add note$/ }).click();
        await expect(page.getByRole("button", { name: /^Placing note$/ })).toBeVisible();
    });
});
