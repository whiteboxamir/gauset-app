import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset-app.vercel.app").trim();
const storageStatePath = (process.env.GAUSET_PLATFORM_E2E_STORAGE_STATE || "").trim();
const storageStateReady = storageStatePath ? existsSync(storageStatePath) : false;
const runLabel =
    (process.env.GAUSET_PLATFORM_CERT_RUN_LABEL || "").trim() ||
    `platform-rollout-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = path.resolve(process.env.GAUSET_PLATFORM_CERT_ARTIFACT_DIR || `artifacts/platform-rollout/${runLabel}`);
const platformRolloutArtifactRoot = path.resolve("artifacts/platform-rollout");
const summaryPath = path.join(artifactDir, "certification-summary.json");
const releaseGatesReportPath = path.join(artifactDir, "release-gates.json");
const liveRoutesReportPath = path.join(artifactDir, "live-routes.json");
const authenticatedApiReportPath = path.join(artifactDir, "authenticated-api.json");
const playwrightJsonPath = path.join(artifactDir, "playwright-results.json");
const liveWebhookReportPath = path.join(artifactDir, "billing-webhook-live.json");
const schemaAuditReportPath = path.join(artifactDir, "schema-live.json");

await fs.mkdir(artifactDir, { recursive: true });

function getBaseUrlHostMode(value) {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.endsWith(".local")
            ? "local"
            : "public";
    } catch {
        return "unknown";
    }
}

const baseUrlHostMode = getBaseUrlHostMode(baseUrl);

const authenticatedBrowserMissingEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL",
    "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD or GAUSET_PLATFORM_E2E_STORAGE_STATE",
].filter((key) => {
    if (key === "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL") {
        return !((process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL || process.env.GAUSET_PLATFORM_E2E_OWNER_EMAIL || "").trim());
    }

    if (key === "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD or GAUSET_PLATFORM_E2E_STORAGE_STATE") {
        return !(
            (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD || process.env.GAUSET_PLATFORM_E2E_OWNER_PASSWORD || "").trim() ||
            storageStateReady
        );
    }

    return !(process.env[key] || "").trim();
});

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

    return !(process.env[key] || "").trim();
});

const seedMissingEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD",
].filter((key) => !((process.env[key] || "").trim()));

const liveWebhookMissingEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
].filter((key) => !((process.env[key] || "").trim()));

const schemaAuditMissingEnv = [
    "SUPABASE_MANAGEMENT_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL",
].filter((key) => {
    if (key === "SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL") {
        return !((process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim());
    }
    return !((process.env[key] || "").trim());
});

const autoSeed = process.env.GAUSET_PLATFORM_CERT_AUTO_SEED === "1";
const liveWebhookMaxAttempts = Math.max(1, Number(process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_MAX_ATTEMPTS || "2"));
const liveWebhookRetryDelayMs = Math.max(0, Number(process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_RETRY_DELAY_MS || "3000"));

const summary = {
    runLabel,
    baseUrl,
    executedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    localEnv: {
        baseUrlHostMode,
        authenticatedBrowserReady: authenticatedBrowserMissingEnv.length === 0,
        authenticatedBrowserMissingEnv,
        authenticatedApiReady: authenticatedApiMissingEnv.length === 0,
        authenticatedApiMissingEnv,
        storageStatePath: storageStatePath || null,
        storageStateReady,
        seedReady: seedMissingEnv.length === 0,
        seedMissingEnv,
        liveWebhookReady: liveWebhookMissingEnv.length === 0,
        liveWebhookMissingEnv,
        schemaAuditReady: schemaAuditMissingEnv.length === 0,
        schemaAuditMissingEnv,
        autoSeed,
    },
    readiness: null,
    liveRoutes: null,
    billingWebhookLive: null,
    schemaAudit: null,
    authenticatedApi: null,
    e2e: null,
    mvpGateObserved: null,
    certificationLanes: {
        readinessProbe: null,
        anonymousRoutes: null,
        authenticatedBrowser: null,
        authenticatedApi: null,
        billingWebhook: null,
        schemaAudit: null,
    },
    steps: [],
    blockers: [],
    blockerDetails: [],
    nextActions: [],
    readyToTurnOnGate: false,
};

async function writeSummary() {
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
}

function addBlocker(category, lane, detail) {
    summary.blockers.push(detail);
    summary.blockerDetails.push({
        category,
        lane,
        detail,
    });
}

function clearBlockersForLane(lane) {
    summary.blockers = summary.blockers.filter((detail, index) => summary.blockerDetails[index]?.lane !== lane);
    summary.blockerDetails = summary.blockerDetails.filter((entry) => entry.lane !== lane);
}

function recordSkippedStep(name, command, reason) {
    summary.steps.push({
        name,
        command,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "skipped",
        exitCode: null,
        signal: null,
        reason,
    });
}

function runStep(name, command, extraEnv = {}) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command[0], command.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
            ...process.env,
            GAUSET_PLATFORM_E2E_BASE_URL: baseUrl,
            ...extraEnv,
        },
    });

    summary.steps.push({
        name,
        command: command.join(" "),
        startedAt,
        completedAt: new Date().toISOString(),
        status: result.status === 0 ? "passed" : "failed",
        exitCode: result.status,
        signal: result.signal || null,
    });

    return result;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchReadiness() {
    const response = await fetch(`${baseUrl}/api/platform/readiness?includeConnectivity=1`, {
        cache: "no-store",
    });
    const payload = await response.json();
    summary.readiness = {
        statusCode: response.status,
        payload,
    };

    summary.steps.push({
        name: "readiness_probe",
        command: `GET ${baseUrl}/api/platform/readiness?includeConnectivity=1`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: response.ok && payload.status === "ready" ? "passed" : "failed",
        exitCode: response.ok ? 0 : response.status,
        signal: null,
    });

    return response.ok && payload.status === "ready";
}

async function readJsonIfExists(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function getCurrentRepoMigrationCount() {
    try {
        const entries = await fs.readdir(path.resolve("supabase/migrations"), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).length;
    } catch {
        return null;
    }
}

const currentRepoMigrationCount = await getCurrentRepoMigrationCount();

async function findLatestHistoricalArtifact(filename, {
    predicate = () => true,
    excludePath = null,
    mapResult = (report, filePath) => ({
        path: filePath,
        runLabel: path.basename(path.dirname(filePath)),
        executedAt: report?.executedAt ?? null,
        completedAt: report?.completedAt ?? null,
    }),
} = {}) {
    let entries;
    try {
        entries = await fs.readdir(platformRolloutArtifactRoot, { withFileTypes: true });
    } catch {
        return null;
    }

    const excludeResolved = excludePath ? path.resolve(excludePath) : null;
    const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();

    for (const directory of directories) {
        const filePath = path.resolve(platformRolloutArtifactRoot, directory, filename);
        if (excludeResolved && filePath === excludeResolved) {
            continue;
        }
        const report = await readJsonIfExists(filePath);
        if (!report || !predicate(report, filePath)) {
            continue;
        }
        return mapResult(report, filePath);
    }

    return null;
}

function collectPlaywrightSpecOutcomes(node, parents = []) {
    const outcomes = [];
    if (!node || typeof node !== "object") {
        return outcomes;
    }

    const title = typeof node.title === "string" && node.title.trim() ? node.title.trim() : null;
    const nextParents = title ? [...parents, title] : parents;

    if (Array.isArray(node.specs)) {
        for (const spec of node.specs) {
            const specTitle = typeof spec.title === "string" ? spec.title : "unnamed spec";
            const tests = Array.isArray(spec.tests) ? spec.tests : [];
            const statuses = tests
                .flatMap((entry) => (Array.isArray(entry.results) ? entry.results : []))
                .map((result) => result.status)
                .filter(Boolean);

            const status = statuses.find((value) => value === "failed") || statuses[0] || "unknown";
            outcomes.push({
                title: [...nextParents, specTitle].join(" › "),
                status,
            });
        }
    }

    if (Array.isArray(node.suites)) {
        for (const suite of node.suites) {
            outcomes.push(...collectPlaywrightSpecOutcomes(suite, nextParents));
        }
    }

    return outcomes;
}

async function hydrateLiveRoutes() {
    const liveRoutes = await readJsonIfExists(liveRoutesReportPath);
    summary.liveRoutes = liveRoutes;
    summary.mvpGateObserved = liveRoutes?.observedMvpMode ?? null;
    summary.certificationLanes.anonymousRoutes =
        liveRoutes?.pass === true
            ? {
                  status: "verified",
                  blockerType: null,
                  detail: "Anonymous platform protection and anonymous /mvp gate behavior passed against the deployed stack.",
                  reportPath: liveRoutesReportPath,
              }
            : {
                  status: "failed",
                  blockerType: "external_service_runtime_issue",
                  detail: liveRoutes ? "Anonymous live route protection checks failed." : "Anonymous live route report was not produced.",
                  reportPath: liveRoutes ? liveRoutesReportPath : null,
              };
    if (liveRoutes && liveRoutes.pass === false) {
        addBlocker("external_service_runtime_issue", "anonymous_routes", "Anonymous live route protection checks failed.");
    }
}

async function hydratePlaywrightSummary({ required = true, missingReportCategory = "external_service_runtime_issue", missingReportLane = "authenticated_browser" } = {}) {
    const report = await readJsonIfExists(playwrightJsonPath);
    if (!report) {
        summary.e2e = null;
        if (required) {
            addBlocker(missingReportCategory, missingReportLane, "Playwright JSON report was not produced.");
        }
        return;
    }

    const outcomes = collectPlaywrightSpecOutcomes(report);
    const counts = outcomes.reduce(
        (acc, outcome) => {
            acc.total += 1;
            if (outcome.status === "passed") acc.passed += 1;
            else if (outcome.status === "skipped") acc.skipped += 1;
            else if (outcome.status === "failed") acc.failed += 1;
            else acc.other += 1;
            return acc;
        },
        { total: 0, passed: 0, skipped: 0, failed: 0, other: 0 },
    );

    summary.e2e = {
        stats: report.stats ?? null,
        counts,
        outcomes,
    };

    if (counts.failed > 0) {
        addBlocker("external_service_runtime_issue", "authenticated_browser", `Playwright reported ${counts.failed} failed spec(s).`);
    }
}

async function hydrateAuthenticatedApiSummary() {
    const report = await readJsonIfExists(authenticatedApiReportPath);
    summary.authenticatedApi = report;
    summary.certificationLanes.authenticatedApi =
        report?.pass === true
            ? {
                  status: "verified",
                  blockerType: null,
                  detail: "Authenticated API certification passed against the deployed stack.",
                  reportPath: authenticatedApiReportPath,
                  historicalEvidence: null,
              }
            : report?.status === "blocked" || report?.blockerType === "missing_credential_env"
              ? {
                    status: "blocked",
                    blockerType: "missing_credential_env",
                    detail:
                        report?.reason ||
                        `Current machine is missing authenticated API inputs: ${
                            authenticatedApiMissingEnv.length > 0 ? authenticatedApiMissingEnv.join(", ") : "unknown"
                        }.`,
                    reportPath: report ? authenticatedApiReportPath : null,
                    historicalEvidence: null,
                }
            : {
                  status: "failed",
                  blockerType: "external_service_runtime_issue",
                  detail: report ? "Authenticated API certification failed." : "Authenticated API JSON report was not produced.",
                  reportPath: report ? authenticatedApiReportPath : null,
                  historicalEvidence: null,
              };

    if (!report) {
        addBlocker("external_service_runtime_issue", "authenticated_api", "Authenticated API JSON report was not produced.");
        return;
    }

    if (report.pass !== true) {
        addBlocker(report.status === "blocked" ? "missing_credential_env" : "external_service_runtime_issue", "authenticated_api", report.reason || "Authenticated API certification failed.");
    }
}

async function hydrateLiveWebhookSummary() {
    const report = await readJsonIfExists(liveWebhookReportPath);
    summary.billingWebhookLive = report;
    summary.certificationLanes.billingWebhook =
        report?.pass === true
            ? {
                  status: "verified",
                  blockerType: null,
                  detail: "Live Stripe webhook delivery certification passed.",
                  reportPath: liveWebhookReportPath,
                  historicalEvidence: null,
              }
            : {
                  status: "failed",
                  blockerType: report?.failureCategory || "external_service_runtime_issue",
                  detail: report ? "Live Stripe webhook delivery certification failed." : "Live Stripe webhook JSON report was not produced.",
                  reportPath: report ? liveWebhookReportPath : null,
                  historicalEvidence: null,
              };

    if (!report) {
        addBlocker(report?.failureCategory || "external_service_runtime_issue", "billing_webhook", "Live Stripe webhook JSON report was not produced.");
        return;
    }

    if (report.pass !== true) {
        addBlocker(report?.failureCategory || "external_service_runtime_issue", "billing_webhook", "Live Stripe webhook delivery certification failed.");
    }
}

async function runLiveWebhookStepWithRetry() {
    for (let attempt = 1; attempt <= liveWebhookMaxAttempts; attempt += 1) {
        const stepName = attempt === 1 ? "platform_billing_webhooks_live" : `platform_billing_webhooks_live_retry_${attempt}`;
        runStep(stepName, ["npm", "run", "test:platform-billing-webhooks-live"], {
            GAUSET_PLATFORM_LIVE_WEBHOOK_REPORT: liveWebhookReportPath,
        });
        await hydrateLiveWebhookSummary();

        if (summary.billingWebhookLive?.pass === true) {
            return;
        }

        const shouldRetry =
            attempt < liveWebhookMaxAttempts && summary.billingWebhookLive?.failureCategory === "external_service_runtime_issue";
        if (!shouldRetry) {
            return;
        }

        clearBlockersForLane("billing_webhook");
        await writeSummary();
        await sleep(liveWebhookRetryDelayMs);
    }
}

async function hydrateSchemaAuditSummary() {
    const report = await readJsonIfExists(schemaAuditReportPath);
    summary.schemaAudit = report;
    summary.certificationLanes.schemaAudit =
        report?.pass === true
            ? {
                  status: "verified",
                  blockerType: null,
                  detail: "Live Supabase schema audit passed.",
                  reportPath: schemaAuditReportPath,
                  historicalEvidence: null,
              }
            : {
                  status: "failed",
                  blockerType: report?.failureCategory || "external_service_runtime_issue",
                  detail: report ? "Live Supabase schema audit failed." : "Live schema audit JSON report was not produced.",
                  reportPath: report ? schemaAuditReportPath : null,
                  historicalEvidence: null,
              };

    if (!report) {
        addBlocker("external_service_runtime_issue", "schema_audit", "Live schema audit JSON report was not produced.");
        return;
    }

    if (report.pass !== true) {
        addBlocker(report?.failureCategory || "external_service_runtime_issue", "schema_audit", "Live Supabase schema audit failed.");
    }
}

if (autoSeed) {
    if (seedMissingEnv.length > 0) {
        addBlocker("missing_credential_env", "auto_seed", `Auto-seed requested but missing seed env: ${seedMissingEnv.join(", ")}.`);
    } else {
        const seedResult = runStep("seed_staging_fixture", ["npm", "run", "seed:platform-staging"], {
            GAUSET_PLATFORM_FIXTURE_SEAT_COUNT: (process.env.GAUSET_PLATFORM_FIXTURE_SEAT_COUNT || "3").trim(),
        });
        if (seedResult.status !== 0) {
            summary.status = "failed";
            addBlocker("external_service_runtime_issue", "auto_seed", "Staging fixture seed failed.");
            summary.completedAt = new Date().toISOString();
            await writeSummary();
            process.exit(seedResult.status || 1);
        }
    }
}

for (const step of [
    [
        "platform_release_gates",
        ["npm", "run", "test:platform-release-gates"],
        {
            GAUSET_PLATFORM_RELEASE_GATES_REPORT: releaseGatesReportPath,
            GAUSET_PLATFORM_RELEASE_GATES_ALLOW_BLOCKED: "1",
            GAUSET_PLATFORM_LIVE_ROUTES_REPORT: liveRoutesReportPath,
            GAUSET_PLATFORM_AUTH_API_REPORT: authenticatedApiReportPath,
        },
    ],
    ["platform_billing_webhooks", ["npm", "run", "test:platform-billing-webhooks"]],
]) {
    const result = runStep(step[0], step[1], step[2] ?? {});
    if (result.status !== 0) {
        summary.status = "failed";
        addBlocker(step[0] === "platform_release_gates" ? "code_regression" : "external_service_runtime_issue", step[0], `${step[0]} failed.`);
        summary.completedAt = new Date().toISOString();
        await writeSummary();
        process.exit(result.status || 1);
    }
}

await hydrateLiveRoutes();
await hydrateAuthenticatedApiSummary();

const readinessOk = await fetchReadiness();
summary.certificationLanes.readinessProbe =
    readinessOk
        ? {
              status: summary.readiness?.payload?.activationStatus === "ready" ? "verified" : "partial",
              blockerType: summary.readiness?.payload?.activationStatus === "ready" ? null : "staging_not_fully_certified",
              detail:
                  summary.readiness?.payload?.activationStatus === "ready"
                      ? "Deployed readiness probe returned ready."
                      : "Deployed readiness probe returned ready, but activationStatus is still partial until live-cert lanes are complete.",
              reportPath: summaryPath,
          }
        : {
              status: "failed",
              blockerType: "external_service_runtime_issue",
              detail: "Deployed readiness endpoint is not green.",
              reportPath: summaryPath,
          };
if (!readinessOk) {
    addBlocker("external_service_runtime_issue", "readiness_probe", "Live readiness endpoint is not green.");
}

if (liveWebhookMissingEnv.length === 0) {
    await runLiveWebhookStepWithRetry();
} else {
    const historicalEvidence = await findLatestHistoricalArtifact("billing-webhook-live.json", {
        excludePath: liveWebhookReportPath,
        predicate: (report) => report?.pass === true,
    });
    summary.billingWebhookLive = {
        status: "skipped",
        reason: `Missing live Stripe webhook inputs: ${liveWebhookMissingEnv.join(", ")}.`,
        blockerType: "missing_credential_env",
        historicalEvidence,
    };
    summary.certificationLanes.billingWebhook = {
        status: "blocked",
        blockerType: "missing_credential_env",
        detail: `Current machine is missing live Stripe webhook inputs: ${liveWebhookMissingEnv.join(", ")}.`,
        reportPath: null,
        historicalEvidence,
    };
    recordSkippedStep("platform_billing_webhooks_live", "npm run test:platform-billing-webhooks-live", summary.billingWebhookLive.reason);
}

if (schemaAuditMissingEnv.length === 0) {
    runStep("platform_schema_live", ["npm", "run", "test:platform-schema-live"], {
        GAUSET_PLATFORM_SCHEMA_AUDIT_REPORT: schemaAuditReportPath,
    });
    await hydrateSchemaAuditSummary();
} else {
    const historicalEvidence = await findLatestHistoricalArtifact("schema-live.json", {
        excludePath: schemaAuditReportPath,
        predicate: (report) => report?.pass === true,
        mapResult: (report, filePath) => {
            const historicalMigrationCount = Array.isArray(report?.checks?.migrations?.expectedMigrationVersions)
                ? report.checks.migrations.expectedMigrationVersions.length
                : null;
            const staleComparedToCurrentRepo =
                currentRepoMigrationCount !== null &&
                historicalMigrationCount !== null &&
                historicalMigrationCount !== currentRepoMigrationCount;

            return {
                path: filePath,
                runLabel: path.basename(path.dirname(filePath)),
                executedAt: report?.executedAt ?? null,
                completedAt: report?.completedAt ?? null,
                staleComparedToCurrentRepo,
                historicalMigrationCount,
                currentRepoMigrationCount,
            };
        },
    });
    summary.schemaAudit = {
        status: "skipped",
        reason: `Missing live schema audit inputs: ${schemaAuditMissingEnv.join(", ")}.`,
        blockerType: "missing_credential_env",
        historicalEvidence,
    };
    summary.certificationLanes.schemaAudit = {
        status: "blocked",
        blockerType: "missing_credential_env",
        detail: `Current machine is missing live schema audit inputs: ${schemaAuditMissingEnv.join(", ")}.`,
        reportPath: null,
        historicalEvidence,
    };
    recordSkippedStep("platform_schema_live", "npm run test:platform-schema-live", summary.schemaAudit.reason);
}

const authenticatedBrowserBlockedByLocalHost = baseUrlHostMode === "local";
let e2eResult = { status: null };
if (authenticatedBrowserMissingEnv.length === 0 && !authenticatedBrowserBlockedByLocalHost) {
    e2eResult = runStep("platform_e2e", ["npm", "run", "test:platform-e2e"], {
        GAUSET_PLATFORM_E2E_JSON_REPORT: playwrightJsonPath,
    });
    if (e2eResult.status !== 0) {
        addBlocker("external_service_runtime_issue", "authenticated_browser", "Platform E2E suite failed.");
    }
    await hydratePlaywrightSummary();
} else {
    const skipReason =
        authenticatedBrowserBlockedByLocalHost
            ? `Authenticated browser certification requires a deployed host, but base URL is local: ${baseUrl}.`
            : `Current machine is missing authenticated browser inputs: ${authenticatedBrowserMissingEnv.join(", ")}.`;
    recordSkippedStep("platform_e2e", "npm run test:platform-e2e", skipReason);
    await hydratePlaywrightSummary({ required: false });
}

const historicalAuthenticatedBrowserEvidence =
    authenticatedBrowserMissingEnv.length > 0
        ? await findLatestHistoricalArtifact("certification-summary.json", {
              excludePath: summaryPath,
              predicate: (report) =>
                  report?.status === "passed" &&
                  report?.localEnv?.authenticatedBrowserReady === true &&
                  (report?.e2e?.counts?.skipped ?? 0) === 0 &&
                  (report?.e2e?.counts?.failed ?? 0) === 0,
          })
        : null;

if (authenticatedBrowserMissingEnv.length > 0) {
    addBlocker("missing_credential_env", "authenticated_browser", `Authenticated browser certification is still blocked by local env: ${authenticatedBrowserMissingEnv.join(", ")}.`);
}

if (storageStatePath && !storageStateReady) {
    addBlocker("missing_credential_env", "authenticated_browser", `Configured storage state file does not exist: ${storageStatePath}.`);
}

if (authenticatedBrowserBlockedByLocalHost) {
    addBlocker("local_host_limitation", "authenticated_browser", `Authenticated browser certification requires a deployed host, but base URL is local: ${baseUrl}.`);
}

if (authenticatedBrowserMissingEnv.length === 0 && (summary.e2e?.counts?.skipped ?? 0) > 0) {
    addBlocker("external_service_runtime_issue", "authenticated_browser", `Authenticated browser inputs are present, but Playwright still skipped ${summary.e2e.counts.skipped} spec(s).`);
}

summary.certificationLanes.authenticatedBrowser =
    authenticatedBrowserMissingEnv.length > 0
        ? {
              status: "blocked",
              blockerType: "missing_credential_env",
              detail: `Current machine is missing authenticated browser inputs: ${authenticatedBrowserMissingEnv.join(", ")}.`,
              reportPath: playwrightJsonPath,
              historicalEvidence: historicalAuthenticatedBrowserEvidence,
          }
        : authenticatedBrowserBlockedByLocalHost
          ? {
                status: "blocked",
                blockerType: "local_host_limitation",
                detail: `Authenticated browser certification requires a deployed host, but base URL is local: ${baseUrl}.`,
                reportPath: null,
                historicalEvidence: historicalAuthenticatedBrowserEvidence,
            }
        : e2eResult.status !== 0
          ? {
                status: "failed",
                blockerType: "external_service_runtime_issue",
                detail: "Authenticated browser certification failed in Playwright.",
                reportPath: playwrightJsonPath,
                historicalEvidence: null,
            }
          : (summary.e2e?.counts?.skipped ?? 0) > 0
            ? {
                  status: "partial",
                  blockerType: "stale_or_insufficient_diagnostics",
                  detail: `Playwright completed but still skipped ${summary.e2e.counts.skipped} authenticated browser spec(s).`,
                  reportPath: playwrightJsonPath,
                  historicalEvidence: null,
              }
            : {
                  status: "verified",
                  blockerType: null,
                  detail: "Authenticated browser certification passed with no skipped specs.",
                  reportPath: playwrightJsonPath,
                  historicalEvidence: null,
              };

if (!summary.liveRoutes?.pass) {
    summary.nextActions.push("Fix anonymous live route protection before any rollout activity.");
}

if (!readinessOk) {
    summary.nextActions.push("Keep the gate off until the deployed readiness endpoint returns ready.");
}

if (liveWebhookMissingEnv.length > 0) {
    addBlocker("missing_credential_env", "billing_webhook", `Live Stripe webhook delivery certification is still blocked by local env: ${liveWebhookMissingEnv.join(", ")}.`);
    summary.nextActions.push("Provide local Supabase REST + Stripe secret inputs, then rerun the live webhook delivery certification.");
}

if (schemaAuditMissingEnv.length > 0) {
    addBlocker("missing_credential_env", "schema_audit", `Live schema audit is still blocked by local env: ${schemaAuditMissingEnv.join(", ")}.`);
    summary.nextActions.push("Provide a Supabase management token, then rerun the live schema audit.");
}

if (authenticatedBrowserMissingEnv.length > 0) {
    summary.nextActions.push("Provide local Supabase anon URL/key plus seeded owner email and either a password or a saved storage-state session, then rerun `npm run certify:platform-rollout`.");
}

if (authenticatedBrowserBlockedByLocalHost) {
    summary.nextActions.push("Point the platform rollout cert at the deployed staging host instead of localhost before rerunning browser proof.");
}

if (authenticatedApiMissingEnv.length > 0) {
    summary.nextActions.push("Provide local Supabase anon URL/key plus seeded owner email and password, then rerun `npm run test:platform-release-gates` or `npm run certify:platform-rollout`.");
}

if (authenticatedApiMissingEnv.length === 0 && summary.authenticatedApi?.pass !== true) {
    summary.nextActions.push("Fix the authenticated API certification lane before any MVP entitlement-gate rollout.");
}

if (summary.e2e?.counts?.failed > 0) {
    summary.nextActions.push("Resolve failing Playwright specs before any MVP entitlement-gate rollout.");
}

if (liveWebhookMissingEnv.length === 0 && summary.billingWebhookLive?.pass !== true) {
    summary.nextActions.push("Fix the live Stripe webhook delivery lane before calling the rollout fully certified.");
}

if (schemaAuditMissingEnv.length === 0 && summary.schemaAudit?.pass !== true) {
    summary.nextActions.push("Fix the live Supabase schema audit before calling the rollout fully certified.");
}

const authenticatedBrowserCertified =
    authenticatedBrowserMissingEnv.length === 0 && e2eResult.status === 0 && (summary.e2e?.counts?.skipped ?? 0) === 0;
const authenticatedLaneCertified = summary.authenticatedApi?.pass === true || authenticatedBrowserCertified;

if (summary.mvpGateObserved === "auth_required" && !authenticatedLaneCertified) {
    summary.nextActions.push("The deployed /mvp route is already behind auth. Finish entitled-session proof on the live stack before calling rollout certified.");
}

summary.readyToTurnOnGate =
    readinessOk &&
    summary.liveRoutes?.pass === true &&
    summary.billingWebhookLive?.pass === true &&
    summary.schemaAudit?.pass === true &&
    authenticatedLaneCertified &&
    e2eResult.status === 0 &&
    authenticatedBrowserMissingEnv.length === 0 &&
    (summary.e2e?.counts?.skipped ?? 0) === 0;
if (summary.blockerDetails.length === 0) {
    summary.status = "passed";
} else if (summary.blockerDetails.every((entry) => ["missing_credential_env", "local_host_limitation"].includes(entry.category))) {
    summary.status = "blocked";
} else {
    summary.status = "failed";
}
summary.completedAt = new Date().toISOString();

await writeSummary();
console.log(JSON.stringify(summary, null, 2));

if (summary.status !== "passed") {
    process.exitCode = 1;
}
