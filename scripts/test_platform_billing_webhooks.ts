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
const planId = randomUUID();
const tables: Record<TableName, TableRow[]> = {
    plans: [
        {
            id: planId,
            code: "studio_yearly",
            name: "Studio Yearly",
            interval: "year",
            price_cents: 238800,
            currency: "USD",
            monthly_credit_limit: 4800,
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
            job_id: "scene_preview_job",
            job_type: "environment",
            job_status: "completed",
            image_id: "img_preview_1",
            debit_amount: 1,
            result_ids: {
                sceneId: "scene_preview_job",
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

const stripeRefund = {
    id: "re_platform_fixture",
    payment_intent: "pi_platform_fixture",
    charge: "ch_platform_fixture",
    amount: 238800,
    currency: "usd",
    status: "succeeded",
    reason: "requested_by_customer",
    created: 1773513600,
    metadata: {
        usage_job_ids: "scene_preview_job",
    },
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
        const candidates = filter
            .slice(4, -1)
            .split(",")
            .map((entry) => entry.trim());
        return candidates.includes(String(value ?? ""));
    }
    return true;
}

function applyFilters(rows: TableRow[], params: URLSearchParams) {
    let filtered = rows.slice();

    for (const [key, value] of params.entries()) {
        if (key === "select" || key === "order" || key === "on_conflict" || key === "limit") {
            continue;
        }

        filtered = filtered.filter((row) => matchesFilter(row[key], value));
    }

    const [orderField, orderDirection] = String(params.get("order") ?? "").split(".");
    if (orderField) {
        filtered.sort((left, right) => {
            const leftValue = left[orderField];
            const rightValue = right[orderField];
            if (leftValue === rightValue) return 0;
            if (leftValue === null || leftValue === undefined) return 1;
            if (rightValue === null || rightValue === undefined) return -1;
            if (String(leftValue) < String(rightValue)) {
                return orderDirection === "desc" ? 1 : -1;
            }
            return orderDirection === "desc" ? -1 : 1;
        });
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
        if (url.pathname === "/v1/payment_intents/pi_platform_fixture" && method === "GET") {
            return jsonResponse({
                id: "pi_platform_fixture",
                customer: "cus_platform_fixture",
                invoice: "in_platform_fixture",
                status: "succeeded",
                amount: 238800,
                currency: "usd",
                created: 1773427200,
                latest_charge: {
                    id: "ch_platform_fixture",
                    created: 1773427200,
                    payment_method_details: {
                        card: {
                            brand: "visa",
                            last4: "4242",
                        },
                    },
                },
                payment_method: {
                    id: "pm_platform_fixture",
                    type: "card",
                    card: {
                        brand: "visa",
                        last4: "4242",
                    },
                },
            });
        }

        if (url.pathname === "/v1/refunds" && method === "GET" && url.searchParams.get("charge") === "ch_platform_fixture") {
            return jsonResponse({
                data: [stripeRefund],
                has_more: false,
            });
        }

        if (url.pathname === "/v1/subscriptions/sub_platform_fixture" && method === "GET") {
            return jsonResponse({
                id: "sub_platform_fixture",
                customer: "cus_platform_fixture",
                status: "active",
                metadata: {
                    plan_code: "studio_yearly",
                },
                items: {
                    data: [
                        {
                            quantity: 3,
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
        }

        if (url.pathname === "/v1/invoices/in_platform_fixture" && method === "GET") {
            return jsonResponse({
                id: "in_platform_fixture",
                customer: "cus_platform_fixture",
                subscription: "sub_platform_fixture",
                status: "paid",
                number: "INV-PLATFORM-001",
                currency: "usd",
                subtotal: 238800,
                tax: 0,
                total: 238800,
                amount_paid: 238800,
                amount_remaining: 0,
                hosted_invoice_url: "https://billing.example.com/invoice/in_platform_fixture",
                created: 1773427200,
                status_transitions: {
                    paid_at: 1773427200,
                },
            });
        }

        throw new Error(`Unexpected Stripe request: ${method} ${url.toString()}`);
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

await assert.rejects(
    handleStripeWebhookRequest({
        rawBody: "{}",
        signatureHeader: "t=1,v1=invalid",
    }),
    /timestamp|signature/i,
);

const checkoutSessionEvent = createSignedEvent("checkout.session.completed", {
    id: "cs_test_platform",
    customer: "cus_platform_fixture",
    client_reference_id: studioId,
    metadata: {
        studio_id: studioId,
        plan_code: "studio_yearly",
    },
});

const checkoutResult = await handleStripeWebhookRequest({
    rawBody: checkoutSessionEvent.payload,
    signatureHeader: checkoutSessionEvent.signatureHeader,
});
assert.deepEqual(checkoutResult.affectedStudioIds, [studioId]);
assert.equal(tables.billing_customers[0]?.provider_customer_id, "cus_platform_fixture");

const subscriptionEvent = createSignedEvent("customer.subscription.updated", {
    id: "sub_platform_fixture",
    customer: "cus_platform_fixture",
    status: "active",
    metadata: {
        plan_code: "studio_yearly",
    },
    items: {
        data: [
            {
                quantity: 3,
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

const subscriptionResult = await handleStripeWebhookRequest({
    rawBody: subscriptionEvent.payload,
    signatureHeader: subscriptionEvent.signatureHeader,
});
assert.deepEqual(subscriptionResult.affectedStudioIds, [studioId]);
assert.equal(tables.subscriptions[0]?.plan_id, planId);
assert.equal(tables.subscriptions[0]?.seat_count, 3);
assert.equal(tables.subscriptions[0]?.billing_customer_id, tables.billing_customers[0]?.id);

const invoiceEvent = createSignedEvent("invoice.paid", {
    id: "in_platform_fixture",
    customer: "cus_platform_fixture",
    subscription: "sub_platform_fixture",
    status: "paid",
    number: "INV-PLATFORM-001",
    currency: "usd",
    subtotal: 238800,
    tax: 0,
    total: 238800,
    amount_paid: 238800,
    amount_remaining: 0,
    hosted_invoice_url: "https://billing.example.com/invoice/in_platform_fixture",
    created: 1773427200,
    status_transitions: {
        paid_at: 1773427200,
    },
});

const invoiceResult = await handleStripeWebhookRequest({
    rawBody: invoiceEvent.payload,
    signatureHeader: invoiceEvent.signatureHeader,
});
assert.deepEqual(invoiceResult.affectedStudioIds, [studioId]);
assert.equal(tables.invoices[0]?.provider_invoice_id, "in_platform_fixture");
assert.equal(tables.invoices[0]?.studio_id, studioId);
assert.equal(tables.credit_ledger[0]?.entry_type, "grant");
assert.equal(tables.credit_ledger[0]?.amount, 4800);
assert.equal(tables.credit_ledger[0]?.balance_after, 4800);

const paymentIntentEvent = createSignedEvent("payment_intent.succeeded", {
    id: "pi_platform_fixture",
    customer: "cus_platform_fixture",
    invoice: "in_platform_fixture",
    status: "succeeded",
    amount: 238800,
    currency: "usd",
    created: 1773427200,
    latest_charge: "ch_platform_fixture",
    payment_method: "pm_platform_fixture",
});

const paymentIntentResult = await handleStripeWebhookRequest({
    rawBody: paymentIntentEvent.payload,
    signatureHeader: paymentIntentEvent.signatureHeader,
});
assert.deepEqual(paymentIntentResult.affectedStudioIds, [studioId]);
assert.equal(tables.payments[0]?.provider_payment_intent_id, "pi_platform_fixture");
assert.equal(tables.payments[0]?.invoice_id, tables.invoices[0]?.id);
assert.equal(tables.payments[0]?.payment_method_last4, "4242");
assert.equal(tables.payments[0]?.payment_method_brand, "visa");
tables.credit_ledger.push({
    id: randomUUID(),
    studio_id: studioId,
    user_id: userId,
    entry_type: "usage",
    amount: -1,
    balance_after: 4799,
    reference_type: "usage_event",
    reference_id: usageEventId,
    note: "Seeded usage debit before refund.",
    created_by_user_id: null,
    created_at: nextTimestamp(),
});

const refundEvent = createSignedEvent("charge.refunded", {
    id: "ch_platform_fixture",
    payment_intent: "pi_platform_fixture",
    refunds: {
        data: [],
    },
});

const refundResult = await handleStripeWebhookRequest({
    rawBody: refundEvent.payload,
    signatureHeader: refundEvent.signatureHeader,
});
assert.deepEqual(refundResult.affectedStudioIds, [studioId]);
assert.equal(tables.refunds[0]?.provider_refund_id, "re_platform_fixture");
assert.equal(tables.refunds[0]?.payment_id, tables.payments[0]?.id);
assert.equal(tables.refunds[0]?.invoice_id, tables.invoices[0]?.id);
assert.equal(tables.refunds[0]?.subscription_id, tables.subscriptions[0]?.id);
assert.equal(tables.refunds[0]?.studio_id, studioId);
assert.equal(tables.payments[0]?.status, "refunded");
assert.equal(tables.credit_ledger[2]?.entry_type, "reversal");
assert.equal(tables.credit_ledger[2]?.amount, -4800);
assert.equal(tables.credit_ledger[2]?.balance_after, -1);
assert.equal(tables.credit_ledger[3]?.entry_type, "refund");
assert.equal(tables.credit_ledger[3]?.amount, 1);
assert.equal(tables.credit_ledger[3]?.balance_after, 0);
assert.equal(tables.usage_events[0]?.reversed_by_refund_id, tables.refunds[0]?.id);
assert.equal(tables.audit_events.length, 5);

console.log("Platform billing webhook checks passed.");
