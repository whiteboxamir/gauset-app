import { chromium } from "@playwright/test";
import hostGuard from "./mvp_host_guard.cjs";
import { collectViewerDiagnostics, detectHydrationMismatchMessages, resolveViewerProof } from "./mvp_viewer_runtime_shared.mjs";

const { assertLocalMvpUrl } = hostGuard;

const url = assertLocalMvpUrl(process.argv[2] ?? "http://localhost:3000/mvp", "scripts/mvp_viewer_diag.mjs");
const screenshotPath = process.argv[3] ?? "/tmp/mvp-viewer-diag.png";
const draftJson = process.env.MVP_DRAFT_JSON ?? "";
const headless = process.env.HEADLESS !== "0";
const channel = process.env.PW_CHANNEL || undefined;
const waitMs = Number(process.env.WAIT_MS ?? "10000");
const expectedViewerLane = process.env.MVP_EXPECT_VIEWER_LANE ?? "any";
const forceWebgl2Unavailable = process.env.MVP_FORCE_WEBGL2_UNAVAILABLE === "1";
const failOnHydrationMismatch = process.env.MVP_FAIL_ON_HYDRATION_MISMATCH !== "0";

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

if (forceWebgl2Unavailable) {
    await page.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
            if (type === "webgl2") {
                return null;
            }
            return originalGetContext.call(this, type, ...args);
        };
    });
}

await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(waitMs);
await page.screenshot({ path: screenshotPath, fullPage: true });

const diagnostics = await collectViewerDiagnostics(page);
const viewerLane = diagnostics.classification.viewerLane;
const hostCapabilityLane = diagnostics.classification.hostCapabilityLane;
const operationalMode = diagnostics.classification.operationalMode;
const surfaceMode = diagnostics.classification.surfaceMode;
const coverage = diagnostics.classification.coverage;
const viewerProof = resolveViewerProof(diagnostics);
const expectationSatisfied = expectedViewerLane === "any" || expectedViewerLane === viewerLane;
const hydrationMismatchMessages = detectHydrationMismatchMessages(consoleMessages);
const hydrationMismatchDetected = hydrationMismatchMessages.length > 0;

console.log(
    JSON.stringify(
        {
            url,
            screenshotPath,
            expectedViewerLane,
            viewerLane,
            hostCapabilityLane,
            operationalMode,
            surfaceMode,
            coverage,
            viewerProof,
            expectationSatisfied,
            forceWebgl2Unavailable,
            failOnHydrationMismatch,
            diagnostics,
            consoleMessages,
            hydrationMismatchDetected,
            hydrationMismatchMessages,
            pageErrors,
            requestFailures,
            failingResponses,
        },
        null,
        2,
    ),
);

await browser.close();

if (!expectationSatisfied) {
    console.error(`viewer lane mismatch: expected ${expectedViewerLane}, received ${viewerLane}`);
    process.exit(1);
}

if (failOnHydrationMismatch && hydrationMismatchDetected) {
    console.error(`viewer hydration mismatch detected (${hydrationMismatchMessages.length} message${hydrationMismatchMessages.length === 1 ? "" : "s"})`);
    process.exit(1);
}
