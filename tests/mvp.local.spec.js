const fs = require("fs");
const { test, expect } = require("playwright/test");

const BASE = "http://127.0.0.1:3015";
const assetImage = "/Users/amirboz/gauset-app/backend/TripoSR/examples/chair.png";
const envImage = "/Users/amirboz/gauset-app/backend/ml-sharp/data/teaser.jpg";
const envImageBytes = fs.readFileSync(envImage);

async function waitForBackendReady(page) {
    await expect(page.getByTestId("mvp-session-status")).toBeVisible();
    await expect
        .poll(
            async () => {
                const text = await page.getByTestId("mvp-session-status").innerText();
                if (/checking services/i.test(text)) return "checking";
                if (/all lanes online|limited lane coverage/i.test(text)) return "ready";
                if (/lane needs attention/i.test(text)) return "degraded";
                if (/services offline/i.test(text)) return "offline";
                return "checking";
            },
            { timeout: 120000 },
        )
        .not.toBe("checking");
}

async function upload(page, filePath) {
    await page.setInputFiles('input[type="file"]', filePath);
    await expect(page.getByTestId("mvp-capture-tray")).toBeVisible({ timeout: 15000 });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(240000);

test("wave1 local shell and backend state", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
    const sessionStatusBox = await page.getByTestId("mvp-session-status").boundingBox();
    expect(sessionStatusBox?.height ?? 0).toBeGreaterThan(220);
    await expect(page.getByText("GAUSET Review")).toBeVisible();
    await page.screenshot({ path: "/tmp/qa-wave1-local-shell.png", fullPage: true });
});

test("wave2 asset upload and generate", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, assetImage);
    await page.getByRole("button", { name: /Extract 3D asset/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toContain("Asset ready:");
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: "/tmp/qa-wave2-asset-generated.png", fullPage: true });
});

test("wave3 asset-only scene graph and save", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, assetImage);
    await page.getByRole("button", { name: /Extract 3D asset/i }).click();
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 120000 });
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toBeVisible({ timeout: 30000 });
    await page.getByTitle("Save Scene as JSON").click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Saved scene_");
    await page.screenshot({ path: "/tmp/qa-wave3-asset-scene-save.png", fullPage: true });
});

test("wave4 environment generate review and comment", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await page.getByTitle("Save Scene as JSON").click();
    await page.getByRole("button", { name: /Save camera view/i }).click();
    await expect(page.getByRole("button", { name: "View 1" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder("Project name")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("Project name").fill("QA Project");
    await page.getByPlaceholder("Scene title").fill("Smoke Env");
    await page.getByPlaceholder("Location").fill("Barcelona");
    await page.getByPlaceholder("Owner").fill("Codex QA");
    await page.getByPlaceholder("Address").fill("Backlot 14");
    await page.getByPlaceholder("Shoot day").fill("Day 12");
    await page.getByPlaceholder("Permit status").fill("Pending");
    await page.getByPlaceholder("Production context").fill("Wave 4 metadata save");
    await page.getByPlaceholder("Approval note").fill("Looks good");
    await page.getByRole("button", { name: "Approve Scene" }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Scene marked approved.");
    await page.getByPlaceholder("Issue title").fill("Tighten scout angle");
    await page.getByPlaceholder("What needs to change, verify, or protect?").fill("Need a cleaner 35mm approach on the hero doorway.");
    await page.getByRole("button", { name: /Add Structured Issue/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Issue added to review handoff.");
    await page.screenshot({ path: "/tmp/qa-wave4-review-comment.png", fullPage: true });
});

test("wave5 review page loads", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await page.getByTitle("Save Scene as JSON").click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toMatch(/Version History/i);

    const sceneId = ((await page.locator("body").innerText()).match(/scene_[a-z0-9]+/i) || [])[0];
    const versions = await page.evaluate(async (value) => {
        const response = await fetch(`/api/mvp/scene/${value}/versions`, { cache: "no-store" });
        return await response.json();
    }, sceneId);
    const versionId = versions?.versions?.[0]?.version_id;

    if (!sceneId || !versionId) {
        throw new Error(`Could not extract scene/version ids: ${sceneId} ${JSON.stringify(versions)}`);
    }

    await page.goto(`${BASE}/mvp/review?scene=${sceneId}&version=${versionId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("review-page-title")).toBeVisible();
    await page.screenshot({ path: "/tmp/qa-wave5-review-page.png", fullPage: true });
});

test("wave6 capture set progress", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Add frame to capture set/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Capture set updated: 1/8 views collected");
    await expect(page.getByRole("button", { name: /Start Reconstruction/i })).toBeDisabled();
});

test("wave7 production shell", async ({ page }) => {
    await page.goto(`https://gauset.com/mvp?ts=${Date.now()}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
    await page.screenshot({ path: "/tmp/qa-wave7-production-shell.png", fullPage: true });
});

test("wave8 mobile local layout", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("mvp-mobile-handoff")).toBeVisible();
    await page.screenshot({ path: "/tmp/qa-wave8-mobile-local.png", fullPage: true });
    await context.close();
});

test("wave9 asset duplicate and delete controls", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, assetImage);
    await page.getByRole("button", { name: /Extract 3D asset/i }).click();
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 120000 });
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1);
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await page.getByTitle("Delete").first().click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1);
    await page.screenshot({ path: "/tmp/qa-wave9-duplicate-delete.png", fullPage: true });
});

test("wave10 review link and export package buttons", async ({ browser }) => {
    const context = await browser.newContext({
        permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await page.getByTitle("Save Scene as JSON").click();
    await expect(page.getByRole("button", { name: /Copy review link/i })).toBeVisible();
    await page.getByRole("button", { name: /Copy review link/i }).click();
    await expect(page.getByText(/review link copied/i)).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export scene package/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".json");
    await page.screenshot({ path: "/tmp/qa-wave10-review-link-export.png", fullPage: true });
    await context.close();
});

test("wave11 restore previous version", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, assetImage);
    await page.getByRole("button", { name: /Extract 3D asset/i }).click();
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 120000 });
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1);
    await page.getByTitle("Save Scene as JSON").click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Saved scene_");
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await page.getByTitle("Save Scene as JSON").click();
    await expect(page.locator("text=/Saved scene_|Autosaved/")).toBeVisible({ timeout: 15000 });
    await page.getByTitle("Restore version").nth(1).click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1, { timeout: 15000 });
    await page.screenshot({ path: "/tmp/qa-wave11-restore-version.png", fullPage: true });
});

test("wave12 duplicate-heavy capture set is blocked", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await page.setInputFiles(
        'input[type="file"]',
        Array.from({ length: 8 }, (_, index) => ({
            name: `capture-${index + 1}.jpg`,
            mimeType: "image/jpeg",
            buffer: envImageBytes,
        })),
    );
    await expect(page.getByTestId("mvp-capture-tray")).toBeVisible();

    for (let index = 0; index < 8; index += 1) {
        await page.getByRole("button", { name: new RegExp(`capture-${index + 1}\\.jpg`, "i") }).click();
        await page.getByRole("button", { name: /Add frame to capture set/i }).click();
    }

    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toContain("Capture set blocked:");

    await expect(page.getByText(/Only 1 unique views are available/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Duplicate or near-identical frames are in the capture set/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Resolve Capture Blockers/i })).toBeDisabled();
    await page.screenshot({ path: "/tmp/qa-wave12-reconstruction-blocked.png", fullPage: true });
});

test("wave13 classic route keeps viewer area on laptop viewports", async ({ browser }) => {
    for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
    ]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
        await waitForBackendReady(page);
        await expect(page.getByText(/Build the world once\./i)).toHaveCount(0);

        const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
        expect(viewerBox?.height ?? 0).toBeGreaterThan(viewport.height * 0.52);
        expect(viewerBox?.width ?? 0).toBeGreaterThan(540);

        await context.close();
    }
});

test("wave14 preview demo stays reference-only and keeps the viewer tray closed", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${BASE}/mvp/preview`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Open reference demo/i }).click();

    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^Start here$/i)).toHaveCount(0);
    await expect(page.getByText(/Reference-only Demo/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Preview Loaded/i)).toHaveCount(0);
    await expect(page.getByTestId("mvp-viewer-selection-tray")).toHaveCount(0);

    const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
    expect(viewerBox?.height ?? 0).toBeGreaterThan(520);

    await page.screenshot({ path: "/tmp/qa-wave14-preview-reference-demo.png", fullPage: true });
    await context.close();
});

test("wave15 preview workspace can return to start and resume the same session", async ({ page }) => {
    await page.goto(`${BASE}/mvp/preview`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Open reference demo/i }).click();
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });

    await page.getByTestId("mvp-preview-back-to-start").click();
    await expect(page.getByText(/Build the world once\./i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Return to workspace/i })).toBeVisible();

    await page.getByRole("button", { name: /Return to workspace/i }).click();
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Reference-only Demo/i).first()).toBeVisible({ timeout: 15000 });
});

test("wave16 preview route keeps back control visible on laptop viewports", async ({ browser }) => {
    for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
    ]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();

        await page.goto(`${BASE}/mvp/preview`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Open reference demo/i }).click();

        const backButton = page.getByTestId("mvp-preview-back-to-start");
        await expect(backButton).toBeVisible({ timeout: 15000 });
        const backButtonBox = await backButton.boundingBox();
        expect(backButtonBox?.y ?? viewport.height).toBeLessThan(viewport.height * 0.2);

        const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
        expect(viewerBox?.height ?? 0).toBeGreaterThan(520);

        await context.close();
    }
});

test("wave17 legacy reference-only drafts do not claim preview is loaded", async ({ page }) => {
    const legacyReferenceOnlyDraft = {
        activeScene: null,
        sceneGraph: {
            environment: {
                id: "scene_legacy_reference",
                lane: "preview",
                metadata: {
                    lane: "preview",
                    truth_label: "Reference-only demo",
                    reference_image: "/images/hero/interior_daylight.png",
                    quality: {
                        score: 6.2,
                        band: "reference_only",
                        warnings: [
                            "Reference-only demo. Generate or import your own still before treating this as a real world.",
                        ],
                    },
                    delivery: {
                        label: "Reference-only preview",
                        summary: "This is a mocked reference state for onboarding, not a generated splat or validated reconstruction.",
                    },
                },
            },
            assets: [],
            camera_views: [],
            pins: [],
            director_path: [],
            director_brief: "",
            viewer: {
                fov: 45,
                lens_mm: 35,
            },
        },
        assetsList: [],
        updatedAt: "2026-03-09T18:00:00.000Z",
    };

    await page.addInitScript(
        ({ key, draft }) => {
            window.localStorage.setItem(key, JSON.stringify(draft));
        },
        { key: "gauset:mvp:draft:v1", draft: legacyReferenceOnlyDraft },
    );

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);

    await expect(page.getByText(/^Reference-only Demo$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Preview Loaded/i)).toHaveCount(0);
});
