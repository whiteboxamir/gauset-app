const fs = require("fs");
const path = require("path");
const { test, expect } = require("playwright/test");
const { assertPublicCertificationContext, assertPublicMvpBaseUrl } = require("../scripts/mvp_host_guard.cjs");

const BASE = assertPublicMvpBaseUrl(process.env.GAUSET_MVP_BASE_URL || "https://gauset-app.vercel.app", "tests/mvp.public.spec.js");
const { runLabel, artifactDir } = assertPublicCertificationContext("tests/mvp.public.spec.js");
const FIXTURE_DIR = path.resolve(__dirname, "fixtures/public-scenes");
const ARTIFACT_DIR = path.resolve(__dirname, "..", artifactDir);
const ACTOR_LABEL = `Codex QA ${runLabel}`;
const PLAYWRIGHT_MANIFEST_PATH = path.join(ARTIFACT_DIR, "playwright-run-manifest.json");

const FIXTURES = {
    desert: path.join(FIXTURE_DIR, "01-desert-dunes.png"),
    island: path.join(FIXTURE_DIR, "02-island-lagoon.png"),
    streets: path.join(FIXTURE_DIR, "03-neon-streets.png"),
    canyon: path.join(FIXTURE_DIR, "04-canyon-overlook.png"),
    snow: path.join(FIXTURE_DIR, "05-alpine-snow.png"),
    forest: path.join(FIXTURE_DIR, "06-forest-trail.png"),
    harbor: path.join(FIXTURE_DIR, "07-harbor-docks.png"),
    market: path.join(FIXTURE_DIR, "08-market-plaza.png"),
    night: path.join(FIXTURE_DIR, "09-night-city.png"),
    cliffs: path.join(FIXTURE_DIR, "10-seaside-cliffs.png"),
};

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const waveEvidence = new Map();
const playwrightManifest = {
    run_label: runLabel,
    base: BASE,
    artifact_dir: artifactDir,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
    waves: [],
};

function ensureArtifactsDir() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function artifactPath(name) {
    ensureArtifactsDir();
    return path.join(ARTIFACT_DIR, name);
}

function persistManifest() {
    ensureArtifactsDir();
    fs.writeFileSync(PLAYWRIGHT_MANIFEST_PATH, JSON.stringify(playwrightManifest, null, 2));
}

function recordWaveEvidence(testTitle, evidence) {
    const current = waveEvidence.get(testTitle) || {};
    const nextEvidence = { ...current, ...evidence };
    if (current.screenshots || evidence.screenshots) {
        nextEvidence.screenshots = Array.from(new Set([...(current.screenshots || []), ...(evidence.screenshots || [])]));
    }
    waveEvidence.set(testTitle, nextEvidence);
    persistManifest();
}

async function captureWaveScreenshot(page, screenshotName, testTitle) {
    await page.screenshot({ path: artifactPath(screenshotName), fullPage: true });
    recordWaveEvidence(testTitle, { screenshots: [screenshotName] });
}

function resolveApiUrl(urlOrPath) {
    if (/^https?:\/\//.test(urlOrPath)) {
        return urlOrPath;
    }
    if (urlOrPath.startsWith("/api/mvp")) {
        return new URL(urlOrPath, BASE).toString();
    }
    if (urlOrPath.startsWith("/")) {
        return new URL(`/api/mvp${urlOrPath}`, BASE).toString();
    }
    return new URL(`/api/mvp/${urlOrPath}`, BASE).toString();
}

async function fetchDeploymentFingerprint(page) {
    const response = await page.request.get(`${BASE}/api/mvp/deployment`);
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.fingerprint?.build_label).toBeTruthy();
    expect(payload.fingerprint?.commit_short).toBeTruthy();
    return payload.fingerprint;
}

async function expectDeploymentFingerprintBadge(page, testId = "mvp-deployment-fingerprint") {
    const fingerprint = await fetchDeploymentFingerprint(page);
    const badge = page.getByTestId(testId);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(fingerprint.build_label);
    return fingerprint;
}

async function gotoMvp(page) {
    await page.goto(`${BASE}/mvp?cert=${encodeURIComponent(runLabel)}&ts=${Date.now()}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
    await expect(page.getByTestId("mvp-preview-route-badge")).toHaveCount(0);
    await expectDeploymentFingerprintBadge(page);
}

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
            { timeout: 45_000 },
        )
        .toBe("ready");
}

async function uploadImage(page, filePath) {
    const uploadResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/mvp/upload") && response.request().method() === "POST",
    );
    await page.setInputFiles('input[type="file"]', filePath);
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok()).toBeTruthy();
    const payload = await uploadResponse.json();
    expect(payload.image_id).toMatch(/^[a-z0-9_-]{12,}$/i);
    await expect(page.getByTestId("mvp-capture-tray")).toBeVisible({ timeout: 15_000 });
    return payload;
}

async function waitForJob(page, jobId) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/jobs/${jobId}`);
                expect(response.ok()).toBeTruthy();
                payload = await response.json();
                return payload.status;
            },
            { timeout: 120_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBe("completed");
    return payload;
}

async function generateEnvironment(page) {
    const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/mvp/generate/environment") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Build world preview/i }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.job_id).toMatch(/^scene_/);
    const job = await waitForJob(page, payload.job_id);
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 30_000 })
        .toContain("Preview ready:");
    expect(job.result.scene_id).toMatch(/^scene_/);
    return job;
}

async function generateAsset(page) {
    const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/mvp/generate/asset") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Extract 3D asset/i }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.job_id).toMatch(/^asset_/);
    const job = await waitForJob(page, payload.job_id);
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 30_000 })
        .toContain("Asset ready:");
    expect(job.result.asset_id).toMatch(/^asset_/);
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 15_000 });
    return job;
}

async function saveScene(page) {
    const saveResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/mvp/scene/save") && response.request().method() === "POST",
    );
    await page.getByTitle("Save Scene as JSON").click();
    const response = await saveResponsePromise;
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    const sceneId = typeof payload.scene_id === "string" ? payload.scene_id : "";
    if (!sceneId) {
        throw new Error(`Could not extract saved scene id from save payload: ${JSON.stringify(payload)}`);
    }
    await waitForSceneVersionCount(page, sceneId, 1);
    return { payload, sceneId };
}

async function waitForSceneVersionCount(page, sceneId, minimumCount = 1) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions`);
                if (!response.ok()) {
                    return 0;
                }
                payload = await response.json();
                return Array.isArray(payload.versions) ? payload.versions.length : 0;
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBeGreaterThanOrEqual(minimumCount);
    return payload;
}

async function fetchVersions(page, sceneId) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions`);
                if (!response.ok()) {
                    return 0;
                }
                payload = await response.json();
                return Array.isArray(payload.versions) ? payload.versions.length : 0;
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBeGreaterThan(0);
    return payload.versions;
}

async function fetchVersionPayload(page, sceneId, versionId) {
    const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
}

async function fetchReview(page, sceneId) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/review`);
                if (!response.ok()) {
                    return 0;
                }
                payload = await response.json();
                return Object.keys(payload.metadata || {}).length + (payload.approval?.state ? 1 : 0);
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBeGreaterThan(0);
    return payload;
}

async function fetchComments(page, sceneId, versionId) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`);
                if (!response.ok()) {
                    return 0;
                }
                payload = await response.json();
                return Array.isArray(payload.comments) ? payload.comments.length : 0;
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBeGreaterThan(0);
    return payload.comments;
}

async function waitForReviewState(page, sceneId, expectedState) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/review`);
                if (!response.ok()) {
                    return "";
                }
                payload = await response.json();
                return payload.approval?.state || "";
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toBe(expectedState);
    return payload;
}

async function waitForReviewTitle(page, sceneId, expectedSubstring) {
    let payload;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${BASE}/api/mvp/scene/${sceneId}/review`);
                if (!response.ok()) {
                    return "";
                }
                payload = await response.json();
                return payload.metadata?.scene_title || "";
            },
            { timeout: 20_000, intervals: [1_000, 1_500, 2_000] },
        )
        .toContain(expectedSubstring);
    return payload;
}

async function assertStorage(page, urlOrPath, expectedContentType, minimumBytes = 16) {
    const response = await page.request.get(resolveApiUrl(urlOrPath), {
        headers: {
            "accept-encoding": "identity",
        },
    });
    expect(response.ok()).toBeTruthy();
    if (expectedContentType) {
        const headers = response.headers();
        expect(headers["content-type"] || "").toContain(expectedContentType);
    }
    const body = await response.body();
    expect(body.length).toBeGreaterThan(minimumBytes);
    return response;
}

async function fillReviewMetadata(page, scene, statusAction = "Save Review") {
    await expect(page.getByPlaceholder("Project name")).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Project name").fill(`Wave ${scene} Project ${runLabel}`);
    await page.getByPlaceholder("Scene title").fill(`${scene} validation ${runLabel}`);
    await page.getByPlaceholder("Location").fill(`${scene} set ${runLabel}`);
    await page.getByPlaceholder("Owner").fill(ACTOR_LABEL);
    await page.getByPlaceholder("Production context").fill(`${scene} live production validation ${runLabel}`);
    await page.getByPlaceholder("Approval note").fill(`${scene} approval note ${runLabel}`);
    await page.getByRole("button", { name: statusAction }).click();
}

test.beforeAll(() => {
    persistManifest();
});

test.afterEach(async ({}, testInfo) => {
    const evidence = waveEvidence.get(testInfo.title) || {};
    const nextEntry = {
        title: testInfo.title,
        status: testInfo.status,
        duration_ms: testInfo.duration,
        ...evidence,
    };

    if (testInfo.errors.length > 0) {
        nextEntry.errors = testInfo.errors.map((error) => error.message);
    }

    const existingIndex = playwrightManifest.waves.findIndex((wave) => wave.title === testInfo.title);
    if (existingIndex >= 0) {
        playwrightManifest.waves[existingIndex] = {
            ...playwrightManifest.waves[existingIndex],
            ...nextEntry,
        };
    } else {
        playwrightManifest.waves.push(nextEntry);
    }

    persistManifest();
});

test.afterAll(() => {
    playwrightManifest.completed_at = new Date().toISOString();
    playwrightManifest.status = playwrightManifest.waves.some((wave) => wave.status !== "passed") ? "failed" : "passed";
    persistManifest();
});

test("wave0 public preview lane stays separate from main workspace", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave00-public-preview-launchpad.png";

    await page.goto(`${BASE}/mvp/preview?cert=${encodeURIComponent(runLabel)}&ts=${Date.now()}`, { waitUntil: "networkidle" });
    await expect(page.getByText(/Bring one image\./i)).toBeVisible();
    await expectDeploymentFingerprintBadge(page);
    await expect(page.getByRole("button", { name: /See the demo world/i })).toBeVisible();
    await page.getByRole("button", { name: /See the demo world/i }).click();
    await captureWaveScreenshot(page, screenshot, title);
    await expect(page.getByTestId("mvp-preview-route-badge")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Legacy demo world state/i)).toBeVisible();
    recordWaveEvidence(title, {
        wave_id: "wave00",
        route: "/mvp/preview",
        preview_lane_validated: true,
    });
});

test("wave1 desert environment upload generate save and splat storage", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave01-desert-environment.png";
    await gotoMvp(page);
    await waitForBackendReady(page);
    const upload = await uploadImage(page, FIXTURES.desert);
    expect(upload.filename).toMatch(/\.png$/i);
    const job = await generateEnvironment(page);
    expect(job.image_id).toBe(upload.image_id);
    const { sceneId } = await saveScene(page);
    expect(sceneId).toMatch(/^scene_/);
    expect(sceneId).toBe(job.result.scene_id);
    const versions = await fetchVersions(page, sceneId);
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/splats.ply`);
    await assertStorage(
        page,
        `/storage/scenes/${sceneId}/environment/metadata.json`,
        "application/json",
    );
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave01",
        route: "/mvp",
        scene_id: sceneId,
        version_id: versions[0]?.version_id ?? null,
    });
});

test("wave2 island environment review metadata approval and comments", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave02-island-annotation.png";
    const scene = "island";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.island);
    const job = await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    expect(sceneId).toBe(job.result.scene_id);
    const versions = await fetchVersions(page, sceneId);
    const versionId = versions[0]?.version_id;
    expect(versionId).toBeTruthy();
    const reviewUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/review`, {
        data: {
            metadata: {
                project_name: `Wave ${scene} Project ${runLabel}`,
                scene_title: `${scene} validation ${runLabel}`,
                location_name: `${scene} set ${runLabel}`,
                owner: ACTOR_LABEL,
                notes: `${scene} live production validation ${runLabel}`,
                address: "Harbor road stage 3",
                shoot_day: "Day 05",
                permit_status: "approved",
                access_notes: "Use the east gate before 6am.",
                parking_notes: "Crew parking in lot B.",
                power_notes: "Bring distro for the seawall edge.",
                safety_notes: "Wind holds above 20mph.",
            },
            approval_state: "approved",
            updated_by: ACTOR_LABEL,
            note: `${scene} approval note ${runLabel}`,
            issues: [
                {
                    id: `issue_${scene}_power_${runLabel}`,
                    title: "Confirm seawall power run",
                    body: "Need a protected cable path before lighting call.",
                    type: "lighting",
                    severity: "high",
                    status: "open",
                    assignee: "G&E",
                    author: ACTOR_LABEL,
                    anchor_position: [1.2, 0.4, -0.8],
                    anchor_view_id: null,
                    version_id: versionId,
                    created_at: "2026-03-11T08:15:00.000Z",
                    updated_at: "2026-03-11T08:15:00.000Z",
                },
            ],
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();
    const review = await waitForReviewState(page, sceneId, "approved");
    expect(review.metadata.scene_title).toContain(scene);
    expect(review.metadata.address).toBe("Harbor road stage 3");
    expect(review.metadata.permit_status).toBe("approved");
    expect(review.issues).toHaveLength(1);
    expect(review.issues[0].title).toContain("power");
    const commentUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`, {
        data: {
            author: ACTOR_LABEL,
            body: `${scene} pinned review comment ${runLabel}`,
            anchor: "scene",
        },
    });
    expect(commentUpsert.ok()).toBeTruthy();
    const comments = await fetchComments(page, sceneId, versionId);
    expect(comments[0].body).toContain(scene);
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/cameras.json`, "application/json", 1);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave02",
        route: "/mvp",
        scene_id: sceneId,
        version_id: versionId,
    });
});

test("wave3 streets environment review page and version history", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave03-streets-review-page.png";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.streets);
    await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    const versions = await fetchVersions(page, sceneId);
    const versionId = versions[0]?.version_id;
    expect(versionId).toMatch(/^[a-z0-9_-]{12,}$/i);
    const reviewUrl = `${BASE}/mvp/review?scene=${sceneId}&version=${versionId}`;
    await page.goto(reviewUrl, { waitUntil: "networkidle" });
    await expect(page.getByTestId("review-page-title")).toBeVisible();
    await expectDeploymentFingerprintBadge(page, "review-deployment-fingerprint");
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave03",
        route: "/mvp/review",
        scene_id: sceneId,
        version_id: versionId,
        review_url: reviewUrl,
    });
});

test("wave4 canyon asset upload mesh preview and save", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave04-canyon-asset.png";
    await gotoMvp(page);
    await waitForBackendReady(page);
    const upload = await uploadImage(page, FIXTURES.canyon);
    const job = await generateAsset(page);
    expect(job.image_id).toBe(upload.image_id);
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toBeVisible({ timeout: 10_000 });
    const { sceneId } = await saveScene(page);
    await assertStorage(page, `/storage/assets/${job.result.asset_id}/preview.png`, "image/png");
    await assertStorage(page, `/storage/assets/${job.result.asset_id}/mesh.glb`);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave04",
        route: "/mvp",
        asset_id: job.result.asset_id,
        scene_id: sceneId,
    });
});

test("wave5 alpine asset duplicate and delete controls", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave05-alpine-duplicate-delete.png";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.snow);
    await generateAsset(page);
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1);
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await page.getByTitle("Delete").first().click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave05",
        route: "/mvp",
    });
});

test("wave6 forest asset version restore", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave06-forest-restore.png";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.forest);
    await generateAsset(page);
    await page.locator('[draggable="true"]').first().click();
    const { sceneId } = await saveScene(page);
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await saveScene(page);
    await expect(page.getByTitle("Restore version").nth(1)).toBeVisible();
    await page.getByTitle("Restore version").nth(1).click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1, { timeout: 15_000 });
    const versions = await fetchVersions(page, sceneId);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave06",
        route: "/mvp",
        scene_id: sceneId,
        version_ids: versions.map((version) => version.version_id),
    });
});

test("wave7 harbor environment copy review link and export package", async ({ browser }) => {
    const title = test.info().title;
    const screenshot = "wave07-harbor-export.png";
    const context = await browser.newContext({
        permissions: ["clipboard-read", "clipboard-write"],
        acceptDownloads: true,
    });
    const page = await context.newPage();
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.harbor);
    await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    await fetchVersions(page, sceneId);
    await page.getByRole("button", { name: "Copy Review Link" }).click();
    await expect(page.getByText("Review link copied.")).toBeVisible({ timeout: 15_000 });
    const reviewLink = await page.evaluate(() => navigator.clipboard.readText());
    expect(reviewLink).toContain("/mvp/review?");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Package" }).click();
    const download = await downloadPromise;
    const packagePath = artifactPath("wave07-harbor-review-package.json");
    await download.saveAs(packagePath);
    const exported = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    expect(exported.summary).toBeTruthy();
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave07",
        route: "/mvp",
        scene_id: sceneId,
        review_url: reviewLink,
        exported_package: path.basename(packagePath),
    });
    await context.close();
});

test("wave8 market environment changes requested state", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave08-market-changes-requested.png";
    const scene = "market";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.market);
    await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    await fetchVersions(page, sceneId);
    await fillReviewMetadata(page, scene, "Request Changes");
    await expect(page.getByText("Scene marked changes requested.")).toBeVisible({ timeout: 15_000 });
    const review = await fetchReview(page, sceneId);
    expect(review.approval.state).toBe("changes_requested");
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave08",
        route: "/mvp",
        scene_id: sceneId,
    });
});

test("wave9 night environment in-review state and comment history", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave09-night-in-review.png";
    const scene = "night";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.night);
    await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    const versions = await fetchVersions(page, sceneId);
    const versionId = versions[0]?.version_id;
    expect(versionId).toBeTruthy();

    const reviewUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/review`, {
        data: {
            metadata: {
                project_name: `Wave ${scene} Project ${runLabel}`,
                scene_title: `${scene} validation ${runLabel}`,
                location_name: `${scene} set ${runLabel}`,
                owner: ACTOR_LABEL,
                notes: `${scene} live production validation ${runLabel}`,
            },
            approval_state: "in_review",
            updated_by: ACTOR_LABEL,
            note: `${scene} approval note ${runLabel}`,
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();

    const commentUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`, {
        data: {
            author: ACTOR_LABEL,
            body: `${scene} pinned review comment ${runLabel}`,
            anchor: "scene",
        },
    });
    expect(commentUpsert.ok()).toBeTruthy();

    const review = await waitForReviewState(page, sceneId, "in_review");
    expect(review.metadata.scene_title).toContain(scene);
    const comments = await fetchComments(page, sceneId, versionId);
    expect(comments[0].body).toContain(scene);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave09",
        route: "/mvp",
        scene_id: sceneId,
        version_id: versionId,
    });
});

test("wave10 seaside environment save metadata and storage validation", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave10-seaside-final.png";
    const scene = "cliffs";
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.cliffs);
    const job = await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    expect(sceneId).toBe(job.result.scene_id);
    await fetchVersions(page, sceneId);
    const reviewUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/review`, {
        data: {
            metadata: {
                project_name: `Wave ${scene} Project ${runLabel}`,
                scene_title: `${scene} validation ${runLabel}`,
                location_name: `${scene} set ${runLabel}`,
                owner: ACTOR_LABEL,
                notes: `${scene} live production validation ${runLabel}`,
            },
            approval_state: "draft",
            updated_by: ACTOR_LABEL,
            note: `${scene} approval note ${runLabel}`,
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();
    const review = await waitForReviewTitle(page, sceneId, scene);
    expect(review.approval.state).toBe("draft");
    const versions = await fetchVersions(page, sceneId);
    expect(versions[0].summary.has_environment).toBeTruthy();
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/splats.ply`);
    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave10",
        route: "/mvp",
        scene_id: sceneId,
        version_id: versions[0]?.version_id ?? null,
    });
});

test("wave11 public scene save persists views pins path brief and viewer lens", async ({ page }) => {
    const title = test.info().title;
    const screenshot = "wave11-public-scene-graph-persistence.png";
    const directorBrief = "50mm move off the boardwalk. Keep the left egress path open and hold the horizon clean.";

    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.desert);
    await generateEnvironment(page);

    const canvas = page.locator('[data-testid="mvp-viewer-surface"] canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "50mm" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "50mm" }).click();
    await page.getByRole("button", { name: /Save camera view/i }).click();
    await expect(page.getByRole("button", { name: "View 1" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Scene notes/i }).click();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
        throw new Error("Public viewer canvas did not expose a bounding box for pin placement.");
    }
    await page.mouse.click(canvasBox.x + canvasBox.width * 0.52, canvasBox.y + canvasBox.height * 0.52);

    await page.getByPlaceholder(/Director brief:/i).fill(directorBrief);
    await page.getByRole("button", { name: /Record camera path/i }).click();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.56, canvasBox.y + canvasBox.height * 0.56);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.68, canvasBox.y + canvasBox.height * 0.48, { steps: 14 });
    await page.waitForTimeout(250);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.42, canvasBox.y + canvasBox.height * 0.44, { steps: 14 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /Stop path/i }).click();

    const { sceneId } = await saveScene(page);
    const versions = await fetchVersions(page, sceneId);
    const versionId = versions[0]?.version_id;
    expect(versionId).toBeTruthy();

    const versionPayload = await fetchVersionPayload(page, sceneId, versionId);
    expect(versionPayload.scene_graph.camera_views).toHaveLength(1);
    expect(versionPayload.scene_graph.pins).toHaveLength(1);
    expect(versionPayload.scene_graph.director_path.length).toBeGreaterThan(1);
    expect(versionPayload.scene_graph.director_brief).toBe(directorBrief);
    expect(versionPayload.scene_graph.viewer.lens_mm).toBe(50);
    expect(versionPayload.scene_document?.version).toBe(2);
    expect(versionPayload.scene_document?.direction?.cameraViews).toHaveLength(1);
    expect(versionPayload.scene_document?.direction?.pins).toHaveLength(1);
    expect(versionPayload.scene_document?.direction?.directorPath?.length ?? 0).toBeGreaterThan(1);
    expect(versionPayload.scene_document?.direction?.directorBrief).toBe(directorBrief);
    expect(versionPayload.scene_document?.viewer?.lens_mm).toBe(50);

    await captureWaveScreenshot(page, screenshot, title);
    recordWaveEvidence(title, {
        wave_id: "wave11",
        route: "/mvp",
        scene_id: sceneId,
        version_id: versionId,
    });
});
