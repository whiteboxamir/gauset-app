function normalizeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        if (value === "true") {
            return true;
        }
        if (value === "false") {
            return false;
        }
    }
    return fallback;
}

function normalizeString(value, fallback = null) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeNumber(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
}

export function detectHydrationMismatchMessages(consoleMessages) {
    return consoleMessages.filter((message) =>
        /hydration-mismatch|server rendered html didn'?t match|hydrated but some attributes/i.test(message.text),
    );
}

export function classifyViewerDiagnostics(diagnostics) {
    const hostCapabilityLane =
        diagnostics.runtimeDiagnostics?.hostCapabilityLane ??
        (diagnostics.webgl2ContextAvailable ? "webgl2_capable" : diagnostics.webglContextAvailable ? "webgl_capable" : "no_webgl");
    const surfaceMode =
        diagnostics.surfaceDiagnostics?.surfaceMode ??
        (diagnostics.hasStaticReferenceViewer
            ? "static_reference"
            : diagnostics.hasEmptyState
              ? "empty"
              : diagnostics.hasViewerSurface
                ? "interactive_requested"
                : "missing");

    let operationalMode = diagnostics.runtimeDiagnostics?.operationalMode ?? null;
    if (!operationalMode) {
        if (diagnostics.hasCanvas) {
            operationalMode = "webgl_live";
        } else if (diagnostics.hasInteractiveFallbackSurface) {
            operationalMode = "interactive_fallback";
        } else if (diagnostics.hasProjectionSurface) {
            operationalMode = "projection_only";
        } else if (diagnostics.hasFallbackCard) {
            operationalMode = "hard_fallback";
        } else if (surfaceMode === "static_reference") {
            operationalMode = "static_reference";
        } else if (surfaceMode === "empty") {
            operationalMode = "blank_idle";
        } else if (diagnostics.hasLoadingLabel) {
            operationalMode = "booting";
        } else {
            operationalMode = "unknown";
        }
    }

    const coverage =
        diagnostics.runtimeDiagnostics?.coverage ??
        (operationalMode === "webgl_live"
            ? "interactive_ready"
            : operationalMode === "interactive_projection" || operationalMode === "interactive_fallback"
              ? "image_interactive"
              : operationalMode === "projection_only" || operationalMode === "static_reference"
                ? "image_only"
                : surfaceMode === "empty"
                  ? "shell_only"
                  : "fallback_only");

    return {
        hostCapabilityLane,
        surfaceMode,
        operationalMode,
        coverage,
        viewerLane: operationalMode === "webgl_live" && hostCapabilityLane === "webgl2_capable" ? "webgl2_capable" : "fallback_only",
        runtimeDiagnostics: diagnostics.runtimeDiagnostics,
        surfaceDiagnostics: diagnostics.surfaceDiagnostics,
    };
}

export function resolveViewerProof(diagnostics) {
    const classification = diagnostics.classification ?? classifyViewerDiagnostics(diagnostics);
    const runtimeDiagnostics = diagnostics.runtimeDiagnostics ?? classification.runtimeDiagnostics ?? null;
    const surfaceDiagnostics = diagnostics.surfaceDiagnostics ?? classification.surfaceDiagnostics ?? null;
    const hasRenderableEnvironment = Boolean(
        runtimeDiagnostics?.hasRenderableEnvironment ?? surfaceDiagnostics?.hasRenderableEnvironment ?? false,
    );
    const loadedSceneRequested = classification.surfaceMode === "interactive_requested";
    const interactiveSurfaceActive = Boolean(
        diagnostics.hasCanvas || diagnostics.hasInteractiveFallbackSurface || diagnostics.hasProjectionSurface,
    );

    let proofScope = "shell_only";
    if (classification.surfaceMode === "static_reference") {
        proofScope = "static_reference_only";
    } else if (!loadedSceneRequested) {
        proofScope = classification.surfaceMode === "empty" ? "shell_only" : "fallback_only";
    } else if (classification.operationalMode === "webgl_live" && diagnostics.hasCanvas && hasRenderableEnvironment) {
        proofScope = "interactive_webgl_live";
    } else if (
        classification.operationalMode === "interactive_fallback" &&
        diagnostics.hasInteractiveFallbackSurface &&
        hasRenderableEnvironment
    ) {
        proofScope = "interactive_fallback";
    } else if (classification.operationalMode === "interactive_projection" && diagnostics.hasProjectionSurface) {
        proofScope = hasRenderableEnvironment ? "interactive_projection" : "projection_only";
    } else if (classification.operationalMode === "projection_only" && diagnostics.hasProjectionSurface) {
        proofScope = "projection_only";
    } else {
        proofScope = "interactive_unproven";
    }

    return {
        classification,
        hasRenderableEnvironment,
        loadedSceneRequested,
        interactiveSurfaceActive,
        proofScope,
        loadedSceneCertified: proofScope === "interactive_webgl_live" || proofScope === "interactive_fallback",
        premiumLiveClaimable: proofScope === "interactive_webgl_live" && classification.viewerLane === "webgl2_capable",
    };
}

export async function collectViewerDiagnostics(page) {
    const diagnostics = await page.evaluate(() => {
        function attr(element, name) {
            return element?.getAttribute(name) ?? null;
        }

        const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
        const surfaceDiagnostics = document.querySelector('[data-testid="mvp-viewer-surface-diagnostics"]');
        const runtimeDiagnostics = document.querySelector('[data-testid="mvp-viewer-runtime-diagnostics"]');
        const deliveryStatus = document.querySelector('[data-testid="mvp-sharp-gaussian-delivery-status"]');
        const canvas = viewerSurface?.querySelector("canvas") ?? null;
        const statusRoot = viewerSurface?.previousElementSibling ?? null;
        const webglProbe = document.createElement("canvas");
        const webgl2Context = webglProbe.getContext("webgl2");
        const webglContext = webgl2Context ?? webglProbe.getContext("webgl") ?? webglProbe.getContext("experimental-webgl");
        const runtimeBadge = document.querySelector('[data-testid="mvp-viewer-runtime-badge"]');
        const viewerRect = viewerSurface?.getBoundingClientRect() ?? null;
        const canvasRect = canvas?.getBoundingClientRect() ?? null;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const viewerCssArea = viewerRect ? viewerRect.width * viewerRect.height : null;
        const canvasCssArea = canvasRect ? canvasRect.width * canvasRect.height : null;
        const canvasIntrinsicArea = canvas ? canvas.width * canvas.height : null;
        const canvasResolutionScaleX = canvasRect && canvasRect.width > 0 ? canvas.width / canvasRect.width : null;
        const canvasResolutionScaleY = canvasRect && canvasRect.height > 0 ? canvas.height / canvasRect.height : null;
        const canvasEffectiveDpr =
            canvasResolutionScaleX !== null && canvasResolutionScaleY !== null
                ? (canvasResolutionScaleX + canvasResolutionScaleY) / 2 / devicePixelRatio
                : null;
        const canvasFillRatio = viewerCssArea && canvasCssArea ? canvasCssArea / viewerCssArea : null;
        const canvasAspectRatio =
            canvasRect && canvasRect.height > 0 ? canvasRect.width / canvasRect.height : null;
        const viewerAspectRatio =
            viewerRect && viewerRect.height > 0 ? viewerRect.width / viewerRect.height : null;
        const canvasAspectRatioDelta =
            canvasAspectRatio !== null && viewerAspectRatio !== null ? Math.abs(canvasAspectRatio - viewerAspectRatio) : null;

        return {
            hasViewerSurface: Boolean(viewerSurface),
            hasCanvas: Boolean(canvas),
            hasEmptyState: Boolean(document.querySelector('[data-testid="mvp-empty-viewer-state"]')),
            hasFallbackCard: Boolean(document.querySelector('[data-testid="mvp-three-overlay-fallback"]')),
            hasReferenceCard: Boolean(document.querySelector('[data-testid="mvp-reference-card"]')),
            hasStaticReferenceViewer: Boolean(document.querySelector('[data-testid="mvp-static-reference-viewer"]')),
            hasInteractiveFallbackSurface: Boolean(document.querySelector('[data-testid="mvp-interactive-fallback-surface"]')),
            hasInteractiveFallbackCanvas: Boolean(document.querySelector('[data-testid="mvp-interactive-fallback-canvas"]')),
            hasProjectionSurface: Boolean(document.querySelector('[data-testid="mvp-single-image-preview-surface"]')),
            hasLoadingLabel: Boolean(document.querySelector('[data-testid="mvp-viewer-loading-label"]')),
            webgl2ContextAvailable: Boolean(webgl2Context),
            webglContextAvailable: Boolean(webglContext),
            viewerBackground: viewerSurface
                ? window.getComputedStyle(viewerSurface).backgroundImage || window.getComputedStyle(viewerSurface).backgroundColor
                : null,
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
            canvasMetrics:
                canvas && canvasRect
                    ? {
                          devicePixelRatio,
                          viewerCssWidth: viewerRect?.width ?? null,
                          viewerCssHeight: viewerRect?.height ?? null,
                          viewerCssArea,
                          canvasCssWidth: canvasRect.width,
                          canvasCssHeight: canvasRect.height,
                          canvasCssArea,
                          canvasIntrinsicWidth: canvas.width,
                          canvasIntrinsicHeight: canvas.height,
                          canvasIntrinsicArea,
                          canvasResolutionScaleX,
                          canvasResolutionScaleY,
                          canvasEffectiveDpr,
                          canvasFillRatio,
                          canvasAspectRatio,
                          viewerAspectRatio,
                          canvasAspectRatioDelta,
                      }
                    : null,
            runtimeBadgeText: runtimeBadge?.textContent?.replace(/\s+/g, " ").trim() ?? null,
            statusSnippet: statusRoot?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) ?? null,
            deliveryStatusText: deliveryStatus?.textContent?.replace(/\s+/g, " ").trim() ?? null,
            surfaceDiagnostics: surfaceDiagnostics
                ? {
                      surfaceMode: attr(surfaceDiagnostics, "data-surface-mode"),
                      coverage: attr(surfaceDiagnostics, "data-coverage"),
                      viewerReady: attr(surfaceDiagnostics, "data-viewer-ready"),
                      hasRenderableEnvironment: attr(surfaceDiagnostics, "data-has-renderable-environment"),
                      hasReferenceImage: attr(surfaceDiagnostics, "data-has-reference-image"),
                      isReferenceOnlyDemo: attr(surfaceDiagnostics, "data-is-reference-only-demo"),
                      isLegacyDemoWorld: attr(surfaceDiagnostics, "data-is-legacy-demo-world"),
                  }
                : null,
            runtimeDiagnostics: runtimeDiagnostics
                ? {
                      hostCapabilityLane: attr(runtimeDiagnostics, "data-host-capability-lane"),
                      operationalMode: attr(runtimeDiagnostics, "data-operational-mode"),
                      operationalLane: attr(runtimeDiagnostics, "data-operational-lane"),
                      coverage: attr(runtimeDiagnostics, "data-coverage"),
                      renderSourceMode: attr(runtimeDiagnostics, "data-render-source-mode"),
                      renderMode: attr(runtimeDiagnostics, "data-render-mode"),
                      fallbackReason: attr(runtimeDiagnostics, "data-fallback-reason"),
                      fallbackMessage: attr(runtimeDiagnostics, "data-fallback-message"),
                      hasRenderableEnvironment: attr(runtimeDiagnostics, "data-has-renderable-environment"),
                      isSingleImagePreview: attr(runtimeDiagnostics, "data-is-single-image-preview"),
                      previewProjectionAvailable: attr(runtimeDiagnostics, "data-preview-projection-available"),
                      referenceImageAvailable: attr(runtimeDiagnostics, "data-reference-image-available"),
                      viewerReady: attr(runtimeDiagnostics, "data-viewer-ready"),
                      maxTextureSize: attr(runtimeDiagnostics, "data-max-texture-size"),
                      label: attr(runtimeDiagnostics, "data-label"),
                      detail: attr(runtimeDiagnostics, "data-detail"),
                      qualityMode: attr(runtimeDiagnostics, "data-quality-mode"),
                      qualityTier: attr(runtimeDiagnostics, "data-quality-tier"),
                      qualityLabel: attr(runtimeDiagnostics, "data-quality-label"),
                      qualitySummary: attr(runtimeDiagnostics, "data-quality-summary"),
                      qualityPremiumEffectsEnabled: attr(runtimeDiagnostics, "data-quality-premium-effects-enabled"),
                      qualityCautiousMode: attr(runtimeDiagnostics, "data-quality-cautious-mode"),
                      effectivePointBudget: attr(runtimeDiagnostics, "data-effective-point-budget"),
                      prefersPerformanceMode: attr(runtimeDiagnostics, "data-prefers-performance-mode"),
                      adaptiveQualityTier: attr(runtimeDiagnostics, "data-adaptive-quality-tier"),
                      lowestAdaptiveQualityTier: attr(runtimeDiagnostics, "data-lowest-adaptive-quality-tier"),
                      contextLossCount: attr(runtimeDiagnostics, "data-context-loss-count"),
                      deliveryManifestUrl: attr(runtimeDiagnostics, "data-delivery-manifest-url"),
                      deliveryManifestFirst: attr(runtimeDiagnostics, "data-delivery-manifest-first"),
                      deliveryHasProgressiveVariants: attr(runtimeDiagnostics, "data-delivery-has-progressive-variants"),
                      deliveryHasCompressedVariants: attr(runtimeDiagnostics, "data-delivery-has-compressed-variants"),
                      deliveryHasPageStreaming: attr(runtimeDiagnostics, "data-delivery-has-page-streaming"),
                      deliveryStagedObserved: attr(runtimeDiagnostics, "data-delivery-staged-observed"),
                      deliveryStreamingObserved: attr(runtimeDiagnostics, "data-delivery-streaming-observed"),
                      deliveryUpgradePending: attr(runtimeDiagnostics, "data-delivery-upgrade-pending"),
                      deliveryActiveVariantLabel: attr(runtimeDiagnostics, "data-delivery-active-variant-label"),
                      deliveryUpgradeVariantLabel: attr(runtimeDiagnostics, "data-delivery-upgrade-variant-label"),
                      deliveryResidentLayerCount: attr(runtimeDiagnostics, "data-delivery-resident-layer-count"),
                      deliveryResidentPointCount: attr(runtimeDiagnostics, "data-delivery-resident-point-count"),
                      deliveryRefinePagesLoaded: attr(runtimeDiagnostics, "data-delivery-refine-pages-loaded"),
                      deliveryRefinePagesPending: attr(runtimeDiagnostics, "data-delivery-refine-pages-pending"),
                      deliveryProgressFraction: attr(runtimeDiagnostics, "data-delivery-progress-fraction"),
                      deliveryEvictions: attr(runtimeDiagnostics, "data-delivery-evictions"),
                      canvasCreatedAtMs: attr(runtimeDiagnostics, "data-canvas-created-at-ms"),
                      viewerReadyAtMs: attr(runtimeDiagnostics, "data-viewer-ready-at-ms"),
                      firstContextLossAtMs: attr(runtimeDiagnostics, "data-first-context-loss-at-ms"),
                      frameCount: attr(runtimeDiagnostics, "data-frame-count"),
                      frameAvgMs: attr(runtimeDiagnostics, "data-frame-avg-ms"),
                      frameP95Ms: attr(runtimeDiagnostics, "data-frame-p95-ms"),
                      frameWorstMs: attr(runtimeDiagnostics, "data-frame-worst-ms"),
                      frameOver33MsRatio: attr(runtimeDiagnostics, "data-frame-over-33ms-ratio"),
                      frameOver50MsRatio: attr(runtimeDiagnostics, "data-frame-over-50ms-ratio"),
                      adaptiveTransitionCount: attr(runtimeDiagnostics, "data-adaptive-transition-count"),
                      adaptiveFullMs: attr(runtimeDiagnostics, "data-adaptive-full-ms"),
                      adaptiveBalancedMs: attr(runtimeDiagnostics, "data-adaptive-balanced-ms"),
                      adaptiveSafeMs: attr(runtimeDiagnostics, "data-adaptive-safe-ms"),
                      adaptiveSafeEntries: attr(runtimeDiagnostics, "data-adaptive-safe-entries"),
                      firstFrameAtMs: attr(runtimeDiagnostics, "data-first-frame-at-ms"),
                      firstStableFrameAtMs: attr(runtimeDiagnostics, "data-first-stable-frame-at-ms"),
                      posterCurtainStage: attr(runtimeDiagnostics, "data-poster-curtain-stage"),
                      posterCurtainVisible: attr(runtimeDiagnostics, "data-poster-curtain-visible"),
                      renderMegapixels: attr(runtimeDiagnostics, "data-render-megapixels"),
                  }
                : null,
            deliveryDiagnostics: deliveryStatus
                ? {
                      stagedDelivery: attr(deliveryStatus, "data-staged-delivery"),
                      upgradePending: attr(deliveryStatus, "data-upgrade-pending"),
                      activeVariantLabel: attr(deliveryStatus, "data-active-variant-label"),
                      upgradeVariantLabel: attr(deliveryStatus, "data-upgrade-variant-label"),
                  }
                : null,
        };
    });

    const normalizedSurfaceDiagnostics = diagnostics.surfaceDiagnostics
        ? {
              surfaceMode: normalizeString(diagnostics.surfaceDiagnostics.surfaceMode),
              coverage: normalizeString(diagnostics.surfaceDiagnostics.coverage),
              viewerReady: normalizeBoolean(diagnostics.surfaceDiagnostics.viewerReady),
              hasRenderableEnvironment: normalizeBoolean(diagnostics.surfaceDiagnostics.hasRenderableEnvironment),
              hasReferenceImage: normalizeBoolean(diagnostics.surfaceDiagnostics.hasReferenceImage),
              isReferenceOnlyDemo: normalizeBoolean(diagnostics.surfaceDiagnostics.isReferenceOnlyDemo),
              isLegacyDemoWorld: normalizeBoolean(diagnostics.surfaceDiagnostics.isLegacyDemoWorld),
          }
        : null;
    const normalizedRuntimeDiagnostics = diagnostics.runtimeDiagnostics
        ? {
              hostCapabilityLane: normalizeString(diagnostics.runtimeDiagnostics.hostCapabilityLane),
              operationalMode: normalizeString(diagnostics.runtimeDiagnostics.operationalMode),
              operationalLane: normalizeString(diagnostics.runtimeDiagnostics.operationalLane),
              coverage: normalizeString(diagnostics.runtimeDiagnostics.coverage),
              renderSourceMode: normalizeString(diagnostics.runtimeDiagnostics.renderSourceMode),
              renderMode: normalizeString(diagnostics.runtimeDiagnostics.renderMode),
              fallbackReason: normalizeString(diagnostics.runtimeDiagnostics.fallbackReason),
              fallbackMessage: normalizeString(diagnostics.runtimeDiagnostics.fallbackMessage, ""),
              hasRenderableEnvironment: normalizeBoolean(diagnostics.runtimeDiagnostics.hasRenderableEnvironment),
              isSingleImagePreview: normalizeBoolean(diagnostics.runtimeDiagnostics.isSingleImagePreview),
              previewProjectionAvailable: normalizeBoolean(diagnostics.runtimeDiagnostics.previewProjectionAvailable),
              referenceImageAvailable: normalizeBoolean(diagnostics.runtimeDiagnostics.referenceImageAvailable),
              viewerReady: normalizeBoolean(diagnostics.runtimeDiagnostics.viewerReady),
              maxTextureSize: normalizeNumber(diagnostics.runtimeDiagnostics.maxTextureSize),
              label: normalizeString(diagnostics.runtimeDiagnostics.label),
              detail: normalizeString(diagnostics.runtimeDiagnostics.detail, ""),
              qualityMode: normalizeString(diagnostics.runtimeDiagnostics.qualityMode),
              qualityTier: normalizeString(diagnostics.runtimeDiagnostics.qualityTier),
              qualityLabel: normalizeString(diagnostics.runtimeDiagnostics.qualityLabel),
              qualitySummary: normalizeString(diagnostics.runtimeDiagnostics.qualitySummary, ""),
              qualityPremiumEffectsEnabled: normalizeBoolean(diagnostics.runtimeDiagnostics.qualityPremiumEffectsEnabled),
              qualityCautiousMode: normalizeBoolean(diagnostics.runtimeDiagnostics.qualityCautiousMode),
              effectivePointBudget: normalizeNumber(diagnostics.runtimeDiagnostics.effectivePointBudget),
              prefersPerformanceMode: normalizeBoolean(diagnostics.runtimeDiagnostics.prefersPerformanceMode),
              adaptiveQualityTier: normalizeString(diagnostics.runtimeDiagnostics.adaptiveQualityTier),
              lowestAdaptiveQualityTier: normalizeString(diagnostics.runtimeDiagnostics.lowestAdaptiveQualityTier),
              contextLossCount: normalizeNumber(diagnostics.runtimeDiagnostics.contextLossCount),
              deliveryManifestUrl: normalizeString(diagnostics.runtimeDiagnostics.deliveryManifestUrl),
              deliveryManifestFirst: normalizeBoolean(diagnostics.runtimeDiagnostics.deliveryManifestFirst),
              deliveryHasProgressiveVariants: normalizeBoolean(diagnostics.runtimeDiagnostics.deliveryHasProgressiveVariants),
              deliveryHasCompressedVariants: normalizeBoolean(diagnostics.runtimeDiagnostics.deliveryHasCompressedVariants),
              deliveryStagedObserved: normalizeBoolean(diagnostics.runtimeDiagnostics.deliveryStagedObserved),
              deliveryUpgradePending: normalizeBoolean(diagnostics.runtimeDiagnostics.deliveryUpgradePending),
              deliveryActiveVariantLabel: normalizeString(diagnostics.runtimeDiagnostics.deliveryActiveVariantLabel),
              deliveryUpgradeVariantLabel: normalizeString(diagnostics.runtimeDiagnostics.deliveryUpgradeVariantLabel),
              canvasCreatedAtMs: normalizeNumber(diagnostics.runtimeDiagnostics.canvasCreatedAtMs),
              viewerReadyAtMs: normalizeNumber(diagnostics.runtimeDiagnostics.viewerReadyAtMs),
              firstContextLossAtMs: normalizeNumber(diagnostics.runtimeDiagnostics.firstContextLossAtMs),
              frameCount: normalizeNumber(diagnostics.runtimeDiagnostics.frameCount),
              frameAvgMs: normalizeNumber(diagnostics.runtimeDiagnostics.frameAvgMs),
              frameP95Ms: normalizeNumber(diagnostics.runtimeDiagnostics.frameP95Ms),
              frameWorstMs: normalizeNumber(diagnostics.runtimeDiagnostics.frameWorstMs),
              frameOver33MsRatio: normalizeNumber(diagnostics.runtimeDiagnostics.frameOver33MsRatio),
              frameOver50MsRatio: normalizeNumber(diagnostics.runtimeDiagnostics.frameOver50MsRatio),
              adaptiveTransitionCount: normalizeNumber(diagnostics.runtimeDiagnostics.adaptiveTransitionCount),
              adaptiveFullMs: normalizeNumber(diagnostics.runtimeDiagnostics.adaptiveFullMs),
              adaptiveBalancedMs: normalizeNumber(diagnostics.runtimeDiagnostics.adaptiveBalancedMs),
              adaptiveSafeMs: normalizeNumber(diagnostics.runtimeDiagnostics.adaptiveSafeMs),
              adaptiveSafeEntries: normalizeNumber(diagnostics.runtimeDiagnostics.adaptiveSafeEntries),
              firstFrameAtMs: normalizeNumber(diagnostics.runtimeDiagnostics.firstFrameAtMs),
              firstStableFrameAtMs: normalizeNumber(diagnostics.runtimeDiagnostics.firstStableFrameAtMs),
              posterCurtainStage: normalizeString(diagnostics.runtimeDiagnostics.posterCurtainStage),
              posterCurtainVisible: normalizeBoolean(diagnostics.runtimeDiagnostics.posterCurtainVisible),
              renderMegapixels: normalizeNumber(diagnostics.runtimeDiagnostics.renderMegapixels),
          }
        : null;
    const normalizedCanvasMetrics = diagnostics.canvasMetrics
        ? {
              devicePixelRatio: normalizeNumber(diagnostics.canvasMetrics.devicePixelRatio),
              viewerCssWidth: normalizeNumber(diagnostics.canvasMetrics.viewerCssWidth),
              viewerCssHeight: normalizeNumber(diagnostics.canvasMetrics.viewerCssHeight),
              viewerCssArea: normalizeNumber(diagnostics.canvasMetrics.viewerCssArea),
              canvasCssWidth: normalizeNumber(diagnostics.canvasMetrics.canvasCssWidth),
              canvasCssHeight: normalizeNumber(diagnostics.canvasMetrics.canvasCssHeight),
              canvasCssArea: normalizeNumber(diagnostics.canvasMetrics.canvasCssArea),
              canvasIntrinsicWidth: normalizeNumber(diagnostics.canvasMetrics.canvasIntrinsicWidth),
              canvasIntrinsicHeight: normalizeNumber(diagnostics.canvasMetrics.canvasIntrinsicHeight),
              canvasIntrinsicArea: normalizeNumber(diagnostics.canvasMetrics.canvasIntrinsicArea),
              canvasResolutionScaleX: normalizeNumber(diagnostics.canvasMetrics.canvasResolutionScaleX),
              canvasResolutionScaleY: normalizeNumber(diagnostics.canvasMetrics.canvasResolutionScaleY),
              canvasEffectiveDpr: normalizeNumber(diagnostics.canvasMetrics.canvasEffectiveDpr),
              canvasFillRatio: normalizeNumber(diagnostics.canvasMetrics.canvasFillRatio),
              canvasAspectRatio: normalizeNumber(diagnostics.canvasMetrics.canvasAspectRatio),
              viewerAspectRatio: normalizeNumber(diagnostics.canvasMetrics.viewerAspectRatio),
              canvasAspectRatioDelta: normalizeNumber(diagnostics.canvasMetrics.canvasAspectRatioDelta),
          }
        : null;
    const normalizedDeliveryDiagnostics = diagnostics.deliveryDiagnostics
        ? {
              stagedDelivery: normalizeBoolean(diagnostics.deliveryDiagnostics.stagedDelivery),
              upgradePending: normalizeBoolean(diagnostics.deliveryDiagnostics.upgradePending),
              activeVariantLabel: normalizeString(diagnostics.deliveryDiagnostics.activeVariantLabel),
              upgradeVariantLabel: normalizeString(diagnostics.deliveryDiagnostics.upgradeVariantLabel),
          }
        : null;

    return {
        ...diagnostics,
        surfaceDiagnostics: normalizedSurfaceDiagnostics,
        runtimeDiagnostics: normalizedRuntimeDiagnostics,
        canvasMetrics: normalizedCanvasMetrics,
        deliveryDiagnostics: normalizedDeliveryDiagnostics,
        classification: classifyViewerDiagnostics({
            ...diagnostics,
            surfaceDiagnostics: normalizedSurfaceDiagnostics,
            runtimeDiagnostics: normalizedRuntimeDiagnostics,
        }),
    };
}

export async function collectCanvasVisualSample(page) {
    return page.evaluate(() => {
        const viewerSurface = document.querySelector('[data-testid="mvp-viewer-surface"]');
        const canvas = viewerSurface?.querySelector("canvas") ?? null;
        if (!canvas || !("width" in canvas) || !("height" in canvas) || canvas.width <= 0 || canvas.height <= 0) {
            return {
                available: false,
                reason: "missing_canvas",
            };
        }

        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
        if (!gl || typeof gl.readPixels !== "function") {
            return {
                available: false,
                reason: "missing_webgl_context",
            };
        }

        const width = canvas.width;
        const height = canvas.height;
        const samplePositions = [
            [0.5, 0.5],
            [0.25, 0.25],
            [0.75, 0.25],
            [0.25, 0.75],
            [0.75, 0.75],
        ];
        const pixel = new Uint8Array(4);
        const samples = [];
        let fingerprint = 2166136261;
        let lumaSum = 0;
        let alphaSum = 0;
        let spreadSum = 0;
        let minLuma = 255;
        let maxLuma = 0;
        let opaqueCount = 0;
        let sampleSource = "webgl_read_pixels";
        let sampleReader = null;

        try {
            const compositedCanvas = document.createElement("canvas");
            compositedCanvas.width = width;
            compositedCanvas.height = height;
            const compositedContext = compositedCanvas.getContext("2d", { willReadFrequently: true });
            if (compositedContext) {
                compositedContext.drawImage(canvas, 0, 0, width, height);
                sampleSource = "canvas_draw_image";
                sampleReader = (x, y) => compositedContext.getImageData(x, y, 1, 1).data;
            }
        } catch {
            sampleReader = null;
        }

        if (!sampleReader) {
            if (typeof gl.finish === "function") {
                gl.finish();
            }
            sampleReader = (x, y) => {
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                return pixel;
            };
        }

        for (const [nx, ny] of samplePositions) {
            const x = Math.max(0, Math.min(width - 1, Math.round((width - 1) * nx)));
            const y = Math.max(0, Math.min(height - 1, Math.round((height - 1) * ny)));

            try {
                const rgba = sampleReader(x, y);
                pixel[0] = rgba[0];
                pixel[1] = rgba[1];
                pixel[2] = rgba[2];
                pixel[3] = rgba[3];
            } catch (error) {
                return {
                    available: false,
                    reason: "read_pixels_failed",
                    message: error instanceof Error ? error.message : String(error),
                };
            }

            const r = pixel[0];
            const g = pixel[1];
            const b = pixel[2];
            const a = pixel[3];
            const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            const spread = Math.max(r, g, b) - Math.min(r, g, b);

            samples.push({
                x,
                y,
                r,
                g,
                b,
                a,
                luma,
                spread,
            });
            lumaSum += luma;
            alphaSum += a;
            spreadSum += spread;
            minLuma = Math.min(minLuma, luma);
            maxLuma = Math.max(maxLuma, luma);
            if (a > 16) {
                opaqueCount += 1;
            }

            fingerprint ^= r;
            fingerprint = Math.imul(fingerprint, 16777619);
            fingerprint ^= g;
            fingerprint = Math.imul(fingerprint, 16777619);
            fingerprint ^= b;
            fingerprint = Math.imul(fingerprint, 16777619);
            fingerprint ^= a;
            fingerprint = Math.imul(fingerprint, 16777619);
        }

        const sampleCount = samples.length || 1;
        const meanLuma = lumaSum / sampleCount;
        const meanAlpha = alphaSum / (sampleCount * 255);
        const meanColorSpread = spreadSum / sampleCount;
        const lumaVariance = samples.reduce((sum, sample) => sum + (sample.luma - meanLuma) ** 2, 0) / sampleCount;
        const lumaStdDev = Math.sqrt(lumaVariance);
        return {
            available: true,
            reason: null,
            sampleSource,
            fingerprint: fingerprint >>> 0,
            sampleCount,
            meanLuma,
            lumaStdDev,
            lumaRange: maxLuma - minLuma,
            meanAlpha,
            opaqueRatio: opaqueCount / sampleCount,
            meanColorSpread,
            samples,
        };
    });
}

export async function probeCanvasStillness(page, idleDelayMs = 120) {
    const first = await collectCanvasVisualSample(page);
    await page.waitForTimeout(idleDelayMs);
    const second = await collectCanvasVisualSample(page);

    if (!first?.available || !second?.available) {
        return {
            available: false,
            reason: first?.reason ?? second?.reason ?? "missing_visual_sample",
            idleDelayMs,
            first,
            second,
        };
    }

    const fingerprintChanged = first.fingerprint !== second.fingerprint;
    const meanLumaDelta = Math.abs(second.meanLuma - first.meanLuma);
    const lumaStdDevDelta = Math.abs(second.lumaStdDev - first.lumaStdDev);
    const meanAlphaDelta = Math.abs(second.meanAlpha - first.meanAlpha);
    const meanColorSpreadDelta = Math.abs(second.meanColorSpread - first.meanColorSpread);
    const opaqueRatioDelta = Math.abs(second.opaqueRatio - first.opaqueRatio);
    const combinedDelta =
        meanLumaDelta / 12 +
        lumaStdDevDelta / 16 +
        meanAlphaDelta / 0.08 +
        meanColorSpreadDelta / 24 +
        opaqueRatioDelta / 0.1 +
        (fingerprintChanged ? 0.5 : 0);
    const isStill = combinedDelta <= 1;

    return {
        available: true,
        reason: null,
        idleDelayMs,
        first,
        second,
        fingerprintChanged,
        meanLumaDelta,
        lumaStdDevDelta,
        meanAlphaDelta,
        meanColorSpreadDelta,
        opaqueRatioDelta,
        combinedDelta,
        isStill,
    };
}
