import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { platformE2EEnv } from "./support/env";

const BASE = platformE2EEnv.baseUrl;
const sampleProjectId = "11111111-1111-4111-8111-111111111111";
const envImage = `${process.cwd()}/public/images/hero_render.png`;
const envImageName = "hero_render.png";
const largeEnvImageName = "hero_render-large.png";

async function createLargeStillFixture(testInfo: TestInfo) {
    const sourceBuffer = await readFile(envImage);
    const minimumLargeSizeInBytes = 5 * 1024 * 1024;
    const paddingByteCount = Math.max(0, minimumLargeSizeInBytes - sourceBuffer.byteLength);
    const largeStillPath = testInfo.outputPath(largeEnvImageName);

    await writeFile(largeStillPath, Buffer.concat([sourceBuffer, Buffer.alloc(paddingByteCount)]));

    return largeStillPath;
}

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
    await expect(page.getByRole("button", { name: /^Save first version$/ })).toBeVisible({ timeout: 240_000 });
}

async function openProjectWorldStart(page: Page) {
    await page.goto(`${BASE}/mvp?project=${sampleProjectId}&source_kind=upload&entry=workspace&ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible();
    await expect(page.getByText(/^Import scout stills$/)).toBeVisible();
}

async function createSavedWorld(page: Page) {
    await openProjectWorldStart(page);
    await uploadSource(page);
    await buildWorldPreview(page);
    await page.getByRole("button", { name: /^Save first version$/ }).click();
    await expect(page.getByRole("heading", { name: "Review and handoff" })).toBeVisible({ timeout: 20_000 });
}

async function fillContinuityRecord(page: Page) {
    await page.getByTestId("mvp-world-bible").fill("Backlot alley stays wet after rain. Alley signage never changes between shots.");
    await page.getByTestId("mvp-cast-continuity").fill("Mina keeps the green coat, left-hand flashlight, and camera-right eyeline.");
    await page.getByTestId("mvp-look-development").fill("Cool sodium-vapor palette with cyan spill, low camera height, and restrained contrast.");
    await page.getByTestId("mvp-shot-plan").fill("1. Wide establish. 2. Tracking approach. 3. Reverse close-up. 4. Insert on wet pavement.");
}

test.describe("v3 project-bound local journey", () => {
    test.describe.configure({ timeout: 360_000 });

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

        await expect(page.getByText("Project record attached")).toBeVisible();
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

    test("local direct backend intake accepts larger stills without proxying through /api/mvp/upload", async ({ page }, testInfo) => {
        const proxyUploadRequests: string[] = [];
        const directUploadRequests: string[] = [];
        page.on("request", (request) => {
            if (request.method() !== "POST") {
                return;
            }

            if (/\/api\/mvp\/upload(?:\?|$)/.test(request.url())) {
                proxyUploadRequests.push(request.url());
                return;
            }

            if (/\/upload(?:\?|$)/.test(request.url())) {
                directUploadRequests.push(request.url());
            }
        });

        await openProjectWorldStart(page);
        await expect(page.getByText("Direct backend intake is available here for stills up to 64 MB.")).toBeVisible();
        await expect(page.getByTestId("mvp-upload-cap-warning")).toHaveCount(0);
        const largeEnvImage = await createLargeStillFixture(testInfo);

        const importTrigger = page.getByText(/^Bring in scout stills$/).first();
        await importTrigger.click();
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(largeEnvImage);

        await expect(page.getByTestId("mvp-capture-tray")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(largeEnvImageName, { exact: true })).toBeVisible();
        await expect.poll(() => directUploadRequests.length).toBeGreaterThan(0);
        await expect.poll(() => proxyUploadRequests.length).toBe(0);
    });

    test("first manual save unlocks review, version history, and studio controls without changing route", async ({ page }) => {
        await createSavedWorld(page);
        await expect(page.getByText("Version History")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Review and handoff" })).toBeVisible();
        await expect(page.getByText(/Studio view (available|on)/)).toBeVisible();
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
