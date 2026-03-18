import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset-app.vercel.app").trim();
const runLabel =
    (process.env.GAUSET_PLATFORM_RELEASE_GATES_RUN_LABEL || "").trim() ||
    `platform-release-gates-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const reportPath = path.resolve(
    process.env.GAUSET_PLATFORM_RELEASE_GATES_REPORT || `artifacts/platform-release-gates/${runLabel}/release-gates.json`,
);
const liveRoutesReportPath = path.resolve(
    process.env.GAUSET_PLATFORM_LIVE_ROUTES_REPORT || path.join(path.dirname(reportPath), "live-routes.json"),
);
const authenticatedApiReportPath = path.resolve(
    process.env.GAUSET_PLATFORM_AUTH_API_REPORT || path.join(path.dirname(reportPath), "authenticated-api.json"),
);
const allowBlocked = (process.env.GAUSET_PLATFORM_RELEASE_GATES_ALLOW_BLOCKED || "").trim() === "1";

const authenticatedApiMissingEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL",
    "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD",
].filter((key) => {
    if (key === "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL") {
        return !((process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL || process.env.GAUSET_PLATFORM_E2E_OWNER_EMAIL || "").trim());
    }

    if (key === "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD") {
        return !((process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD || process.env.GAUSET_PLATFORM_E2E_OWNER_PASSWORD || "").trim());
    }

    return !((process.env[key] || "").trim());
});

await fs.mkdir(path.dirname(reportPath), { recursive: true });

function runStep(name, command, extraEnv = {}) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command[0], command.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
            ...process.env,
            GAUSET_PLATFORM_E2E_BASE_URL: baseUrl,
            GAUSET_PLATFORM_BASE_URL: baseUrl,
            ...extraEnv,
        },
    });

    return {
        name,
        command: command.join(" "),
        startedAt,
        completedAt: new Date().toISOString(),
        status: result.status === 0 ? "passed" : "failed",
        exitCode: result.status,
        signal: result.signal || null,
    };
}

function createBlockedAuthApiReport(reason) {
    const completedAt = new Date().toISOString();
    return {
        baseUrl,
        executedAt: completedAt,
        completedAt,
        pass: false,
        status: "blocked",
        blockerType: "missing_credential_env",
        missingEnv: authenticatedApiMissingEnv,
        reason,
        checks: {},
        cleanup: {
            invitationRevoked: false,
            revokeOthersStatus: null,
            primaryLogoutStatus: null,
            secondaryLogoutStatus: null,
            errors: [],
        },
        error: null,
    };
}

async function writeJson(filePath, payload) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readJsonIfExists(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
        return null;
    }
}

function isBlockedLiveRouteFailure(report) {
    const checks = Object.values(report?.checks ?? {});
    if (checks.length === 0) {
        return false;
    }

    return checks.every((entry) => {
        const error = typeof entry?.error === "string" ? entry.error : "";
        return /could not resolve host|failed to connect|temporary failure in name resolution|network is unreachable/i.test(error);
    });
}

const steps = [];
const blocked = [];
const failed = [];

steps.push(runStep("platform_contracts", ["npm", "run", "test:platform-contracts"]));
steps.push(runStep("review_share_matrix", ["npm", "run", "test:review-share-matrix"]));
steps.push(runStep("mvp_workspace_persistence", ["npm", "run", "test:mvp-workspace-persistence"]));
steps.push(runStep("platform_scenarios", ["npm", "run", "test:platform-scenarios"]));
steps.push(runStep("platform_route_smoke", ["npm", "run", "test:platform-routes"]));
steps.push(runStep("platform_activation_readiness", ["npm", "run", "test:platform-readiness"]));
const liveRoutesStep = runStep("platform_live_routes", ["npm", "run", "test:platform-live-routes"], {
    GAUSET_PLATFORM_LIVE_ROUTES_REPORT: liveRoutesReportPath,
    GAUSET_PLATFORM_EXPECT_MVP_GATE: "1",
});
steps.push(liveRoutesStep);

if (liveRoutesStep.status === "failed") {
    const liveRoutesReport = await readJsonIfExists(liveRoutesReportPath);
    if (isBlockedLiveRouteFailure(liveRoutesReport)) {
        liveRoutesStep.status = "blocked";
        liveRoutesStep.exitCode = null;
        liveRoutesStep.reason = "Live route smoke could not resolve or reach the configured host from this shell.";
        blocked.push(liveRoutesStep.reason);
    }
}

if (authenticatedApiMissingEnv.length > 0) {
    const reason = `Missing authenticated API inputs: ${authenticatedApiMissingEnv.join(", ")}.`;
    steps.push({
        name: "platform_authenticated_api",
        command: "npm run test:platform-authenticated-api",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "blocked",
        exitCode: null,
        signal: null,
        reason,
    });
    blocked.push(reason);
    await writeJson(authenticatedApiReportPath, createBlockedAuthApiReport(reason));
} else {
    const authApiStep = runStep("platform_authenticated_api", ["npm", "run", "test:platform-authenticated-api"], {
        GAUSET_PLATFORM_AUTH_API_REPORT: authenticatedApiReportPath,
    });
    steps.push(authApiStep);
    if (authApiStep.status !== "passed") {
        failed.push("Authenticated API certification failed.");
    }
}

for (const step of steps) {
    if (step.status === "failed") {
        failed.push(`${step.name} failed.`);
    }
}

const status = failed.length > 0 ? "failed" : blocked.length > 0 ? "blocked" : "passed";
const report = {
    runLabel,
    baseUrl,
    allowBlocked,
    executedAt: steps[0]?.startedAt || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status,
    pass: status === "passed",
    blocked,
    failed,
    steps,
};

await writeJson(reportPath, report);

console.log(JSON.stringify(report, null, 2));

if (status === "failed" || (status === "blocked" && !allowBlocked)) {
    process.exitCode = 1;
}
