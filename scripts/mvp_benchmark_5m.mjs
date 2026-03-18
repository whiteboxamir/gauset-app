import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ensureBenchmarkFixture } from "./generate_benchmark_splat_fixture.mjs";
import hostGuard from "./mvp_host_guard.cjs";
import { collectViewerDiagnostics, detectHydrationMismatchMessages, resolveViewerProof } from "./mvp_viewer_runtime_shared.mjs";

const { assertLocalMvpUrl, sanitizeRunLabel } = hostGuard;

const url = assertLocalMvpUrl(
    process.env.GAUSET_MVP_BENCHMARK_URL || "http://localhost:3015/mvp",
    "scripts/mvp_benchmark_5m.mjs",
);
const channel = process.env.PW_CHANNEL || undefined;
const headless = process.env.HEADLESS !== "0";
const sceneId = process.env.GAUSET_BENCHMARK_SCENE_ID || "scene_benchmark_5m";
const runLabel =
    sanitizeRunLabel(
        process.env.GAUSET_BENCHMARK_RUN_LABEL ??
            `benchmark-5m-${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}`,
    ) || `benchmark-5m-${Date.now().toString(36)}`;
const artifactDir = path.resolve(
    process.env.GAUSET_BENCHMARK_ARTIFACT_DIR || `artifacts/viewer-benchmark-5m/${runLabel}`,
);
const reportPath = path.join(artifactDir, "report.json");
const stressDurationMs = Number(process.env.STRESS_DURATION_MS || "60000");

function ensureArtifactsDir() {
    fs.mkdirSync(artifactDir, { recursive: true });
}

function screenshotPath(name) {
    ensureArtifactsDir();
    return path.join(artifactDir, name);
}

function classifyBenchmarkFailure(report, error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/browserType\.launch|MachPortRendezvous|Permission denied \(1100\)/i.test(message)) {
        return "browser_launch_blocked";
    }

    if (report.hydrationMismatchDetected) {
        return "hydration_mismatch";
    }

    if (/compatibilitySceneGraph|ReferenceError/i.test(message)) {
        return "runtime_regression";
    }

    if (
        report.failingResponses.some(
            (entry) =>
                entry.status === 404 &&
                (entry.url.includes("/api/mvp/jobs/") ||
                    entry.url.includes("/api/mvp/setup/status") ||
                    entry.url.includes("/api/mvp/health") ||
                    entry.url.includes("/mvp")),
        )
    ) {
        return "runtime_regression";
    }

    if (/not WebGL2-capable enough|does not expose WebGL2|no_webgl/i.test(message)) {
        return "host_not_webgl2_capable";
    }

    if (/expected webgl_live/i.test(message)) {
        return "viewer_live_not_proven";
    }

    return "unknown";
}

function buildDraft(fixture) {
    return {
        activeScene: fixture.sceneId,
        sceneGraph: {
            environment: {
                id: fixture.sceneId,
                lane: "reconstruction",
                label: "5M Benchmark Fixture",
                urls: fixture.urls,
                metadata: fixture.metadata,
            },
            assets: [],
            camera_views: [],
            pins: [],
            director_path: [],
            director_brief: "Benchmark fixture for Phase 1 renderer certification.",
            viewer: {
                fov: 45,
                lens_mm: 35,
            },
        },
        assetsList: [],
        updatedAt: new Date().toISOString(),
    };
}

async function collectViewerSnapshot(page, label) {
    const viewerDiagnostics = await collectViewerDiagnostics(page);
    const viewerProof = resolveViewerProof(viewerDiagnostics);
    const snapshot = await page.evaluate((stepLabel) => {
        const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
        const viewerText = viewerSurface?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const canvas = viewerSurface?.querySelector("canvas");
        const performanceMemory =
            "memory" in performance && performance.memory
                ? {
                      usedJSHeapSize: performance.memory.usedJSHeapSize,
                      totalJSHeapSize: performance.memory.totalJSHeapSize,
                      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                  }
                : null;
        return {
            label: stepLabel,
            timestamp: new Date().toISOString(),
            bodyText: (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1200),
            viewerText: viewerText.slice(0, 600),
            hasCanvas: Boolean(canvas),
            canvasSize:
                canvas && "width" in canvas && "height" in canvas
                    ? {
                          width: canvas.width,
                          height: canvas.height,
                          clientWidth: canvas.clientWidth,
                          clientHeight: canvas.clientHeight,
                      }
                    : null,
            fallbackVisible: /3D viewer unavailable|Environment splat failed/i.test(viewerText),
            loadingVisible: /Loading environment splat|Fetching environment splat|Parsing environment splat/i.test(viewerText),
            selectionTrayVisible: Boolean(document.querySelector('[data-testid="mvp-viewer-selection-tray"]')),
            performanceMemory,
        };
    }, label);

    return {
        ...snapshot,
        viewerDiagnostics,
        viewerProof,
        viewerLane: viewerDiagnostics.classification.viewerLane,
        hostCapabilityLane: viewerDiagnostics.classification.hostCapabilityLane,
        operationalMode: viewerDiagnostics.classification.operationalMode,
        coverage: viewerDiagnostics.classification.coverage,
    };
}

async function waitForViewerLoaded(page, label) {
    await page.waitForSelector('[data-testid="mvp-viewer-surface"]', { timeout: 120000 });
    await page.waitForFunction(
        () => {
            const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
            const canvas = viewerSurface?.querySelector("canvas");
            const runtimeDiagnostics = document.querySelector('[data-testid="mvp-viewer-runtime-diagnostics"]');
            const operationalMode = runtimeDiagnostics?.getAttribute("data-operational-mode");
            return (
                (Boolean(canvas) && operationalMode === "webgl_live") ||
                operationalMode === "interactive_fallback" ||
                operationalMode === "interactive_projection" ||
                operationalMode === "projection_only" ||
                operationalMode === "hard_fallback"
            );
        },
        null,
        { timeout: 180000 },
    );
    const snapshot = await collectViewerSnapshot(page, label);
    if (snapshot.viewerProof.proofScope !== "interactive_webgl_live") {
        throw new Error(
            snapshot.hostCapabilityLane === "webgl2_capable"
                ? `Benchmark expected webgl_live but received ${snapshot.viewerProof.proofScope}.`
                : `Benchmark host is not WebGL2-capable enough for live renderer certification (${snapshot.hostCapabilityLane}).`,
        );
    }
    return snapshot;
}

async function collectCanvasHealth(page) {
    const viewerDiagnostics = await collectViewerDiagnostics(page);
    const viewerProof = resolveViewerProof(viewerDiagnostics);
    return {
        hasCanvas: viewerDiagnostics.hasCanvas,
        fallbackVisible:
            viewerDiagnostics.classification.operationalMode === "hard_fallback" ||
            viewerDiagnostics.classification.operationalMode === "interactive_fallback",
        selectionTrayVisible: Boolean(await page.locator('[data-testid="mvp-viewer-selection-tray"]').count()),
        viewerLane: viewerDiagnostics.classification.viewerLane,
        hostCapabilityLane: viewerDiagnostics.classification.hostCapabilityLane,
        operationalMode: viewerDiagnostics.classification.operationalMode,
        coverage: viewerDiagnostics.classification.coverage,
        viewerProof,
        diagnostics: viewerDiagnostics,
    };
}

async function runStressOrbit(page, durationMs) {
    const canvas = page.locator('[data-testid="mvp-viewer-surface"] canvas').first();
    const box = await canvas.boundingBox();
    if (!box) {
        throw new Error("Benchmark viewer canvas did not expose a bounding box.");
    }

    const memorySnapshots = [];
    const start = Date.now();
    let cycle = 0;
    while (Date.now() - start < durationMs) {
        await page.mouse.move(box.x + box.width * 0.54, box.y + box.height * 0.54);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.76, box.y + box.height * 0.42, { steps: 22 });
        await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.61, { steps: 22 });
        await page.mouse.up();
        await page.waitForTimeout(250);

        memorySnapshots.push({
            cycle,
            elapsedMs: Date.now() - start,
            ...(await page.evaluate(() => {
                const performanceMemory =
                    "memory" in performance && performance.memory
                        ? {
                              usedJSHeapSize: performance.memory.usedJSHeapSize,
                              totalJSHeapSize: performance.memory.totalJSHeapSize,
                              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                          }
                        : null;
                return { performanceMemory };
            })),
        });
        cycle += 1;
    }

    return memorySnapshots;
}

const fixture = ensureBenchmarkFixture({ sceneId });
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const failingResponses = [];
const observedSceneResponses = [];

const report = {
    suite_id: "real_space_world_class_v1",
    run_label: runLabel,
    scene_id: fixture.sceneId,
    executed_at: new Date().toISOString(),
    url,
    artifact_dir: artifactDir,
    browser: {
        name: "chromium",
        channel,
        headless,
    },
    fixture: {
        pointCount: fixture.pointCount,
        plyPath: fixture.plyPath,
        metadataPath: fixture.metadataPath,
    },
    screenshots: {},
    timings: {
        coldLoadMs: null,
        warmLoadMs: null,
        stressDurationMs,
    },
    diagnostics: {},
    viewer_truth: null,
    memorySnapshots: [],
    consoleMessages,
    hydrationMismatchDetected: false,
    hydrationMismatchMessages: [],
    pageErrors,
    requestFailures,
    failingResponses,
    observedSceneResponses,
    warnings: [],
    failures: [],
    failure_classification: null,
    status: "running",
    pass: false,
};

let browser = null;
let page = null;

try {
    browser = await chromium.launch({ headless, channel });
    const context = await browser.newContext({ viewport: { width: 2048, height: 1124 } });
    page = await context.newPage();

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
        if (targetUrl.includes(sceneId) || targetUrl.includes("/api/mvp/setup/status")) {
            observedSceneResponses.push({
                url: targetUrl,
                status: response.status(),
                statusText: response.statusText(),
                method: response.request().method(),
            });
        }
        if (response.status() >= 400) {
            failingResponses.push({
                url: targetUrl,
                status: response.status(),
                statusText: response.statusText(),
            });
        }
    });

    await page.addInitScript((draft) => {
        window.localStorage.setItem("gauset:mvp:draft:v1", JSON.stringify(draft));
    }, buildDraft(fixture));

    const coldStart = Date.now();
    await page.goto(url, { waitUntil: "networkidle", timeout: 180000 });
    const coldDiagnostics = await waitForViewerLoaded(page, "cold-load");
    report.timings.coldLoadMs = Date.now() - coldStart;
    report.diagnostics.coldDiagnostics = coldDiagnostics;
    report.viewer_truth = {
        host_capability_lane: coldDiagnostics.hostCapabilityLane,
        certified_viewer_lane: coldDiagnostics.viewerLane,
        proof_scope: coldDiagnostics.viewerProof.proofScope,
    };
    report.screenshots.cold = screenshotPath("cold-load.png");
    await page.screenshot({ path: report.screenshots.cold, fullPage: true });

    const warmStart = Date.now();
    await page.reload({ waitUntil: "networkidle", timeout: 180000 });
    const warmDiagnostics = await waitForViewerLoaded(page, "warm-load");
    report.timings.warmLoadMs = Date.now() - warmStart;
    report.diagnostics.warmDiagnostics = warmDiagnostics;
    report.screenshots.warm = screenshotPath("warm-load.png");
    await page.screenshot({ path: report.screenshots.warm, fullPage: true });

    const preStressHealth = await collectCanvasHealth(page);
    report.diagnostics.preStressHealth = preStressHealth;
    report.memorySnapshots = await runStressOrbit(page, stressDurationMs);
    const postStressHealth = await collectCanvasHealth(page);
    report.diagnostics.postStressHealth = postStressHealth;
    report.hydrationMismatchMessages = detectHydrationMismatchMessages(consoleMessages);
    report.hydrationMismatchDetected = report.hydrationMismatchMessages.length > 0;
    report.screenshots.postStress = screenshotPath("post-stress.png");
    await page.screenshot({ path: report.screenshots.postStress, fullPage: true });

    report.pass =
        coldDiagnostics.hasCanvas &&
        warmDiagnostics.hasCanvas &&
        coldDiagnostics.operationalMode === "webgl_live" &&
        warmDiagnostics.operationalMode === "webgl_live" &&
        !preStressHealth.fallbackVisible &&
        !postStressHealth.fallbackVisible &&
        preStressHealth.operationalMode === "webgl_live" &&
        postStressHealth.operationalMode === "webgl_live" &&
        pageErrors.length === 0 &&
        requestFailures.length === 0 &&
        !report.hydrationMismatchDetected;
    report.status = report.pass ? "passed" : "failed";
    if (!report.pass) {
        report.failures.push("The 5M benchmark did not maintain a live WebGL path through cold load, warm load, and stress orbit.");
    }
} catch (error) {
    report.error = {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
    };
    if (page) {
        try {
            report.diagnostics.failureSnapshot = await collectViewerSnapshot(page, "failure");
            report.viewer_truth = {
                host_capability_lane: report.diagnostics.failureSnapshot.hostCapabilityLane,
                certified_viewer_lane: report.diagnostics.failureSnapshot.viewerLane,
                proof_scope: report.diagnostics.failureSnapshot.viewerProof.proofScope,
            };
            report.screenshots.failure = screenshotPath("failure.png");
            await page.screenshot({ path: report.screenshots.failure, fullPage: true });
        } catch (snapshotError) {
            report.diagnostics.failureSnapshotError = snapshotError instanceof Error ? snapshotError.message : String(snapshotError);
        }
    }
    report.failures.push(report.error.message);
    report.failure_classification = classifyBenchmarkFailure(report, error);
    if (report.failure_classification === "browser_launch_blocked") {
        report.warnings.push(
            "Playwright could not launch Chromium in this execution context, so the 5M benchmark needs to be rerun outside the restricted browser sandbox.",
        );
    } else if (report.failure_classification === "host_not_webgl2_capable") {
        report.warnings.push(
            "This host does not expose a WebGL2-capable live lane for the 5M benchmark, so premium viewer certification cannot be claimed from this run.",
        );
    } else if (report.failure_classification === "runtime_regression") {
        report.warnings.push(
            "The benchmark was blocked by a current workspace/runtime regression before the 5M viewer lane could be certified.",
        );
    }
    report.status = "failed";
} finally {
    if (report.hydrationMismatchMessages.length === 0) {
        report.hydrationMismatchMessages = detectHydrationMismatchMessages(consoleMessages);
        report.hydrationMismatchDetected = report.hydrationMismatchMessages.length > 0;
    }
    if (!report.failure_classification && report.hydrationMismatchDetected) {
        report.failure_classification = "hydration_mismatch";
    }
    if (report.status === "running") {
        report.status = report.pass ? "passed" : "failed";
    }
    ensureArtifactsDir();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (browser) {
        await browser.close();
    }
}

if (!report.pass) {
    process.exit(1);
}
