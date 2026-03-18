import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-test-key";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_platform_mock";
process.env.GAUSET_BILLING_SYNC_MVP_BACKEND_URL = process.env.GAUSET_BILLING_SYNC_MVP_BACKEND_URL || "https://backend.example.com";

const { reconcileStripeBilling } = await import("../src/server/billing/reconcile.ts");

type TableRow = Record<string, unknown>;
type TableName =
    | "plans"
    | "billing_customers"
    | "subscriptions"
    | "invoices"
    | "payments"
    | "refunds"
    | "usage_events"
    | "credit_ledger";

const studioId = randomUUID();
const userId = randomUUID();
const monthlyPlanId = randomUUID();
const yearlyPlanId = randomUUID();
const tables: Record<TableName, TableRow[]> = {
    plans: [
        {
            id: monthlyPlanId,
            code: "studio_monthly",
            name: "Studio Monthly",
            interval: "month",
            price_cents: 24900,
            currency: "USD",
            monthly_credit_limit: 3000,
        },
        {
            id: yearlyPlanId,
            code: "studio_yearly",
            name: "Studio Yearly",
            interval: "year",
            price_cents: 238800,
            currency: "USD",
            monthly_credit_limit: 4800,
        },
    ],
    billing_customers: [
        {
            id: randomUUID(),
            studio_id: studioId,
            provider_customer_id: "cus_reconcile_platform",
            default_payment_method_id: null,
        },
    ],
    subscriptions: [],
    invoices: [],
    payments: [],
    refunds: [],
    usage_events: [],
    credit_ledger: [],
};

let autoTimestampCounter = 0;

function nextTimestamp() {
    const base = Date.UTC(2026, 2, 15, 0, 0, 0, 0);
    return new Date(base + autoTimestampCounter++).toISOString();
}

function jsonResponse(payload: unknown, status = 200) {
    return new Response(payload === null ? null : JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

function matchesFilter(value: unknown, filter: string) {
    if (filter.startsWith("eq.")) {
        return String(value ?? "") === filter.slice(3);
    }
    if (filter.startsWith("in.(") && filter.endsWith(")")) {
        const expected = filter
            .slice(4, -1)
            .split(",")
            .map((entry) => entry.trim());
        return expected.includes(String(value ?? ""));
    }
    return true;
}

function applyFilters(rows: TableRow[], params: URLSearchParams) {
    let filtered = rows.slice();

    for (const [key, value] of params.entries()) {
        if (key === "select" || key === "order" || key === "limit" || key === "on_conflict") {
            continue;
        }
        filtered = filtered.filter((row) => matchesFilter(row[key], value));
    }

    const limit = Number(params.get("limit") ?? "");
    if (Number.isFinite(limit) && limit > 0) {
        filtered = filtered.slice(0, limit);
    }

    return filtered;
}

function upsertRows(table: TableName, payload: TableRow, onConflict: string | null) {
    const rows = tables[table];
    const conflictKey = onConflict?.trim() || null;
    const existingIndex =
        conflictKey === null ? -1 : rows.findIndex((row) => String(row[conflictKey] ?? "") === String(payload[conflictKey] ?? ""));
    const createdAt = (existingIndex >= 0 ? rows[existingIndex].created_at : payload.created_at) ?? nextTimestamp();
    const updatedAt = payload.updated_at ?? (existingIndex >= 0 ? rows[existingIndex].updated_at : createdAt) ?? createdAt;
    const nextRow = {
        ...(existingIndex >= 0 ? rows[existingIndex] : {}),
        ...payload,
        id: String((existingIndex >= 0 ? rows[existingIndex].id : payload.id) ?? randomUUID()),
        created_at: createdAt,
        updated_at: updatedAt,
    };

    if (existingIndex >= 0) {
        rows[existingIndex] = nextRow;
    } else {
        rows.push(nextRow);
    }

    return [nextRow];
}

function patchRows(table: TableName, payload: TableRow, params: URLSearchParams) {
    const rows = tables[table];
    const matching = applyFilters(rows, params);
    matching.forEach((row) => {
        const index = rows.findIndex((candidate) => candidate.id === row.id);
        rows[index] = {
            ...rows[index],
            ...payload,
        };
    });
    return matching.map((row) => rows.find((candidate) => candidate.id === row.id));
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.origin === "https://api.stripe.com") {
        if (url.pathname === "/v1/subscriptions" && method === "GET" && url.searchParams.get("customer") === "cus_reconcile_platform") {
            return jsonResponse({
                data: [
                    {
                        id: "sub_reconcile_platform",
                        customer: "cus_reconcile_platform",
                        status: "active",
                        items: {
                            data: [
                                {
                                    quantity: 3,
                                    price: {
                                        currency: "usd",
                                        unit_amount: 24900,
                                        recurring: {
                                            interval: "month",
                                        },
                                    },
                                },
                            ],
                        },
                        current_period_start: 1773427200,
                        current_period_end: 1776105600,
                    },
                ],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/invoices" && method === "GET" && url.searchParams.get("customer") === "cus_reconcile_platform") {
            return jsonResponse({
                data: [
                    {
                        id: "in_reconcile_paid",
                        customer: "cus_reconcile_platform",
                        subscription: "sub_reconcile_platform",
                        status: "paid",
                        number: "INV-RECON-PAID",
                        currency: "usd",
                        subtotal: 24900,
                        total: 24900,
                        amount_paid: 24900,
                        amount_remaining: 0,
                        created: 1773427200,
                        status_transitions: {
                            paid_at: 1773427200,
                        },
                    },
                    {
                        id: "in_reconcile_failed",
                        customer: "cus_reconcile_platform",
                        subscription: "sub_reconcile_platform",
                        status: "open",
                        number: "INV-RECON-FAILED",
                        currency: "usd",
                        subtotal: 24900,
                        total: 24900,
                        amount_paid: 0,
                        amount_remaining: 24900,
                        created: 1773513600,
                    },
                ],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/payment_intents" && method === "GET" && url.searchParams.get("customer") === "cus_reconcile_platform") {
            return jsonResponse({
                data: [
                    {
                        id: "pi_reconcile_paid",
                        customer: "cus_reconcile_platform",
                        invoice: "in_reconcile_paid",
                        status: "succeeded",
                        amount: 24900,
                        currency: "usd",
                        created: 1773427200,
                        latest_charge: "ch_reconcile_paid",
                        payment_method: "pm_reconcile_paid",
                    },
                    {
                        id: "pi_reconcile_failed",
                        customer: "cus_reconcile_platform",
                        invoice: "in_reconcile_failed",
                        status: "requires_payment_method",
                        amount: 24900,
                        currency: "usd",
                        created: 1773513600,
                        latest_charge: null,
                        payment_method: "pm_reconcile_failed",
                    },
                ],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/refunds" && method === "GET" && url.searchParams.get("payment_intent") === "pi_reconcile_paid") {
            return jsonResponse({
                data: [
                    {
                        id: "re_reconcile_paid",
                        payment_intent: "pi_reconcile_paid",
                        charge: "ch_reconcile_paid",
                        amount: 24900,
                        currency: "usd",
                        status: "succeeded",
                        reason: "requested_by_customer",
                        created: 1773600000,
                        metadata: {
                            usage_job_ids: "genimg_reconcile_job",
                        },
                    },
                ],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/refunds" && method === "GET" && url.searchParams.get("payment_intent") === "pi_reconcile_failed") {
            return jsonResponse({
                data: [],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/payment_intents/pi_reconcile_paid" && method === "GET") {
            return jsonResponse({
                id: "pi_reconcile_paid",
                customer: "cus_reconcile_platform",
                invoice: "in_reconcile_paid",
                status: "succeeded",
                amount: 24900,
                currency: "usd",
                created: 1773427200,
                latest_charge: {
                    id: "ch_reconcile_paid",
                    created: 1773427200,
                    payment_method_details: {
                        card: {
                            brand: "visa",
                            last4: "4242",
                        },
                    },
                },
                payment_method: {
                    id: "pm_reconcile_paid",
                    type: "card",
                    card: {
                        brand: "visa",
                        last4: "4242",
                    },
                },
            });
        }

        if (url.pathname === "/v1/payment_intents/pi_reconcile_failed" && method === "GET") {
            return jsonResponse({
                id: "pi_reconcile_failed",
                customer: "cus_reconcile_platform",
                invoice: "in_reconcile_failed",
                status: "requires_payment_method",
                amount: 24900,
                currency: "usd",
                created: 1773513600,
                latest_charge: null,
                payment_method: {
                    id: "pm_reconcile_failed",
                    type: "card",
                    card: {
                        brand: "mastercard",
                        last4: "4444",
                    },
                },
            });
        }

        throw new Error(`Unexpected Stripe request: ${method} ${url.toString()}`);
    }

    if (url.origin === "https://backend.example.com" && url.pathname === "/jobs" && method === "GET") {
        assert.equal(url.searchParams.get("studio_id"), studioId);
        assert.equal(url.searchParams.get("status"), "completed");
        assert.equal(url.searchParams.get("types"), "generated_image,environment,asset");
        return jsonResponse({
            jobs: [
                {
                    id: "genimg_reconcile_job",
                    type: "generated_image",
                    status: "completed",
                    studio_id: studioId,
                    user_id: userId,
                    created_at: "2026-03-14T00:00:00Z",
                    updated_at: "2026-03-14T00:05:00Z",
                    provider: "openai",
                    model: "gpt-image-1",
                    prompt: "Scout the foyer lighting.",
                    result: {
                        images: [
                            {
                                image_id: "img_generated_reconcile_1",
                            },
                        ],
                    },
                },
                {
                    id: "asset_missing_user_job",
                    type: "asset",
                    status: "completed",
                    studio_id: studioId,
                    user_id: null,
                    created_at: "2026-03-14T00:10:00Z",
                    updated_at: "2026-03-14T00:10:00Z",
                    result: {
                        asset_id: "asset_missing_user_job",
                    },
                },
            ],
            next_offset: null,
            total_count: 2,
        });
    }

    if (!url.pathname.startsWith("/rest/v1/")) {
        throw new Error(`Unexpected fetch target: ${url.toString()}`);
    }

    const table = url.pathname.slice("/rest/v1/".length) as TableName;
    if (!(table in tables)) {
        return jsonResponse({ message: `Unknown table ${table}` }, 404);
    }

    if (method === "GET") {
        return jsonResponse(applyFilters(tables[table], url.searchParams));
    }

    if (method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as TableRow;
        return jsonResponse(upsertRows(table, payload, url.searchParams.get("on_conflict")));
    }

    if (method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as TableRow;
        return jsonResponse(patchRows(table, payload, url.searchParams));
    }

    return jsonResponse({ message: `Unsupported method ${method}` }, 405);
}) as typeof fetch;

const firstRun = await reconcileStripeBilling({
    studioId,
});

assert.deepEqual(firstRun.customerIds, ["cus_reconcile_platform"]);
assert.equal(firstRun.processed.subscriptions, 1);
assert.equal(firstRun.processed.invoices, 2);
assert.equal(firstRun.processed.payments, 2);
assert.equal(firstRun.processed.refunds, 1);
assert.equal(firstRun.processed.usageEvents, 1);
assert.equal(firstRun.processed.usageDebits, 1);
assert.equal(firstRun.processed.grantReversals, 1);
assert.equal(firstRun.processed.refundRestorations, 1);
assert.equal(firstRun.processed.preMetadataJobsSkipped, 1);
assert.equal(tables.subscriptions.length, 1);
assert.equal(tables.invoices.length, 2);
assert.equal(tables.payments.length, 2);
assert.equal(tables.refunds.length, 1);
assert.equal(tables.usage_events.length, 1);
assert.equal(tables.credit_ledger.length, 4);
assert.equal(tables.subscriptions[0]?.plan_id, monthlyPlanId);
assert.equal(tables.payments[0]?.payment_method_last4, "4242");
assert.equal(tables.payments[0]?.status, "refunded");
assert.equal(tables.payments[1]?.status, "failed");
assert.equal(tables.refunds[0]?.status, "succeeded");
assert.equal(tables.credit_ledger[0]?.entry_type, "grant");
assert.equal(tables.credit_ledger[1]?.entry_type, "usage");
assert.equal(tables.credit_ledger[2]?.entry_type, "reversal");
assert.equal(tables.credit_ledger[3]?.entry_type, "refund");
assert.equal(tables.usage_events[0]?.job_id, "genimg_reconcile_job");
assert.equal(tables.usage_events[0]?.reversed_by_refund_id, tables.refunds[0]?.id);
assert.deepEqual(firstRun.skipped.usageBackfillReasons, []);

const countsAfterFirstRun = {
    subscriptions: tables.subscriptions.length,
    invoices: tables.invoices.length,
    payments: tables.payments.length,
    refunds: tables.refunds.length,
    usageEvents: tables.usage_events.length,
    creditLedger: tables.credit_ledger.length,
};

const secondRun = await reconcileStripeBilling({
    studioId,
});

assert.deepEqual(secondRun.customerIds, ["cus_reconcile_platform"]);
assert.deepEqual(
    {
        subscriptions: tables.subscriptions.length,
        invoices: tables.invoices.length,
        payments: tables.payments.length,
        refunds: tables.refunds.length,
        usageEvents: tables.usage_events.length,
        creditLedger: tables.credit_ledger.length,
    },
    countsAfterFirstRun,
);
assert.equal(tables.credit_ledger[0]?.balance_after, 3000);
assert.equal(tables.credit_ledger[1]?.balance_after, 2999);
assert.equal(secondRun.processed.usageDebits, 0);
assert.equal(secondRun.processed.grantReversals, 0);
assert.equal(secondRun.processed.refundRestorations, 0);

console.log("Platform billing reconciliation checks passed.");
