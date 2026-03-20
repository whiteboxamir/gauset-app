import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-test-key";
delete process.env.SUPABASE_URL;

type TableName = "profiles" | "studio_invitations" | "studio_memberships" | "waitlist";
type TableRow = Record<string, unknown>;

const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const tables: Record<TableName, TableRow[]> = {
    profiles: [
        {
            id: "profile-active",
            email: "member@studio.com",
            onboarding_state: "active",
        },
        {
            id: "profile-suspended",
            email: "suspended@studio.com",
            onboarding_state: "suspended",
        },
    ],
    studio_invitations: [
        {
            id: "invite-active",
            email: "invited@studio.com",
            status: "pending",
            expires_at: futureIso,
        },
        {
            id: "invite-expired",
            email: "expired@studio.com",
            status: "pending",
            expires_at: pastIso,
        },
    ],
    studio_memberships: [
        {
            id: "membership-active",
            user_id: "profile-active",
            status: "active",
        },
    ],
    waitlist: [
        {
            email: "waitlist@studio.com",
        },
    ],
};

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

function applyFilters(rows: TableRow[], params: URLSearchParams) {
    let filtered = rows.slice();

    for (const [key, value] of params.entries()) {
        if (key === "select" || key === "limit") {
            continue;
        }

        if (value.startsWith("eq.")) {
            const expected = value.slice(3).toLowerCase();
            filtered = filtered.filter((row) => String(row[key] ?? "").toLowerCase() === expected);
            continue;
        }

        if (value.startsWith("ilike.")) {
            const expected = value.slice(6).toLowerCase();
            filtered = filtered.filter((row) => String(row[key] ?? "").toLowerCase() === expected);
        }
    }

    const limit = Number(params.get("limit") ?? "");
    if (Number.isFinite(limit) && limit > 0) {
        filtered = filtered.slice(0, limit);
    }

    return filtered;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.origin, new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin);
    if (!url.pathname.startsWith("/rest/v1/")) {
        throw new Error(`Unexpected fetch target: ${url.toString()}`);
    }

    const table = url.pathname.slice("/rest/v1/".length) as keyof typeof tables;
    if (!(table in tables)) {
        return jsonResponse({ message: `Unknown table ${table}` }, 404);
    }

    const request = input instanceof Request ? input : null;
    const method = request?.method ?? init?.method ?? "GET";

    if (method === "POST") {
        const rawBody =
            typeof init?.body === "string"
                ? init.body
                : request
                  ? await request.text()
                  : "";
        const payload = rawBody ? (JSON.parse(rawBody) as TableRow) : {};
        const normalizedEmail = String(payload.email ?? "").toLowerCase();

        if (normalizedEmail && tables[table].some((row) => String(row.email ?? "").toLowerCase() === normalizedEmail)) {
            return jsonResponse({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
        }

        tables[table].push(payload);
        return jsonResponse([payload], 201);
    }

    return jsonResponse(applyFilters(tables[table], url.searchParams));
}) as typeof fetch;

const { supabaseInsert } = await import("../src/lib/supabase.ts");
const { hasLaunchAccessForEmail } = await import("../src/server/auth/invitations.ts");

const insertResult = await supabaseInsert("waitlist", { email: "new@studio.com" });
assert.equal(insertResult.error, null);
assert.equal(
    tables.waitlist.some((row) => row.email === "new@studio.com"),
    true,
);

const duplicateInsert = await supabaseInsert("waitlist", { email: "waitlist@studio.com" });
assert.equal(duplicateInsert.error?.code, "23505");

const waitlistAllowed = await hasLaunchAccessForEmail("WAITLIST@studio.com");
assert.equal(waitlistAllowed.allowed, true);
assert.equal(waitlistAllowed.hasWaitlistEntry, true);
assert.equal(waitlistAllowed.hasActiveInvitation, false);

const inviteAllowed = await hasLaunchAccessForEmail("invited@studio.com");
assert.equal(inviteAllowed.allowed, true);
assert.equal(inviteAllowed.hasWaitlistEntry, false);
assert.equal(inviteAllowed.hasActiveInvitation, true);

const memberAllowed = await hasLaunchAccessForEmail("member@studio.com");
assert.equal(memberAllowed.allowed, true);
assert.equal(memberAllowed.hasActiveMembership, true);
assert.equal(memberAllowed.hasEstablishedAccess, true);

const expiredInvite = await hasLaunchAccessForEmail("expired@studio.com");
assert.equal(expiredInvite.allowed, false);
assert.equal(expiredInvite.hasActiveInvitation, false);

const suspendedProfile = await hasLaunchAccessForEmail("suspended@studio.com");
assert.equal(suspendedProfile.allowed, false);
assert.equal(suspendedProfile.isRestricted, true);

const blockedEmail = await hasLaunchAccessForEmail("blocked@studio.com");
assert.equal(blockedEmail.allowed, false);
assert.equal(blockedEmail.hasWaitlistEntry, false);
assert.equal(blockedEmail.hasActiveInvitation, false);

console.log("Launch registration gate checks passed.");
