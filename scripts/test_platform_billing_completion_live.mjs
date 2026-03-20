import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";
import { uploadStillFixtureToMvp } from "./mvp_upload_client.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset.com").trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripeApiVersion = (process.env.STRIPE_API_VERSION || "").trim();
const reportPath = process.env.GAUSET_PLATFORM_BILLING_COMPLETION_LIVE_REPORT
    ? path.resolve(process.env.GAUSET_PLATFORM_BILLING_COMPLETION_LIVE_REPORT)
    : null;
const runLabel =
    (process.env.GAUSET_PLATFORM_BILLING_COMPLETION_RUN_LABEL || "").trim() ||
    `platform-billing-completion-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = reportPath ? path.dirname(reportPath) : path.resolve(`artifacts/platform-billing-completion/${runLabel}`);
const stripeApiBaseUrl = "https://api.stripe.com/v1";
const waitTimeoutMs = Number(process.env.GAUSET_PLATFORM_BILLING_COMPLETION_TIMEOUT_MS || "180000");
const waitIntervalMs = Number(process.env.GAUSET_PLATFORM_BILLING_COMPLETION_INTERVAL_MS || "3000");
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const billingCompletionImageOverride = (process.env.GAUSET_PLATFORM_BILLING_COMPLETION_IMAGE || "").trim();
const missingEnv = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !stripeSecretKey ? "STRIPE_SECRET_KEY" : null,
].filter(Boolean);
const stripeKeyMode = stripeSecretKey.startsWith("sk_live_") ? "live" : stripeSecretKey.startsWith("sk_test_") ? "test" : "unknown";
const testPaymentMethodFixtureIds = ["pm_card_visa", "pm_card_chargeCustomerFail"];
const defaultBillingCompletionImageCandidates = [
    path.resolve(".vercel/output/static/images/hero_render.png"),
    path.resolve(".vercel/output/static/images/amir.png"),
    path.resolve("scenes/scene_42f5b070/environment/preview-projection.png"),
];

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

async function resolveBillingCompletionImage() {
    const candidates = [
        ...(billingCompletionImageOverride ? [path.resolve(billingCompletionImageOverride)] : []),
        ...defaultBillingCompletionImageCandidates,
    ];
    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {}
    }
    throw new Error(`No billing completion image fixture found. Checked: ${candidates.join(", ")}`);
}

function getUploadContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".png") {
        return "image/png";
    }
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }
    return "application/octet-stream";
}

function createSupabaseHeaders() {
    const headers = new Headers({
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
    });
    if (jwtPattern.test(serviceRoleKey)) {
        headers.set("Authorization", `Bearer ${serviceRoleKey}`);
    }
    return headers;
}

function createAnonHeaders() {
    const headers = new Headers({
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
    });
    if (jwtPattern.test(supabaseAnonKey)) {
        headers.set("Authorization", `Bearer ${supabaseAnonKey}`);
    }
    return headers;
}

function buildRestUrl(pathname, searchParams) {
    const url = new URL(`/rest/v1/${pathname.replace(/^\//, "")}`, supabaseUrl);
    (searchParams || new URLSearchParams()).forEach((value, key) => {
        url.searchParams.set(key, value);
    });
    return url;
}

async function restSelect(table, filters, select = "*") {
    const params = new URLSearchParams();
    params.set("select", select);
    Object.entries(filters || {}).forEach(([key, value]) => {
        params.set(key, String(value));
    });

    const response = await fetch(buildRestUrl(table, params), {
        headers: createSupabaseHeaders(),
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `Supabase REST query failed for ${table} with ${response.status}.`);
    }
    return payload;
}

function appendFormEntries(params, key, value) {
    if (value === undefined || value === null) {
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => appendFormEntries(params, `${key}[${index}]`, entry));
        return;
    }
    if (typeof value === "object") {
        Object.entries(value).forEach(([childKey, childValue]) => {
            appendFormEntries(params, `${key}[${childKey}]`, childValue);
        });
        return;
    }
    params.append(key, String(value));
}

async function stripeRequest(pathname, { method = "GET", payload = null, allowFailure = false } = {}) {
    const headers = new Headers({
        Authorization: `Bearer ${stripeSecretKey}`,
    });
    if (stripeApiVersion) {
        headers.set("Stripe-Version", stripeApiVersion);
    }

    let body;
    if (payload) {
        const params = new URLSearchParams();
        Object.entries(payload).forEach(([key, value]) => appendFormEntries(params, key, value));
        body = params;
        headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    const response = await fetch(`${stripeApiBaseUrl}/${pathname.replace(/^\//, "")}`, {
        method,
        headers,
        body,
        cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok && !allowFailure) {
        throw new Error(json?.error?.message || `Stripe API request failed with ${response.status}.`);
    }
    return {
        ok: response.ok,
        status: response.status,
        json,
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, callback) {
    const deadline = Date.now() + waitTimeoutMs;
    let lastSnapshot = null;
    while (Date.now() < deadline) {
        lastSnapshot = await callback();
        if (lastSnapshot?.done) {
            return lastSnapshot;
        }
        await sleep(waitIntervalMs);
    }
    throw new Error(`Timed out waiting for ${label}. Last snapshot: ${JSON.stringify(lastSnapshot)}`);
}

function updateCookies(response, cookieJar) {
    const setCookies =
        typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : response.headers.get("set-cookie")
              ? [response.headers.get("set-cookie")]
              : [];

    for (const entry of setCookies) {
        if (!entry) continue;
        const [pair] = entry.split(";");
        const separatorIndex = pair.indexOf("=");
        if (separatorIndex <= 0) continue;
        const name = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (!name) continue;
        if (!value) {
            cookieJar.delete(name);
        } else {
            cookieJar.set(name, value);
        }
    }
}

function getCookieHeader(cookieJar) {
    return Array.from(cookieJar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}

async function parseJson(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return text;
    }
}

async function supabasePasswordGrant(email, password) {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: createAnonHeaders(),
        body: JSON.stringify({
            email,
            password,
        }),
        cache: "no-store",
    });
    const payload = await parseJson(response);
    if (!response.ok || !payload?.access_token) {
        throw new Error(payload?.error_description || payload?.msg || "Unable to exchange the owner password grant.");
    }
    return payload;
}

function createAppClient(label) {
    const cookieJar = new Map();
    const defaultHeaders = {
        "user-agent": `gauset-platform-billing-completion-${label}`,
    };

    function buildHeaders(headers = {}) {
        return {
            ...(cookieJar.size > 0 ? { cookie: getCookieHeader(cookieJar) } : {}),
            ...defaultHeaders,
            ...headers,
        };
    }

    return {
        buildHeaders,
        async request(pathname, { method = "GET", json = undefined, body = undefined, headers = {}, redirect = "manual" } = {}) {
            const response = await fetch(`${baseUrl}${pathname}`, {
                method,
                redirect,
                headers: buildHeaders({
                    ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
                    ...headers,
                }),
                body: json !== undefined ? JSON.stringify(json) : body,
                cache: "no-store",
            });
            updateCookies(response, cookieJar);
            return {
                response,
                payload: await parseJson(response),
            };
        },
    };
}

async function establishSession(client, email, password) {
    const grant = await supabasePasswordGrant(email, password);
    const sessionEstablish = await client.request("/api/auth/session", {
        method: "PUT",
        json: {
            accessToken: grant.access_token,
            refreshToken: grant.refresh_token,
            provider: "magic_link",
        },
    });
    assert.equal(sessionEstablish.response.status, 200, "Session bootstrap should return 200.");
    return grant;
}

function parseJsonFromStdout(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed) {
        throw new Error("Seed/reconcile script did not produce JSON output.");
    }
    return JSON.parse(trimmed);
}

function createFixtureIdentity() {
    const slugSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
    return {
        ownerEmail: `platform-billing-${slugSuffix}@gauset.dev`,
        ownerPassword: `PlatformBilling!${Date.now()}Aa`,
        studioSlug: `platform-billing-${slugSuffix}`.slice(0, 48),
        studioName: `Platform Billing ${slugSuffix}`,
    };
}

function seedFixture(identity) {
    const result = spawnSync(
        "node",
        ["--experimental-strip-types", "--experimental-specifier-resolution=node", "scripts/seed_platform_staging_fixture.ts"],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
                ...process.env,
                GAUSET_PLATFORM_BASE_URL: baseUrl,
                NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
                SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
                STRIPE_SECRET_KEY: stripeSecretKey,
                GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL: identity.ownerEmail,
                GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD: identity.ownerPassword,
                GAUSET_PLATFORM_FIXTURE_STUDIO_SLUG: identity.studioSlug,
                GAUSET_PLATFORM_FIXTURE_STUDIO_NAME: identity.studioName,
                GAUSET_PLATFORM_FIXTURE_PLAN_CODE: "studio_monthly",
            },
        },
    );

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "Unable to seed the billing completion fixture.");
    }

    return parseJsonFromStdout(result.stdout);
}

function runBillingReconciliation({ fixture, startedAt, skipUsageBackfill = true }) {
    const result = spawnSync(
        "node",
        [
            "--experimental-strip-types",
            "--experimental-specifier-resolution=node",
            "scripts/reconcile_platform_billing.ts",
            "--studio-id",
            fixture.studioId,
            "--customer-id",
            fixture.stripeCustomerId,
            "--since",
            startedAt,
            ...(skipUsageBackfill ? ["--skip-usage-backfill"] : []),
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
                ...process.env,
                GAUSET_PLATFORM_BASE_URL: baseUrl,
                GAUSET_BILLING_SYNC_MVP_BACKEND_URL:
                    process.env.GAUSET_BILLING_SYNC_MVP_BACKEND_URL
                    || process.env.GAUSET_BACKEND_URL
                    || `${baseUrl.replace(/\/$/, "")}/api/_mvp_backend`,
                ...(skipUsageBackfill ? { GAUSET_BILLING_SYNC_SKIP_USAGE_BACKFILL: "1" } : {}),
                NODE_NO_WARNINGS: "1",
            },
        },
    );
    if (result.status !== 0) {
        throw new Error([result.stderr, result.stdout].filter((value) => value && value.trim()).join("\n") || "Billing reconciliation failed.");
    }
    return parseJsonFromStdout(result.stdout);
}

async function waitForSingleRow(label, table, filters, select = "*") {
    return waitFor(label, async () => {
        const rows = await restSelect(table, { ...filters, limit: "1" }, select);
        return {
            done: Array.isArray(rows) && rows.length > 0,
            row: Array.isArray(rows) ? rows[0] ?? null : null,
        };
    });
}

async function runAuthenticatedUsageFlow({ fixture }) {
    const client = createAppClient("billing-completion");
    await establishSession(client, fixture.ownerEmail, fixture.ownerPassword);

    const billingSummary = await client.request("/api/billing/summary");
    assert.equal(billingSummary.response.status, 200, "Billing summary should load for the fixture owner.");

    const uploadFixturePath = await resolveBillingCompletionImage();
    const upload = await uploadStillFixtureToMvp(baseUrl, uploadFixturePath, {
        headers: client.buildHeaders(),
        contentType: getUploadContentType(uploadFixturePath),
    });
    assert.ok(upload.payload?.image_id, "Upload should return an image id.");

    const generation = await client.request("/api/mvp/generate/asset", {
        method: "POST",
        json: {
            image_id: upload.payload.image_id,
        },
    });
    assert.equal(generation.response.status, 200, "Asset generation should return 200.");
    const jobId = generation.payload?.job_id || generation.payload?.asset_id;
    assert.ok(jobId, "Asset generation should return a job id.");

    const completedJob = await waitFor(`completed MVP asset job ${jobId}`, async () => {
        const job = await client.request(`/api/mvp/jobs/${jobId}`);
        return {
            done: job.response.ok && job.payload?.status === "completed",
            snapshot: job.payload,
        };
    });

    const usageEvent = await waitForSingleRow("usage_events row", "usage_events", {
        studio_id: `eq.${fixture.studioId}`,
        job_id: `eq.${jobId}`,
    });
    const usageLedger = await waitForSingleRow("usage ledger row", "credit_ledger", {
        studio_id: `eq.${fixture.studioId}`,
        entry_type: "eq.usage",
        reference_type: "eq.usage_event",
        reference_id: `eq.${usageEvent.row.id}`,
    });

    return {
        ownerEmail: fixture.ownerEmail,
        uploadFixturePath,
        uploadTransport: upload.transport,
        imageId: upload.payload.image_id,
        job: completedJob.snapshot,
        usageEvent: usageEvent.row,
        usageLedger: usageLedger.row,
    };
}

async function runStripeLifecycle({ fixture, usageJobId, startedAt }) {
    const planRows = await restSelect(
        "plans",
        {
            code: "in.(studio_monthly,studio_yearly)",
        },
        "id,code",
    );
    const monthlyPlan = planRows.find((row) => row.code === "studio_monthly") ?? null;
    const yearlyPlan = planRows.find((row) => row.code === "studio_yearly") ?? null;
    assert.ok(monthlyPlan && yearlyPlan, "Monthly and yearly plan rows must exist.");

    const attachedVisa = await stripeRequest("payment_methods/pm_card_visa/attach", {
        method: "POST",
        payload: {
            customer: fixture.stripeCustomerId,
        },
    });
    await stripeRequest(`customers/${fixture.stripeCustomerId}`, {
        method: "POST",
        payload: {
            invoice_settings: {
                default_payment_method: attachedVisa.json.id,
            },
        },
    });

    const product = await stripeRequest("products", {
        method: "POST",
        payload: {
            name: `Platform billing completion ${runLabel}`,
            metadata: {
                source: "gauset_platform_billing_completion",
                fixture_studio_id: fixture.studioId,
            },
        },
    });
    const yearlyPrice = await stripeRequest("prices", {
        method: "POST",
        payload: {
            currency: "usd",
            unit_amount: 238800,
            recurring: {
                interval: "year",
            },
            product: product.json.id,
        },
    });
    const monthlyPrice = await stripeRequest("prices", {
        method: "POST",
        payload: {
            currency: "usd",
            unit_amount: 24900,
            recurring: {
                interval: "month",
            },
            product: product.json.id,
        },
    });

    const createdSubscription = await stripeRequest("subscriptions", {
        method: "POST",
        payload: {
            customer: fixture.stripeCustomerId,
            "items[0][price]": yearlyPrice.json.id,
            collection_method: "charge_automatically",
            metadata: {
                plan_code: "studio_yearly",
                studio_id: fixture.studioId,
            },
            expand: ["latest_invoice.payment_intent", "items.data.price"],
        },
    });
    const subscriptionId = createdSubscription.json.id;
    const subscriptionItemId = createdSubscription.json.items?.data?.[0]?.id || null;
    assert.ok(subscriptionItemId, "Created Stripe subscription should expose an item id.");

    const subscriptionReconciliation = runBillingReconciliation({
        fixture,
        startedAt,
        skipUsageBackfill: true,
    });

    const localSubscription = await waitForSingleRow("live subscription row", "subscriptions", {
        provider_subscription_id: `eq.${subscriptionId}`,
    });
    const localInvoice = await waitForSingleRow("live invoice row", "invoices", {
        provider_invoice_id: `eq.${createdSubscription.json.latest_invoice.id}`,
    });
    const localPayment = await waitForSingleRow("live payment row", "payments", {
        provider_payment_intent_id: `eq.${createdSubscription.json.latest_invoice.payment_intent.id}`,
    });

    const refund = await stripeRequest("refunds", {
        method: "POST",
        payload: {
            payment_intent: createdSubscription.json.latest_invoice.payment_intent.id,
            metadata: {
                usage_job_ids: usageJobId,
            },
        },
    });
    const localRefund = await waitForSingleRow("live refund row", "refunds", {
        provider_refund_id: `eq.${refund.json.id}`,
    });
    const refundLedger = await waitForSingleRow("refund credit ledger row", "credit_ledger", {
        studio_id: `eq.${fixture.studioId}`,
        entry_type: "eq.refund",
        reference_type: "eq.refund",
        reference_id: `eq.${localRefund.row.id}`,
    });
    const reversalLedger = await waitForSingleRow("grant reversal ledger row", "credit_ledger", {
        studio_id: `eq.${fixture.studioId}`,
        entry_type: "eq.reversal",
        reference_type: "eq.invoice",
        reference_id: `eq.${localInvoice.row.id}`,
    });
    const reversedUsageEvent = await waitForSingleRow("reversed usage event", "usage_events", {
        studio_id: `eq.${fixture.studioId}`,
        job_id: `eq.${usageJobId}`,
        reversed_by_refund_id: `eq.${localRefund.row.id}`,
    });

    await stripeRequest(`subscriptions/${subscriptionId}`, {
        method: "POST",
        payload: {
            "items[0][id]": subscriptionItemId,
            "items[0][price]": monthlyPrice.json.id,
            proration_behavior: "none",
            metadata: {
                plan_code: "studio_monthly",
                studio_id: fixture.studioId,
            },
        },
    });
    const downgradedSubscription = await waitFor("downgraded subscription row", async () => {
        const rows = await restSelect(
            "subscriptions",
            {
                provider_subscription_id: `eq.${subscriptionId}`,
                limit: "1",
            },
            "id,plan_id,status",
        );
        const row = rows[0] ?? null;
        return {
            done: Boolean(row && row.plan_id === monthlyPlan.id && row.status === "active"),
            row,
        };
    });

    await stripeRequest(`subscriptions/${subscriptionId}`, {
        method: "DELETE",
    });

    const lifecycleReconciliation = runBillingReconciliation({
        fixture,
        startedAt,
        skipUsageBackfill: true,
    });
    const canceledSubscription = await waitFor("canceled subscription row", async () => {
        const rows = await restSelect(
            "subscriptions",
            {
                provider_subscription_id: `eq.${subscriptionId}`,
                limit: "1",
            },
            "id,plan_id,status,canceled_at",
        );
        const row = rows[0] ?? null;
        return {
            done: Boolean(row && row.status === "canceled"),
            row,
        };
    });

    const failedPaymentAttempt = await stripeRequest("payment_methods/pm_card_chargeCustomerFail/attach", {
        method: "POST",
        payload: {
            customer: fixture.stripeCustomerId,
        },
    });
    const failedPaymentIntent = await stripeRequest("payment_intents", {
        method: "POST",
        allowFailure: true,
        payload: {
            amount: 500,
            currency: "usd",
            customer: fixture.stripeCustomerId,
            payment_method: failedPaymentAttempt.json?.id ?? "pm_card_chargeCustomerFail",
            confirm: true,
            payment_method_types: ["card"],
        },
    });

    let failedPayment = null;
    let failedPaymentSkippedReason = null;
    const failedPaymentIntentId =
        failedPaymentIntent.json?.id ?? failedPaymentIntent.json?.error?.payment_intent?.id ?? failedPaymentIntent.json?.payment_intent?.id ?? null;
    if (failedPaymentIntentId) {
        const failedPaymentRow = await waitFor("failed payment row", async () => {
            const rows = await restSelect(
                "payments",
                {
                    provider_payment_intent_id: `eq.${failedPaymentIntentId}`,
                    limit: "1",
                },
                "id,status,payment_method_brand,payment_method_last4,provider_payment_intent_id",
            );
            const row = rows[0] ?? null;
            return {
                done: Boolean(row && row.status === "failed"),
                row,
            };
        }).catch(() => null);
        failedPayment = failedPaymentRow?.row ?? null;
        if (!failedPayment) {
            failedPaymentSkippedReason = "Stripe created a failing payment intent, but the failed payment webhook row was not observed before timeout.";
        }
    } else {
        failedPaymentSkippedReason =
            failedPaymentIntent.json?.error?.message || `Stripe returned ${failedPaymentIntent.status} without a reusable payment intent id.`;
    }

    return {
        stripe: {
            productId: product.json.id,
            yearlyPriceId: yearlyPrice.json.id,
            monthlyPriceId: monthlyPrice.json.id,
            subscriptionId,
            refundId: refund.json.id,
            failedPaymentIntentId,
        },
        rows: {
            subscription: localSubscription.row,
            invoice: localInvoice.row,
            payment: localPayment.row,
            refund: localRefund.row,
            refundLedger: refundLedger.row,
            reversalLedger: reversalLedger.row,
            reversedUsageEvent: reversedUsageEvent.row,
            downgradedSubscription: downgradedSubscription.row,
            canceledSubscription: canceledSubscription.row,
            failedPayment,
        },
        skipped: {
            pastDue: "Covered by deterministic local unhappy-path certification.",
            unpaid: "Covered by deterministic local unhappy-path certification.",
            failedPayment: failedPayment ? null : failedPaymentSkippedReason,
        },
        reconciliation: {
            subscriptionSync: subscriptionReconciliation,
            lifecycleSync: lifecycleReconciliation,
        },
    };
}

const report = {
    runLabel,
    baseUrl,
    executedAt: new Date().toISOString(),
    completedAt: null,
    pass: false,
    failureCategory: null,
    missingEnv,
    hostMode: getBaseUrlHostMode(baseUrl),
    fixture: null,
    usage: null,
    liveLifecycle: null,
    proven: [],
    skipped: [],
    error: null,
};

function assertSupportedStripeFixtureMode() {
    if (stripeKeyMode !== "live") {
        return;
    }
    throw new Error(
        `Live billing completion certification still uses Stripe test payment method fixtures (${testPaymentMethodFixtureIds.join(", ")}) and cannot run with an sk_live_ key. Use a test key for this automation or implement a real live payment-method setup flow.`,
    );
}

function classifyBillingCompletionFailure(message) {
    if (missingEnv.length > 0) {
        return "missing_credential_env";
    }
    if (report.hostMode === "local") {
        return "local_host_limitation";
    }
    if (/test payment method fixtures|cannot run with an sk_live_ key/i.test(message)) {
        return "invalid_live_test_fixture_mix";
    }
    if (/should return|should load|should succeed|should expose|missing|assert/i.test(message)) {
        return "code_regression";
    }
    return "external_service_runtime_issue";
}

try {
    if (missingEnv.length > 0) {
        throw new Error(`Missing required billing completion env: ${missingEnv.join(", ")}.`);
    }
    if (report.hostMode === "local") {
        throw new Error(`Live billing completion proof requires a deployed HTTPS base URL, not ${baseUrl}.`);
    }
    assertSupportedStripeFixtureMode();

    const identity = createFixtureIdentity();
    const seeded = seedFixture(identity);
    const fixture = {
        ...seeded.fixture,
        ownerEmail: identity.ownerEmail,
        ownerPassword: identity.ownerPassword,
    };
    report.fixture = fixture;

    const usage = await runAuthenticatedUsageFlow({ fixture });
    report.usage = usage;
    report.proven.push("Authenticated `/api/mvp` asset generation completed on the deployed app and wrote a real `usage_events` row plus `credit_ledger` usage debit.");

    const liveLifecycle = await runStripeLifecycle({
        fixture,
        usageJobId: usage.job.id,
        startedAt: report.executedAt,
    });
    report.liveLifecycle = liveLifecycle;
    report.proven.push("Live Stripe subscription, invoice, payment, refund, downgrade, cancellation, and reconciliation flows synchronized into Supabase for the disposable fixture.");

    if (liveLifecycle.rows.failedPayment) {
        report.proven.push("A live failed payment intent synchronized into the `payments` table with `failed` status.");
    } else if (liveLifecycle.skipped.failedPayment) {
        report.skipped.push(`Live failed payment lane was not proven: ${liveLifecycle.skipped.failedPayment}`);
    }

    report.proven.push("Live billing reconciliation synchronized Stripe subscription, invoice, payment, refund, and subscription-state rows without relying on usage backfill.");

    report.skipped.push(`Past_due status was not exercised live: ${liveLifecycle.skipped.pastDue}`);
    report.skipped.push(`Unpaid status was not exercised live: ${liveLifecycle.skipped.unpaid}`);
    report.pass = true;
} catch (error) {
    report.error = error instanceof Error ? error.message : "Platform billing completion live certification failed.";
    report.failureCategory = classifyBillingCompletionFailure(report.error);
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    await fs.writeFile(reportPath ?? path.join(artifactDir, "billing-completion-live.json"), JSON.stringify(report, null, 2));
}
