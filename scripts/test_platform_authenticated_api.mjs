import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset-app.vercel.app").trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const ownerEmail = (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL || process.env.GAUSET_PLATFORM_E2E_OWNER_EMAIL || "").trim().toLowerCase();
const ownerPassword = (process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD || process.env.GAUSET_PLATFORM_E2E_OWNER_PASSWORD || "").trim();
const reportPath = process.env.GAUSET_PLATFORM_AUTH_API_REPORT ? path.resolve(process.env.GAUSET_PLATFORM_AUTH_API_REPORT) : null;
const SUPABASE_JWT_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const AUTH_ACCESS_COOKIE = "gauset-access-token";
const AUTH_REFRESH_COOKIE = "gauset-refresh-token";
const AUTH_SESSION_AT_COOKIE = "gauset-session-at";
const PLATFORM_SESSION_COOKIE = "gauset-platform-session";

assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required.");
assert.ok(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
assert.ok(ownerEmail, "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL is required.");
assert.ok(ownerPassword, "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD is required.");

function isSupabaseJwtApiKey(apiKey) {
    return SUPABASE_JWT_KEY_PATTERN.test(apiKey.trim());
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

async function supabasePasswordGrant() {
    const headers = {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
    };
    if (isSupabaseJwtApiKey(supabaseAnonKey)) {
        headers.Authorization = `Bearer ${supabaseAnonKey}`;
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            email: ownerEmail,
            password: ownerPassword,
        }),
        cache: "no-store",
    });
    const payload = await parseJson(response);
    if (!response.ok || !payload?.access_token) {
        throw new Error(payload?.error_description || payload?.msg || "Unable to exchange the owner password grant.");
    }
    return payload;
}

function createAppClient(label, initialCookies = new Map()) {
    const cookieJar = new Map(initialCookies);
    const defaultHeaders = {
        "user-agent": `gauset-platform-cert-${label}`,
    };

    return {
        label,
        snapshotCookies() {
            return new Map(cookieJar);
        },
        async request(pathname, { method = "GET", body = null, headers = {}, redirect = "manual" } = {}) {
            const response = await fetch(`${baseUrl}${pathname}`, {
                method,
                redirect,
                headers: {
                    ...(body ? { "Content-Type": "application/json" } : {}),
                    ...(cookieJar.size > 0 ? { cookie: getCookieHeader(cookieJar) } : {}),
                    ...defaultHeaders,
                    ...headers,
                },
                body: body ? JSON.stringify(body) : undefined,
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

function cookieValuesFromResponse(client) {
    const snapshot = client.snapshotCookies();
    return {
        accessToken: snapshot.get(AUTH_ACCESS_COOKIE) || null,
        refreshToken: snapshot.get(AUTH_REFRESH_COOKIE) || null,
        sessionAt: snapshot.get(AUTH_SESSION_AT_COOKIE) || null,
        platformSessionId: snapshot.get(PLATFORM_SESSION_COOKIE) || null,
    };
}

function buildCookieJarFromValues(values, { includePlatformSession = true, platformSessionId = values.platformSessionId } = {}) {
    const cookieJar = new Map();
    if (values.accessToken) {
        cookieJar.set(AUTH_ACCESS_COOKIE, values.accessToken);
    }
    if (values.refreshToken) {
        cookieJar.set(AUTH_REFRESH_COOKIE, values.refreshToken);
    }
    if (values.sessionAt) {
        cookieJar.set(AUTH_SESSION_AT_COOKIE, values.sessionAt);
    }
    if (includePlatformSession && platformSessionId) {
        cookieJar.set(PLATFORM_SESSION_COOKIE, platformSessionId);
    }
    return cookieJar;
}

function sameOriginMutationHeaders() {
    return {
        origin: baseUrl,
        "sec-fetch-site": "same-origin",
    };
}

async function establishSession(client, grant) {
    const sessionEstablish = await client.request("/api/auth/session", {
        method: "PUT",
        body: {
            accessToken: grant.access_token,
            refreshToken: grant.refresh_token,
            provider: "magic_link",
        },
    });
    assert.equal(sessionEstablish.response.status, 200, `${client.label} session bootstrap should return 200.`);
}

const report = {
    baseUrl,
    executedAt: new Date().toISOString(),
    completedAt: null,
    pass: false,
    checks: {},
    cleanup: {
        invitationRevoked: false,
        revokeOthersStatus: null,
        primaryLogoutStatus: null,
        secondaryLogoutStatus: null,
        errors: [],
    },
    error: null,
};

const primary = createAppClient("primary");
const secondary = createAppClient("secondary");
let createdInvitationId = null;

try {
    const grant = await supabasePasswordGrant();
    await establishSession(primary, grant);

    const session = await primary.request("/api/auth/session");
    assert.equal(session.response.status, 200, "Authenticated session lookup should return 200.");
    assert.ok(session.payload?.session?.activeStudioId, "Seeded owner should have an active studio.");

    const protectedPages = {};
    for (const pathname of ["/app/team", "/app/billing", "/app/settings/security", "/mvp"]) {
        const page = await primary.request(pathname);
        assert.equal(page.response.status, 200, `${pathname} should be reachable for the seeded owner.`);
        protectedPages[pathname] = {
            status: page.response.status,
        };
    }

    const billing = await primary.request("/api/billing/summary");
    assert.equal(billing.response.status, 200, "Billing summary should return 200.");
    assert.equal(billing.payload?.summary?.entitlements?.canAccessMvp, true, "Seeded owner should have MVP entitlement.");

    const team = await primary.request("/api/team/roster");
    assert.equal(team.response.status, 200, "Team roster should return 200.");
    assert.ok(team.payload?.roster?.studio, "Team roster should resolve an active studio.");

    const security = await primary.request("/api/account/security/sessions");
    assert.equal(security.response.status, 200, "Security sessions should return 200.");
    assert.ok(security.payload?.currentSession?.sessionId, "Security sessions should expose the current tracked session.");

    const portal = await primary.request("/api/billing/portal", {
        method: "POST",
        body: {},
    });
    assert.equal(portal.response.status, 200, "Billing portal route should return 200.");
    assert.match(String(portal.payload?.url || ""), /billing\.stripe\.com/i, "Billing portal should return a Stripe URL.");

    const currentPlanCode = billing.payload?.summary?.plan?.code || "studio_monthly";
    const checkoutPlanCode = currentPlanCode === "studio_monthly" ? "studio_yearly" : "studio_monthly";
    const checkout = await primary.request("/api/billing/checkout", {
        method: "POST",
        body: {
            planCode: checkoutPlanCode,
        },
    });
    assert.equal(checkout.response.status, 200, "Billing checkout route should return 200.");
    assert.equal(
        Boolean(checkout.payload?.approvalRequired) || typeof checkout.payload?.url === "string",
        true,
        "Checkout should either queue approval or return a Stripe checkout URL.",
    );

    const inviteEmail = `platform-cert-${Date.now()}@example.com`;
    const inviteCreate = await primary.request("/api/team/invitations", {
        method: "POST",
        body: {
            email: inviteEmail,
            role: "member",
        },
    });
    assert.equal(inviteCreate.response.status, 200, "Team invitation creation should return 200.");
    assert.equal(inviteCreate.payload?.success, true, "Team invitation creation should succeed.");
    assert.ok(["invited", "requested"].includes(inviteCreate.payload?.mode), "Invitation response should expose its delivery mode.");

    const rosterAfterInvite = await primary.request("/api/team/roster");
    assert.equal(rosterAfterInvite.response.status, 200, "Team roster refresh should return 200.");
    const pendingInvitation =
        rosterAfterInvite.payload?.roster?.invitations?.find((entry) => entry.email === inviteEmail && entry.status === "pending") || null;

    if (inviteCreate.payload?.mode === "invited") {
        assert.ok(pendingInvitation, "Created invitation should appear in the roster.");
        createdInvitationId = inviteCreate.payload?.invitationId || pendingInvitation?.invitationId || null;
        assert.ok(createdInvitationId, "Invited flow should expose an invitation id.");
    } else {
        assert.ok(inviteCreate.payload?.approvalRequest, "Approval-request flow should return an approval request.");
    }

    if (createdInvitationId) {
        const inviteRevoke = await primary.request("/api/team/invitations", {
            method: "PATCH",
            body: {
                invitationId: createdInvitationId,
                action: "revoke",
            },
        });
        assert.equal(inviteRevoke.response.status, 200, "Invitation revoke should return 200.");
        assert.equal(inviteRevoke.payload?.success, true, "Invitation revoke should succeed.");

        const rosterAfterRevoke = await primary.request("/api/team/roster");
        assert.equal(rosterAfterRevoke.response.status, 200, "Team roster post-revoke refresh should return 200.");
        const revokedInvitation =
            rosterAfterRevoke.payload?.roster?.invitations?.find((entry) => entry.invitationId === createdInvitationId) || null;
        assert.notEqual(revokedInvitation?.status, "pending", "Invitation should no longer be pending after revoke.");
        report.cleanup.invitationRevoked = true;
        createdInvitationId = null;
    }

    await establishSession(secondary, grant);
    const secondarySecurity = await secondary.request("/api/account/security/sessions");
    assert.equal(secondarySecurity.response.status, 200, "Secondary session inventory should return 200.");
    const secondarySessionId = secondarySecurity.payload?.currentSession?.sessionId || null;
    assert.ok(secondarySessionId, "Secondary session should create a tracked platform session.");

    const securityWithSecondary = await primary.request("/api/account/security/sessions");
    assert.equal(securityWithSecondary.response.status, 200, "Primary security inventory refresh should return 200.");
    const trackedSecondary =
        securityWithSecondary.payload?.otherSessions?.find((entry) => entry.sessionId === secondarySessionId) || null;
    assert.ok(trackedSecondary, "Primary session should see the secondary tracked session.");

    const revokeSecondary = await primary.request(`/api/account/security/sessions/${encodeURIComponent(secondarySessionId)}`, {
        method: "DELETE",
    });
    assert.equal(revokeSecondary.response.status, 200, "Tracked session revoke route should return 200.");
    assert.equal(revokeSecondary.payload?.success, true, "Tracked session revoke route should succeed.");

    const secondarySession = await secondary.request("/api/auth/session");
    assert.equal(secondarySession.response.status, 200, "Revoked session lookup should still return 200.");
    assert.equal(secondarySession.payload?.session ?? null, null, "Revoked secondary session should no longer resolve.");

    const finalSecurity = await primary.request("/api/account/security/sessions");
    assert.equal(finalSecurity.response.status, 200, "Final security inventory should return 200.");
    assert.equal(
        Boolean(finalSecurity.payload?.otherSessions?.some((entry) => entry.sessionId === secondarySessionId)),
        false,
        "Revoked secondary session should disappear from the current security inventory.",
    );

    const primaryCookieValues = cookieValuesFromResponse(primary);
    const missingTrackedCookieClient = createAppClient(
        "missing-tracked-cookie",
        buildCookieJarFromValues(primaryCookieValues, {
            includePlatformSession: false,
        }),
    );
    const staleTrackedCookieClient = createAppClient(
        "stale-tracked-cookie",
        buildCookieJarFromValues(primaryCookieValues, {
            platformSessionId: secondarySessionId,
        }),
    );

    const missingTrackedSession = await missingTrackedCookieClient.request("/api/auth/session");
    assert.equal(missingTrackedSession.response.status, 200, "Missing tracked cookie lookup should still return 200.");
    assert.equal(missingTrackedSession.payload?.session ?? null, null, "Missing tracked cookie should fail closed.");

    const staleTrackedSession = await staleTrackedCookieClient.request("/api/auth/session");
    assert.equal(staleTrackedSession.response.status, 200, "Stale tracked cookie lookup should still return 200.");
    assert.equal(staleTrackedSession.payload?.session ?? null, null, "Revoked tracked cookie should fail closed.");

    const sessionLogoutProbe = createAppClient("session-logout-probe");
    await establishSession(sessionLogoutProbe, grant);
    const sessionLogoutCrossSite = await sessionLogoutProbe.request("/api/auth/session", {
        method: "DELETE",
        headers: {
            origin: "https://evil.example",
        },
    });
    assert.equal(sessionLogoutCrossSite.response.status, 403, "Cross-site auth session mutation should be rejected.");
    const sessionLogoutSameOrigin = await sessionLogoutProbe.request("/api/auth/session", {
        method: "DELETE",
        headers: sameOriginMutationHeaders(),
    });
    assert.equal(sessionLogoutSameOrigin.response.status, 200, "Same-origin auth session logout should succeed.");
    const sessionLogoutCheck = await sessionLogoutProbe.request("/api/auth/session");
    assert.equal(sessionLogoutCheck.payload?.session ?? null, null, "Same-origin auth session logout should clear the tracked session.");

    const logoutRouteProbe = createAppClient("logout-route-probe");
    await establishSession(logoutRouteProbe, grant);
    const logoutRouteCrossSite = await logoutRouteProbe.request("/api/auth/logout", {
        method: "POST",
        headers: {
            origin: "https://evil.example",
        },
    });
    assert.equal(logoutRouteCrossSite.response.status, 403, "Cross-site logout should be rejected.");
    const logoutRouteSameOrigin = await logoutRouteProbe.request("/api/auth/logout", {
        method: "POST",
        headers: sameOriginMutationHeaders(),
    });
    assert.equal(logoutRouteSameOrigin.response.status, 200, "Same-origin logout should succeed.");
    const logoutRouteSessionCheck = await logoutRouteProbe.request("/api/auth/session");
    assert.equal(logoutRouteSessionCheck.payload?.session ?? null, null, "Logout should clear the tracked session cookie.");

    report.checks = {
        authenticatedSession: {
            activeStudioId: session.payload?.session?.activeStudioId || null,
        },
        protectedPages,
        billing: {
            planCode: billing.payload?.summary?.plan?.code || null,
            canAccessMvp: billing.payload?.summary?.entitlements?.canAccessMvp || false,
        },
        team: {
            studioName: team.payload?.roster?.studio?.studioName || null,
            inviteMode: inviteCreate.payload?.mode || null,
            invitePendingVisible: Boolean(pendingInvitation),
        },
        security: {
            currentSessionId: security.payload?.currentSession?.sessionId || null,
            secondarySessionId,
            secondaryRevoked: true,
        },
        portal: {
            url: portal.payload?.url || null,
        },
        checkout: {
            approvalRequired: Boolean(checkout.payload?.approvalRequired),
            url: checkout.payload?.url || null,
        },
    };
    report.pass = true;
} catch (error) {
    report.error = error instanceof Error ? error.message : "Authenticated API certification failed.";
    process.exitCode = 1;
} finally {
    if (createdInvitationId) {
        try {
            const inviteCleanup = await primary.request("/api/team/invitations", {
                method: "PATCH",
                body: {
                    invitationId: createdInvitationId,
                    action: "revoke",
                },
            });
            report.cleanup.invitationRevoked = inviteCleanup.response.status === 200 && inviteCleanup.payload?.success === true;
        } catch (error) {
            report.cleanup.errors.push(error instanceof Error ? error.message : "Unable to clean up the created invitation.");
        }
    }

    try {
        const revokeOthers = await primary.request("/api/account/security/revoke-others", {
            method: "POST",
        });
        report.cleanup.revokeOthersStatus = revokeOthers.response.status;
    } catch (error) {
        report.cleanup.errors.push(error instanceof Error ? error.message : "Unable to revoke other tracked sessions during cleanup.");
    }

    try {
        const primaryLogout = await primary.request("/api/auth/session", {
            method: "DELETE",
            headers: sameOriginMutationHeaders(),
        });
        report.cleanup.primaryLogoutStatus = primaryLogout.response.status;
    } catch (error) {
        report.cleanup.errors.push(error instanceof Error ? error.message : "Unable to clear the primary auth session.");
    }

    try {
        const secondaryLogout = await secondary.request("/api/auth/session", {
            method: "DELETE",
            headers: sameOriginMutationHeaders(),
        });
        report.cleanup.secondaryLogoutStatus = secondaryLogout.response.status;
    } catch (error) {
        report.cleanup.errors.push(error instanceof Error ? error.message : "Unable to clear the secondary auth session.");
    }

    report.completedAt = new Date().toISOString();

    if (reportPath) {
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    }

    console.log(JSON.stringify(report, null, 2));
}
