import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-test-key";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_platform_mock";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_platform_test";

const { handleStripeWebhookRequest } = await import("../src/server/billing/webhooks.ts");

type TableRow = Record<string, unknown>;
type TableName =
    | "plans"
    | "billing_customers"
    | "subscriptions"
    | "invoices"
    | "payments"
    | "refunds"
    | "usage_events"
    | "credit_ledger"
    | "audit_events";

const studioId = randomUUID();
const userId = randomUUID();
const usageEventId = randomUUID();
const yearlyPlanId = randomUUID();
const monthlyPlanId = randomUUID();
const tables: Record<TableName, TableRow[]> = {
    plans: [
        {
            id: yearlyPlanId,
            code: "studio_yearly",
            name: "Studio Yearly",
            interval: "year",
            price_cents: 238800,
            currency: "USD",
            monthly_credit_limit: 4800,
        },
        {
            id: monthlyPlanId,
            code: "studio_monthly",
            name: "Studio Monthly",
            interval: "month",
            price_cents: 24900,
            currency: "USD",
            monthly_credit_limit: 3000,
        },
    ],
    billing_customers: [],
    subscriptions: [],
    invoices: [],
    payments: [],
    refunds: [],
    usage_events: [
        {
            id: usageEventId,
            studio_id: studioId,
            user_id: userId,
            job_id: "asset_refund_job",
            job_type: "asset",
            job_status: "completed",
            image_id: "img_asset_1",
            debit_amount: 1,
            result_ids: {
                assetId: "asset_refund_job",
            },
            metadata: {},
            reversed_by_refund_id: null,
            reversed_at: null,
            created_at: "2026-03-14T00:00:00Z",
            updated_at: "2026-03-14T00:00:00Z",
        },
    ],
    credit_ledger: [],
    audit_events: [],
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

function createSignedEvent(type: string, object: Record<string, unknown>) {
    const payload = JSON.stringify({
        id: `evt_${type.replace(/\./g, "_")}`,
        type,
        data: {
            object,
        },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET ?? "")
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");

    return {
        payload,
        signatureHeader: `t=${timestamp},v1=${signature}`,
    };
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.origin === "https://api.stripe.com") {
        throw new Error(`Unexpected Stripe request in unhappy-path mock: ${method} ${url.toString()}`);
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
        if (table === "audit_events") {
            const row = {
                ...payload,
                id: String(payload.id ?? randomUUID()),
            };
            tables.audit_events.push(row);
            return jsonResponse([row]);
        }

        return jsonResponse(upsertRows(table, payload, url.searchParams.get("on_conflict")));
    }

    if (method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as TableRow;
        return jsonResponse(patchRows(table, payload, url.searchParams));
    }

    return jsonResponse({ message: `Unsupported method ${method}` }, 405);
}) as typeof fetch;

async function dispatch(type: string, object: Record<string, unknown>) {
    const event = createSignedEvent(type, object);
    return handleStripeWebhookRequest({
        rawBody: event.payload,
        signatureHeader: event.signatureHeader,
    });
}

await dispatch("checkout.session.completed", {
    id: "cs_unhappy_platform",
    customer: "cus_unhappy_platform",
    client_reference_id: studioId,
    metadata: {
        studio_id: studioId,
        plan_code: "studio_yearly",
    },
});

await dispatch("customer.subscription.updated", {
    id: "sub_unhappy_platform",
    customer: "cus_unhappy_platform",
    status: "active",
    metadata: {
        plan_code: "studio_yearly",
    },
    items: {
        data: [
            {
                quantity: 4,
                price: {
                    currency: "usd",
                    unit_amount: 238800,
                    recurring: {
                        interval: "year",
                    },
                },
            },
        ],
    },
    current_period_start: 1773427200,
    current_period_end: 1804963200,
});
assert.equal(tables.subscriptions[0]?.plan_id, yearlyPlanId);
assert.equal(tables.subscriptions[0]?.status, "active");

await dispatch("customer.subscription.updated", {
    id: "sub_unhappy_platform",
    customer: "cus_unhappy_platform",
    status: "past_due",
    items: {
        data: [
            {
                quantity: 4,
                price: {
                    currency: "usd",
                    unit_amount: 238800,
                    recurring: {
                        interval: "year",
                    },
                },
            },
        ],
    },
});
assert.equal(tables.subscriptions[0]?.status, "past_due");

await dispatch("invoice.payment_failed", {
    id: "in_failed_platform",
    customer: "cus_unhappy_platform",
    subscription: "sub_unhappy_platform",
    status: "open",
    number: "INV-FAILED-001",
    currency: "usd",
    subtotal: 24900,
    total: 24900,
    amount_paid: 0,
    amount_remaining: 24900,
    created: 1773513600,
});
assert.equal(tables.invoices[0]?.provider_invoice_id, "in_failed_platform");
assert.equal(tables.invoices[0]?.status, "open");
assert.equal(tables.invoices[0]?.amount_remaining_cents, 24900);

await dispatch("payment_intent.payment_failed", {
    id: "pi_failed_platform",
    customer: "cus_unhappy_platform",
    invoice: "in_failed_platform",
    status: "requires_payment_method",
    amount: 24900,
    currency: "usd",
    created: 1773513600,
    payment_method: {
        id: "pm_failed_platform",
        type: "card",
        card: {
            brand: "mastercard",
            last4: "4444",
        },
    },
});
assert.equal(tables.payments[0]?.status, "failed");
assert.equal(tables.payments[0]?.payment_method_brand, "mastercard");
assert.equal(tables.payments[0]?.payment_method_last4, "4444");

await dispatch("customer.subscription.updated", {
    id: "sub_unhappy_platform",
    customer: "cus_unhappy_platform",
    status: "unpaid",
    items: {
        data: [
            {
                quantity: 4,
                price: {
                    currency: "usd",
                    unit_amount: 238800,
                    recurring: {
                        interval: "year",
                    },
                },
            },
        ],
    },
});
assert.equal(tables.subscriptions[0]?.status, "unpaid");

await dispatch("customer.subscription.updated", {
    id: "sub_unhappy_platform",
    customer: "cus_unhappy_platform",
    status: "active",
    items: {
        data: [
            {
                quantity: 2,
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
});
assert.equal(tables.subscriptions[0]?.plan_id, monthlyPlanId);
assert.equal(tables.subscriptions[0]?.seat_count, 2);
assert.equal(tables.subscriptions[0]?.status, "active");

await dispatch("customer.subscription.deleted", {
    id: "sub_unhappy_platform",
    customer: "cus_unhappy_platform",
    status: "canceled",
    canceled_at: 1773600000,
    items: {
        data: [
            {
                quantity: 2,
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
});
assert.equal(tables.subscriptions[0]?.status, "canceled");
assert.ok(String(tables.subscriptions[0]?.canceled_at || "").startsWith("2026-03"));

await dispatch("invoice.paid", {
    id: "in_refund_platform",
    customer: "cus_unhappy_platform",
    subscription: "sub_unhappy_platform",
    status: "paid",
    number: "INV-REFUND-001",
    currency: "usd",
    subtotal: 5000,
    total: 5000,
    amount_paid: 5000,
    amount_remaining: 0,
    created: 1773686400,
    status_transitions: {
        paid_at: 1773686400,
    },
});
assert.equal(tables.credit_ledger[0]?.entry_type, "grant");
assert.equal(tables.credit_ledger[0]?.amount, 3000);

await dispatch("payment_intent.succeeded", {
    id: "pi_refund_platform",
    customer: "cus_unhappy_platform",
    invoice: "in_refund_platform",
    status: "succeeded",
    amount: 5000,
    currency: "usd",
    created: 1773686400,
    payment_method: {
        id: "pm_refund_platform",
        type: "card",
        card: {
            brand: "visa",
            last4: "4242",
        },
    },
});
assert.equal(tables.payments[1]?.status, "succeeded");
tables.credit_ledger.push({
    id: randomUUID(),
    studio_id: studioId,
    user_id: userId,
    entry_type: "usage",
    amount: -1,
    balance_after: 2999,
    reference_type: "usage_event",
    reference_id: usageEventId,
    note: "Seeded usage debit before refund.",
    created_by_user_id: null,
    created_at: nextTimestamp(),
});

await dispatch("refund.updated", {
    id: "re_unhappy_platform",
    payment_intent: "pi_refund_platform",
    charge: "ch_refund_platform",
    amount: 5000,
    currency: "usd",
    status: "pending",
    reason: "requested_by_customer",
    created: 1773772800,
    metadata: {
        usage_job_ids: "asset_refund_job",
    },
});
assert.equal(tables.refunds[0]?.status, "pending");
assert.equal(tables.credit_ledger.length, 2);

await dispatch("refund.updated", {
    id: "re_unhappy_platform",
    payment_intent: "pi_refund_platform",
    charge: "ch_refund_platform",
    amount: 5000,
    currency: "usd",
    status: "succeeded",
    reason: "requested_by_customer",
    created: 1773772800,
    metadata: {
        usage_job_ids: "asset_refund_job",
    },
});
assert.equal(tables.refunds[0]?.status, "succeeded");
assert.equal(tables.payments[1]?.status, "refunded");
assert.equal(tables.credit_ledger[2]?.entry_type, "reversal");
assert.equal(tables.credit_ledger[2]?.amount, -3000);
assert.equal(tables.credit_ledger[3]?.entry_type, "refund");
assert.equal(tables.credit_ledger[3]?.amount, 1);
assert.equal(tables.usage_events[0]?.reversed_by_refund_id, tables.refunds[0]?.id);

console.log("Platform billing unhappy-path checks passed.");
