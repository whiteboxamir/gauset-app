import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ensureBenchmarkFixture } from "./generate_benchmark_splat_fixture.mjs";
import hostGuard from "./mvp_host_guard.cjs";
import {
    collectCanvasVisualSample,
    collectViewerDiagnostics,
    detectHydrationMismatchMessages,
    probeCanvasStillness,
    resolveViewerProof,
} from "./mvp_viewer_runtime_shared.mjs";

const { assertLocalMvpUrl, sanitizeRunLabel } = hostGuard;

function resolveBenchmarkUrl() {
    const explicitUrl = process.argv[2] ?? process.env.GAUSET_MVP_BENCHMARK_URL;
    if (explicitUrl) {
        return explicitUrl;
    }

    const baseUrl = process.env.GAUSET_MVP_BASE_URL ?? "";
    if (!baseUrl) {
        return "http://localhost:3015/mvp";
    }

    return baseUrl.endsWith("/mvp") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/mvp`;
}

const url = assertLocalMvpUrl(
    resolveBenchmarkUrl(),
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

    if (/context was lost|context lost/i.test(message)) {
        return "context_lost";
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

function summarizeRuntimeQuality(snapshot) {
    const runtimeDiagnostics = snapshot?.viewerDiagnostics?.runtimeDiagnostics ?? null;
    return runtimeDiagnostics
        ? {
              qualityMode: runtimeDiagnostics.qualityMode,
              qualityTier: runtimeDiagnostics.qualityTier,
              qualityLabel: runtimeDiagnostics.qualityLabel,
              qualitySummary: runtimeDiagnostics.qualitySummary,
              qualityPremiumEffectsEnabled: runtimeDiagnostics.qualityPremiumEffectsEnabled,
              qualityCautiousMode: runtimeDiagnostics.qualityCautiousMode,
              adaptiveQualityTier: runtimeDiagnostics.adaptiveQualityTier,
              lowestAdaptiveQualityTier: runtimeDiagnostics.lowestAdaptiveQualityTier,
              adaptiveTransitionCount: runtimeDiagnostics.adaptiveTransitionCount,
              adaptiveFullMs: runtimeDiagnostics.adaptiveFullMs,
              adaptiveBalancedMs: runtimeDiagnostics.adaptiveBalancedMs,
              adaptiveSafeMs: runtimeDiagnostics.adaptiveSafeMs,
              adaptiveSafeEntries: runtimeDiagnostics.adaptiveSafeEntries,
              effectivePointBudget: runtimeDiagnostics.effectivePointBudget,
              prefersPerformanceMode: runtimeDiagnostics.prefersPerformanceMode,
              contextLossCount: runtimeDiagnostics.contextLossCount,
              canvasCreatedAtMs: runtimeDiagnostics.canvasCreatedAtMs,
              viewerReadyAtMs: runtimeDiagnostics.viewerReadyAtMs,
              firstContextLossAtMs: runtimeDiagnostics.firstContextLossAtMs,
              firstFrameAtMs: runtimeDiagnostics.firstFrameAtMs,
              firstStableFrameAtMs: runtimeDiagnostics.firstStableFrameAtMs,
              frameCount: runtimeDiagnostics.frameCount,
              frameAvgMs: runtimeDiagnostics.frameAvgMs,
              frameP95Ms: runtimeDiagnostics.frameP95Ms,
              frameWorstMs: runtimeDiagnostics.frameWorstMs,
              frameOver33MsRatio: runtimeDiagnostics.frameOver33MsRatio,
              frameOver50MsRatio: runtimeDiagnostics.frameOver50MsRatio,
              posterCurtainStage: runtimeDiagnostics.posterCurtainStage,
              posterCurtainVisible: runtimeDiagnostics.posterCurtainVisible,
              renderMegapixels: runtimeDiagnostics.renderMegapixels,
              deliveryManifestFirst: runtimeDiagnostics.deliveryManifestFirst,
              deliveryHasProgressiveVariants: runtimeDiagnostics.deliveryHasProgressiveVariants,
              deliveryHasCompressedVariants: runtimeDiagnostics.deliveryHasCompressedVariants,
              deliveryHasPageStreaming: runtimeDiagnostics.deliveryHasPageStreaming,
              stagedDeliveryObserved: runtimeDiagnostics.deliveryStagedObserved,
              streamingObserved: runtimeDiagnostics.deliveryStreamingObserved,
              upgradePending: runtimeDiagnostics.deliveryUpgradePending,
              activeVariantLabel: runtimeDiagnostics.deliveryActiveVariantLabel,
              upgradeVariantLabel: runtimeDiagnostics.deliveryUpgradeVariantLabel,
              residentLayerCount: runtimeDiagnostics.deliveryResidentLayerCount,
              residentPointCount: runtimeDiagnostics.deliveryResidentPointCount,
              refinePagesLoaded: runtimeDiagnostics.deliveryRefinePagesLoaded,
              refinePagesPending: runtimeDiagnostics.deliveryRefinePagesPending,
              deliveryProgressFraction: runtimeDiagnostics.deliveryProgressFraction,
              deliveryEvictions: runtimeDiagnostics.deliveryEvictions,
          }
        : null;
}

function summarizeCanvasMetrics(snapshot) {
    const canvasMetrics = snapshot?.viewerDiagnostics?.canvasMetrics ?? snapshot?.diagnostics?.canvasMetrics ?? null;
    if (!canvasMetrics) {
        return null;
    }

    return {
        devicePixelRatio: canvasMetrics.devicePixelRatio,
        viewerCssWidth: canvasMetrics.viewerCssWidth,
        viewerCssHeight: canvasMetrics.viewerCssHeight,
        viewerCssArea: canvasMetrics.viewerCssArea,
        canvasCssWidth: canvasMetrics.canvasCssWidth,
        canvasCssHeight: canvasMetrics.canvasCssHeight,
        canvasCssArea: canvasMetrics.canvasCssArea,
        canvasIntrinsicWidth: canvasMetrics.canvasIntrinsicWidth,
        canvasIntrinsicHeight: canvasMetrics.canvasIntrinsicHeight,
        canvasIntrinsicArea: canvasMetrics.canvasIntrinsicArea,
        canvasResolutionScaleX: canvasMetrics.canvasResolutionScaleX,
        canvasResolutionScaleY: canvasMetrics.canvasResolutionScaleY,
        canvasEffectiveDpr: canvasMetrics.canvasEffectiveDpr,
        canvasFillRatio: canvasMetrics.canvasFillRatio,
        canvasAspectRatio: canvasMetrics.canvasAspectRatio,
        viewerAspectRatio: canvasMetrics.viewerAspectRatio,
        canvasAspectRatioDelta: canvasMetrics.canvasAspectRatioDelta,
        renderMegapixels:
            Number.isFinite(canvasMetrics.canvasIntrinsicWidth) && Number.isFinite(canvasMetrics.canvasIntrinsicHeight)
                ? (canvasMetrics.canvasIntrinsicWidth * canvasMetrics.canvasIntrinsicHeight) / 1_000_000
                : null,
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

function resolveVisualVerdict(runtimeQuality, canvasMetrics, visualSample, stillnessProbe, overallQualityOutcome) {
    if (!visualSample?.available) {
        return {
            outcome: "unknown",
            reasons: [visualSample?.reason ?? "missing_visual_sample"],
        };
    }

    const reasons = [];
    const visualRichnessScore = visualSample.lumaStdDev * 1.25 + visualSample.meanColorSpread * 0.35 + visualSample.lumaRange * 0.2 + visualSample.opaqueRatio * 10;

    if ((canvasMetrics?.canvasFillRatio ?? 1) < 0.85) {
        reasons.push(`canvas_fill_ratio:${canvasMetrics?.canvasFillRatio?.toFixed(3) ?? "unknown"}`);
    }
    if ((canvasMetrics?.canvasAspectRatioDelta ?? 0) > 0.05) {
        reasons.push(`aspect_delta:${canvasMetrics?.canvasAspectRatioDelta?.toFixed(3) ?? "unknown"}`);
    }
    if ((canvasMetrics?.canvasEffectiveDpr ?? 1) < 0.85) {
        reasons.push(`canvas_effective_dpr:${canvasMetrics?.canvasEffectiveDpr?.toFixed(3) ?? "unknown"}`);
    }
    if ((runtimeQuality?.posterCurtainStage ?? "hidden") !== "hidden") {
        reasons.push(`poster_curtain:${runtimeQuality.posterCurtainStage}`);
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

function getQualityOutcomeRank(outcome) {
    return {
        failed: 0,
        guarded: 1,
        stable: 2,
        premium: 3,
    }[outcome] ?? 0;
}

function collectQualitySignals(snapshot, fixturePointCount) {
    const runtimeQuality = snapshot?.runtimeQuality ?? null;
    const canvasMetrics = summarizeCanvasMetrics(snapshot);
    const contextLossCount = runtimeQuality?.contextLossCount ?? 0;
    const effectivePointBudget = runtimeQuality?.effectivePointBudget ?? null;
    const pointBudgetRatio =
        Number.isFinite(effectivePointBudget) && fixturePointCount > 0 ? effectivePointBudget / fixturePointCount : null;
    const qualityMode = runtimeQuality?.qualityMode ?? "";
    const qualityTier = runtimeQuality?.qualityTier ?? "";
    const qualityLabel = runtimeQuality?.qualityLabel ?? "";
    const qualitySummary = runtimeQuality?.qualitySummary ?? "";
    const guardrailSignals = [
        /safe|balanced|guarded/i.test(qualityMode),
        /safe|balanced|guarded/i.test(qualityTier),
        /safe|balanced|guarded/i.test(qualityLabel),
        Boolean(runtimeQuality?.qualityCautiousMode),
        Boolean(runtimeQuality?.prefersPerformanceMode),
        Boolean(runtimeQuality?.stagedDeliveryObserved),
        Boolean(runtimeQuality?.upgradePending),
        contextLossCount > 0,
        pointBudgetRatio !== null && pointBudgetRatio < 0.9,
        canvasMetrics?.canvasEffectiveDpr !== null && canvasMetrics.canvasEffectiveDpr < 0.95,
    ];
    const premiumSignals = [
        /premium|full/i.test(qualityMode),
        /premium|full/i.test(qualityTier),
        /premium/i.test(qualityLabel),
        Boolean(runtimeQuality?.qualityPremiumEffectsEnabled),
        runtimeQuality?.adaptiveQualityTier ? /premium|full/i.test(runtimeQuality.adaptiveQualityTier) : false,
        runtimeQuality?.lowestAdaptiveQualityTier ? /premium|full/i.test(runtimeQuality.lowestAdaptiveQualityTier) : false,
        pointBudgetRatio !== null && pointBudgetRatio >= 0.9,
        canvasMetrics?.canvasEffectiveDpr !== null && canvasMetrics.canvasEffectiveDpr >= 0.95,
    ];

    return {
        hasCanvas: Boolean(snapshot?.hasCanvas),
        proofScope: snapshot?.viewerProof?.proofScope ?? null,
        operationalMode: snapshot?.operationalMode ?? null,
        contextLossCount,
        effectivePointBudget,
        pointBudgetRatio,
        qualityMode,
        qualityTier,
        qualityLabel,
        qualitySummary,
        qualityCautiousMode: Boolean(runtimeQuality?.qualityCautiousMode),
        qualityPremiumEffectsEnabled: Boolean(runtimeQuality?.qualityPremiumEffectsEnabled),
        prefersPerformanceMode: Boolean(runtimeQuality?.prefersPerformanceMode),
        adaptiveQualityTier: runtimeQuality?.adaptiveQualityTier ?? null,
        lowestAdaptiveQualityTier: runtimeQuality?.lowestAdaptiveQualityTier ?? null,
        deliveryManifestFirst: Boolean(runtimeQuality?.deliveryManifestFirst),
        deliveryHasProgressiveVariants: Boolean(runtimeQuality?.deliveryHasProgressiveVariants),
        deliveryHasCompressedVariants: Boolean(runtimeQuality?.deliveryHasCompressedVariants),
        stagedDeliveryObserved: Boolean(runtimeQuality?.stagedDeliveryObserved),
        upgradePending: Boolean(runtimeQuality?.upgradePending),
        canvasMetrics,
        guardrailSignals,
        premiumSignals,
        livePathHealthy:
            Boolean(snapshot?.hasCanvas) &&
            snapshot?.viewerProof?.proofScope === "interactive_webgl_live" &&
            contextLossCount === 0 &&
            !snapshot?.fallbackVisible,
        premiumEligible:
            Boolean(snapshot?.hasCanvas) &&
            snapshot?.viewerProof?.proofScope === "interactive_webgl_live" &&
            contextLossCount === 0 &&
            premiumSignals.every(Boolean) &&
            !guardrailSignals.some(Boolean),
        guarded:
            Boolean(snapshot?.hasCanvas) &&
            snapshot?.viewerProof?.proofScope === "interactive_webgl_live" &&
            contextLossCount === 0 &&
            guardrailSignals.some(Boolean),
    };
}

function judgeQualityOutcome(snapshot, fixturePointCount) {
    const signals = collectQualitySignals(snapshot, fixturePointCount);
    const reasons = [];

    if (!signals.hasCanvas) {
        reasons.push("no_canvas");
    }
    if (signals.proofScope !== "interactive_webgl_live") {
        reasons.push(`proof_scope:${signals.proofScope ?? "unknown"}`);
    }
    if (signals.contextLossCount > 0) {
        reasons.push(`context_loss:${signals.contextLossCount}`);
    }
    if (signals.guardrailSignals.some(Boolean)) {
        if (/safe/i.test(signals.qualityMode) || /safe/i.test(signals.qualityTier) || /safe/i.test(signals.qualityLabel)) {
            reasons.push("safe_quality_mode");
        }
        if (/balanced/i.test(signals.qualityMode) || /balanced/i.test(signals.qualityTier) || /balanced/i.test(signals.qualityLabel)) {
            reasons.push("balanced_quality_mode");
        }
        if (signals.qualityCautiousMode) {
            reasons.push("cautious_mode");
        }
        if (signals.prefersPerformanceMode) {
            reasons.push("performance_mode");
        }
        if (signals.stagedDeliveryObserved) {
            reasons.push("staged_delivery");
        }
        if (signals.upgradePending) {
            reasons.push("upgrade_pending");
        }
        if (signals.pointBudgetRatio !== null && signals.pointBudgetRatio < 0.9) {
            reasons.push(`point_budget_ratio:${signals.pointBudgetRatio.toFixed(3)}`);
        }
        if (signals.canvasMetrics?.canvasEffectiveDpr !== null && signals.canvasMetrics.canvasEffectiveDpr < 0.95) {
            reasons.push(`canvas_effective_dpr:${signals.canvasMetrics.canvasEffectiveDpr.toFixed(3)}`);
        }
    }

    let outcome = "failed";
    if (signals.premiumEligible) {
        outcome = "premium";
        reasons.unshift("premium_ready");
    } else if (signals.guarded) {
        outcome = "guarded";
    } else if (signals.livePathHealthy) {
        outcome = "stable";
    }

    return {
        outcome,
        rank: getQualityOutcomeRank(outcome),
        reasons: Array.from(new Set(reasons)),
        signals,
    };
}

function resolveMotionVerdict(runtimeQuality) {
    if (!runtimeQuality) {
        return {
            outcome: "unknown",
            reasons: ["missing_runtime_quality"],
        };
    }

    const reasons = [];
    const frameP95Ms = runtimeQuality.frameP95Ms ?? null;
    const frameOver50MsRatio = runtimeQuality.frameOver50MsRatio ?? null;
    const adaptiveSafeMs = runtimeQuality.adaptiveSafeMs ?? 0;
    const adaptiveBalancedMs = runtimeQuality.adaptiveBalancedMs ?? 0;
    const adaptiveFullMs = runtimeQuality.adaptiveFullMs ?? 0;
    const adaptiveTotalMs = adaptiveSafeMs + adaptiveBalancedMs + adaptiveFullMs;
    const adaptiveSafeRatio = adaptiveTotalMs > 0 ? adaptiveSafeMs / adaptiveTotalMs : 0;
    const contextLossCount = runtimeQuality.contextLossCount ?? 0;

    if (frameP95Ms !== null && frameP95Ms > 50) {
        reasons.push(`frame_p95_ms:${frameP95Ms}`);
    }
    if (frameOver50MsRatio !== null && frameOver50MsRatio > 0.02) {
        reasons.push(`slow_frame_ratio:${frameOver50MsRatio.toFixed(3)}`);
    }
    if ((runtimeQuality.adaptiveSafeEntries ?? 0) > 0) {
        reasons.push(`adaptive_safe_entries:${runtimeQuality.adaptiveSafeEntries}`);
    }
    if (adaptiveSafeRatio > 0.2) {
        reasons.push(`adaptive_safe_ratio:${adaptiveSafeRatio.toFixed(3)}`);
    }
    if (contextLossCount > 0) {
        reasons.push(`context_loss_count:${contextLossCount}`);
    }
    if (runtimeQuality.streamingObserved && (runtimeQuality.refinePagesLoaded ?? 0) + (runtimeQuality.refinePagesPending ?? 0) <= 0) {
        reasons.push("streaming_truth_missing");
    }

    if (reasons.length > 0) {
        return {
            outcome: "stable_but_degraded",
            reasons,
        };
    }

    if (
        (runtimeQuality.frameP95Ms ?? Number.POSITIVE_INFINITY) <= 33 &&
        (runtimeQuality.frameOver50MsRatio ?? 1) <= 0.02 &&
        (runtimeQuality.adaptiveSafeEntries ?? 0) === 0 &&
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

function summarizeMemorySnapshots(memorySnapshots) {
    const samples = memorySnapshots
        .map((entry) => entry.performanceMemory?.usedJSHeapSize ?? null)
        .filter((value) => Number.isFinite(value));

    if (samples.length === 0) {
        return {
            samples: 0,
            startUsedJSHeapSize: null,
            endUsedJSHeapSize: null,
            peakUsedJSHeapSize: null,
            peakIncreaseBytes: null,
            endIncreaseBytes: null,
        };
    }

    const startUsedJSHeapSize = samples[0];
    const endUsedJSHeapSize = samples[samples.length - 1];
    const peakUsedJSHeapSize = Math.max(...samples);
    return {
        samples: samples.length,
        startUsedJSHeapSize,
        endUsedJSHeapSize,
        peakUsedJSHeapSize,
        peakIncreaseBytes: peakUsedJSHeapSize - startUsedJSHeapSize,
        endIncreaseBytes: endUsedJSHeapSize - startUsedJSHeapSize,
    };
}

function aggregateQualityJudgement(outcomes) {
    const ordered = Object.entries(outcomes)
        .filter(([, value]) => Boolean(value))
        .map(([phase, value]) => ({ phase, ...value }))
        .sort((a, b) => a.rank - b.rank);
    const overall = ordered[0] ?? { outcome: "failed", rank: 0, reasons: ["no_quality_data"], phase: "unknown" };

    return {
        overall: {
            phase: overall.phase,
            outcome: overall.outcome,
            reasons: overall.reasons,
        },
        phases: outcomes,
    };
}

async function collectViewerSnapshot(page, label) {
    const viewerDiagnostics = await collectViewerDiagnostics(page);
    const viewerProof = resolveViewerProof(viewerDiagnostics);
    const visualSample = await collectCanvasVisualSample(page);
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
            loadingVisible: /Loading environment splat|Loading live renderer|Fetching environment splat|Parsing environment splat|Reading environment manifest/i.test(
                viewerText,
            ),
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
        runtimeQuality: summarizeRuntimeQuality({ viewerDiagnostics }),
        canvasMetrics: summarizeCanvasMetrics({ viewerDiagnostics }),
        visualSample: summarizeVisualSample(visualSample),
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
    const visualSample = await collectCanvasVisualSample(page);
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
        viewerDiagnostics,
        runtimeQuality: summarizeRuntimeQuality({ viewerDiagnostics }),
        canvasMetrics: summarizeCanvasMetrics({ viewerDiagnostics }),
        visualSample: summarizeVisualSample(visualSample),
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
    quality_summary: null,
    quality_judgement: null,
    visual_verdict: null,
    motion_verdict: null,
    performance_summary: null,
    visual_sampling: null,
    presentation_judgement: null,
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
        quality_mode: coldDiagnostics.runtimeQuality?.qualityMode ?? null,
        quality_tier: coldDiagnostics.runtimeQuality?.qualityTier ?? null,
        adaptive_quality_tier: coldDiagnostics.runtimeQuality?.adaptiveQualityTier ?? null,
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
    report.quality_summary = {
        cold: coldDiagnostics.runtimeQuality,
        warm: warmDiagnostics.runtimeQuality,
        pre_stress: preStressHealth.runtimeQuality,
        post_stress: postStressHealth.runtimeQuality,
    };
    report.quality_judgement = aggregateQualityJudgement({
        cold: judgeQualityOutcome(coldDiagnostics, fixture.pointCount),
        warm: judgeQualityOutcome(warmDiagnostics, fixture.pointCount),
        pre_stress: judgeQualityOutcome(preStressHealth, fixture.pointCount),
        post_stress: judgeQualityOutcome(postStressHealth, fixture.pointCount),
    });
    const stillnessProbe = await probeCanvasStillness(page, 120);
    report.visual_sampling = {
        cold: coldDiagnostics.visualSample,
        warm: warmDiagnostics.visualSample,
        pre_stress: preStressHealth.visualSample,
        post_stress: postStressHealth.visualSample,
        stillness_probe: stillnessProbe,
    };
    report.motion_verdict = resolveMotionVerdict(postStressHealth.runtimeQuality);
    report.visual_verdict = resolveVisualVerdict(
        postStressHealth.runtimeQuality,
        postStressHealth.canvasMetrics,
        postStressHealth.visualSample,
        stillnessProbe,
        report.quality_judgement?.overall?.outcome ?? "failed",
    );
    report.presentation_judgement = resolvePresentationJudgement(
        report.quality_judgement?.overall?.outcome ?? "failed",
        report.motion_verdict,
        report.visual_verdict,
        stillnessProbe,
    );
    report.performance_summary = {
        timings: {
            coldLoadMs: report.timings.coldLoadMs,
            warmLoadMs: report.timings.warmLoadMs,
            warmMinusColdMs:
                Number.isFinite(report.timings.coldLoadMs) && Number.isFinite(report.timings.warmLoadMs)
                    ? report.timings.warmLoadMs - report.timings.coldLoadMs
                    : null,
            stressDurationMs: report.timings.stressDurationMs,
        },
        canvas: {
            cold: coldDiagnostics.canvasMetrics,
            warm: warmDiagnostics.canvasMetrics,
            preStress: preStressHealth.canvasMetrics,
            postStress: postStressHealth.canvasMetrics,
        },
        memory: summarizeMemorySnapshots(report.memorySnapshots),
    };
    report.hydrationMismatchMessages = detectHydrationMismatchMessages(consoleMessages);
    report.hydrationMismatchDetected = report.hydrationMismatchMessages.length > 0;
    report.screenshots.postStress = screenshotPath("post-stress.png");
    await page.screenshot({ path: report.screenshots.postStress, fullPage: true });

    const maxContextLossCount = Math.max(
        coldDiagnostics.runtimeQuality?.contextLossCount ?? 0,
        warmDiagnostics.runtimeQuality?.contextLossCount ?? 0,
        preStressHealth.runtimeQuality?.contextLossCount ?? 0,
        postStressHealth.runtimeQuality?.contextLossCount ?? 0,
    );
    const worstAdaptiveQualityTier = [
        coldDiagnostics.runtimeQuality?.lowestAdaptiveQualityTier,
        warmDiagnostics.runtimeQuality?.lowestAdaptiveQualityTier,
        preStressHealth.runtimeQuality?.lowestAdaptiveQualityTier,
        postStressHealth.runtimeQuality?.lowestAdaptiveQualityTier,
    ].reduce((current, candidate) => {
        if (candidate === "safe") {
            return "safe";
        }
        if (candidate === "balanced" && current === "full") {
            return "balanced";
        }
        return current;
    }, "full");
    const stagedDeliveryObserved = [
        coldDiagnostics.runtimeQuality?.stagedDeliveryObserved,
        warmDiagnostics.runtimeQuality?.stagedDeliveryObserved,
        preStressHealth.runtimeQuality?.stagedDeliveryObserved,
        postStressHealth.runtimeQuality?.stagedDeliveryObserved,
    ].some(Boolean);
    const upgradePendingAfterStress = [
        coldDiagnostics.runtimeQuality?.upgradePending,
        warmDiagnostics.runtimeQuality?.upgradePending,
        preStressHealth.runtimeQuality?.upgradePending,
        postStressHealth.runtimeQuality?.upgradePending,
    ].some(Boolean);
    const overallQualityOutcome = report.quality_judgement?.overall?.outcome ?? "failed";
    report.pass =
        coldDiagnostics.hasCanvas &&
        warmDiagnostics.hasCanvas &&
        coldDiagnostics.operationalMode === "webgl_live" &&
        warmDiagnostics.operationalMode === "webgl_live" &&
        !preStressHealth.fallbackVisible &&
        !postStressHealth.fallbackVisible &&
        preStressHealth.operationalMode === "webgl_live" &&
        postStressHealth.operationalMode === "webgl_live" &&
        maxContextLossCount === 0 &&
        pageErrors.length === 0 &&
        requestFailures.length === 0 &&
        failingResponses.length === 0 &&
        !report.hydrationMismatchDetected;
    if (maxContextLossCount > 0) {
        report.warnings.push(`Viewer lost WebGL context ${maxContextLossCount} time(s) during the benchmark run.`);
        report.failures.push("The 5M benchmark observed WebGL context loss, so live renderer certification is not valid.");
        report.failure_classification = "context_lost";
    }
    if (worstAdaptiveQualityTier === "safe") {
        report.warnings.push("Adaptive safe live mode engaged under stress to protect browser stability.");
    } else if (worstAdaptiveQualityTier === "balanced") {
        report.warnings.push("Adaptive balanced live mode engaged under stress to keep the renderer responsive.");
    }
    if (coldDiagnostics.runtimeQuality?.deliveryManifestFirst || warmDiagnostics.runtimeQuality?.deliveryManifestFirst) {
        report.warnings.push("Manifest-first delivery was active for this benchmark scene.");
    }
    if (stagedDeliveryObserved) {
        report.warnings.push("The viewer selected a safer first-light variant before attempting or considering premium refinement.");
    }
    if (upgradePendingAfterStress) {
        report.warnings.push("The staged delivery upgrade was still in progress at the end of stress orbit.");
    }
    if (overallQualityOutcome === "premium") {
        report.warnings.push("The benchmark achieved a premium live rendering lane with no guardrail downgrade signals.");
    } else if (overallQualityOutcome === "stable") {
        report.warnings.push("The benchmark held a stable live lane, but premium quality headroom was not proven.");
    } else if (overallQualityOutcome === "guarded") {
        report.warnings.push("The benchmark stayed live, but guardrails or reduced quality signals were active.");
    }
    if ((report.presentation_judgement?.beauty?.outcome ?? "") === "beautiful") {
        report.warnings.push("Canvas sampling and stillness checks suggest a genuinely premium-looking presentation.");
    } else if ((report.presentation_judgement?.beauty?.outcome ?? "") === "flat") {
        report.warnings.push("The viewer stayed stable, but the sampled canvas looked visually flat rather than premium.");
    } else if ((report.presentation_judgement?.beauty?.outcome ?? "") === "suspect") {
        report.warnings.push("The sampled canvas looked visually suspect, so the scene is live but not aesthetically trustworthy.");
    }
    if (stillnessProbe?.available && !stillnessProbe.isStill) {
        report.warnings.push(`Idle stillness probe detected ongoing motion or settling (delta ${stillnessProbe.combinedDelta.toFixed(3)}).`);
    }
    if ((postStressHealth.runtimeQuality?.frameP95Ms ?? 0) > 50) {
        report.warnings.push(
            `Approximate frame pacing degraded beyond premium comfort by the end of the cumulative live session (p95 ${postStressHealth.runtimeQuality?.frameP95Ms}ms).`,
        );
    }
    if ((postStressHealth.runtimeQuality?.frameOver50MsRatio ?? 0) > 0.05) {
        report.warnings.push("More than 5% of sampled frames exceeded 50ms across the cumulative live session.");
    }
    if ((postStressHealth.runtimeQuality?.firstStableFrameAtMs ?? 0) > 4000) {
        report.warnings.push(
            `The benchmark took longer than 4s to reach its first stable canvas frame (${postStressHealth.runtimeQuality?.firstStableFrameAtMs}ms).`,
        );
    }
    if ((report.visual_verdict?.outcome ?? "") === "visually_suspect") {
        report.warnings.push("Canvas or reveal diagnostics suggest the visual presentation was live but not visually trustworthy enough for a premium claim.");
    }
    if (failingResponses.length > 0) {
        report.failures.push("The 5M benchmark observed HTTP error responses while the viewer was running.");
        report.failure_classification = report.failure_classification ?? "http_error";
    }
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
                quality_mode: report.diagnostics.failureSnapshot.runtimeQuality?.qualityMode ?? null,
                quality_tier: report.diagnostics.failureSnapshot.runtimeQuality?.qualityTier ?? null,
                adaptive_quality_tier: report.diagnostics.failureSnapshot.runtimeQuality?.adaptiveQualityTier ?? null,
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
