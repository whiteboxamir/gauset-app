import fs from "node:fs/promises";
import path from "node:path";
import hostGuard from "./mvp_host_guard.cjs";

const { assertPublicCertificationContext, assertPublicMvpBaseUrl } = hostGuard;

const BASE = assertPublicMvpBaseUrl(
    process.env.GAUSET_MVP_BASE_URL || "https://gauset-app.vercel.app",
    "scripts/mvp_public_preflight.mjs",
);
const { artifactDir, runLabel } = assertPublicCertificationContext("scripts/mvp_public_preflight.mjs", {
    requireWriteAck: false,
});
const reportPath = path.resolve(artifactDir, "preflight.json");

async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.text();
    return { response, body };
}

async function fetchRedirect(url) {
    const response = await fetch(url, { cache: "no-store", redirect: "manual" });
    const body = await response.text();
    return {
        response,
        body,
        location: response.headers.get("location"),
    };
}

function parseJson(body, label) {
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`${label} did not return valid JSON.`);
    }
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });

const report = {
    run_label: runLabel,
    base: BASE,
    executed_at: new Date().toISOString(),
    checks: {},
    pass: false,
};

const mvpShell = await fetchText(`${BASE}/mvp?cert=${encodeURIComponent(runLabel)}&ts=${Date.now()}`);
report.checks.mvp_shell = {
    status: mvpShell.response.status,
    ok: mvpShell.response.ok,
    title_present: /Build one world\.\s+Save it once\.\s+Then direct it\./i.test(mvpShell.body),
    launchpad_present: /Open project library/i.test(mvpShell.body) && /Open sample world/i.test(mvpShell.body),
};

const previewCompatibility = await fetchRedirect(
    `${BASE}/mvp/preview?project=11111111-1111-4111-8111-111111111111&source_kind=upload&entry=workspace&cert=${encodeURIComponent(runLabel)}&ts=${Date.now()}`,
);
report.checks.preview_compatibility = {
    status: previewCompatibility.response.status,
    ok:
        (previewCompatibility.response.status === 307 || previewCompatibility.response.status === 308) &&
        Boolean(
            previewCompatibility.location?.includes(
                `/mvp?project=11111111-1111-4111-8111-111111111111&source_kind=upload&entry=workspace`,
            ),
        ),
    redirect_to: previewCompatibility.location ?? null,
};

const uploadInit = await fetchText(`${BASE}/api/mvp/upload-init`);
const uploadInitPayload = parseJson(uploadInit.body, "/api/mvp/upload-init");
report.checks.upload_init = {
    status: uploadInit.response.status,
    ok:
        uploadInit.response.ok &&
        typeof uploadInitPayload?.available === "boolean" &&
        typeof uploadInitPayload?.maximumSizeInBytes === "number" &&
        typeof uploadInitPayload?.legacyProxyMaximumSizeInBytes === "number",
    transport: uploadInitPayload?.transport ?? null,
    maximum_size_bytes: uploadInitPayload?.maximumSizeInBytes ?? null,
    legacy_proxy_maximum_size_bytes: uploadInitPayload?.legacyProxyMaximumSizeInBytes ?? null,
};

const health = await fetchText(`${BASE}/api/mvp/health`);
const healthPayload = parseJson(health.body, "/api/mvp/health");
report.checks.health = {
    status: health.response.status,
    ok: health.response.ok,
    payload: healthPayload,
};

const deployment = await fetchText(`${BASE}/api/mvp/deployment`);
const deploymentPayload = parseJson(deployment.body, "/api/mvp/deployment");
report.checks.frontend_deployment = {
    status: deployment.response.status,
    ok: deployment.response.ok,
    fingerprint: deploymentPayload.fingerprint ?? null,
};

const setupStatus = await fetchText(`${BASE}/api/mvp/setup/status`);
const setupPayload = parseJson(setupStatus.body, "/api/mvp/setup/status");
report.checks.setup_status = {
    status: setupStatus.response.status,
    ok: setupStatus.response.status === 401,
    code: setupPayload.code ?? null,
    redirect_to: setupPayload.redirectTo ?? null,
};

const failures = [];
if (!report.checks.mvp_shell.ok) failures.push("/mvp not reachable");
if (!report.checks.mvp_shell.title_present) failures.push("/mvp did not render the production launchpad title");
if (!report.checks.mvp_shell.launchpad_present) failures.push("/mvp did not render the project-first launchpad actions");
if (!report.checks.preview_compatibility.ok) failures.push("/mvp/preview did not canonicalize to the matching /mvp route");
if (!report.checks.upload_init.ok) failures.push("/api/mvp/upload-init did not return a valid capability payload");
if (!report.checks.health.ok || healthPayload.status !== "ok") failures.push("/api/mvp/health failed");
if (!report.checks.frontend_deployment.ok) {
    failures.push("/api/mvp/deployment failed");
} else {
    if (!deploymentPayload?.fingerprint?.build_label) failures.push("frontend deployment fingerprint missing build_label");
    if (!deploymentPayload?.fingerprint?.commit_short || deploymentPayload.fingerprint.commit_short === "no-sha") {
        failures.push("frontend deployment fingerprint missing commit sha");
    }
}
if (!report.checks.setup_status.ok) {
    failures.push("/api/mvp/setup/status did not require authentication");
} else {
    if (setupPayload?.code !== "AUTH_REQUIRED") failures.push("/api/mvp/setup/status did not return AUTH_REQUIRED");
    if (setupPayload?.redirectTo !== "/auth/login?next=%2Fmvp") {
        failures.push("/api/mvp/setup/status did not preserve the /mvp login redirect");
    }
}

report.failures = failures;
report.pass = failures.length === 0;

await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
    process.exitCode = 1;
}
