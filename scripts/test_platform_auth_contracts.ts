import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isSameOriginMutation } from "../src/server/auth/mutations.ts";
import { getAuthSurfaceStatus } from "../src/server/auth/surface.ts";
import { resolveTrackedPlatformSessionAccess } from "../src/server/auth/tracked-session.ts";
import { deriveMvpAccessPosture } from "../src/server/billing/surface.ts";
import { getPlatformActivationReadiness } from "../src/server/platform/activation-readiness.ts";
import { resolveMvpAccessMode, resolveMvpWorkspaceAccessDecision } from "../src/server/mvp/access-gate.ts";

const workspaceRoot = process.cwd();

function readTextFixture(relativePath: string) {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function testMutationGuardrails() {
    const sessionRouteSource = readTextFixture("src/app/api/auth/session/route.ts");
    const logoutRouteSource = readTextFixture("src/app/api/auth/logout/route.ts");
    const proxyRouteSource = readTextFixture("src/app/api/mvp/[...path]/route.ts");
    const proxyAccessSource = readTextFixture("src/server/mvp/proxyAccess.ts");

    assert.match(sessionRouteSource, /export async function PUT\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);
    assert.match(sessionRouteSource, /Cross-site session establishment requests are rejected\./);
    assert.match(sessionRouteSource, /export async function DELETE\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);
    assert.match(sessionRouteSource, /Cross-site session logout requests are rejected\./);
    assert.match(logoutRouteSource, /export async function POST\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);
    assert.match(logoutRouteSource, /Cross-site logout requests are rejected\./);

    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
        assert.match(
            proxyRouteSource,
            new RegExp(`export async function ${method}\\(request: NextRequest, context: \\{ params: Promise<\\{ path: string\\[\\] \\}> \\}\\) \\{\\s*return proxyMvpRequest\\(request, context\\);`),
        );
    }
    assert.match(
        proxyAccessSource,
        /if \(accessMode\.misconfigured && !isPublicProxyPath\(pathname, request\.method\) && !reviewShareAccess\) \{\s*return buildAccessDeniedResponse\(\{\s*pathname,\s*status: 503,\s*code: "MVP_GATE_UNAVAILABLE"/,
    );
    assert.match(
        proxyAccessSource,
        /if \(isPublicProxyPath\(pathname, request\.method\) \|\| isMvpAccessControlBypassed\(\) \|\| reviewShareAccess\)/,
    );

    const sameOriginRequest = {
        headers: new Headers({
            origin: "https://app.example.com",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const crossOriginRequest = {
        headers: new Headers({
            origin: "https://evil.example",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const fetchSiteRequest = {
        headers: new Headers({
            "sec-fetch-site": "same-site",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const missingContextRequest = {
        headers: new Headers(),
        nextUrl: new URL("https://app.example.com"),
    };

    assert.equal(isSameOriginMutation(sameOriginRequest), true);
    assert.equal(isSameOriginMutation(crossOriginRequest), false);
    assert.equal(isSameOriginMutation(fetchSiteRequest), true);
    assert.equal(isSameOriginMutation(missingContextRequest), false);
}

function testTrackedSessionGuardrails() {
    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: null,
            trackedPlatformSession: null,
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "missing_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-stale",
            trackedPlatformSession: null,
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "stale_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-revoked",
            trackedPlatformSession: {
                user_id: "11111111-1111-4111-8111-111111111111",
                revoked_at: "2026-03-13T10:00:00.000Z",
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "revoked_tracked_session",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-foreign",
            trackedPlatformSession: {
                user_id: "22222222-2222-4222-8222-222222222222",
                revoked_at: null,
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "foreign_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-current",
            trackedPlatformSession: {
                user_id: "11111111-1111-4111-8111-111111111111",
                revoked_at: null,
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: true,
            reason: "tracked_session_valid",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: false,
            platformSessionId: "session-not-required",
            trackedPlatformSession: {
                user_id: "22222222-2222-4222-8222-222222222222",
                revoked_at: "2026-03-13T10:00:00.000Z",
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: true,
            reason: "tracked_session_not_required",
        },
    );
}

function testMvpTruthSurfaces() {
    const authSurface = getAuthSurfaceStatus({});
    assert.equal(authSurface.operational, false);
    assert.equal(authSurface.tone, "blocked");
    assert.match(authSurface.message, /cannot issue or validate email links/i);

    const disabledAccessMode = resolveMvpAccessMode({
        env: {},
        databaseConfigured: true,
        authConfigured: true,
        billingConfigured: true,
    });
    assert.equal(disabledAccessMode.status, "disabled");
    assert.equal(disabledAccessMode.bypassed, true);

    const misconfiguredAccessMode = resolveMvpAccessMode({
        env: {
            GAUSET_ENABLE_PLATFORM_MVP_GATE: "1",
        },
        databaseConfigured: false,
        authConfigured: true,
        billingConfigured: true,
    });
    assert.equal(misconfiguredAccessMode.status, "misconfigured");
    assert.equal(misconfiguredAccessMode.misconfigured, true);
    assert.equal(misconfiguredAccessMode.bypassed, false);

    const routeDecision = resolveMvpWorkspaceAccessDecision({
        gateEnabled: true,
        misconfigured: true,
        anonymousAllowed: false,
        hasSession: true,
        entitled: true,
    });
    assert.equal(routeDecision.allowed, false);
    assert.equal(routeDecision.reason, "gate_misconfigured");

    const posture = deriveMvpAccessPosture({
        gateEnabled: true,
        misconfigured: true,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });
    assert.equal(posture.label, "Gate misconfigured");
    assert.match(posture.description, /fail closed/i);
}

async function testReadinessConsistency() {
    const blockedReadiness = await getPlatformActivationReadiness({
        env: {
            GAUSET_ENABLE_PLATFORM_MVP_GATE: "1",
        },
    });
    assert.equal(blockedReadiness.rollout.status, "blocked");
    assert.equal(blockedReadiness.rollout.details.gateRequested, true);
    assert.equal(blockedReadiness.rollout.details.gateMisconfigured, true);
    assert.equal(blockedReadiness.rollout.details.gateBypassed, false);
    assert.equal(blockedReadiness.integration.details.mvpGateShouldStayOff, true);
    assert.match(blockedReadiness.rollout.summary, /Leave the MVP gate off/i);
}

testMutationGuardrails();
testTrackedSessionGuardrails();
testMvpTruthSurfaces();
await testReadinessConsistency();

console.log("Platform auth guardrail checks passed.");
