import hostGuard from "./mvp_host_guard.cjs";

const { assertLocalMvpBaseUrl } = hostGuard;

const webBaseUrl = assertLocalMvpBaseUrl(
    process.env.GAUSET_MVP_BASE_URL ?? "http://localhost:3015",
    "scripts/diagnose_mvp_local_stack.mjs web base",
);
const backendBaseUrl = assertLocalMvpBaseUrl(
    process.env.GAUSET_BACKEND_BASE_URL ?? "http://localhost:8000",
    "scripts/diagnose_mvp_local_stack.mjs backend base",
);
const requestTimeoutMs = Math.max(1000, Number(process.env.GAUSET_LOCAL_STACK_TIMEOUT_MS ?? "20000"));

function readPath(payload, path) {
    return path.split(".").reduce((value, key) => {
        if (value && typeof value === "object" && key in value) {
            return value[key];
        }
        return undefined;
    }, payload);
}

async function fetchText(url, { redirect = "follow", timeoutMs = requestTimeoutMs } = {}) {
    try {
        const response = await fetch(url, {
            cache: "no-store",
            redirect,
            signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();
        return {
            url,
            response,
            body,
            error: null,
        };
    } catch (error) {
        return {
            url,
            response: null,
            body: "",
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function fetchJson(url, options) {
    const { response, body, error } = await fetchText(url, options);
    let payload = null;
    try {
        payload = body ? JSON.parse(body) : null;
    } catch {
        payload = null;
    }
    return {
        url,
        response,
        payload,
        body,
        error,
    };
}

async function main() {
    const failures = [];

    const directHealth = await fetchJson(`${backendBaseUrl}/health`);
    if (!directHealth.response?.ok || directHealth.payload?.status !== "ok") {
        failures.push(`backend /health failed (${directHealth.response?.status ?? "fetch-error"}${directHealth.error ? `: ${directHealth.error}` : ""})`);
    }

    const directSetup = await fetchJson(`${backendBaseUrl}/setup/status`);
    if (!directSetup.response?.ok || directSetup.payload?.status !== "ok") {
        failures.push(`backend /setup/status failed (${directSetup.response?.status ?? "fetch-error"}${directSetup.error ? `: ${directSetup.error}` : ""})`);
    }

    const proxyHealth = await fetchJson(`${webBaseUrl}/api/mvp/health`);
    if (!proxyHealth.response?.ok || proxyHealth.payload?.status !== "ok") {
        failures.push(`proxy /api/mvp/health failed (${proxyHealth.response?.status ?? "fetch-error"}${proxyHealth.error ? `: ${proxyHealth.error}` : ""})`);
    }

    const proxySetup = await fetchJson(`${webBaseUrl}/api/mvp/setup/status`);
    if (!proxySetup.response?.ok || proxySetup.payload?.status !== "ok") {
        failures.push(`proxy /api/mvp/setup/status failed (${proxySetup.response?.status ?? "fetch-error"}${proxySetup.error ? `: ${proxySetup.error}` : ""})`);
    }

    const deployment = await fetchJson(`${webBaseUrl}/api/mvp/deployment`, {
        timeoutMs: Math.max(requestTimeoutMs, 60000),
    });
    if (!deployment.response?.ok || deployment.payload?.status !== "ok") {
        failures.push(`/api/mvp/deployment failed (${deployment.response?.status ?? "fetch-error"}${deployment.error ? `: ${deployment.error}` : ""})`);
    }
    if (!deployment.payload?.fingerprint?.build_label) {
        failures.push("deployment fingerprint missing build_label");
    }

    const workspaceRoute = await fetchText(`${webBaseUrl}/mvp`, { redirect: "manual" });
    const workspaceStatus = workspaceRoute.response?.status ?? null;
    const workspaceLocation = workspaceRoute.response?.headers.get("location") ?? null;
    const workspaceBody = workspaceRoute.body;
    const workspaceTruthful =
        workspaceStatus === 200
            ? workspaceBody.includes('data-testid="mvp-shell-title"') || workspaceBody.includes("Director workspace")
            : [302, 303, 307, 308].includes(workspaceStatus) &&
              (workspaceLocation?.includes("/auth") || workspaceLocation?.includes("/billing"));
    if (!workspaceTruthful) {
        failures.push(`/mvp did not return a truthful local route response (${workspaceStatus ?? "fetch-error"}${workspaceRoute.error ? `: ${workspaceRoute.error}` : ""})`);
    }

    const parityFields = [
        "backend.kind",
        "backend.deployment",
        "backend.lane_truth",
        "lane_truth.preview",
        "lane_truth.reconstruction",
        "lane_truth.asset",
        "capabilities.preview.available",
        "capabilities.reconstruction.available",
        "capabilities.asset.available",
        "provider_generation.enabled",
        "provider_generation.available",
        "provider_generation.image_provider_count",
        "provider_generation.available_image_provider_count",
        "provider_generation.video_provider_count",
    ];

    const parityMismatches = [];
    for (const field of parityFields) {
        const directValue = readPath(directSetup.payload, field);
        const proxyValue = readPath(proxySetup.payload, field);
        if (JSON.stringify(directValue) !== JSON.stringify(proxyValue)) {
            parityMismatches.push({
                field,
                backend: directValue,
                proxy: proxyValue,
            });
        }
    }
    if (parityMismatches.length > 0) {
        failures.push(`proxy setup parity mismatch on ${parityMismatches.length} field(s)`);
    }

    const report = {
        checkedAt: new Date().toISOString(),
        webBaseUrl,
        backendBaseUrl,
        requestTimeoutMs,
        directHealth: {
            status: directHealth.response?.status ?? null,
            payload: directHealth.payload,
            error: directHealth.error,
        },
        directSetup: {
            status: directSetup.response?.status ?? null,
            backend: directSetup.payload?.backend ?? null,
            lane_truth: directSetup.payload?.lane_truth ?? null,
            capabilities: directSetup.payload?.capabilities ?? null,
            provider_generation: directSetup.payload?.provider_generation ?? null,
            error: directSetup.error,
        },
        proxyHealth: {
            status: proxyHealth.response?.status ?? null,
            payload: proxyHealth.payload,
            error: proxyHealth.error,
        },
        proxySetup: {
            status: proxySetup.response?.status ?? null,
            backend: proxySetup.payload?.backend ?? null,
            lane_truth: proxySetup.payload?.lane_truth ?? null,
            capabilities: proxySetup.payload?.capabilities ?? null,
            provider_generation: proxySetup.payload?.provider_generation ?? null,
            error: proxySetup.error,
        },
        deployment: {
            status: deployment.response?.status ?? null,
            payload: deployment.payload,
            error: deployment.error,
        },
        workspaceRoute: {
            status: workspaceStatus,
            location: workspaceLocation,
            truthful: workspaceTruthful,
            error: workspaceRoute.error,
        },
        parityMismatches,
        failures,
        ok: failures.length === 0,
    };

    console.log(JSON.stringify(report, null, 2));

    if (failures.length > 0) {
        process.exit(1);
    }
}

await main();
