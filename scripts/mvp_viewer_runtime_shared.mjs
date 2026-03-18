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
        const canvas = viewerSurface?.querySelector("canvas") ?? null;
        const statusRoot = viewerSurface?.previousElementSibling ?? null;
        const webglProbe = document.createElement("canvas");
        const webgl2Context = webglProbe.getContext("webgl2");
        const webglContext = webgl2Context ?? webglProbe.getContext("webgl") ?? webglProbe.getContext("experimental-webgl");
        const runtimeBadge = document.querySelector('[data-testid="mvp-viewer-runtime-badge"]');

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
            runtimeBadgeText: runtimeBadge?.textContent?.replace(/\s+/g, " ").trim() ?? null,
            statusSnippet: statusRoot?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) ?? null,
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
          }
        : null;

    return {
        ...diagnostics,
        surfaceDiagnostics: normalizedSurfaceDiagnostics,
        runtimeDiagnostics: normalizedRuntimeDiagnostics,
        classification: classifyViewerDiagnostics({
            ...diagnostics,
            surfaceDiagnostics: normalizedSurfaceDiagnostics,
            runtimeDiagnostics: normalizedRuntimeDiagnostics,
        }),
    };
}
