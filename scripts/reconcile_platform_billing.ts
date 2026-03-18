import nextEnv from "@next/env";

import { reconcileStripeBilling } from "../src/server/billing/reconcile.ts";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

function readOption(name: string) {
    const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    if (inline) {
        return inline.slice(name.length + 3).trim();
    }

    const index = process.argv.indexOf(`--${name}`);
    if (index >= 0) {
        return (process.argv[index + 1] ?? "").trim();
    }

    return "";
}

function readFlag(name: string) {
    return process.argv.includes(`--${name}`);
}

function parseCreatedGte(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
        return Math.floor(numeric);
    }

    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate)) {
        return Math.floor(parsedDate / 1000);
    }

    throw new Error(`Unable to parse --since value "${value}". Use Unix seconds or an ISO timestamp.`);
}

const studioId = readOption("studio-id") || process.env.GAUSET_BILLING_SYNC_STUDIO_ID || null;
const customerId = readOption("customer-id") || process.env.GAUSET_BILLING_SYNC_CUSTOMER_ID || null;
const includeAllCustomers = readFlag("all-customers") || process.env.GAUSET_BILLING_SYNC_ALL === "1";
const createdGte = parseCreatedGte(readOption("since") || process.env.GAUSET_BILLING_SYNC_SINCE || "");
const skipUsageBackfill = readFlag("skip-usage-backfill") || process.env.GAUSET_BILLING_SYNC_SKIP_USAGE_BACKFILL === "1";

const report = {
    executedAt: new Date().toISOString(),
    completedAt: null as string | null,
    pass: false,
    studioId,
    customerId,
    includeAllCustomers,
    createdGte,
    skipUsageBackfill,
    result: null as Awaited<ReturnType<typeof reconcileStripeBilling>> | null,
    error: null as string | null,
};

function formatError(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Stripe billing reconciliation failed.";
    }

    const parts = [error.message];
    let cause = error.cause;
    while (cause instanceof Error) {
        parts.push(`caused by: ${cause.message}`);
        cause = cause.cause;
    }
    if (error.stack) {
        parts.push(error.stack);
    }
    return parts.join("\n");
}

try {
    report.result = await reconcileStripeBilling({
        studioId,
        customerId,
        includeAllCustomers,
        createdGte,
        skipUsageBackfill,
    });
    report.pass = true;
} catch (error) {
    report.error = formatError(error);
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
}
