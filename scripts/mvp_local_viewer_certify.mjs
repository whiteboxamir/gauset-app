import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import hostGuard from "./mvp_host_guard.cjs";
import { samplePngVisual } from "./png_visual_sample.mjs";
import {
    collectCanvasVisualSample,
    collectViewerDiagnostics,
    detectHydrationMismatchMessages,
    probeCanvasStillness,
    resolveViewerProof,
} from "./mvp_viewer_runtime_shared.mjs";

const { assertLocalMvpBaseUrl, sanitizeRunLabel } = hostGuard;

const baseUrl = assertLocalMvpBaseUrl(
    process.argv[2] ?? process.env.GAUSET_MVP_BASE_URL ?? "http://localhost:3015",
    "scripts/mvp_local_viewer_certify.mjs",
);
const certInputRaw =
    process.argv[3] ??
    process.env.GAUSET_LOCAL_VIEWER_INPUT ??
    process.env.GAUSET_LOCAL_VIEWER_FIXTURE ??
    process.env.GAUSET_LOCAL_VIEWER_EXISTING_SCENE_PATH ??
    process.env.GAUSET_LOCAL_VIEWER_EXISTING_SCENE_ID ??
    "tests/fixtures/public-scenes/03-neon-streets.png";
const waitMs = Number(process.env.WAIT_MS ?? "12000");
const headless = process.env.HEADLESS !== "0";
const channel = process.env.PW_CHANNEL || undefined;
const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS ?? "300000");
const explicitExistingSceneId = process.env.GAUSET_LOCAL_VIEWER_EXISTING_SCENE_ID ?? "";
const explicitExistingScenePath =
    process.env.GAUSET_LOCAL_VIEWER_EXISTING_SCENE_PATH ?? process.env.GAUSET_LOCAL_VIEWER_EXISTING_SCENE_URL ?? "";
const runLabel =
    sanitizeRunLabel(
        process.env.GAUSET_LOCAL_VIEWER_RUN_LABEL ??
            `viewer-${new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "").toLowerCase()}`,
    ) || `viewer-${Date.now().toString(36)}`;
const artifactDir = path.resolve(
    process.env.GAUSET_LOCAL_VIEWER_ARTIFACT_DIR ?? `artifacts/local-viewer/${runLabel}`,
);
const reportPath = path.join(artifactDir, "viewer-certification.json");
const goldSceneRegistryPath = path.resolve(process.env.GAUSET_GOLD_SCENE_REGISTRY ?? "tests/fixtures/gold-scenes.json");
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

function stripQueryAndFragment(value) {
    return value.split(/[?#]/, 1)[0];
}

function isImageFixturePath(candidatePath) {
    return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(path.extname(candidatePath).toLowerCase());
}

function isStorageSceneInput(value) {
    return /\/storage\/scenes\//.test(value) || /\/api\/mvp\/storage\/scenes\//.test(value);
}

function extractSceneIdFromInput(value) {
    const cleanValue = stripQueryAndFragment(value);
    const storageMatch = cleanValue.match(/\/storage\/scenes\/([^/]+)/);
    if (storageMatch?.[1]) {
        return storageMatch[1];
    }
    if (cleanValue.includes("/")) {
        return path.basename(cleanValue);
    }
    return cleanValue || null;
}

async function pathExists(candidatePath) {
    try {
        await fs.stat(candidatePath);
        return true;
    } catch {
        return false;
    }
}

async function resolveCertInput(rawInput) {
    const candidate = String(rawInput ?? "").trim();
    if (!candidate) {
        throw new Error("Missing local viewer certification input.");
    }

    if (explicitExistingSceneId) {
        return {
            mode: "existing_scene",
            raw_input: candidate,
            source_kind: "scene_id",
            scene_id: explicitExistingSceneId,
            scene_path: null,
            fixture_path: null,
            display_path: explicitExistingSceneId,
        };
    }

    if (explicitExistingScenePath) {
        return {
            mode: "existing_scene",
            raw_input: candidate,
            source_kind: "scene_path",
            scene_id: extractSceneIdFromInput(explicitExistingScenePath),
            scene_path: explicitExistingScenePath,
            fixture_path: null,
            display_path: explicitExistingScenePath,
        };
    }

    const candidatePath = stripQueryAndFragment(candidate);
    const existingPath = await pathExists(candidatePath);

    if (isStorageSceneInput(candidatePath)) {
        return {
            mode: "existing_scene",
            raw_input: candidate,
            source_kind: "scene_path",
            scene_id: extractSceneIdFromInput(candidatePath),
            scene_path: candidatePath,
            fixture_path: null,
            display_path: candidatePath,
        };
    }

    if (existingPath && !isImageFixturePath(candidatePath)) {
        return {
            mode: "existing_scene",
            raw_input: candidate,
            source_kind: "scene_path",
            scene_id: extractSceneIdFromInput(candidatePath),
            scene_path: candidatePath,
            fixture_path: null,
            display_path: candidatePath,
        };
    }

    if (!existingPath && !isImageFixturePath(candidatePath) && !candidatePath.includes(".")) {
        return {
            mode: "existing_scene",
            raw_input: candidate,
            source_kind: "scene_id",
            scene_id: candidatePath,
            scene_path: null,
            fixture_path: null,
            display_path: candidatePath,
        };
    }

    return {
        mode: "upload_fixture",
        raw_input: candidate,
        source_kind: "fixture_path",
        scene_id: null,
        scene_path: null,
        fixture_path: path.resolve(candidatePath),
        display_path: path.resolve(candidatePath),
    };
}

async function uploadFixture(fixturePath) {
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
    let cameraViews = [];
    let directorPath = [];
    try {
        if (fs.existsSync(goldSceneRegistryPath)) {
            const registry = JSON.parse(fs.readFileSync(goldSceneRegistryPath, "utf8"));
            const sceneEntry = Array.isArray(registry) ? registry.find((entry) => entry?.scene_id === sceneId) : null;
            cameraViews = Array.isArray(sceneEntry?.camera_views) ? sceneEntry.camera_views : [];
            directorPath = Array.isArray(sceneEntry?.director_path) ? sceneEntry.director_path : [];
        }
    } catch {
        cameraViews = [];
        directorPath = [];
    }

    return {
        activeScene: sceneId,
        sceneGraph: {
            environment: {
                id: sceneId,
                lane: metadata?.lane ?? "preview",
                urls,
                files: files ?? null,
                metadata,
                previewImage: metadata?.preview_image ?? null,
                demo_reference_image: metadata?.demo_reference_image ?? null,
            },
            assets: [],
            camera_views: cameraViews,
            pins: [],
            director_path: directorPath,
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

function buildReferenceFixtureMetadata(referenceImageUrl) {
    return {
        lane: "reference",
        truth_label: "Reference-only fixture proof",
        quality_tier: "reference_only_fixture",
        quality: {
            band: "reference_only",
            warnings: ["Generated preview worker unavailable; showing a deterministic local fixture reference instead."],
        },
        delivery: {
            label: "reference-only fixture",
            ready: false,
        },
        rendering: {
            source_format: "reference_fixture",
            viewer_renderer: "static_reference",
        },
        preview_image: referenceImageUrl,
        demo_reference_image: referenceImageUrl,
        reference_image: referenceImageUrl,
        preview_projection: referenceImageUrl,
    };
}

function buildReferenceFixtureDraft({ sceneId, referenceImageUrl, sourceUrl }) {
    return buildDraft({
        sceneId,
        urls: {
            preview_projection: referenceImageUrl,
        },
        metadata: buildReferenceFixtureMetadata(referenceImageUrl),
        files: sourceUrl ? { source: sourceUrl } : null,
    });
}

function classifyPreviewWorkerFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const blockedByMissingWorker =
        lower.includes("ml-sharp repo not found") ||
        lower.includes("ml-sharp inference failed") ||
        lower.includes("permit mock fallback") ||
        lower.includes("gauset_allow_mock_mode") ||
        lower.includes("preview worker") ||
        lower.includes("mock fallback");

    return {
        message,
        kind: blockedByMissingWorker ? "preview_worker_unavailable" : "preview_generation_failed",
        preview_worker_unavailable: blockedByMissingWorker,
        deterministic_fixture_path_available: true,
        deterministic_fixture_path_label: "reference-only fixture",
        deterministic_fixture_path_status: "available",
    };
}

function buildExistingSceneUrls(sceneId) {
    return {
        viewer: `/storage/scenes/${sceneId}/environment`,
        splats: `/storage/scenes/${sceneId}/environment/splats.ply`,
        manifest: `/storage/scenes/${sceneId}/environment/delivery-manifest.json`,
        cameras: `/storage/scenes/${sceneId}/environment/cameras.json`,
        metadata: `/storage/scenes/${sceneId}/environment/metadata.json`,
    };
}

function normalizeMetadataText(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assessGeneratedPreviewTruth(metadata) {
    const executionMode = normalizeMetadataText(metadata?.execution_mode);
    const qualityTier = normalizeMetadataText(metadata?.quality_tier);
    const laneTruth = normalizeMetadataText(metadata?.lane_truth ?? metadata?.truth_label);
    const sourceFormat = normalizeMetadataText(metadata?.rendering?.source_format);
    const reasons = [];

    if (executionMode === "mock" || qualityTier.includes("mock")) {
        reasons.push("mock_preview");
    }
    if (
        laneTruth.includes("preview_only") ||
        qualityTier.includes("single_image_preview") ||
        qualityTier.includes("dense_fallback") ||
        sourceFormat.includes("dense_preview")
    ) {
        reasons.push("preview_only_geometry");
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        execution_mode: executionMode || null,
        quality_tier: qualityTier || null,
        lane_truth: laneTruth || null,
        source_format: sourceFormat || null,
    };
}

function summarizeVisualSample(sample) {
    if (!sample?.available) {
        return sample
            ? {
                  available: false,
                  reason: sample.reason ?? "missing_visual_sample",
              }
            : null;
    }

    const visualRichnessScore =
        sample.lumaStdDev * 1.25 +
        sample.meanColorSpread * 0.35 +
        sample.lumaRange * 0.2 +
        sample.opaqueRatio * 10;

    return {
        available: true,
        reason: null,
        fingerprint: sample.fingerprint,
        sampleCount: sample.sampleCount,
        meanLuma: sample.meanLuma,
        lumaStdDev: sample.lumaStdDev,
        lumaRange: sample.lumaRange,
        meanAlpha: sample.meanAlpha,
        opaqueRatio: sample.opaqueRatio,
        meanColorSpread: sample.meanColorSpread,
        visualRichnessScore,
        samples: sample.samples,
    };
}

function resolveMotionVerdict(runtimeDiagnostics) {
    if (!runtimeDiagnostics) {
        return {
            outcome: "unknown",
            reasons: ["missing_runtime_quality"],
        };
    }

    const reasons = [];
    const frameP95Ms = runtimeDiagnostics.frameP95Ms ?? null;
    const frameOver50MsRatio = runtimeDiagnostics.frameOver50MsRatio ?? null;
    const adaptiveSafeMs = runtimeDiagnostics.adaptiveSafeMs ?? 0;
    const adaptiveBalancedMs = runtimeDiagnostics.adaptiveBalancedMs ?? 0;
    const adaptiveFullMs = runtimeDiagnostics.adaptiveFullMs ?? 0;
    const adaptiveTotalMs = adaptiveSafeMs + adaptiveBalancedMs + adaptiveFullMs;
    const adaptiveSafeRatio = adaptiveTotalMs > 0 ? adaptiveSafeMs / adaptiveTotalMs : 0;
    const contextLossCount = runtimeDiagnostics.contextLossCount ?? 0;

    if (frameP95Ms !== null && frameP95Ms > 50) {
        reasons.push(`frame_p95_ms:${frameP95Ms}`);
    }
    if (frameOver50MsRatio !== null && frameOver50MsRatio > 0.02) {
        reasons.push(`slow_frame_ratio:${frameOver50MsRatio.toFixed(3)}`);
    }
    if ((runtimeDiagnostics.adaptiveSafeEntries ?? 0) > 0) {
        reasons.push(`adaptive_safe_entries:${runtimeDiagnostics.adaptiveSafeEntries}`);
    }
    if (adaptiveSafeRatio > 0.2) {
        reasons.push(`adaptive_safe_ratio:${adaptiveSafeRatio.toFixed(3)}`);
    }
    if (contextLossCount > 0) {
        reasons.push(`context_loss_count:${contextLossCount}`);
    }
    if (
        runtimeDiagnostics.deliveryStreamingObserved &&
        (runtimeDiagnostics.deliveryRefinePagesLoaded ?? 0) + (runtimeDiagnostics.deliveryRefinePagesPending ?? 0) <= 0
    ) {
        reasons.push("streaming_truth_missing");
    }

    if (reasons.length > 0) {
        return {
            outcome: "stable_but_degraded",
            reasons,
        };
    }

    if (
        (runtimeDiagnostics.frameP95Ms ?? Number.POSITIVE_INFINITY) <= 33 &&
        (runtimeDiagnostics.frameOver50MsRatio ?? 1) <= 0.02 &&
        (runtimeDiagnostics.adaptiveSafeEntries ?? 0) === 0 &&
        contextLossCount === 0
    ) {
        return {
            outcome: "premium_candidate",
            reasons: ["pacing_within_premium_candidate_bounds"],
        };
    }

    return {
        outcome: "guarded_live",
        reasons: ["motion_is_live_but_not_premium"],
    };
}

function resolveScenarioQualityOutcome(diagnostics, scenarioPass) {
    const runtimeDiagnostics = diagnostics.runtimeDiagnostics ?? null;
    if (diagnostics.classification.operationalMode !== "webgl_live" || !scenarioPass) {
        return "guarded";
    }

    const qualitySignals = [
        runtimeDiagnostics?.qualityMode ?? "",
        runtimeDiagnostics?.qualityTier ?? "",
        runtimeDiagnostics?.qualityLabel ?? "",
    ].join(" ");

    if (
        /premium|full/i.test(qualitySignals) &&
        !runtimeDiagnostics?.qualityCautiousMode &&
        !runtimeDiagnostics?.prefersPerformanceMode &&
        (runtimeDiagnostics?.contextLossCount ?? 0) === 0
    ) {
        return "premium";
    }

    if (
        /safe|balanced|guarded/i.test(qualitySignals) ||
        Boolean(runtimeDiagnostics?.qualityCautiousMode) ||
        Boolean(runtimeDiagnostics?.prefersPerformanceMode) ||
        (runtimeDiagnostics?.adaptiveSafeEntries ?? 0) > 0
    ) {
        return "guarded";
    }

    return "stable";
}

function resolveVisualVerdict(runtimeDiagnostics, canvasMetrics, visualSample, stillnessProbe, overallQualityOutcome) {
    if (!visualSample?.available) {
        return {
            outcome: "unknown",
            reasons: [visualSample?.reason ?? "missing_visual_sample"],
        };
    }

    const reasons = [];
    const visualRichnessScore = visualSample.visualRichnessScore ?? 0;

    if ((canvasMetrics?.canvasFillRatio ?? 1) < 0.85) {
        reasons.push(`canvas_fill_ratio:${canvasMetrics?.canvasFillRatio?.toFixed(3) ?? "unknown"}`);
    }
    if ((canvasMetrics?.canvasAspectRatioDelta ?? 0) > 0.05) {
        reasons.push(`aspect_delta:${canvasMetrics?.canvasAspectRatioDelta?.toFixed(3) ?? "unknown"}`);
    }
    if ((canvasMetrics?.canvasEffectiveDpr ?? 1) < 0.85) {
        reasons.push(`canvas_effective_dpr:${canvasMetrics?.canvasEffectiveDpr?.toFixed(3) ?? "unknown"}`);
    }
    if ((runtimeDiagnostics?.posterCurtainStage ?? "hidden") !== "hidden") {
        reasons.push(`poster_curtain:${runtimeDiagnostics?.posterCurtainStage}`);
    }
    if (stillnessProbe && stillnessProbe.available && !stillnessProbe.isStill) {
        reasons.push(`stillness_delta:${stillnessProbe.combinedDelta.toFixed(3)}`);
    }
    if (visualSample.meanAlpha < 0.85) {
        reasons.push(`mean_alpha:${visualSample.meanAlpha.toFixed(3)}`);
    }
    if (visualSample.opaqueRatio < 0.8) {
        reasons.push(`opaque_ratio:${visualSample.opaqueRatio.toFixed(3)}`);
    }

    let outcome = "flat_live";
    if (reasons.length > 0) {
        outcome = "visually_suspect";
    } else if (visualRichnessScore >= 28 && stillnessProbe?.available && stillnessProbe.isStill && overallQualityOutcome === "premium") {
        outcome = "beautiful_candidate";
    } else if (visualRichnessScore >= 20 && stillnessProbe?.available && stillnessProbe.isStill) {
        outcome = "polished_live";
    } else if (visualRichnessScore >= 14) {
        outcome = "textured_live";
    }

    return {
        outcome,
        reasons: Array.from(new Set(reasons)),
        visualRichnessScore,
        stillnessSupported: Boolean(stillnessProbe?.available),
        stillnessStable: Boolean(stillnessProbe?.available && stillnessProbe.isStill),
    };
}

function resolvePresentationJudgement(qualityOutcome, motionVerdict, visualVerdict, stillnessProbe) {
    const stabilityReasons = [];
    let stabilityOutcome = "failed";
    if (qualityOutcome === "premium") {
        stabilityOutcome = motionVerdict?.outcome === "premium_candidate" ? "stable" : "guarded";
        if (motionVerdict?.outcome && motionVerdict.outcome !== "premium_candidate") {
            stabilityReasons.push(...(motionVerdict.reasons ?? []));
        }
    } else if (qualityOutcome === "stable") {
        stabilityOutcome = "stable";
    } else if (qualityOutcome === "guarded") {
        stabilityOutcome = "guarded";
    }

    const beautyReasons = [];
    let beautyOutcome = "uncertain";
    if (visualVerdict?.outcome === "beautiful_candidate") {
        beautyOutcome = "beautiful";
        beautyReasons.push("rich_visual_sample_and_stillness");
    } else if (visualVerdict?.outcome === "polished_live") {
        beautyOutcome = "polished";
        beautyReasons.push("rich_live_canvas_but_not_premium_lane");
    } else if (visualVerdict?.outcome === "textured_live") {
        beautyOutcome = "textured";
        beautyReasons.push("some_visual_texture_present");
    } else if (visualVerdict?.outcome === "flat_live") {
        beautyOutcome = "flat";
        beautyReasons.push("low_visual_variance");
    } else if (visualVerdict?.outcome === "visually_suspect") {
        beautyOutcome = "suspect";
        beautyReasons.push(...(visualVerdict.reasons ?? []));
    }
    if (stillnessProbe && stillnessProbe.available && !stillnessProbe.isStill) {
        beautyReasons.push(`stillness_delta:${stillnessProbe.combinedDelta.toFixed(3)}`);
    }

    const overallOutcome =
        stabilityOutcome === "failed"
            ? "failed"
            : beautyOutcome === "beautiful"
              ? "stable_and_beautiful"
              : beautyOutcome === "polished"
                ? "stable_and_polished"
                : beautyOutcome === "textured"
                  ? "stable_and_textured"
                  : stabilityOutcome === "guarded"
                    ? "stable_only_guarded"
                    : "stable_only";

    return {
        stability: {
            outcome: stabilityOutcome,
            reasons: Array.from(new Set(stabilityReasons)),
        },
        beauty: {
            outcome: beautyOutcome,
            reasons: Array.from(new Set(beautyReasons)),
        },
        overall: {
            outcome: overallOutcome,
            reasons: Array.from(
                new Set([
                    ...stabilityReasons,
                    ...beautyReasons,
                    stillnessProbe?.available ? `stillness:${stillnessProbe.isStill ? "stable" : "moving"}` : "stillness:unavailable",
                ]),
            ),
        },
    };
}

function choosePerceivedVisualSample(canvasSample, screenshotSample) {
    if (screenshotSample?.available) {
        const canvasLooksBlank =
            !canvasSample?.available ||
            ((canvasSample.meanAlpha ?? 0) <= 0.001 &&
                (canvasSample.meanLuma ?? 0) <= 1 &&
                (canvasSample.meanColorSpread ?? 0) <= 1);
        const screenshotHasSignal =
            (screenshotSample.meanLuma ?? 0) > 4 ||
            (screenshotSample.meanColorSpread ?? 0) > 6 ||
            (screenshotSample.opaqueRatio ?? 0) > 0.15;
        if (canvasLooksBlank && screenshotHasSignal) {
            return screenshotSample;
        }
    }

    return canvasSample ?? screenshotSample ?? null;
}

function screenshotPath(name) {
    return path.join(artifactDir, name);
}

function isSceneFailure(sceneId, entry) {
    if (typeof entry?.url !== "string") {
        return false;
    }
    return (Boolean(sceneId) && entry.url.includes(sceneId)) || entry.url.includes("/storage/scenes/");
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
                const staticReferenceViewer = document.querySelector('[data-testid="mvp-static-reference-viewer"]');
                const operationalMode = runtimeDiagnostics?.getAttribute("data-operational-mode");
                return (
                    Boolean(canvas) ||
                    Boolean(staticReferenceViewer) ||
                    operationalMode === "interactive_fallback" ||
                    operationalMode === "interactive_projection" ||
                    operationalMode === "projection_only" ||
                    operationalMode === "static_reference" ||
                    operationalMode === "hard_fallback"
                );
            },
            null,
            { timeout: 120000 },
        ).catch(() => null);
        await page.waitForTimeout(waitMs);

        const screenshot = screenshotPath(`${scenarioId}.png`);
        const viewerSurface = page.locator('[data-testid="mvp-viewer-surface"]').first();
        if (await viewerSurface.count()) {
            await viewerSurface.screenshot({ path: screenshot });
        } else {
            await page.screenshot({ path: screenshot, fullPage: true });
        }
        const diagnostics = await collectViewerDiagnostics(page);
        const canvasVisualSample = summarizeVisualSample(await collectCanvasVisualSample(page));
        const screenshotVisualSample = summarizeVisualSample(await samplePngVisual(screenshot));
        const visualSample = choosePerceivedVisualSample(canvasVisualSample, screenshotVisualSample);
        const stillnessProbe = await probeCanvasStillness(page);

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

        const referenceFixtureEvidence = {
            deterministic_fixture_path_available: true,
            reference_fixture_rendered: diagnostics.hasStaticReferenceViewer,
            reference_fixture_certified:
                viewerProof.proofScope === "static_reference_only" &&
                diagnostics.hasStaticReferenceViewer &&
                sceneRequestFailures.length === 0 &&
                sceneFailingResponses.length === 0 &&
                !hydrationMismatchDetected,
            proof_scope: viewerProof.proofScope,
            operational_mode: operationalMode,
            viewer_lane: viewerLane,
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

        const referencePass =
            referenceFixtureEvidence.reference_fixture_certified &&
            !forceWebgl2Unavailable &&
            viewerLane === "fallback_only" &&
            !diagnostics.hasCanvas &&
            !hydrationMismatchDetected;
        const qualityOutcome = resolveScenarioQualityOutcome(diagnostics, pass);
        const motionVerdict = resolveMotionVerdict(diagnostics.runtimeDiagnostics);
        const visualVerdict = resolveVisualVerdict(
            diagnostics.runtimeDiagnostics,
            diagnostics.canvasMetrics,
            visualSample,
            stillnessProbe,
            qualityOutcome,
        );
        const presentationJudgement = resolvePresentationJudgement(qualityOutcome, motionVerdict, visualVerdict, stillnessProbe);

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
            canvas_visual_sample: canvasVisualSample,
            screenshot_visual_sample: screenshotVisualSample,
            visual_sample: visualSample,
            stillness_probe: stillnessProbe,
            motion_verdict: motionVerdict,
            visual_verdict: visualVerdict,
            presentation_judgement: presentationJudgement,
            screenshot,
            hydration_mismatch_detected: hydrationMismatchDetected,
            hydration_mismatch_messages: hydrationMismatchMessages,
            observed_scene_responses: sceneObservedResponses,
            console_messages: consoleMessages,
            page_errors: pageErrors,
            request_failures: requestFailures,
            failing_responses: failingResponses,
            pass,
            reference_fixture_evidence: referenceFixtureEvidence,
            reference_pass: referencePass,
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
    fixture_path: certInputRaw,
    artifact_dir: artifactDir,
    executed_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
    certification_input: null,
    preview: null,
    preview_blocked: null,
    preview_truth_blocked: null,
    deterministic_fixture: null,
    existing_scene: null,
    existing_scene_certified: false,
    host_viewer_lane: null,
    host_capability_lane: null,
    certified_viewer_lane: null,
    certified_fixture_lane: null,
    operational_mode: null,
    proof_scope: null,
    loaded_scene_certified: false,
    premium_live_lane_claimable: false,
    interactive_fallback_certified: false,
    reference_fixture_certified: false,
    beauty_certified: false,
    beauty_outcome: null,
    presentation_judgement: null,
    viewer_truth: null,
    coverage: null,
    warnings: [],
    failures: [],
    scenarios: [],
    certification_paths: [],
    pass: false,
};

try {
    const certInput = await resolveCertInput(certInputRaw);
    report.certification_input = certInput;

    if (certInput.mode === "existing_scene") {
        const sceneId = certInput.scene_id ?? extractSceneIdFromInput(certInput.display_path) ?? certInput.display_path;
        const urls = buildExistingSceneUrls(sceneId);
        const metadata = await fetchMetadata(urls.metadata);
        const draft = buildDraft({
            sceneId,
            urls,
            metadata,
            files: null,
        });
        const existingSceneScenario = await runViewerScenario({
            scenarioId: "existing-scene",
            draft,
            sceneId,
            forceWebgl2Unavailable: false,
        });
        const existingSceneCertified =
            existingSceneScenario.loaded_scene_evidence.loaded_scene_certified ||
            existingSceneScenario.reference_fixture_evidence.reference_fixture_certified;

        report.existing_scene = {
            source_kind: certInput.source_kind,
            source: certInput.display_path,
            scene_id: sceneId,
            urls,
            metadata,
            scenario: existingSceneScenario,
        };
        report.scenarios.push(existingSceneScenario);
        report.host_viewer_lane = existingSceneScenario.host_capability_lane;
        report.host_capability_lane = existingSceneScenario.host_capability_lane;
        report.certified_viewer_lane = existingSceneScenario.viewer_lane;
        report.certified_fixture_lane = null;
        report.operational_mode = existingSceneScenario.operational_mode;
        report.proof_scope = existingSceneScenario.viewer_proof.proofScope;
        report.loaded_scene_certified = existingSceneScenario.loaded_scene_evidence.loaded_scene_certified;
        report.premium_live_lane_claimable = existingSceneScenario.viewer_proof.premiumLiveClaimable && existingSceneScenario.pass;
        report.interactive_fallback_certified =
            existingSceneScenario.loaded_scene_evidence.loaded_scene_certified &&
            existingSceneScenario.viewer_proof.proofScope === "interactive_fallback";
        report.reference_fixture_certified = existingSceneScenario.reference_fixture_evidence.reference_fixture_certified;
        report.existing_scene_certified = existingSceneCertified;
        report.presentation_judgement = existingSceneScenario.presentation_judgement;
        report.beauty_outcome = existingSceneScenario.presentation_judgement?.beauty?.outcome ?? null;
        report.beauty_certified = ["beautiful", "polished"].includes(report.beauty_outcome ?? "");
        report.preview_truth_blocked = {
            blocked: true,
            kind: "existing_scene_mode",
            message: "Existing scene certification was requested, so preview generation was intentionally not run.",
        };
        report.coverage = existingSceneScenario.coverage;
        report.viewer_truth = {
            host_capability_lane: existingSceneScenario.host_capability_lane,
            certified_viewer_lane: existingSceneScenario.viewer_lane,
            operational_mode: existingSceneScenario.operational_mode,
            proof_scope: existingSceneScenario.viewer_proof.proofScope,
            loaded_scene_certified: report.loaded_scene_certified,
            premium_live_lane_claimable: report.premium_live_lane_claimable,
            interactive_fallback_certified: report.interactive_fallback_certified,
            existing_scene_certified: existingSceneCertified,
            beauty_certified: report.beauty_certified,
            beauty_outcome: report.beauty_outcome,
            preview_truth_blocked: true,
            preview_truth_blocked_kind: "existing_scene_mode",
        };
        report.warnings.push(
            "Existing scene certified without preview generation.",
            "Preview truth blocked: existing scene certification bypassed the preview worker by design.",
        );
        if (!report.beauty_certified) {
            report.warnings.push(
                `Existing scene stayed live, but presentation beauty is still ${report.beauty_outcome ?? "unproven"}.`,
            );
        }
        report.pass = existingSceneCertified;
        report.status = report.pass ? "passed_existing_scene" : "failed";
        report.certification_paths.push({
            kind: "existing_scene",
            status: existingSceneCertified ? "passed" : "failed",
            proof_scope: existingSceneScenario.viewer_proof.proofScope,
        });
        if (!existingSceneCertified) {
            report.failures.push("existing-scene failed its viewer expectations.");
        }
    } else {
        const upload = await uploadFixture(certInput.fixture_path);
    const previewAttempt = await (async () => {
        try {
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
            const previewTruth = assessGeneratedPreviewTruth(metadata);
            const draft = buildDraft({
                sceneId,
                urls,
                metadata,
                files: finalJob.result?.files ?? null,
            });

            return {
                ok: true,
                upload,
                preview,
                finalJob,
                sceneId,
                urls,
                metadata,
                previewTruth,
                draft,
            };
        } catch (error) {
            return {
                ok: false,
                upload,
                blocked: classifyPreviewWorkerFailure(error),
            };
        }
    })();

    report.preview = {
        upload,
        preview: previewAttempt.ok ? previewAttempt.preview : null,
        final_job: previewAttempt.ok ? previewAttempt.finalJob : null,
        scene_id: previewAttempt.ok ? previewAttempt.sceneId : null,
        metadata: previewAttempt.ok ? previewAttempt.metadata : null,
        truth: previewAttempt.ok ? previewAttempt.previewTruth : null,
    };

    if (previewAttempt.ok) {
        const actualScenario = await runViewerScenario({
            scenarioId: "actual-lane",
            draft: previewAttempt.draft,
            sceneId: previewAttempt.sceneId,
            forceWebgl2Unavailable: false,
        });
        const forcedFallbackScenario = await runViewerScenario({
            scenarioId: "forced-fallback",
            draft: previewAttempt.draft,
            sceneId: previewAttempt.sceneId,
            forceWebgl2Unavailable: true,
        });
        const previewTruthEligible = previewAttempt.previewTruth.eligible;
        report.preview_truth_blocked = previewTruthEligible
            ? null
            : {
                  blocked: true,
                  kind: "preview_truth_ineligible",
                  message: "The generated preview rendered, but its metadata still describes preview-only or mock output.",
                  reasons: previewAttempt.previewTruth.reasons,
              };

        report.scenarios.push(actualScenario, forcedFallbackScenario);
        report.host_viewer_lane = actualScenario.host_capability_lane;
        report.host_capability_lane = actualScenario.host_capability_lane;
        report.certified_viewer_lane = actualScenario.viewer_lane;
        report.certified_fixture_lane = null;
        report.operational_mode = actualScenario.operational_mode;
        report.proof_scope = actualScenario.viewer_proof.proofScope;
        report.loaded_scene_certified = actualScenario.loaded_scene_evidence.loaded_scene_certified && previewTruthEligible;
        report.premium_live_lane_claimable = actualScenario.viewer_proof.premiumLiveClaimable && actualScenario.pass && previewTruthEligible;
        report.interactive_fallback_certified =
            actualScenario.loaded_scene_evidence.loaded_scene_certified &&
            previewTruthEligible &&
            actualScenario.viewer_proof.proofScope === "interactive_fallback";
        report.reference_fixture_certified = false;
        report.existing_scene_certified = false;
        report.presentation_judgement = actualScenario.presentation_judgement;
        report.beauty_outcome = actualScenario.presentation_judgement?.beauty?.outcome ?? null;
        report.beauty_certified = previewTruthEligible && ["beautiful", "polished"].includes(report.beauty_outcome ?? "");
        report.coverage = actualScenario.operational_mode === "webgl_live" ? "interactive_and_fallback" : actualScenario.coverage;
        report.viewer_truth = {
            host_capability_lane: actualScenario.host_capability_lane,
            certified_viewer_lane: actualScenario.viewer_lane,
            operational_mode: actualScenario.operational_mode,
            proof_scope: actualScenario.viewer_proof.proofScope,
            loaded_scene_certified: report.loaded_scene_certified,
            premium_live_lane_claimable: report.premium_live_lane_claimable,
            interactive_fallback_certified: report.interactive_fallback_certified,
            beauty_certified: report.beauty_certified,
            beauty_outcome: report.beauty_outcome,
            preview_truth_eligible: previewTruthEligible,
            preview_truth_reasons: previewAttempt.previewTruth.reasons,
            preview_worker_blocked: false,
            reference_fixture_certified: false,
            existing_scene_certified: false,
            preview_truth_blocked: Boolean(report.preview_truth_blocked),
            preview_truth_blocked_kind: report.preview_truth_blocked?.kind ?? null,
        };

        if (!report.loaded_scene_certified) {
            report.warnings.push(
                previewTruthEligible
                    ? "The viewer packet did not prove a real loaded scene. Shell-only or unproven fallback must not be treated as viewer certification."
                    : "The generated preview rendered, but its metadata still describes preview-only or mock output, so it is not valid as live scene certification.",
            );
        }

        if (report.coverage === "fallback_only" || report.coverage === "image_only" || report.coverage === "image_interactive") {
            report.warnings.push(
                actualScenario.host_capability_lane === "webgl2_capable"
                    ? "Host exposes WebGL2, but the local viewer scenario still did not achieve a live canvas."
                    : "Host does not expose WebGL2. Premium live canvas certification is not covered on this machine.",
            );
        }
        if (!report.beauty_certified) {
            report.warnings.push(`Generated scene beauty remains ${report.beauty_outcome ?? "unproven"}.`);
        }

        for (const scenario of report.scenarios) {
            if (!scenario.pass) {
                report.failures.push(`${scenario.scenario_id} failed its viewer expectations.`);
            }
        }

        if (!previewTruthEligible) {
            report.failures.push(
                `Generated preview metadata is not eligible for beauty certification (${previewAttempt.previewTruth.reasons.join(", ")}).`,
            );
        }

        report.pass = report.failures.length === 0;
        report.status = report.pass ? "passed" : previewTruthEligible ? "failed" : "failed_preview_truth_blocked";
        report.certification_paths.push(
            {
                kind: "generated_preview",
                status: previewTruthEligible ? (actualScenario.pass ? "passed" : "failed") : "blocked_truth",
                proof_scope: actualScenario.viewer_proof.proofScope,
                truth: previewAttempt.previewTruth,
            },
            {
                kind: "forced_fallback",
                status: forcedFallbackScenario.pass ? "passed" : "failed",
                proof_scope: forcedFallbackScenario.viewer_proof.proofScope,
            },
        );
    } else {
        const referenceImageUrl = toProxyUrl(upload.url);
        const referenceSceneId = `fixture-reference-${upload.image_id}`;
        const referenceDraft = buildReferenceFixtureDraft({
            sceneId: referenceSceneId,
            referenceImageUrl,
            sourceUrl: referenceImageUrl,
        });
        const referenceScenario = await runViewerScenario({
            scenarioId: "deterministic-fixture",
            draft: referenceDraft,
            sceneId: null,
            forceWebgl2Unavailable: false,
        });

        report.preview_blocked = previewAttempt.blocked;
        report.preview_truth_blocked = previewAttempt.blocked;
        report.preview = {
            upload,
            preview: null,
            final_job: null,
            scene_id: null,
            metadata: null,
        };
        report.deterministic_fixture = {
            scene_id: referenceSceneId,
            reference_image: referenceImageUrl,
            scenario: referenceScenario,
        };
        report.scenarios.push(referenceScenario);
        report.host_viewer_lane = referenceScenario.host_capability_lane;
        report.host_capability_lane = referenceScenario.host_capability_lane;
        report.certified_viewer_lane = referenceScenario.viewer_lane;
        report.certified_fixture_lane = referenceScenario.reference_fixture_evidence.reference_fixture_certified
            ? "static_reference"
            : null;
        report.operational_mode = referenceScenario.operational_mode;
        report.proof_scope = referenceScenario.viewer_proof.proofScope;
        report.loaded_scene_certified = false;
        report.premium_live_lane_claimable = false;
        report.interactive_fallback_certified = false;
        report.reference_fixture_certified = referenceScenario.reference_fixture_evidence.reference_fixture_certified;
        report.existing_scene_certified = false;
        report.presentation_judgement = referenceScenario.presentation_judgement;
        report.beauty_outcome = referenceScenario.presentation_judgement?.beauty?.outcome ?? null;
        report.beauty_certified = false;
        report.coverage = referenceScenario.coverage;
        report.viewer_truth = {
            host_capability_lane: referenceScenario.host_capability_lane,
            certified_viewer_lane: referenceScenario.viewer_lane,
            operational_mode: referenceScenario.operational_mode,
            proof_scope: referenceScenario.viewer_proof.proofScope,
            loaded_scene_certified: false,
            premium_live_lane_claimable: false,
            interactive_fallback_certified: false,
            beauty_certified: false,
            beauty_outcome: report.beauty_outcome,
            preview_worker_blocked: true,
            preview_worker_blocked_reason: previewAttempt.blocked.message,
            reference_fixture_certified: report.reference_fixture_certified,
            existing_scene_certified: false,
            preview_truth_blocked: true,
            preview_truth_blocked_kind: previewAttempt.blocked.kind,
        };

        report.warnings.push(
            `Preview worker blocked: ${previewAttempt.blocked.message}`,
            "The local cert fell back to a deterministic reference-only fixture path. That proves the viewer can still render a truthful local fixture state, but it does not certify the live preview worker.",
        );

        report.pass = referenceScenario.reference_pass;
        report.status = report.pass ? "passed_with_preview_blocked" : "failed";
        report.certification_paths.push(
            {
                kind: "generated_preview",
                status: "blocked",
                reason: previewAttempt.blocked.kind,
                message: previewAttempt.blocked.message,
            },
            {
                kind: "deterministic_fixture",
                status: referenceScenario.reference_pass ? "passed" : "failed",
                proof_scope: referenceScenario.viewer_proof.proofScope,
            },
        );

        if (!referenceScenario.reference_pass) {
            report.failures.push("deterministic-fixture failed its viewer expectations.");
        }
    }
}
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
