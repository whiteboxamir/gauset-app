import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset-app.vercel.app").trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripeApiVersion = (process.env.STRIPE_API_VERSION || "").trim();
const reportPath = process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_REPORT ? path.resolve(process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_REPORT) : null;
const runLabel =
    (process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_RUN_LABEL || "").trim() ||
    `platform-live-webhook-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = reportPath ? path.dirname(reportPath) : path.resolve(`artifacts/platform-live-webhook/${runLabel}`);
const stripeWebhookUrl = `${baseUrl}/api/webhooks/stripe`;
const stripeApiBaseUrl = "https://api.stripe.com/v1";
const waitTimeoutMs = Number(process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_TIMEOUT_MS || "120000");
const waitIntervalMs = Number(process.env.GAUSET_PLATFORM_LIVE_WEBHOOK_INTERVAL_MS || "3000");
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const missingEnv = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !stripeSecretKey ? "STRIPE_SECRET_KEY" : null,
].filter(Boolean);
const stripeKeyMode = stripeSecretKey.startsWith("sk_live_") ? "live" : stripeSecretKey.startsWith("sk_test_") ? "test" : "unknown";
const testPaymentMethodFixtureIds = ["pm_card_visa"];

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

async function stripeRequest(pathname, { method = "GET", payload = null } = {}) {
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
    if (!response.ok) {
        throw new Error(json?.error?.message || `Stripe API request failed with ${response.status}.`);
    }
    return json;
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

function parseJsonFromStdout(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed) {
        throw new Error("Seed script did not produce JSON output.");
    }
    return JSON.parse(trimmed);
}

function extractStripeEventObjectId(event) {
    const object = event?.data?.object;
    return object?.id || null;
}

function createFixtureIdentity() {
    const slugSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
    return {
        ownerEmail: `platform-webhook-${slugSuffix}@gauset.dev`,
        ownerPassword: `PlatformWebhook!${Date.now()}Aa`,
        studioSlug: `platform-webhook-${slugSuffix}`.slice(0, 48),
        studioName: `Platform Webhook ${slugSuffix}`,
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
        throw new Error(result.stderr || result.stdout || "Unable to seed the live webhook fixture.");
    }

    return parseJsonFromStdout(result.stdout);
}

const report = {
    baseUrl,
    stripeWebhookUrl,
    executedAt: new Date().toISOString(),
    completedAt: null,
    pass: false,
    failureCategory: null,
    missingEnv,
    hostMode: getBaseUrlHostMode(baseUrl),
    fixture: null,
    webhookEndpoint: null,
    stripeObjects: null,
    checks: {
        subscriptionRow: null,
        invoiceRow: null,
        paymentRow: null,
        relevantStripeEvents: [],
        matchingAuditEvents: [],
    },
    cleanup: {
        subscriptionCanceled: false,
        errors: [],
    },
    error: null,
};

let createdSubscriptionId = null;

function assertSupportedStripeFixtureMode() {
    if (stripeKeyMode !== "live") {
        return;
    }
    throw new Error(
        `Live Stripe webhook certification still uses Stripe test payment method fixtures (${testPaymentMethodFixtureIds.join(", ")}) and cannot run with an sk_live_ key. Use a test key for this automation or implement a real live payment-method setup flow.`,
    );
}

function classifyWebhookFailure(message) {
    if (missingEnv.length > 0) {
        return "missing_credential_env";
    }
    if (report.hostMode === "local") {
        return "local_host_limitation";
    }
    if (/test payment method fixtures|cannot run with an sk_live_ key/i.test(message)) {
        return "invalid_live_test_fixture_mix";
    }
    if (/should|expected|missing row|not observed|timed out/i.test(message)) {
        return "external_service_runtime_issue";
    }
    return "external_service_runtime_issue";
}

try {
    if (missingEnv.length > 0) {
        throw new Error(`Missing required live webhook env: ${missingEnv.join(", ")}.`);
    }
    if (report.hostMode === "local") {
        throw new Error(`Live Stripe webhook proof requires a deployed HTTPS base URL, not ${baseUrl}.`);
    }
    assertSupportedStripeFixtureMode();

    const identity = createFixtureIdentity();
    const seeded = seedFixture(identity);
    const fixture = seeded.fixture;
    report.fixture = fixture;

    const webhookEndpoints = await stripeRequest("webhook_endpoints?limit=100");
    const webhookEndpoint = (webhookEndpoints.data || []).find((entry) => entry.url === stripeWebhookUrl) || null;
    report.webhookEndpoint = webhookEndpoint
        ? {
              id: webhookEndpoint.id,
              status: webhookEndpoint.status || null,
              enabledEvents: webhookEndpoint.enabled_events || [],
          }
        : null;

    if (!webhookEndpoint) {
        throw new Error(`No Stripe webhook endpoint matched ${stripeWebhookUrl}.`);
    }

    const attachedPaymentMethod = await stripeRequest("payment_methods/pm_card_visa/attach", {
        method: "POST",
        payload: {
            customer: fixture.stripeCustomerId,
        },
    });

    await stripeRequest(`customers/${fixture.stripeCustomerId}`, {
        method: "POST",
        payload: {
            invoice_settings: {
                default_payment_method: attachedPaymentMethod.id,
            },
        },
    });

    const product = await stripeRequest("products", {
        method: "POST",
        payload: {
            name: `Platform webhook audit ${runLabel}`,
            metadata: {
                source: "gauset_platform_cert",
                fixture_studio_id: fixture.studioId,
            },
        },
    });
    const price = await stripeRequest("prices", {
        method: "POST",
        payload: {
            currency: "usd",
            unit_amount: 12900,
            recurring: {
                interval: "month",
            },
            product: product.id,
        },
    });

    const startedAtIso = new Date().toISOString();
    const startedAtUnix = Math.floor(Date.now() / 1000) - 5;
    const subscription = await stripeRequest("subscriptions", {
        method: "POST",
        payload: {
            customer: fixture.stripeCustomerId,
            collection_method: "charge_automatically",
            items: [{ price: price.id }],
            metadata: {
                plan_code: "studio_monthly",
                fixture_studio_id: fixture.studioId,
            },
            expand: ["latest_invoice.payment_intent"],
        },
    });
    createdSubscriptionId = subscription.id;

    const latestInvoiceId =
        typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id || null;
    const latestPaymentIntentId =
        typeof subscription.latest_invoice?.payment_intent === "string"
            ? subscription.latest_invoice.payment_intent
            : subscription.latest_invoice?.payment_intent?.id || null;

    report.stripeObjects = {
        productId: product.id,
        priceId: price.id,
        customerId: fixture.stripeCustomerId,
        subscriptionId: subscription.id,
        latestInvoiceId,
        latestPaymentIntentId,
    };

    const waited = await waitFor("Stripe webhook delivery into Supabase", async () => {
        const [subscriptionRows, invoiceRows, paymentRows, auditRows, recentEvents] = await Promise.all([
            restSelect("subscriptions", {
                provider_subscription_id: `eq.${subscription.id}`,
                limit: "1",
            }),
            latestInvoiceId
                ? restSelect("invoices", {
                      provider_invoice_id: `eq.${latestInvoiceId}`,
                      limit: "1",
                  })
                : Promise.resolve([]),
            latestPaymentIntentId
                ? restSelect("payments", {
                      provider_payment_intent_id: `eq.${latestPaymentIntentId}`,
                      limit: "1",
                  })
                : Promise.resolve([]),
            restSelect(
                "audit_events",
                {
                    target_type: "eq.billing.webhook",
                    created_at: `gte.${startedAtIso}`,
                    order: "created_at.desc",
                    limit: "30",
                },
                "id,target_id,event_type,created_at,summary",
            ),
            stripeRequest(`events?limit=100&created[gte]=${startedAtUnix}`),
        ]);

        const relevantStripeEvents = (recentEvents.data || []).filter((event) => {
            const objectId = extractStripeEventObjectId(event);
            return (
                objectId === subscription.id ||
                objectId === latestInvoiceId ||
                objectId === latestPaymentIntentId ||
                event?.data?.object?.customer === fixture.stripeCustomerId
            );
        });
        const relevantEventIds = new Set(relevantStripeEvents.map((event) => event.id));
        const matchingAuditEvents = (auditRows || []).filter((row) => relevantEventIds.has(row.target_id));

        const done = Boolean(subscriptionRows[0] && invoiceRows[0] && paymentRows[0] && matchingAuditEvents.length > 0);
        return {
            done,
            subscriptionRow: subscriptionRows[0] || null,
            invoiceRow: invoiceRows[0] || null,
            paymentRow: paymentRows[0] || null,
            relevantStripeEvents: relevantStripeEvents.map((event) => ({
                id: event.id,
                type: event.type,
                objectId: extractStripeEventObjectId(event),
                created: event.created,
            })),
            matchingAuditEvents,
        };
    });

    report.checks = waited;
    report.pass = true;
} catch (error) {
    report.error = error instanceof Error ? error.message : "Live Stripe webhook delivery certification failed.";
    report.failureCategory = classifyWebhookFailure(report.error);
    process.exitCode = 1;
} finally {
    if (createdSubscriptionId) {
        try {
            await stripeRequest(`subscriptions/${createdSubscriptionId}`, {
                method: "DELETE",
            });
            report.cleanup.subscriptionCanceled = true;
        } catch (error) {
            report.cleanup.errors.push(error instanceof Error ? error.message : "Unable to cancel the live webhook audit subscription.");
        }
    }

    report.completedAt = new Date().toISOString();
    if (reportPath) {
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));
}
