import fs from "fs/promises";
import path from "path";
import { chromium } from "@playwright/test";

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const fixturePath = path.resolve(process.argv[3] ?? "tests/fixtures/public-scenes/03-neon-streets.png");
const screenshotPath = process.argv[4] ?? "/tmp/mvp-preview-repro.png";
const routePath = process.argv[5] ?? "/mvp";
const existingSceneId = process.env.EXISTING_SCENE_ID || "";
const waitMs = Number(process.env.WAIT_MS ?? "12000");
const headless = process.env.HEADLESS !== "0";
const channel = process.env.PW_CHANNEL || undefined;
const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS ?? "300000");

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toProxyUrl(urlOrPath) {
    if (!urlOrPath) return "";
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
        return urlOrPath;
    }
    if (urlOrPath.startsWith("/api/mvp")) {
        return urlOrPath;
    }
    if (urlOrPath.startsWith("/storage/")) {
        return `/api/mvp${urlOrPath}`;
    }
    if (urlOrPath.startsWith("/")) {
        return `/api/mvp${urlOrPath}`;
    }
    return `/api/mvp/${urlOrPath}`;
}

async function jsonFetch(url, init) {
    const response = await fetch(url, init);
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = { raw: text };
    }
    return { response, payload };
}

async function uploadFixture() {
    const bytes = await fs.readFile(fixturePath);
    const formData = new FormData();
    formData.set("file", new Blob([bytes], { type: "image/png" }), path.basename(fixturePath));
    const { response, payload } = await jsonFetch(`${baseUrl}/api/mvp/upload`, {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        throw new Error(`upload failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}

async function generatePreview(imageId) {
    const { response, payload } = await jsonFetch(`${baseUrl}/api/mvp/generate/environment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
    });
    if (!response.ok) {
        throw new Error(`preview generation failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}

async function pollJob(jobId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < pollTimeoutMs) {
        const { response, payload } = await jsonFetch(`${baseUrl}/api/mvp/jobs/${jobId}`, {
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`job polling failed: ${response.status} ${JSON.stringify(payload)}`);
        }
        if (payload?.status === "completed" || payload?.status === "failed") {
            return payload;
        }
        await sleep(1000);
    }
    throw new Error(`job timeout: ${jobId}`);
}

async function fetchMetadata(metadataUrl) {
    const { response, payload } = await jsonFetch(`${baseUrl}${toProxyUrl(metadataUrl)}`, {
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error(`metadata fetch failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}

let upload = null;
let preview = null;
let finalJob = null;
let sceneId = existingSceneId;
let urls = {};
let metadata = null;

if (existingSceneId) {
    urls = {
        viewer: toProxyUrl(`/storage/scenes/${existingSceneId}/environment`),
        splats: toProxyUrl(`/storage/scenes/${existingSceneId}/environment/splats.ply`),
        cameras: toProxyUrl(`/storage/scenes/${existingSceneId}/environment/cameras.json`),
        metadata: toProxyUrl(`/storage/scenes/${existingSceneId}/environment/metadata.json`),
    };
    metadata = await fetchMetadata(urls.metadata);
} else {
    upload = await uploadFixture();
    preview = await generatePreview(upload.image_id);
    finalJob = await pollJob(preview.job_id ?? preview.scene_id);
    if (finalJob.status === "failed") {
        throw new Error(finalJob.error || "preview generation failed");
    }

    sceneId = finalJob.result?.scene_id ?? preview.scene_id ?? preview.job_id;
    urls = Object.fromEntries(
        Object.entries(finalJob.result?.urls ?? preview.urls ?? {}).map(([key, value]) => [key, toProxyUrl(value)]),
    );
    metadata = await fetchMetadata(urls.metadata);
}
const draftJson = JSON.stringify({
    activeScene: sceneId,
    sceneGraph: {
        environment: {
            id: sceneId,
            lane: metadata?.lane ?? "preview",
            urls,
            files: finalJob?.result?.files ?? null,
            metadata,
        },
        assets: [],
    },
    assetsList: [],
    updatedAt: new Date().toISOString(),
});

const browser = await chromium.launch({ headless, channel });
const context = await browser.newContext({ viewport: { width: 2048, height: 1124 } });
const page = await context.newPage();

const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const failingResponses = [];

page.on("console", (message) => {
    consoleMessages.push({
        type: message.type(),
        text: message.text(),
    });
});

page.on("pageerror", (error) => {
    pageErrors.push(String(error));
});

page.on("requestfailed", (request) => {
    requestFailures.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText ?? "unknown",
    });
});

page.on("response", async (response) => {
    const targetUrl = response.url();
    if (!targetUrl.includes("/api/mvp/")) {
        return;
    }
    if (response.status() >= 400) {
        failingResponses.push({
            url: targetUrl,
            status: response.status(),
            statusText: response.statusText(),
        });
    }
});

await page.addInitScript((payload) => {
    window.localStorage.removeItem("gauset:mvp:hud:v1:workspace");
    window.localStorage.removeItem("gauset:mvp:hud:v1:preview");
    window.localStorage.setItem("gauset:mvp:draft:v1", payload);
}, draftJson);

await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle", timeout: 120000 });
const resumeDraftButton = page.getByRole("button", { name: /Resume last draft/i });
if (await resumeDraftButton.count()) {
    await resumeDraftButton.first().click();
    await page.waitForLoadState("networkidle");
}
await page.waitForTimeout(waitMs);
await page.screenshot({ path: screenshotPath, fullPage: true });

const diagnostics = await page.evaluate(() => {
    const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
    const canvas = viewerSurface?.querySelector("canvas") ?? null;
    const previewImage = viewerSurface?.querySelector('img[alt="Single-image ML-Sharp preview projection"]') ?? null;
    const webglProbe = document.createElement("canvas");
    const webglContext =
        webglProbe.getContext("webgl2") ??
        webglProbe.getContext("webgl") ??
        webglProbe.getContext("experimental-webgl");

    return {
        title: document.title,
        bodyTextSnippet: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) ?? "",
        hasViewerSurface: Boolean(viewerSurface),
        hasCanvas: Boolean(canvas),
        hasPreviewImage: Boolean(previewImage),
        previewImageSrc: previewImage?.getAttribute("src") ?? null,
        webglContextAvailable: Boolean(webglContext),
        viewerBackground: viewerSurface ? window.getComputedStyle(viewerSurface).backgroundImage || window.getComputedStyle(viewerSurface).backgroundColor : null,
        canvasBackground: canvas ? window.getComputedStyle(canvas).backgroundColor : null,
        canvasOpacity: canvas ? window.getComputedStyle(canvas).opacity : null,
        canvasSize:
            canvas && "width" in canvas && "height" in canvas
                ? {
                      width: canvas.width,
                      height: canvas.height,
                      clientWidth: canvas.clientWidth,
                      clientHeight: canvas.clientHeight,
                  }
                : null,
        statusBlocks: Array.from(document.querySelectorAll("p,span,div"))
            .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .filter((text) => text.includes("Preview Loaded") || text.includes("Instant Preview") || text.includes("Image-to-Splat"))
            .slice(0, 12),
        hudButtons: Array.from(document.querySelectorAll("button"))
            .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .filter(Boolean)
            .filter((text) => text.includes("HUD") || text === "Hide" || text === "Expand")
            .slice(0, 20),
    };
});

console.log(
    JSON.stringify(
        {
            baseUrl,
            routePath,
            fixturePath,
            existingSceneId,
            screenshotPath,
            upload,
            preview,
            finalJob,
            metadata,
            diagnostics,
            consoleMessages,
            pageErrors,
            requestFailures,
            failingResponses,
        },
        null,
        2,
    ),
);

await browser.close();
