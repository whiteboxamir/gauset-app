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

function includesGatedEntry(body, encodedNextPath) {
    return body.includes(`/auth/login?next=${encodedNextPath}`) && (/NEXT_REDIRECT/.test(body) || /Loading workspace/i.test(body));
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
    loading_shell_present: /Loading workspace/i.test(mvpShell.body),
    gated_entry_present: includesGatedEntry(mvpShell.body, "%2Fmvp"),
};

const previewShell = await fetchText(`${BASE}/mvp/preview?cert=${encodeURIComponent(runLabel)}&ts=${Date.now()}`);
report.checks.preview_shell = {
    status: previewShell.response.status,
    ok: previewShell.response.ok,
    loading_shell_present: /Loading workspace/i.test(previewShell.body),
    gated_entry_present: includesGatedEntry(previewShell.body, "%2Fmvp%2Fpreview"),
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
if (!report.checks.mvp_shell.loading_shell_present) failures.push("/mvp shell did not render the gated workspace loading surface");
if (!report.checks.mvp_shell.gated_entry_present) failures.push("/mvp did not preserve the gated login redirect");
if (!report.checks.preview_shell.ok) failures.push("/mvp/preview not reachable");
if (!report.checks.preview_shell.loading_shell_present) failures.push("/mvp/preview did not render the gated workspace loading surface");
if (!report.checks.preview_shell.gated_entry_present) failures.push("/mvp/preview did not preserve the gated login redirect");
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
