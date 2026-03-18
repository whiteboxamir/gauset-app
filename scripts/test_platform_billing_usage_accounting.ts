import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-test-key";

const { syncUsageEventFromJobPayload } = await import("../src/server/billing/usage.ts");

type TableRow = Record<string, unknown>;
type TableName = "usage_events" | "credit_ledger";

const studioId = randomUUID();
const userId = randomUUID();
const tables: Record<TableName, TableRow[]> = {
    usage_events: [],
    credit_ledger: [],
};

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
    const nextRow = {
        ...(existingIndex >= 0 ? rows[existingIndex] : {}),
        ...payload,
        id: String((existingIndex >= 0 ? rows[existingIndex].id : payload.id) ?? randomUUID()),
    };

    if (existingIndex >= 0) {
        rows[existingIndex] = nextRow;
    } else {
        rows.push(nextRow);
    }

    return [nextRow];
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();

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
        const matching = applyFilters(tables[table], url.searchParams);
        matching.forEach((row) => {
            const index = tables[table].findIndex((candidate) => candidate.id === row.id);
            tables[table][index] = {
                ...tables[table][index],
                ...payload,
            };
        });
        return jsonResponse(matching);
    }

    return jsonResponse({ message: `Unsupported method ${method}` }, 405);
}) as typeof fetch;

const completedJob = {
    id: "genimg_usage_test",
    type: "generated_image",
    status: "completed",
    studio_id: studioId,
    user_id: userId,
    provider: "openai",
    model: "gpt-image-1",
    prompt: "Scout a neon hallway.",
    created_at: "2026-03-15T10:00:00Z",
    updated_at: "2026-03-15T10:00:05Z",
    result: {
        images: [
            {
                image_id: "img_usage_test_1",
            },
        ],
    },
};

const firstSync = await syncUsageEventFromJobPayload({
    job: completedJob,
    studioId,
    userId,
});
assert.equal(firstSync.skippedReason, null);
assert.equal(firstSync.usageEventCreated, true);
assert.equal(firstSync.debitCreated, true);
assert.equal(tables.usage_events.length, 1);
assert.equal(tables.credit_ledger.length, 1);
assert.equal(tables.credit_ledger[0]?.entry_type, "usage");
assert.equal(tables.credit_ledger[0]?.amount, -1);
assert.equal(tables.credit_ledger[0]?.balance_after, -1);
assert.deepEqual(tables.usage_events[0]?.result_ids, {
    imageIds: ["img_usage_test_1"],
});

const secondSync = await syncUsageEventFromJobPayload({
    job: {
        ...completedJob,
        updated_at: "2026-03-15T10:00:10Z",
    },
    studioId,
    userId,
});
assert.equal(secondSync.skippedReason, null);
assert.equal(secondSync.usageEventCreated, false);
assert.equal(secondSync.debitCreated, false);
assert.equal(tables.usage_events.length, 1);
assert.equal(tables.credit_ledger.length, 1);

const skippedPending = await syncUsageEventFromJobPayload({
    job: {
        ...completedJob,
        id: "genimg_pending_test",
        status: "processing",
    },
    studioId,
    userId,
});
assert.equal(skippedPending.skippedReason, "job not completed");

console.log("Platform billing usage accounting checks passed.");
