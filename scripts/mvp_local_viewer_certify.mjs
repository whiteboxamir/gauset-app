import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import hostGuard from "./mvp_host_guard.cjs";
import { collectViewerDiagnostics, detectHydrationMismatchMessages, resolveViewerProof } from "./mvp_viewer_runtime_shared.mjs";

const { assertLocalMvpBaseUrl, sanitizeRunLabel } = hostGuard;

const baseUrl = assertLocalMvpBaseUrl(
    process.argv[2] ?? process.env.GAUSET_MVP_BASE_URL ?? "http://localhost:3015",
    "scripts/mvp_local_viewer_certify.mjs",
);
const fixturePath = path.resolve(process.argv[3] ?? process.env.GAUSET_LOCAL_VIEWER_FIXTURE ?? "tests/fixtures/public-scenes/03-neon-streets.png");
const waitMs = Number(process.env.WAIT_MS ?? "12000");
const headless = process.env.HEADLESS !== "0";
const channel = process.env.PW_CHANNEL || undefined;
const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS ?? "300000");
const runLabel =
    sanitizeRunLabel(
        process.env.GAUSET_LOCAL_VIEWER_RUN_LABEL ??
            `viewer-${new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "").toLowerCase()}`,
    ) || `viewer-${Date.now().toString(36)}`;
const artifactDir = path.resolve(
    process.env.GAUSET_LOCAL_VIEWER_ARTIFACT_DIR ?? `artifacts/local-viewer/${runLabel}`,
);
const reportPath = path.join(artifactDir, "viewer-certification.json");
const LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";

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

function buildDraft({ sceneId, urls, metadata, files }) {
    return {
        activeScene: sceneId,
        sceneGraph: {
            environment: {
                id: sceneId,
                lane: metadata?.lane ?? "preview",
                urls,
                files: files ?? null,
                metadata,
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
        updatedAt: new Date().toISOString(),
    };
}

function screenshotPath(name) {
    return path.join(artifactDir, name);
}

function isSceneFailure(sceneId, entry) {
    return typeof entry?.url === "string" && (entry.url.includes(sceneId) || entry.url.includes("/storage/scenes/"));
}

function hasSuccessfulSceneResponse(entries) {
    return entries.some((entry) => typeof entry?.status === "number" && entry.status >= 200 && entry.status < 400);
}

async function runViewerScenario({ scenarioId, draft, sceneId, forceWebgl2Unavailable }) {
    const browser = await chromium.launch({ headless, channel });
    const context = await browser.newContext({ viewport: { width: 2048, height: 1124 } });
    const page = await context.newPage();

    const consoleMessages = [];
    const pageErrors = [];
    const requestFailures = [];
    const failingResponses = [];
    const observedSceneResponses = [];

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
        if (!targetUrl.includes("/api/mvp/") && !targetUrl.includes("/storage/scenes/")) {
            return;
        }
        if (isSceneFailure(sceneId, { url: targetUrl })) {
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

    await page.addInitScript(({ key, payload }) => {
        window.localStorage.removeItem("gauset:mvp:hud:v1:workspace");
        window.localStorage.removeItem("gauset:mvp:hud:v1:preview");
        window.localStorage.setItem(key, payload);
    }, {
        key: LOCAL_DRAFT_KEY,
        payload: JSON.stringify(draft),
    });

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

    try {
        await page.goto(`${baseUrl}/mvp`, { waitUntil: "networkidle", timeout: 180000 });
        const resumeDraftButton = page.getByRole("button", { name: /Return to my last world|Resume last draft/i });
        if (await resumeDraftButton.count()) {
            await resumeDraftButton.first().click();
            await page.waitForLoadState("networkidle");
        }

        await page.waitForSelector('[data-testid="mvp-viewer-surface"]', { timeout: 120000 });
        await page.waitForFunction(
            () => {
                const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
                const canvas = viewerSurface?.querySelector("canvas");
                const runtimeDiagnostics = document.querySelector('[data-testid="mvp-viewer-runtime-diagnostics"]');
                const operationalMode = runtimeDiagnostics?.getAttribute("data-operational-mode");
                return (
                    Boolean(canvas) ||
                    operationalMode === "interactive_fallback" ||
                    operationalMode === "interactive_projection" ||
                    operationalMode === "projection_only" ||
                    operationalMode === "hard_fallback"
                );
            },
            null,
            { timeout: 120000 },
        ).catch(() => null);
        await page.waitForTimeout(waitMs);

        const diagnostics = await collectViewerDiagnostics(page);

        const screenshot = screenshotPath(`${scenarioId}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });

        const viewerLane = diagnostics.classification.viewerLane;
        const hostCapabilityLane = diagnostics.classification.hostCapabilityLane;
        const operationalMode = diagnostics.classification.operationalMode;
        const coverage = diagnostics.classification.coverage;
        const surfaceMode = diagnostics.classification.surfaceMode;
        const viewerProof = resolveViewerProof(diagnostics);
        const hydrationMismatchMessages = detectHydrationMismatchMessages(consoleMessages);
        const hydrationMismatchDetected = hydrationMismatchMessages.length > 0;
        const sceneObservedResponses = observedSceneResponses.filter((entry) => isSceneFailure(sceneId, entry));
        const sceneFailingResponses = failingResponses.filter((entry) => isSceneFailure(sceneId, entry));
        const sceneRequestFailures = requestFailures.filter((entry) => isSceneFailure(sceneId, entry));
        const loadedSceneEvidence = {
            loaded_scene_requested: viewerProof.loadedSceneRequested,
            has_renderable_environment: viewerProof.hasRenderableEnvironment,
            proof_scope: viewerProof.proofScope,
            interactive_surface_active: viewerProof.interactiveSurfaceActive,
            scene_response_count: sceneObservedResponses.length,
            successful_scene_response_count: sceneObservedResponses.filter(
                (entry) => typeof entry.status === "number" && entry.status >= 200 && entry.status < 400,
            ).length,
            request_failure_count: sceneRequestFailures.length,
            failing_response_count: sceneFailingResponses.length,
            loaded_scene_certified:
                viewerProof.loadedSceneCertified &&
                viewerProof.loadedSceneRequested &&
                viewerProof.hasRenderableEnvironment &&
                hasSuccessfulSceneResponse(sceneObservedResponses),
        };

        const pass = forceWebgl2Unavailable
            ? viewerLane === "fallback_only" &&
              operationalMode === "interactive_fallback" &&
              viewerProof.proofScope === "interactive_fallback" &&
              loadedSceneEvidence.loaded_scene_certified &&
              sceneRequestFailures.length === 0 &&
              sceneFailingResponses.length === 0 &&
              !hydrationMismatchDetected
            : hostCapabilityLane === "webgl2_capable"
              ? viewerLane === "webgl2_capable" &&
                operationalMode === "webgl_live" &&
                diagnostics.hasCanvas &&
                viewerProof.proofScope === "interactive_webgl_live" &&
                loadedSceneEvidence.loaded_scene_certified &&
                sceneFailingResponses.length === 0 &&
                sceneRequestFailures.length === 0 &&
                !hydrationMismatchDetected
              : viewerLane === "fallback_only" &&
                operationalMode === "interactive_fallback" &&
                viewerProof.proofScope === "interactive_fallback" &&
                loadedSceneEvidence.loaded_scene_certified &&
                sceneRequestFailures.length === 0 &&
                sceneFailingResponses.length === 0 &&
                !hydrationMismatchDetected;

        return {
            scenario_id: scenarioId,
            force_webgl2_unavailable: forceWebgl2Unavailable,
            viewer_lane: viewerLane,
            host_capability_lane: hostCapabilityLane,
            operational_mode: operationalMode,
            surface_mode: surfaceMode,
            coverage,
            viewer_proof: viewerProof,
            loaded_scene_evidence: loadedSceneEvidence,
            diagnostics,
            screenshot,
            hydration_mismatch_detected: hydrationMismatchDetected,
            hydration_mismatch_messages: hydrationMismatchMessages,
            observed_scene_responses: sceneObservedResponses,
            console_messages: consoleMessages,
            page_errors: pageErrors,
            request_failures: requestFailures,
            failing_responses: failingResponses,
            pass,
        };
    } finally {
        await browser.close();
    }
}

await fs.mkdir(artifactDir, { recursive: true });

const report = {
    suite_id: "local_viewer_cert_v1",
    run_label: runLabel,
    base: baseUrl,
    fixture_path: fixturePath,
    artifact_dir: artifactDir,
    executed_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
    preview: null,
    host_viewer_lane: null,
    host_capability_lane: null,
    certified_viewer_lane: null,
    operational_mode: null,
    proof_scope: null,
    loaded_scene_certified: false,
    premium_live_lane_claimable: false,
    interactive_fallback_certified: false,
    viewer_truth: null,
    coverage: null,
    warnings: [],
    failures: [],
    scenarios: [],
    pass: false,
};

try {
    const upload = await uploadFixture();
    const preview = await generatePreview(upload.image_id);
    const finalJob = await pollJob(preview.job_id ?? preview.scene_id);
    if (finalJob.status === "failed") {
        throw new Error(finalJob.error || "preview generation failed");
    }

    const sceneId = finalJob.result?.scene_id ?? preview.scene_id ?? preview.job_id;
    const urls = Object.fromEntries(
        Object.entries(finalJob.result?.urls ?? preview.urls ?? {}).map(([key, value]) => [key, toProxyUrl(value)]),
    );
    const metadata = await fetchMetadata(urls.metadata);
    const draft = buildDraft({
        sceneId,
        urls,
        metadata,
        files: finalJob.result?.files ?? null,
    });

    report.preview = {
        upload,
        preview,
        final_job: finalJob,
        scene_id: sceneId,
        metadata,
    };

    const actualScenario = await runViewerScenario({
        scenarioId: "actual-lane",
        draft,
        sceneId,
        forceWebgl2Unavailable: false,
    });
    const forcedFallbackScenario = await runViewerScenario({
        scenarioId: "forced-fallback",
        draft,
        sceneId,
        forceWebgl2Unavailable: true,
    });

    report.scenarios.push(actualScenario, forcedFallbackScenario);
    report.host_viewer_lane = actualScenario.host_capability_lane;
    report.host_capability_lane = actualScenario.host_capability_lane;
    report.certified_viewer_lane = actualScenario.viewer_lane;
    report.operational_mode = actualScenario.operational_mode;
    report.proof_scope = actualScenario.viewer_proof.proofScope;
    report.loaded_scene_certified = actualScenario.loaded_scene_evidence.loaded_scene_certified;
    report.premium_live_lane_claimable = actualScenario.viewer_proof.premiumLiveClaimable && actualScenario.pass;
    report.interactive_fallback_certified =
        actualScenario.loaded_scene_evidence.loaded_scene_certified && actualScenario.viewer_proof.proofScope === "interactive_fallback";
    report.coverage = actualScenario.operational_mode === "webgl_live" ? "interactive_and_fallback" : actualScenario.coverage;
    report.viewer_truth = {
        host_capability_lane: actualScenario.host_capability_lane,
        certified_viewer_lane: actualScenario.viewer_lane,
        operational_mode: actualScenario.operational_mode,
        proof_scope: actualScenario.viewer_proof.proofScope,
        loaded_scene_certified: actualScenario.loaded_scene_evidence.loaded_scene_certified,
        premium_live_lane_claimable: report.premium_live_lane_claimable,
        interactive_fallback_certified: report.interactive_fallback_certified,
    };

    if (!report.loaded_scene_certified) {
        report.warnings.push("The viewer packet did not prove a real loaded scene. Shell-only or unproven fallback must not be treated as viewer certification.");
    }

    if (report.coverage === "fallback_only" || report.coverage === "image_only" || report.coverage === "image_interactive") {
        report.warnings.push(
            actualScenario.host_capability_lane === "webgl2_capable"
                ? "Host exposes WebGL2, but the local viewer scenario still did not achieve a live canvas."
                : "Host does not expose WebGL2. Premium live canvas certification is not covered on this machine.",
        );
    }

    for (const scenario of report.scenarios) {
        if (!scenario.pass) {
            report.failures.push(`${scenario.scenario_id} failed its viewer expectations.`);
        }
    }

    report.pass = report.failures.length === 0;
    report.status = report.pass ? "passed" : "failed";
} catch (error) {
    report.status = "failed";
    report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
    report.completed_at = new Date().toISOString();
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
}

if (!report.pass) {
    process.exit(1);
}
