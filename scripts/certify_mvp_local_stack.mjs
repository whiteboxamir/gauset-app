import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import hostGuard from "./mvp_host_guard.cjs";

const { assertLocalMvpBaseUrl, sanitizeRunLabel } = hostGuard;

const frontendPort = Number(process.env.GAUSET_FRONTEND_PORT || process.env.GAUSET_LOCAL_CERT_FRONTEND_PORT || "3017");
const backendPort = Number(process.env.GAUSET_BACKEND_PORT || process.env.GAUSET_LOCAL_CERT_BACKEND_PORT || "8010");
const frontendHost = process.env.GAUSET_LOCAL_CERT_FRONTEND_HOST || process.env.GAUSET_FRONTEND_HOST || "127.0.0.1";
const webBaseUrl = assertLocalMvpBaseUrl(
    process.env.GAUSET_MVP_BASE_URL ?? `http://${frontendHost}:${frontendPort}`,
    "scripts/certify_mvp_local_stack.mjs web base",
);
const backendBaseUrl = assertLocalMvpBaseUrl(
    process.env.GAUSET_BACKEND_BASE_URL ?? `http://127.0.0.1:${backendPort}`,
    "scripts/certify_mvp_local_stack.mjs backend base",
);
const runLabel =
    sanitizeRunLabel(
        process.env.GAUSET_LOCAL_STACK_CERT_RUN_LABEL ??
            `local-stack-${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}`,
    ) || `local-stack-${Date.now().toString(36)}`;
const artifactDir = path.resolve(process.env.GAUSET_LOCAL_STACK_CERT_ARTIFACT_DIR || `artifacts/mvp-local-stack/${runLabel}`);
const summaryPath = path.join(artifactDir, "certification-summary.json");
const diagnosticPath = path.join(artifactDir, "local-stack-diagnostic.json");
const deploymentPath = path.join(artifactDir, "deployment-fingerprint.json");
const smokePath = path.join(artifactDir, "mvp-smoke.json");
const viewerDiagPath = path.join(artifactDir, "viewer-diag.json");
const viewerScreenshotPath = path.join(artifactDir, "viewer-diag.png");
const viewerShellDiagPath = path.join(artifactDir, "viewer-shell-diag.json");
const viewerShellScreenshotPath = viewerScreenshotPath;
const viewerLiveArtifactDir = path.join(artifactDir, "viewer-live");
const viewerLiveReportPath = path.join(viewerLiveArtifactDir, "viewer-certification.json");
const hostileAuditPath = path.join(artifactDir, "hostile-local-reconstruction.json");
const devLogPath = path.join(artifactDir, "dev-stack.log");
const startupTimeoutMs = Math.max(15_000, Number(process.env.GAUSET_LOCAL_STACK_CERT_STARTUP_TIMEOUT_MS || "120000"));
const pollIntervalMs = Math.max(500, Number(process.env.GAUSET_LOCAL_STACK_CERT_POLL_INTERVAL_MS || "2500"));
const skipViewer = process.env.GAUSET_LOCAL_STACK_CERT_SKIP_VIEWER === "1";

await fs.mkdir(artifactDir, { recursive: true });

const summary = {
    runLabel,
    executedAt: new Date().toISOString(),
    completedAt: null,
    webBaseUrl,
    backendBaseUrl,
    frontendPort,
    backendPort,
    artifactDir,
    env: {
        providerImageGenerationEnabled: true,
        mockProviderEnabled: true,
        skipViewer,
    },
    steps: [],
    reports: {
        diagnostic: null,
        deployment: null,
        smoke: null,
        viewer: null,
        viewerShell: null,
        viewerLoaded: null,
        viewerTruth: null,
        hostileAudit: null,
    },
    warnings: [],
    blockers: [],
    status: "running",
};

async function writeSummary() {
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function appendLog(prefix, chunk) {
    const text = chunk.toString();
    return fs.appendFile(devLogPath, `${prefix}${text.endsWith("\n") ? text : `${text}\n`}`);
}

function runStep(name, command, extraEnv = {}, options = {}) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command[0], command.slice(1), {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
            ...process.env,
            GAUSET_FRONTEND_PORT: String(frontendPort),
            GAUSET_BACKEND_PORT: String(backendPort),
            GAUSET_MVP_BASE_URL: webBaseUrl,
            GAUSET_BACKEND_BASE_URL: backendBaseUrl,
            GAUSET_ENABLE_PROVIDER_IMAGE_GEN: "1",
            GAUSET_PROVIDER_MOCK: "1",
            ...extraEnv,
        },
        stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    const step = {
        name,
        command: command.join(" "),
        startedAt,
        completedAt: new Date().toISOString(),
        status: result.status === 0 ? "passed" : "failed",
        exitCode: result.status,
        signal: result.signal || null,
        stdout: options.capture ? result.stdout : undefined,
        stderr: options.capture ? result.stderr : undefined,
    };
    summary.steps.push(step);
    return step;
}

async function fetchJsonStep(name, url, outputPath) {
    const startedAt = new Date().toISOString();
    const response = await fetch(url, { cache: "no-store" });
    const raw = await response.text();
    let payload = null;
    try {
        payload = raw ? JSON.parse(raw) : null;
    } catch {
        payload = raw;
    }

    const step = {
        name,
        command: `GET ${url}`,
        startedAt,
        completedAt: new Date().toISOString(),
        status: response.ok ? "passed" : "failed",
        exitCode: response.ok ? 0 : response.status,
        signal: null,
    };
    summary.steps.push(step);

    if (outputPath) {
        await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }

    return {
        ok: response.ok,
        status: response.status,
        payload,
    };
}

function parseCapturedJson(step) {
    if (!step.stdout || typeof step.stdout !== "string") {
        return null;
    }
    const raw = step.stdout.trim();
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
        if (!match) {
            return null;
        }
        try {
            return JSON.parse(match[1]);
        } catch {
            return null;
        }
    }
}

function buildViewerTruth(shellReport, liveReport) {
    const shellProof = shellReport?.viewerProof ?? null;
    const loadedSceneTruth = liveReport?.viewer_truth ?? null;
    return {
        packet_scope: liveReport ? "shell_and_loaded_scene" : "shell_only",
        shell: shellReport
            ? {
                  viewer_lane: shellReport.viewerLane ?? null,
                  host_capability_lane: shellReport.hostCapabilityLane ?? null,
                  operational_mode: shellReport.operationalMode ?? null,
                  coverage: shellReport.coverage ?? null,
                  proof_scope: shellProof?.proofScope ?? null,
                  hydration_mismatch_detected: Boolean(shellReport.hydrationMismatchDetected),
              }
            : null,
        loaded_scene: loadedSceneTruth
            ? {
                  host_capability_lane: loadedSceneTruth.host_capability_lane ?? liveReport?.host_capability_lane ?? null,
                  certified_viewer_lane: loadedSceneTruth.certified_viewer_lane ?? liveReport?.certified_viewer_lane ?? null,
                  operational_mode: loadedSceneTruth.operational_mode ?? liveReport?.operational_mode ?? null,
                  proof_scope: loadedSceneTruth.proof_scope ?? liveReport?.proof_scope ?? null,
                  loaded_scene_certified: Boolean(
                      loadedSceneTruth.loaded_scene_certified ?? liveReport?.loaded_scene_certified,
                  ),
                  premium_live_lane_claimable: Boolean(
                      loadedSceneTruth.premium_live_lane_claimable ?? liveReport?.premium_live_lane_claimable,
                  ),
                  interactive_fallback_certified: Boolean(
                      loadedSceneTruth.interactive_fallback_certified ?? liveReport?.interactive_fallback_certified,
                  ),
              }
            : null,
        premium_live_lane_claimable: Boolean(
            loadedSceneTruth?.premium_live_lane_claimable ?? liveReport?.premium_live_lane_claimable,
        ),
    };
}

function startDevStack() {
    const child = spawn("npm", ["run", "dev:all"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            GAUSET_FRONTEND_PORT: String(frontendPort),
            GAUSET_BACKEND_PORT: String(backendPort),
            GAUSET_BACKEND_HOST: "127.0.0.1",
            GAUSET_FRONTEND_HOST: frontendHost,
            GAUSET_ENABLE_PROVIDER_IMAGE_GEN: "1",
            GAUSET_PROVIDER_MOCK: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
    });

    child.stdout.on("data", (chunk) => {
        process.stdout.write(`[local-cert] ${chunk}`);
        void appendLog("[stdout] ", chunk);
    });
    child.stderr.on("data", (chunk) => {
        process.stderr.write(`[local-cert] ${chunk}`);
        void appendLog("[stderr] ", chunk);
    });

    return child;
}

function stopProcessTree(child) {
    if (!child?.pid) {
        return;
    }
    try {
        if (process.platform === "win32") {
            child.kill("SIGTERM");
        } else {
            process.kill(-child.pid, "SIGTERM");
        }
    } catch {
        // Process already exited.
    }
}

async function waitForHealthyStack() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < startupTimeoutMs) {
        const diagnosticStep = runStep(
            "diagnose_mvp_local_stack_probe",
            ["npm", "run", "diagnose:mvp-local-stack"],
            {},
            { capture: true },
        );
        const payload = parseCapturedJson(diagnosticStep);
        if (payload && diagnosticStep.status === "passed" && payload.ok) {
            summary.reports.diagnostic = payload;
            await fs.writeFile(diagnosticPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
            return payload;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Timed out waiting for local stack readiness after ${startupTimeoutMs}ms.`);
}

const devStack = startDevStack();
let stopped = false;

async function finalize(exitCode = 0) {
    if (stopped) {
        return;
    }
    stopped = true;
    stopProcessTree(devStack);
    summary.completedAt = new Date().toISOString();
    summary.status = exitCode === 0 && summary.blockers.length === 0 ? "passed" : "failed";
    await writeSummary();
    process.exit(exitCode === 0 && summary.blockers.length === 0 ? 0 : 1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        void finalize(1);
    });
}

try {
    await waitForHealthyStack();

    const deploymentProbe = await fetchJsonStep("deployment_probe", `${webBaseUrl}/api/mvp/deployment`, deploymentPath);
    summary.reports.deployment = deploymentProbe.payload;
    if (!deploymentProbe.ok) {
        summary.blockers.push("Deployment fingerprint probe failed.");
    }

    const smokeStep = runStep(
        "mvp_smoke_full",
        ["backend_venv/bin/python", "scripts/mvp_smoke.py", "--mode", "full", "--web-base-url", webBaseUrl],
        {},
        { capture: true },
    );
    const smokePayload = parseCapturedJson(smokeStep);
    summary.reports.smoke = smokePayload;
    if (smokePayload) {
        await fs.writeFile(smokePath, `${JSON.stringify(smokePayload, null, 2)}\n`, "utf8");
    }
    if (smokeStep.status !== "passed") {
        summary.blockers.push("Full MVP smoke certification failed.");
    }

    if (!skipViewer) {
        const viewerStep = runStep(
            "mvp_viewer_diag_shell",
            ["node", "scripts/mvp_viewer_diag.mjs", `${webBaseUrl}/mvp`, viewerShellScreenshotPath],
            {},
            { capture: true },
        );
        const viewerPayload = parseCapturedJson(viewerStep);
        summary.reports.viewer = viewerPayload;
        summary.reports.viewerShell = viewerPayload;
        if (viewerPayload) {
            await fs.writeFile(viewerShellDiagPath, `${JSON.stringify(viewerPayload, null, 2)}\n`, "utf8");
            await fs.writeFile(viewerDiagPath, `${JSON.stringify(viewerPayload, null, 2)}\n`, "utf8");
        }
        if (viewerStep.status !== "passed") {
            summary.blockers.push("Viewer shell diagnostic failed.");
        }

        await fs.mkdir(viewerLiveArtifactDir, { recursive: true });
        const viewerLocalStep = runStep(
            "mvp_local_viewer_certify",
            ["node", "scripts/mvp_local_viewer_certify.mjs", webBaseUrl],
            {
                GAUSET_LOCAL_VIEWER_ARTIFACT_DIR: viewerLiveArtifactDir,
            },
            { capture: true },
        );
        let viewerLocalPayload = parseCapturedJson(viewerLocalStep);
        if (!viewerLocalPayload) {
            try {
                viewerLocalPayload = JSON.parse(await fs.readFile(viewerLiveReportPath, "utf8"));
            } catch {
                viewerLocalPayload = null;
            }
        }
        summary.reports.viewerLoaded = viewerLocalPayload;
        if (viewerLocalStep.status !== "passed") {
            summary.blockers.push("Loaded-scene viewer certification failed.");
        }

        const viewerTruth = buildViewerTruth(viewerPayload, viewerLocalPayload);
        summary.reports.viewerTruth = viewerTruth;

        if (!viewerLocalPayload?.loaded_scene_certified) {
            summary.blockers.push("Viewer packet did not certify a real loaded scene.");
        }
        if (viewerLocalPayload?.host_capability_lane === "webgl2_capable" && !viewerLocalPayload?.premium_live_lane_claimable) {
            summary.blockers.push("Host exposes WebGL2, but the loaded-scene viewer still did not prove a premium live lane.");
        }
        if (viewerLocalPayload?.host_capability_lane && viewerLocalPayload.host_capability_lane !== "webgl2_capable") {
            summary.warnings.push("This host does not expose WebGL2, so the packet cannot claim a premium live viewer lane from this run.");
        }
        if (viewerPayload?.viewerProof?.proofScope === "shell_only") {
            summary.warnings.push("The shell viewer diagnostic remained shell-only. Only the loaded-scene viewer report can certify renderer behavior.");
        }
    }

    const hostileStep = runStep(
        "hostile_local_reconstruction_audit",
        ["node", "scripts/hostile_local_reconstruction_audit.mjs"],
        {
            GAUSET_HOSTILE_LOCAL_REPORT_PATH: hostileAuditPath,
        },
        { capture: true },
    );
    let hostilePayload = parseCapturedJson(hostileStep);
    if (!hostilePayload) {
        try {
            hostilePayload = JSON.parse(await fs.readFile(hostileAuditPath, "utf8"));
        } catch {
            hostilePayload = null;
        }
    }
    summary.reports.hostileAudit = hostilePayload;
    if (hostileStep.status !== "passed") {
        summary.blockers.push("Hostile local reconstruction audit failed.");
    }

    await finalize(summary.blockers.length === 0 ? 0 : 1);
} catch (error) {
    summary.blockers.push(error instanceof Error ? error.message : String(error));
    await finalize(1);
}
