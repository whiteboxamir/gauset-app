import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:3000/mvp";
const screenshotPath = process.argv[3] ?? "/tmp/mvp-viewer-diag.png";
const draftJson = process.env.MVP_DRAFT_JSON ?? "";
const headless = process.env.HEADLESS !== "0";
const channel = process.env.PW_CHANNEL || undefined;
const waitMs = Number(process.env.WAIT_MS ?? "10000");

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

if (draftJson) {
    await page.addInitScript((payload) => {
        window.localStorage.setItem("gauset:mvp:draft:v1", payload);
    }, draftJson);
}

await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(waitMs);
await page.screenshot({ path: screenshotPath, fullPage: true });

const diagnostics = await page.evaluate(() => {
    const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
    const fallbackCard = document.querySelector('[data-testid="mvp-empty-viewer-state"]');
    const referenceCard = document.querySelector('[data-testid="mvp-reference-card"]');
    const canvas = viewerSurface?.querySelector("canvas") ?? null;
    const statusRoot = document.querySelector("[data-testid='mvp-viewer-surface']")?.previousElementSibling ?? null;
    const webglProbe = document.createElement("canvas");
    const webglContext =
        webglProbe.getContext("webgl2") ??
        webglProbe.getContext("webgl") ??
        webglProbe.getContext("experimental-webgl");

    return {
        hasViewerSurface: Boolean(viewerSurface),
        hasCanvas: Boolean(canvas),
        hasFallbackCard: Boolean(fallbackCard),
        hasReferenceCard: Boolean(referenceCard),
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
        statusSnippet: statusRoot?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ?? null,
    };
});

console.log(
    JSON.stringify(
        {
            url,
            screenshotPath,
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
