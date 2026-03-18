import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset-app.vercel.app").trim();
const runLabel =
    (process.env.GAUSET_PLATFORM_BILLING_CERT_RUN_LABEL || "").trim() ||
    `platform-billing-completion-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = path.resolve(
    process.env.GAUSET_PLATFORM_BILLING_CERT_ARTIFACT_DIR || `artifacts/platform-billing-completion/${runLabel}`,
);
const billingCompletionArtifactRoot = path.resolve("artifacts/platform-billing-completion");
const platformRolloutArtifactRoot = path.resolve("artifacts/platform-rollout");
const summaryPath = path.join(artifactDir, "certification-summary.json");
const liveWebhookReportPath = path.join(artifactDir, "billing-webhook-live.json");
const liveCompletionReportPath = path.join(artifactDir, "billing-completion-live.json");
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
const liveBillingMissingEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
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

const summary = {
    runLabel,
    baseUrl,
    executedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    localEnv: {
        baseUrlHostMode,
        liveBillingReady: liveBillingMissingEnv.length === 0 && baseUrlHostMode !== "local",
        liveBillingMissingEnv,
        schemaAuditReady: schemaAuditMissingEnv.length === 0,
        schemaAuditMissingEnv,
    },
    localSteps: [],
    liveSteps: [],
    liveReports: {
        webhook: null,
        completion: null,
        schemaAudit: null,
    },
    certificationLanes: {
        localContracts: null,
        liveWebhook: null,
        liveCompletion: null,
        schemaAudit: null,
    },
    blockers: [],
    blockerDetails: [],
    skipped: [],
    nextActions: [],
    readyToCallBillingComplete: false,
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

async function readJsonIfExists(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
        return null;
    }
}

async function findLatestHistoricalArtifact(
    filename,
    {
        roots = [billingCompletionArtifactRoot, platformRolloutArtifactRoot],
        predicate = () => true,
        excludePaths = [],
        mapResult = (report, filePath) => ({
            path: filePath,
            runLabel: path.basename(path.dirname(filePath)),
            executedAt: report?.executedAt ?? null,
            completedAt: report?.completedAt ?? null,
            failureCategory: report?.failureCategory ?? null,
        }),
    } = {},
) {
    const excluded = new Set(excludePaths.filter(Boolean).map((entry) => path.resolve(entry)));

    for (const root of roots) {
        let entries;
        try {
            entries = await fs.readdir(root, { withFileTypes: true });
        } catch {
            continue;
        }

        const directories = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .reverse();

        for (const directory of directories) {
            const filePath = path.resolve(root, directory, filename);
            if (excluded.has(filePath)) {
                continue;
            }
            const report = await readJsonIfExists(filePath);
            if (!report || !predicate(report, filePath)) {
                continue;
            }
            return mapResult(report, filePath);
        }
    }

    return null;
}

const localCommands = [
    ["typecheck", ["npm", "run", "typecheck"]],
    ["platform_billing_usage", ["npm", "run", "test:platform-billing-usage"]],
    ["platform_billing_webhooks", ["npm", "run", "test:platform-billing-webhooks"]],
    ["platform_billing_unhappy_paths", ["npm", "run", "test:platform-billing-unhappy-paths"]],
    ["platform_billing_reconciliation", ["npm", "run", "test:platform-billing-reconciliation"]],
    ["mvp_proxy_contracts", ["npm", "run", "test:mvp-proxy-contracts"]],
    ["mvp_job_listing_contracts", ["npm", "run", "test:mvp-job-listing-contracts"]],
];

for (const [name, command] of localCommands) {
    const step = runStep(name, command);
    summary.localSteps.push(step);
    if (step.status !== "passed") {
        const detail = `${name} failed.`;
        addBlocker("code_regression", "local_contracts", detail);
        summary.certificationLanes.localContracts = {
            status: "failed",
            blockerType: "code_regression",
            detail,
            reportPath: summaryPath,
        };
        summary.status = "failed";
        summary.completedAt = new Date().toISOString();
        await writeSummary();
        process.exit(1);
    }
}

summary.certificationLanes.localContracts = {
    status: "verified",
    blockerType: null,
    detail: "Billing usage, webhook, unhappy-path, reconciliation, and related contract lanes all passed locally.",
    reportPath: summaryPath,
};

const webhookHistoricalEvidence = await findLatestHistoricalArtifact("billing-webhook-live.json", {
    excludePaths: [liveWebhookReportPath],
    predicate: (report) => report?.pass === true,
});
const completionHistoricalEvidence = await findLatestHistoricalArtifact("billing-completion-live.json", {
    roots: [billingCompletionArtifactRoot],
    excludePaths: [liveCompletionReportPath],
    predicate: (report) => report?.pass === true,
});
const schemaHistoricalEvidence = await findLatestHistoricalArtifact("schema-live.json", {
    excludePaths: [schemaAuditReportPath],
    predicate: (report) => report?.pass === true,
});

if (baseUrlHostMode === "local") {
    const detail = `Live billing proof requires a deployed HTTPS base URL. Current base URL is local: ${baseUrl}.`;
    summary.skipped.push(detail);
    addBlocker("local_host_limitation", "live_webhook", detail);
    addBlocker("local_host_limitation", "live_completion", detail);
    summary.certificationLanes.liveWebhook = {
        status: "blocked",
        blockerType: "local_host_limitation",
        detail,
        reportPath: null,
        historicalEvidence: webhookHistoricalEvidence,
    };
    summary.certificationLanes.liveCompletion = {
        status: "blocked",
        blockerType: "local_host_limitation",
        detail,
        reportPath: null,
        historicalEvidence: completionHistoricalEvidence,
    };
} else if (liveBillingMissingEnv.length > 0) {
    const detail = `Live billing proof is blocked by missing env: ${liveBillingMissingEnv.join(", ")}.`;
    summary.skipped.push(detail);
    addBlocker("missing_credential_env", "live_webhook", `Live Stripe webhook proof is blocked by missing env: ${liveBillingMissingEnv.join(", ")}.`);
    addBlocker("missing_credential_env", "live_completion", `Live billing completion proof is blocked by missing env: ${liveBillingMissingEnv.join(", ")}.`);
    summary.certificationLanes.liveWebhook = {
        status: "blocked",
        blockerType: "missing_credential_env",
        detail: `Current machine is missing live Stripe webhook inputs: ${liveBillingMissingEnv.join(", ")}.`,
        reportPath: null,
        historicalEvidence: webhookHistoricalEvidence,
    };
    summary.certificationLanes.liveCompletion = {
        status: "blocked",
        blockerType: "missing_credential_env",
        detail: `Current machine is missing live billing completion inputs: ${liveBillingMissingEnv.join(", ")}.`,
        reportPath: null,
        historicalEvidence: completionHistoricalEvidence,
    };
} else {
    const webhookStep = runStep("platform_billing_webhooks_live", ["npm", "run", "test:platform-billing-webhooks-live"], {
        GAUSET_PLATFORM_LIVE_WEBHOOK_REPORT: liveWebhookReportPath,
    });
    summary.liveSteps.push(webhookStep);

    const completionStep = runStep("platform_billing_completion_live", ["npm", "run", "test:platform-billing-completion-live"], {
        GAUSET_PLATFORM_BILLING_COMPLETION_LIVE_REPORT: liveCompletionReportPath,
    });
    summary.liveSteps.push(completionStep);

    summary.liveReports.webhook = await readJsonIfExists(liveWebhookReportPath);
    summary.liveReports.completion = await readJsonIfExists(liveCompletionReportPath);

    if (summary.liveReports.webhook?.pass === true) {
        summary.certificationLanes.liveWebhook = {
            status: "verified",
            blockerType: null,
            detail: "Live Stripe webhook delivery certification passed.",
            reportPath: liveWebhookReportPath,
            historicalEvidence: null,
        };
    } else {
        const category = summary.liveReports.webhook?.failureCategory || "external_service_runtime_issue";
        const detail =
            summary.liveReports.webhook?.error || (webhookStep.status === "passed" ? "Live Stripe webhook report was not produced." : "Live Stripe webhook certification failed.");
        addBlocker(category, "live_webhook", `Live Stripe webhook proof failed: ${detail}`);
        summary.certificationLanes.liveWebhook = {
            status: "failed",
            blockerType: category,
            detail,
            reportPath: summary.liveReports.webhook ? liveWebhookReportPath : null,
            historicalEvidence: null,
        };
    }

    if (summary.liveReports.completion?.pass === true) {
        summary.certificationLanes.liveCompletion = {
            status: "verified",
            blockerType: null,
            detail: "Live billing completion certification passed.",
            reportPath: liveCompletionReportPath,
            historicalEvidence: null,
        };
    } else {
        const category = summary.liveReports.completion?.failureCategory || "external_service_runtime_issue";
        const detail =
            summary.liveReports.completion?.error ||
            (completionStep.status === "passed" ? "Live billing completion report was not produced." : "Live billing completion certification failed.");
        addBlocker(category, "live_completion", `Live billing completion proof failed: ${detail}`);
        summary.certificationLanes.liveCompletion = {
            status: "failed",
            blockerType: category,
            detail,
            reportPath: summary.liveReports.completion ? liveCompletionReportPath : null,
            historicalEvidence: null,
        };
    }
}

if (schemaAuditMissingEnv.length > 0) {
    const detail = `Live schema audit is blocked by missing env: ${schemaAuditMissingEnv.join(", ")}.`;
    summary.skipped.push(detail);
    addBlocker("missing_credential_env", "schema_audit", detail);
    summary.certificationLanes.schemaAudit = {
        status: "blocked",
        blockerType: "missing_credential_env",
        detail: `Current machine is missing live schema audit inputs: ${schemaAuditMissingEnv.join(", ")}.`,
        reportPath: null,
        historicalEvidence: schemaHistoricalEvidence,
    };
} else {
    const schemaStep = runStep("platform_schema_live", ["npm", "run", "test:platform-schema-live"], {
        GAUSET_PLATFORM_SCHEMA_AUDIT_REPORT: schemaAuditReportPath,
    });
    summary.liveSteps.push(schemaStep);
    summary.liveReports.schemaAudit = await readJsonIfExists(schemaAuditReportPath);

    if (summary.liveReports.schemaAudit?.pass === true) {
        summary.certificationLanes.schemaAudit = {
            status: "verified",
            blockerType: null,
            detail: "Live schema audit passed.",
            reportPath: schemaAuditReportPath,
            historicalEvidence: null,
        };
    } else {
        const category = summary.liveReports.schemaAudit?.failureCategory || "external_service_runtime_issue";
        const detail =
            summary.liveReports.schemaAudit?.error || (schemaStep.status === "passed" ? "Live schema audit report was not produced." : "Live schema audit failed.");
        addBlocker(category, "schema_audit", `Live schema audit failed: ${detail}`);
        summary.certificationLanes.schemaAudit = {
            status: "failed",
            blockerType: category,
            detail,
            reportPath: summary.liveReports.schemaAudit ? schemaAuditReportPath : null,
            historicalEvidence: null,
        };
    }
}

if (baseUrlHostMode === "local") {
    summary.nextActions.push("Point GAUSET_PLATFORM_BASE_URL or GAUSET_PLATFORM_E2E_BASE_URL at the deployed staging host before rerunning live billing proof.");
}
if (liveBillingMissingEnv.length > 0) {
    summary.nextActions.push("Provide NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and STRIPE_SECRET_KEY, then rerun the billing-completion cert.");
}
if (schemaAuditMissingEnv.length > 0) {
    summary.nextActions.push("Provide SUPABASE_MANAGEMENT_ACCESS_TOKEN and SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL, then rerun the live schema audit.");
}
if (summary.certificationLanes.liveWebhook?.status === "failed") {
    summary.nextActions.push("Fix live Stripe webhook delivery before calling billing operationally complete.");
}
if (summary.certificationLanes.liveCompletion?.status === "failed") {
    summary.nextActions.push("Fix the live billing completion flow before calling billing operationally complete.");
}
if (summary.certificationLanes.schemaAudit?.status === "failed") {
    summary.nextActions.push("Fix the live schema audit before calling billing operationally complete.");
}

summary.readyToCallBillingComplete =
    summary.blockerDetails.length === 0 &&
    summary.localSteps.every((step) => step.status === "passed") &&
    summary.liveReports.webhook?.pass === true &&
    summary.liveReports.completion?.pass === true &&
    summary.liveReports.schemaAudit?.pass === true;

if (summary.blockerDetails.length === 0) {
    summary.status = "passed";
} else if (summary.blockerDetails.every((entry) => ["missing_credential_env", "local_host_limitation"].includes(entry.category))) {
    summary.status = "blocked";
} else {
    summary.status = "failed";
}

summary.completedAt = new Date().toISOString();

await writeSummary();

if (summary.status !== "passed") {
    process.exitCode = 1;
}
