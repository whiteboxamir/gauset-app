const fs = require("fs");
const { test, expect } = require("playwright/test");
const { assertLocalMvpBaseUrl } = require("../scripts/mvp_host_guard.cjs");

const BASE = assertLocalMvpBaseUrl(process.env.GAUSET_MVP_BASE_URL || "http://localhost:3015", "tests/mvp.local.spec.js");
const LEGACY_LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";
const LOCAL_DRAFT_KEY_PREFIX = "gauset:mvp:draft:v2";
const AUTOSAVE_DEBOUNCE_MS = 1500;
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

async function fetchDeploymentFingerprint(page) {
    const response = await page.request.get(`${BASE}/api/mvp/deployment`);
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.fingerprint?.build_label).toBeTruthy();
    return payload.fingerprint;
}

async function expectDeploymentFingerprintBadge(page, testId = "mvp-deployment-fingerprint") {
    const fingerprint = await fetchDeploymentFingerprint(page);
    const badge = page.getByTestId(testId);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(fingerprint.build_label);
    return fingerprint;
}

async function fetchLatestVersionPayload(page, sceneId) {
    const versionsResponse = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions`);
    expect(versionsResponse.ok()).toBeTruthy();
    const versionsPayload = await versionsResponse.json();
    const versionId = versionsPayload?.versions?.[0]?.version_id;
    expect(versionId).toBeTruthy();

    const versionResponse = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}`);
    expect(versionResponse.ok()).toBeTruthy();

    return {
        versionId,
        versionPayload: await versionResponse.json(),
    };
}

async function waitForSceneVersionCount(page, minimumCount = 1) {
    let sceneId = null;
    await expect
        .poll(
            async () => {
                const bodyText = await page.locator("body").innerText();
                sceneId = bodyText.match(/scene_[a-z0-9]+/i)?.[0] ?? null;
                if (!sceneId) {
                    return 0;
                }

                const versionsResponse = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions`);
                if (!versionsResponse.ok()) {
                    return 0;
                }

                const versionsPayload = await versionsResponse.json();
                return Array.isArray(versionsPayload?.versions) ? versionsPayload.versions.length : 0;
            },
            { timeout: 15000, intervals: [500, 1000, 1500] },
        )
        .toBeGreaterThanOrEqual(minimumCount);

    if (!sceneId) {
        throw new Error("Scene id was not available after save.");
    }

    return sceneId;
}

async function fetchSceneVersionCount(page, sceneId) {
    const versionsResponse = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions`);
    expect(versionsResponse.ok()).toBeTruthy();
    const versionsPayload = await versionsResponse.json();
    return Array.isArray(versionsPayload?.versions) ? versionsPayload.versions.length : 0;
}

async function readLocalDraft(page, routeVariant = null) {
    return page.evaluate(({ keyPrefix, legacyKey, requestedRouteVariant }) => {
        const resolvedRouteVariant =
            requestedRouteVariant || (window.location.pathname.includes("/mvp/preview") ? "preview" : "workspace");
        const namespacedKey = Object.keys(window.localStorage).find((key) =>
            key.startsWith(`${keyPrefix}:${resolvedRouteVariant}:`),
        );
        const payload = window.localStorage.getItem(namespacedKey || legacyKey);
        return payload ? JSON.parse(payload) : null;
    }, {
        keyPrefix: LOCAL_DRAFT_KEY_PREFIX,
        legacyKey: LEGACY_LOCAL_DRAFT_KEY,
        requestedRouteVariant: routeVariant,
    });
}

async function readNamespacedLocalDraft(page, routeVariant) {
    return page.evaluate(({ keyPrefix, requestedRouteVariant }) => {
        const namespacedKey = Object.keys(window.localStorage).find((key) =>
            key.startsWith(`${keyPrefix}:${requestedRouteVariant}:`),
        );
        const payload = namespacedKey ? window.localStorage.getItem(namespacedKey) : null;
        return payload ? JSON.parse(payload) : null;
    }, {
        keyPrefix: LOCAL_DRAFT_KEY_PREFIX,
        requestedRouteVariant: routeVariant,
    });
}

async function listLocalDraftKeys(page) {
    return page.evaluate((keyPrefix) => Object.keys(window.localStorage).filter((key) => key.startsWith(keyPrefix)), LOCAL_DRAFT_KEY_PREFIX);
}

async function getNamespacedLocalDraftKey(page, routeVariant) {
    return page.evaluate(({ keyPrefix, requestedRouteVariant }) => {
        return Object.keys(window.localStorage).find((key) => key.startsWith(`${keyPrefix}:${requestedRouteVariant}:`)) || null;
    }, {
        keyPrefix: LOCAL_DRAFT_KEY_PREFIX,
        requestedRouteVariant: routeVariant,
    });
}

async function setAuthSessionRouteMock(page, sessionPayload) {
    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(sessionPayload),
        });
    });
}

async function createSavedWorkspaceDraft(page, options = {}) {
    const directorBrief = options.directorBrief || "Restore-safe draft under test.";
    const marker = options.marker || `Draft ${Date.now().toString(36)}`;

    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await page.getByPlaceholder(/Director brief:/i).fill(`${directorBrief} ${marker}`);
    await page.getByTitle("Save Scene as JSON").click();
    const sceneId = await waitForSceneVersionCount(page, 1);
    await expect.poll(async () => (await readNamespacedLocalDraft(page, "workspace"))?.activeScene ?? null, { timeout: 15000 }).toBe(sceneId);
    return { sceneId, directorBrief: `${directorBrief} ${marker}` };
}

async function detectWebgl2Support(page) {
    return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}

test.describe.configure({ mode: "serial" });
test.setTimeout(240000);

test("wave0 project-bound launchpad keeps the world record flow primary", async ({ page }) => {
    await page.goto(`${BASE}/mvp?project=11111111-1111-4111-8111-111111111111&source_kind=upload`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Build one project world\./i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open project world workspace/i })).toBeVisible();
    await expect(page.getByText(/Project identity stays attached/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Open sample world/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Resume local draft/i })).toHaveCount(0);
});

test("wave0 worlds local preview fallback stays inspectable without auth env", async ({ page }) => {
    await page.goto(`${BASE}/app/worlds`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/^Local preview$/i).first()).toBeVisible();
    await expect(page.getByText(/Choose a project\. Build one world\. Save it once\./i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open project record/i }).first()).toBeVisible();

    await page.getByRole("link", { name: /Open project record/i }).first().click();
    await expect(page).toHaveURL(/\/app\/worlds\/11111111-1111-4111-8111-111111111111$/);
    await expect(page.getByRole("heading", { name: "Backlot Scout" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Import source frames/i })).toBeVisible();
});

test("wave1 local shell and backend state", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "domcontentloaded" });
    await waitForBackendReady(page);
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
    await expectDeploymentFingerprintBadge(page);
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
    await waitForSceneVersionCount(page, 1);
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
    await expectDeploymentFingerprintBadge(page, "review-deployment-fingerprint");
    await page.screenshot({ path: "/tmp/qa-wave5-review-page.png", fullPage: true });
});

test("wave5b localhost review-share contract", async ({ page }) => {
    const response = await page.request.post(`${BASE}/api/review-shares`, {
        data: {
            sceneId: "scene_local_contract",
            versionId: "version_local_contract",
        },
    });
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload.shareMode).toBe("localhost_fallback");
    expect(payload.shareToken).toBeNull();
    expect(payload.shareUrl).toBe(`${BASE}/mvp/review?scene=scene_local_contract&version=version_local_contract`);
    expect(payload.shareUrl).not.toContain("share=");
    expect(Number.isNaN(Date.parse(payload.expiresAt))).toBeFalsy();
});

test("wave6 capture set progress", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Add frame to capture set/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 15000 })
        .toContain("Capture set updated: 1/8 views collected");
    await expect(page.getByRole("button", { name: /Awaiting Multi-View Capture/i })).toBeDisabled();
});

test("wave7 local preview shell", async ({ page }) => {
    await page.goto(`${BASE}/mvp?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Build one world\./i)).toBeVisible();
    await expectDeploymentFingerprintBadge(page);
    await expect(page.getByRole("link", { name: /Open project library/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open sample world/i })).toBeVisible();
    await page.screenshot({ path: "/tmp/qa-wave7-preview-shell.png", fullPage: true });
});

test("wave8 mobile local layout", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("mvp-viewer-surface")).toBeVisible();
    const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
    expect(viewerBox?.width ?? 0).toBeGreaterThan(320);
    expect(viewerBox?.height ?? 0).toBeGreaterThan(320);
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
    const sceneGraph = page.getByTestId("mvp-scene-graph");
    const sceneGraphAssets = sceneGraph.locator('[data-testid^="mvp-scene-graph-asset-"]');
    await expect(sceneGraphAssets).toHaveCount(1);
    await sceneGraph.locator('[data-testid^="mvp-scene-graph-duplicate-"]').first().click();
    await expect(sceneGraphAssets).toHaveCount(2);
    await sceneGraph.locator('[data-testid^="mvp-scene-graph-delete-"]').first().click();
    await expect(sceneGraphAssets).toHaveCount(1);
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
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const exportedPackage = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    expect(exportedPackage.sceneDocument?.version).toBe(2);
    expect(exportedPackage.sceneGraph?.__scene_document_v2?.version).toBe(2);
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
    await waitForSceneVersionCount(page, 1);
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await page.getByTitle("Save Scene as JSON").click();
    const sceneId = await waitForSceneVersionCount(page, 2);
    await page.getByTitle("Restore version").nth(1).click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1, { timeout: 15000 });
    await page.waitForTimeout(2200);
    expect(await fetchSceneVersionCount(page, sceneId)).toBe(2);
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

test("wave13 focused preview stays simple before save and keeps advanced density locked", async ({ page }) => {
    await page.goto(`${BASE}/mvp?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Build one world\./i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Open sample world/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Resume local draft/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Studio view on|Studio view off/i })).toHaveCount(0);
    await expect(page.getByText(/Richer direction, review, and handoff unlock after the first save\./i)).toBeVisible();

    await page.getByRole("button", { name: /Open sample world/i }).click();
    await expect(page.getByTestId("mvp-viewer-surface")).toBeVisible();
    await expect(page.getByRole("button", { name: /Studio view on|Studio view off/i })).toHaveCount(0);
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

        const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
        expect(viewerBox?.height ?? 0).toBeGreaterThan(viewport.height * 0.52);
        expect(viewerBox?.width ?? 0).toBeGreaterThan(540);

        await context.close();
    }
});

test("wave14 preview sample stays static and keeps the viewer tray closed", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Open sample world/i }).click();

    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Show left HUD/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Sample world loaded/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^Sample world$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Preview Loaded/i)).toHaveCount(0);
    await expect(page.getByTestId("mvp-viewer-selection-tray")).toHaveCount(0);

    const viewerBox = await page.getByTestId("mvp-viewer-surface").boundingBox();
    expect(viewerBox?.height ?? 0).toBeGreaterThan(520);

    await page.screenshot({ path: "/tmp/qa-wave14-preview-reference-demo.png", fullPage: true });
    await context.close();
});

test("wave15 preview workspace can return to start and resume the same session", async ({ page }) => {
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Open sample world/i }).click();
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => Boolean(await readLocalDraft(page, "preview")), { timeout: 15000 }).toBe(true);
    await expect.poll(async () => await listLocalDraftKeys(page), { timeout: 15000 }).toContainEqual(expect.stringContaining(":preview:"));

    await page.getByTestId("mvp-preview-back-to-start").click();
    await expect(page.getByText(/Build one world\./i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Resume local draft/i })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Resume local draft/i }).click();
    await expect(page.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Sample world loaded/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^Sample world$/i).first()).toBeVisible({ timeout: 15000 });
});

test("wave16 preview route keeps back control visible on laptop viewports", async ({ browser }) => {
    for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
    ]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();

        await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Open sample world/i }).click();

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

test("wave18 full-scene graph survives save, draft recovery, and restore-version", async ({ page }) => {
    const directorBrief = "50mm push through the doorway. Preserve the clear egress lane and keep the dolly off the left wall.";
    test.skip(
        !(await detectWebgl2Support(page)),
        "Wave18 requires WebGL2. Use wave19 and scripts/mvp_viewer_diag.mjs for fallback-only hosts.",
    );

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);

    const canvas = page.locator('[data-testid="mvp-viewer-surface"] canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "50mm" })).toBeEnabled({ timeout: 30000 });
    await page.getByRole("button", { name: "50mm" }).click();
    await page.getByRole("button", { name: /Save camera view/i }).click();
    await expect(page.getByRole("button", { name: "View 1" })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Scene notes/i }).click();
    await expect(page.getByRole("button", { name: /Drop scene note/i })).toBeVisible({ timeout: 15000 });
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
        throw new Error("Viewer canvas did not expose a bounding box for pin placement.");
    }
    await canvas.click({
        position: {
            x: canvasBox.width * 0.52,
            y: canvasBox.height * 0.62,
        },
        force: true,
    });
    await expect.poll(async () => (await readLocalDraft(page))?.sceneGraph?.pins?.length ?? 0, { timeout: 15000 }).toBe(1);

    await page.getByPlaceholder(/Director brief:/i).fill(directorBrief);
    await page.getByRole("button", { name: /Record camera path/i }).click();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.56, canvasBox.y + canvasBox.height * 0.62);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.68, canvasBox.y + canvasBox.height * 0.58, { steps: 14 });
    await page.waitForTimeout(250);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.42, canvasBox.y + canvasBox.height * 0.64, { steps: 14 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /Stop path/i }).click();
    await expect.poll(async () => (await readLocalDraft(page))?.sceneGraph?.director_path?.length ?? 0, { timeout: 15000 }).toBeGreaterThan(1);

    await page.getByTitle("Save Scene as JSON").click();
    const sceneId = await waitForSceneVersionCount(page, 1);
    const { versionPayload } = await fetchLatestVersionPayload(page, sceneId);
    const savedGraph = versionPayload.scene_graph;
    const savedDocument = versionPayload.scene_document;

    expect(savedGraph.camera_views).toHaveLength(1);
    expect(savedGraph.pins).toHaveLength(1);
    expect(savedGraph.director_path.length).toBeGreaterThan(1);
    expect(savedGraph.director_brief).toBe(directorBrief);
    expect(savedGraph.viewer.lens_mm).toBe(50);
    expect(savedGraph.viewer.fov).toBeGreaterThan(20);
    expect(savedGraph.__scene_document_v2?.version).toBe(2);
    expect(savedDocument?.version).toBe(2);
    expect(savedDocument?.direction?.cameraViews).toHaveLength(1);
    expect(savedDocument?.direction?.pins).toHaveLength(1);
    expect(savedDocument?.direction?.directorPath?.length ?? 0).toBeGreaterThan(1);
    expect(savedDocument?.direction?.directorBrief).toBe(directorBrief);
    expect(savedDocument?.viewer?.lens_mm).toBe(50);

    await page.reload({ waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await expect(page.getByRole("button", { name: "View 1" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/Director brief:/i)).toHaveValue(directorBrief, { timeout: 15000 });

    const recoveredDraft = await readLocalDraft(page);
    expect(recoveredDraft.sceneDocument?.version).toBe(2);
    expect(recoveredDraft.sceneDocument?.direction?.cameraViews).toHaveLength(1);
    expect(recoveredDraft.sceneDocument?.direction?.pins).toHaveLength(1);
    expect(recoveredDraft.sceneDocument?.direction?.directorPath?.length ?? 0).toBeGreaterThan(1);
    expect(recoveredDraft.sceneDocument?.direction?.directorBrief).toBe(directorBrief);
    expect(recoveredDraft.sceneDocument?.viewer?.lens_mm).toBe(50);
    expect(recoveredDraft.sceneGraph.__scene_document_v2?.version).toBe(2);
    expect(recoveredDraft.sceneGraph.camera_views).toHaveLength(1);
    expect(recoveredDraft.sceneGraph.pins).toHaveLength(1);
    expect(recoveredDraft.sceneGraph.director_path.length).toBeGreaterThan(1);
    expect(recoveredDraft.sceneGraph.director_brief).toBe(directorBrief);
    expect(recoveredDraft.sceneGraph.viewer.lens_mm).toBe(50);

    await page.getByPlaceholder(/Director brief:/i).fill("Temporary override before restore.");
    await page.getByRole("button", { name: "85mm" }).click();
    await page.getByTitle("Restore version").first().click();

    await expect.poll(async () => (await readLocalDraft(page))?.sceneGraph?.director_brief ?? "", { timeout: 15000 }).toBe(directorBrief);
    await expect.poll(async () => (await readLocalDraft(page))?.sceneGraph?.viewer?.lens_mm ?? 0, { timeout: 15000 }).toBe(50);

    const restoredDraft = await readLocalDraft(page);
    expect(restoredDraft.sceneDocument?.version).toBe(2);
    expect(restoredDraft.sceneDocument?.direction?.cameraViews).toHaveLength(1);
    expect(restoredDraft.sceneDocument?.direction?.pins).toHaveLength(1);
    expect(restoredDraft.sceneDocument?.direction?.directorPath?.length ?? 0).toBe(savedGraph.director_path.length);
    expect(restoredDraft.sceneGraph.__scene_document_v2?.version).toBe(2);
    expect(restoredDraft.sceneGraph.camera_views).toHaveLength(1);
    expect(restoredDraft.sceneGraph.pins).toHaveLength(1);
    expect(restoredDraft.sceneGraph.director_path.length).toBe(savedGraph.director_path.length);

    await page.screenshot({ path: "/tmp/qa-wave18-full-scene-roundtrip.png", fullPage: true });
});

test("wave19 unsupported sharp viewer falls back before the canvas crashes", async ({ browser }) => {
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();

    await setupPage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(setupPage);
    await upload(setupPage, envImage);
    await setupPage.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await setupPage.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await setupPage.getByTitle("Save Scene as JSON").click();
    const sceneId = await waitForSceneVersionCount(setupPage, 1);
    const { versionPayload } = await fetchLatestVersionPayload(setupPage, sceneId);
    await setupContext.close();

    const fallbackContext = await browser.newContext();
    await fallbackContext.addInitScript(({ key, draft }) => {
        window.localStorage.setItem(key, JSON.stringify(draft));
    }, {
        key: LEGACY_LOCAL_DRAFT_KEY,
        draft: {
            activeScene: sceneId,
            sceneGraph: versionPayload.scene_graph,
            assetsList: [],
            updatedAt: new Date().toISOString(),
        },
    });
    await fallbackContext.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
            if (type === "webgl2") {
                return null;
            }
            return originalGetContext.call(this, type, ...args);
        };
    });

    const page = await fallbackContext.newPage();
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);

    await expect(page.getByText(/3D viewer unavailable/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/does not expose WebGL2/i)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="mvp-viewer-surface"] canvas')).toHaveCount(0);

    await page.screenshot({ path: "/tmp/qa-wave19-unsupported-sharp-fallback.png", fullPage: true });
    await fallbackContext.close();
});

test("wave20 missing preview splat falls back instead of black-screening the viewer", async ({ page }) => {
    const missingSplatDraft = {
        activeScene: "scene_missing_preview",
        sceneGraph: {
            environment: {
                id: "scene_missing_preview",
                lane: "preview",
                urls: {
                    splats: "/storage/scenes/scene_missing_preview/environment/splats.ply",
                    metadata: "/storage/scenes/scene_missing_preview/environment/metadata.json",
                    preview_projection: "/images/hero/interior_daylight.png",
                },
                metadata: {
                    lane: "preview",
                    truth_label: "Instant Preview",
                    quality_tier: "single_image_preview_dense_fallback",
                    rendering: {
                        viewer_renderer: "sharp_gaussian_direct",
                        source_format: "sharp_ply_dense_preview_fallback",
                        color_encoding: "sh_dc_rgb",
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
        updatedAt: "2026-03-11T20:00:00.000Z",
    };

    await page.addInitScript(
        ({ key, draft }) => {
            window.localStorage.setItem(key, JSON.stringify(draft));
        },
        { key: LEGACY_LOCAL_DRAFT_KEY, draft: missingSplatDraft },
    );

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);

    await expect(page.getByText(/3D viewer unavailable/i)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="mvp-viewer-surface"] canvas')).toHaveCount(0);

    await page.screenshot({ path: "/tmp/qa-wave20-missing-splat-fallback.png", fullPage: true });
});

test("wave21 workspace and preview drafts stay on separate v2 namespaces", async ({ browser }) => {
    const context = await browser.newContext();
    const sessionPayload = {
        session: {
            user: {
                userId: "11111111-1111-4111-8111-111111111111",
            },
            activeStudioId: "22222222-2222-4222-8222-222222222222",
        },
    };

    const workspacePage = await context.newPage();
    await setAuthSessionRouteMock(workspacePage, sessionPayload);
    await workspacePage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    const workspaceDraft = await createSavedWorkspaceDraft(workspacePage, {
        directorBrief: "Workspace route isolation check.",
        marker: "workspace",
    });
    expect(workspaceDraft.sceneId).toBeTruthy();
    const workspaceKey = await getNamespacedLocalDraftKey(workspacePage, "workspace");
    expect(workspaceKey).toContain(":workspace:");
    expect(workspaceKey).toContain(LOCAL_DRAFT_KEY_PREFIX);
    expect((await readNamespacedLocalDraft(workspacePage, "workspace"))?.sceneDocument?.version).toBe(2);

    const previewPage = await context.newPage();
    await setAuthSessionRouteMock(previewPage, sessionPayload);
    await previewPage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(previewPage);
    await expect(previewPage.getByText(/Build one world\./i)).toBeVisible();
    await expect(await readNamespacedLocalDraft(previewPage, "preview")).toBeNull();
    await expect(await readLocalDraft(previewPage, "preview")).toBeNull();
    await previewPage.getByRole("button", { name: /Open sample world/i }).click();
    await expect(previewPage.getByTestId("mvp-preview-back-to-start")).toBeVisible({ timeout: 15000 });

    const previewKey = await getNamespacedLocalDraftKey(previewPage, "preview");
    expect(previewKey).toContain(":preview:");
    expect(previewKey).toContain(LOCAL_DRAFT_KEY_PREFIX);
    expect(previewKey).not.toBe(workspaceKey);

    const localKeys = await listLocalDraftKeys(previewPage);
    expect(localKeys).toEqual(expect.arrayContaining([workspaceKey, previewKey]));
    expect((await readNamespacedLocalDraft(previewPage, "preview"))?.sceneDocument?.version).toBe(2);
    expect((await readNamespacedLocalDraft(previewPage, "workspace"))?.sceneDocument?.version).toBe(2);

    await context.close();
});

test("wave22 first and second authenticated browser tabs keep separate draft namespaces", async ({ browser }) => {
    const context = await browser.newContext();
    const firstSessionPayload = {
        session: {
            user: {
                userId: "33333333-3333-4333-8333-333333333333",
            },
            activeStudioId: "44444444-4444-4444-8444-444444444444",
        },
    };
    const secondSessionPayload = {
        session: {
            user: {
                userId: "55555555-5555-4555-8555-555555555555",
            },
            activeStudioId: "66666666-6666-4666-8666-666666666666",
        },
    };

    const anonymousPage = await context.newPage();
    await setAuthSessionRouteMock(anonymousPage, firstSessionPayload);
    await anonymousPage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    const firstDraft = await createSavedWorkspaceDraft(anonymousPage, {
        directorBrief: "First authenticated tab draft",
        marker: "first",
    });
    const firstKey = await getNamespacedLocalDraftKey(anonymousPage, "workspace");
    expect(firstKey).toContain(":user_33333333-3333-4333-8333-333333333333:");
    expect(firstKey).toContain(":studio_44444444-4444-4444-8444-444444444444:");

    const authedPage = await context.newPage();
    await setAuthSessionRouteMock(authedPage, secondSessionPayload);
    await authedPage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    const secondDraft = await createSavedWorkspaceDraft(authedPage, {
        directorBrief: "Second authenticated tab draft",
        marker: "second",
    });
    const secondKey = await getNamespacedLocalDraftKey(authedPage, "workspace");
    expect(secondKey).toContain(":user_55555555-5555-4555-8555-555555555555:");
    expect(secondKey).toContain(":studio_66666666-6666-4666-8666-666666666666:");
    expect(secondKey).not.toBe(firstKey);

    const localKeys = await listLocalDraftKeys(authedPage);
    expect(localKeys).toEqual(expect.arrayContaining([firstKey, secondKey]));
    expect(firstDraft.sceneId).not.toBe(secondDraft.sceneId);
    await context.close();
});

test("wave23 restoring a saved version does not trigger an autosave", async ({ page }) => {
    await setAuthSessionRouteMock(page, { session: null });
    const saveRequests = [];
    page.on("request", (request) => {
        if (request.url().endsWith("/api/mvp/scene/save") && request.method() === "POST") {
            saveRequests.push(request.postDataJSON());
        }
    });

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);
    await page.getByPlaceholder(/Director brief:/i).fill("Restore guard baseline.");
    await page.getByTitle("Save Scene as JSON").click();
    const sceneId = await waitForSceneVersionCount(page, 1);
    const baselineSaveCount = saveRequests.length;

    await page.getByPlaceholder(/Director brief:/i).fill("Restore guard mutated draft.");
    await page.getByTitle("Restore version").first().click();
    await expect.poll(async () => saveRequests.length, { timeout: 10000 }).toBe(baselineSaveCount);
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 500);
    expect(saveRequests.length).toBe(baselineSaveCount);
    expect(saveRequests.at(-1)?.scene_id).toBe(sceneId);
});

test("wave24 a fresh-scene manual save and autosave race keeps one scene id", async ({ page }) => {
    await setAuthSessionRouteMock(page, { session: null });
    const saveBodies = [];
    let releaseFirstSave = null;

    await page.route("**/api/mvp/scene/save", async (route) => {
        const body = route.request().postDataJSON();
        saveBodies.push(body);
        if (saveBodies.length === 1) {
            await new Promise((resolve) => {
                releaseFirstSave = resolve;
            });
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                saved_at: "2026-03-17T10:00:00.000Z",
            }),
        });
    });

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await upload(page, envImage);
    await page.getByRole("button", { name: /Build world preview/i }).click();
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 120000 })
        .toMatch(/ready:\s+scene_/i);

    await page.getByTitle("Save Scene as JSON").click();
    await expect.poll(async () => saveBodies.length, { timeout: 5000 }).toBe(1);
    await page.waitForTimeout(150);
    await page.getByPlaceholder(/Director brief:/i).fill("Edited while first save is still pending.");
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 300);
    releaseFirstSave?.();

    await expect.poll(async () => saveBodies.length, { timeout: 15000 }).toBe(2);
    expect(saveBodies[0]?.scene_id).toBeTruthy();
    expect(saveBodies[0]?.scene_id).toBe(saveBodies[1]?.scene_id);
    expect(saveBodies[1]?.scene_document?.direction?.directorBrief).toContain("Edited while first save is still pending.");
    expect(new Set(saveBodies.map((body) => body.scene_id)).size).toBe(1);
});

test("wave25 legacy v1 workspace drafts migrate into the v2 namespace and clear the legacy slot", async ({ browser }) => {
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    await setAuthSessionRouteMock(setupPage, { session: null });
    await setupPage.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(setupPage);
    const seededDraft = await createSavedWorkspaceDraft(setupPage, {
        directorBrief: "Legacy migration seed.",
        marker: "legacy",
    });
    const { versionPayload } = await fetchLatestVersionPayload(setupPage, seededDraft.sceneId);
    await setupContext.close();

    const context = await browser.newContext();
    await context.addInitScript(
        ({ key, draft }) => {
            window.localStorage.setItem(key, JSON.stringify(draft));
        },
        {
            key: LEGACY_LOCAL_DRAFT_KEY,
            draft: {
                activeScene: seededDraft.sceneId,
                sceneGraph: versionPayload.scene_graph,
                assetsList: [],
                updatedAt: "2026-03-09T18:00:00.000Z",
            },
        },
    );

    const page = await context.newPage();
    await setAuthSessionRouteMock(page, { session: null });
    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);

    const migratedKey = await getNamespacedLocalDraftKey(page, "workspace");
    expect(migratedKey).toContain(":workspace:");
    expect(migratedKey).toContain(LOCAL_DRAFT_KEY_PREFIX);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LEGACY_LOCAL_DRAFT_KEY)).toBeNull();

    const migratedDraft = await readNamespacedLocalDraft(page, "workspace");
    expect(migratedDraft?.activeScene).toBe(seededDraft.sceneId);
    expect(migratedDraft?.sceneDocument?.version).toBe(2);
    expect(migratedDraft?.sceneGraph?.__scene_document_v2?.version).toBe(2);

    await context.close();
});

test("wave26 auth transitions keep anonymous and authenticated workspace drafts isolated", async ({ page }) => {
    const sessionPayload = { session: null };
    await setAuthSessionRouteMock(page, sessionPayload);

    await page.goto(`${BASE}/mvp`, { waitUntil: "networkidle" });
    await waitForBackendReady(page);
    const anonymousDraft = await createSavedWorkspaceDraft(page, {
        directorBrief: "Anonymous draft for auth transition.",
        marker: "anonymous",
    });
    const anonymousKey = await getNamespacedLocalDraftKey(page, "workspace");
    expect(anonymousKey).toContain(":workspace:");
    expect(anonymousKey).toContain(":session_");

    sessionPayload.session = {
        user: {
            userId: "77777777-7777-4777-8777-777777777777",
        },
        activeStudioId: "88888888-8888-4888-8888-888888888888",
    };

    await page.reload({ waitUntil: "networkidle" });
    await waitForBackendReady(page);
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
    const authenticatedDraft = await createSavedWorkspaceDraft(page, {
        directorBrief: "Authenticated draft for auth transition.",
        marker: "authenticated",
    });
    const authenticatedKey = await getNamespacedLocalDraftKey(page, "workspace");
    expect(authenticatedKey).toContain(":workspace:");
    expect(authenticatedKey).toContain(":user_77777777-7777-4777-8777-777777777777:");
    expect(authenticatedKey).toContain(":studio_88888888-8888-4888-8888-888888888888:");
    expect(authenticatedKey).not.toBe(anonymousKey);

    const localKeys = await listLocalDraftKeys(page);
    expect(localKeys).toEqual(expect.arrayContaining([anonymousKey, authenticatedKey]));
    expect(anonymousDraft.sceneId).not.toBe(authenticatedDraft.sceneId);

    sessionPayload.session = null;
    await page.reload({ waitUntil: "networkidle" });
    await waitForBackendReady(page);

    const recoveredAnonymousDraft = await readNamespacedLocalDraft(page, "workspace");
    expect(recoveredAnonymousDraft?.activeScene).toBe(anonymousDraft.sceneId);
    expect(await getNamespacedLocalDraftKey(page, "workspace")).toBe(anonymousKey);
    expect((await readNamespacedLocalDraft(page, "workspace"))?.sceneDocument?.version).toBe(2);
});
