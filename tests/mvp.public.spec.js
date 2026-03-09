const fs = require("fs");
const path = require("path");
const { test, expect } = require("playwright/test");

const BASE = process.env.GAUSET_MVP_BASE_URL || "https://gauset-app.vercel.app";
const FIXTURE_DIR = path.resolve(__dirname, "fixtures/public-scenes");
const ARTIFACT_DIR = path.resolve(__dirname, "../test-results/public-live");

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

function ensureArtifactsDir() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function artifactPath(name) {
    ensureArtifactsDir();
    return path.join(ARTIFACT_DIR, name);
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

async function gotoMvp(page) {
    await page.goto(`${BASE}/mvp?ts=${Date.now()}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("mvp-shell-title")).toBeVisible();
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
    await expect
        .poll(async () => await page.locator("body").innerText(), { timeout: 20_000 })
        .toMatch(/Saved scene_/);
    const sceneId =
        ((await page.locator("p.font-mono").first().textContent()) || "")
            .trim()
            .match(/scene_[a-z0-9]+/i)?.[0] ||
        (await page.locator("body").innerText()).match(/Saved (scene_[a-z0-9]+)/i)?.[1];
    if (!sceneId) {
        throw new Error("Could not extract saved scene id.");
    }
    return { payload, sceneId };
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
    await page.getByPlaceholder("Project name").fill(`Wave ${scene} Project`);
    await page.getByPlaceholder("Scene title").fill(`${scene} validation`);
    await page.getByPlaceholder("Location").fill(`${scene} set`);
    await page.getByPlaceholder("Owner").fill("Codex QA");
    await page.getByPlaceholder("Production context").fill(`${scene} live production validation`);
    await page.getByPlaceholder("Approval note").fill(`${scene} approval note`);
    await page.getByRole("button", { name: statusAction }).click();
}

test("wave1 desert environment upload generate save and splat storage", async ({ page }) => {
    await gotoMvp(page);
    await waitForBackendReady(page);
    const upload = await uploadImage(page, FIXTURES.desert);
    expect(upload.filename).toMatch(/\.png$/i);
    const job = await generateEnvironment(page);
    expect(job.image_id).toBe(upload.image_id);
    const { sceneId } = await saveScene(page);
    expect(sceneId).toMatch(/^scene_/);
    expect(sceneId).toBe(job.result.scene_id);
    await fetchVersions(page, sceneId);
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/splats.ply`);
    await assertStorage(
        page,
        `/storage/scenes/${sceneId}/environment/metadata.json`,
        "application/json",
    );
    await page.screenshot({ path: artifactPath("wave01-desert-environment.png"), fullPage: true });
});

test("wave2 island environment review metadata approval and comments", async ({ page }) => {
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
                project_name: `Wave ${scene} Project`,
                scene_title: `${scene} validation`,
                location_name: `${scene} set`,
                owner: "Codex QA",
                notes: `${scene} live production validation`,
            },
            approval_state: "approved",
            updated_by: "Codex QA",
            note: `${scene} approval note`,
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();
    const review = await waitForReviewState(page, sceneId, "approved");
    expect(review.metadata.scene_title).toContain(scene);
    const commentUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`, {
        data: {
            author: "Codex QA",
            body: `${scene} pinned review comment`,
            anchor: "scene",
        },
    });
    expect(commentUpsert.ok()).toBeTruthy();
    const comments = await fetchComments(page, sceneId, versionId);
    expect(comments[0].body).toContain(scene);
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/cameras.json`, "application/json", 1);
    await page.screenshot({ path: artifactPath("wave02-island-annotation.png"), fullPage: true });
});

test("wave3 streets environment review page and version history", async ({ page }) => {
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.streets);
    await generateEnvironment(page);
    const { sceneId } = await saveScene(page);
    const versions = await fetchVersions(page, sceneId);
    const versionId = versions[0]?.version_id;
    expect(versionId).toMatch(/^[a-z0-9_-]{12,}$/i);
    await page.goto(`${BASE}/mvp/review?scene=${sceneId}&version=${versionId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("review-page-title")).toBeVisible();
    await page.screenshot({ path: artifactPath("wave03-streets-review-page.png"), fullPage: true });
});

test("wave4 canyon asset upload mesh preview and save", async ({ page }) => {
    await gotoMvp(page);
    await waitForBackendReady(page);
    const upload = await uploadImage(page, FIXTURES.canyon);
    const job = await generateAsset(page);
    expect(job.image_id).toBe(upload.image_id);
    await page.locator('[draggable="true"]').first().click();
    await expect(page.getByText(/pos \[/)).toBeVisible({ timeout: 10_000 });
    await saveScene(page);
    await assertStorage(page, `/storage/assets/${job.result.asset_id}/preview.png`, "image/png");
    await assertStorage(page, `/storage/assets/${job.result.asset_id}/mesh.glb`);
    await page.screenshot({ path: artifactPath("wave04-canyon-asset.png"), fullPage: true });
});

test("wave5 alpine asset duplicate and delete controls", async ({ page }) => {
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
    await page.screenshot({ path: artifactPath("wave05-alpine-duplicate-delete.png"), fullPage: true });
});

test("wave6 forest asset version restore", async ({ page }) => {
    await gotoMvp(page);
    await waitForBackendReady(page);
    await uploadImage(page, FIXTURES.forest);
    await generateAsset(page);
    await page.locator('[draggable="true"]').first().click();
    await saveScene(page);
    await page.getByTitle("Duplicate").click();
    await expect(page.getByText(/pos \[/)).toHaveCount(2);
    await saveScene(page);
    await expect(page.getByTitle("Restore version").nth(1)).toBeVisible();
    await page.getByTitle("Restore version").nth(1).click();
    await expect(page.getByText(/pos \[/)).toHaveCount(1, { timeout: 15_000 });
    await page.screenshot({ path: artifactPath("wave06-forest-restore.png"), fullPage: true });
});

test("wave7 harbor environment copy review link and export package", async ({ browser }) => {
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
    await page.screenshot({ path: artifactPath("wave07-harbor-export.png"), fullPage: true });
    await context.close();
});

test("wave8 market environment changes requested state", async ({ page }) => {
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
    await page.screenshot({ path: artifactPath("wave08-market-changes-requested.png"), fullPage: true });
});

test("wave9 night environment in-review state and comment history", async ({ page }) => {
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
                project_name: `Wave ${scene} Project`,
                scene_title: `${scene} validation`,
                location_name: `${scene} set`,
                owner: "Codex QA",
                notes: `${scene} live production validation`,
            },
            approval_state: "in_review",
            updated_by: "Codex QA",
            note: `${scene} approval note`,
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();

    const commentUpsert = await page.request.post(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`, {
        data: {
            author: "Codex QA",
            body: `${scene} pinned review comment`,
            anchor: "scene",
        },
    });
    expect(commentUpsert.ok()).toBeTruthy();

    const review = await waitForReviewState(page, sceneId, "in_review");
    expect(review.metadata.scene_title).toContain(scene);
    const comments = await fetchComments(page, sceneId, versionId);
    expect(comments[0].body).toContain(scene);
    await page.screenshot({ path: artifactPath("wave09-night-in-review.png"), fullPage: true });
});

test("wave10 seaside environment save metadata and storage validation", async ({ page }) => {
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
                project_name: `Wave ${scene} Project`,
                scene_title: `${scene} validation`,
                location_name: `${scene} set`,
                owner: "Codex QA",
                notes: `${scene} live production validation`,
            },
            approval_state: "draft",
            updated_by: "Codex QA",
            note: `${scene} approval note`,
        },
    });
    expect(reviewUpsert.ok()).toBeTruthy();
    const review = await waitForReviewTitle(page, sceneId, scene);
    expect(review.approval.state).toBe("draft");
    const versions = await fetchVersions(page, sceneId);
    expect(versions[0].summary.has_environment).toBeTruthy();
    await assertStorage(page, `/storage/scenes/${sceneId}/environment/splats.ply`);
    await page.screenshot({ path: artifactPath("wave10-seaside-final.png"), fullPage: true });
});
