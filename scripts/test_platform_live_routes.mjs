import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset.com").trim();
const artifactPath = process.env.GAUSET_PLATFORM_LIVE_ROUTES_REPORT
    ? path.resolve(process.env.GAUSET_PLATFORM_LIVE_ROUTES_REPORT)
    : null;
const expectMvpGate =
    (() => {
        const raw = (process.env.GAUSET_PLATFORM_EXPECT_MVP_GATE || "").trim().toLowerCase();
        if (raw === "1" || raw === "true") return true;
        if (raw === "0" || raw === "false") return false;
        return null;
    })();

function parseCurlResponse(stdout) {
    const normalized = stdout.replace(/\r\n/g, "\n");
    const headerEndIndex = normalized.indexOf("\n\n");
    const headerBlock = headerEndIndex >= 0 ? normalized.slice(0, headerEndIndex) : normalized;
    const body = headerEndIndex >= 0 ? normalized.slice(headerEndIndex + 2) : "";
    const headerLines = headerBlock.split("\n").filter(Boolean);
    const statusLine = headerLines.find((line) => /^HTTP\/\S+\s+\d+/.test(line)) || "HTTP/1.1 000";
    const statusMatch = statusLine.match(/^HTTP\/\S+\s+(\d+)/);
    const status = statusMatch ? Number(statusMatch[1]) : 0;
    const headers = new Map();

    for (const line of headerLines.slice(1)) {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) continue;
        const key = line.slice(0, separatorIndex).trim().toLowerCase();
        const value = line.slice(separatorIndex + 1).trim();
        headers.set(key, value);
    }

    return {
        status,
        headers,
        body,
    };
}

function request(pathname, { method = "GET", body = null, headers = {} } = {}) {
    const curlArgs = [
        "--silent",
        "--show-error",
        "--include",
        "--max-redirs",
        "0",
        "--request",
        method,
    ];

    for (const [key, value] of Object.entries(headers)) {
        curlArgs.push("--header", `${key}: ${value}`);
    }

    if (body) {
        curlArgs.push("--header", "Content-Type: application/json", "--data-raw", JSON.stringify(body));
    }

    curlArgs.push(`${baseUrl}${pathname}`);
    const result = spawnSync("curl", curlArgs, {
        cwd: process.cwd(),
        encoding: "utf8",
    });

    if (result.status !== 0 && !result.stdout) {
        return {
            status: result.status || 0,
            headers: new Map(),
            body: "",
            error: result.stderr || `curl failed with status ${result.status}.`,
        };
    }

    const response = parseCurlResponse(result.stdout || "");
    return {
        ...response,
        error: null,
    };
}

function probe(pathname, { method = "GET", body = null, headers = {}, expectedStatus, expectedLocationIncludes } = {}) {
    const response = request(pathname, { method, body, headers });
    const location = response.headers.get("location");
    const contentType = response.headers.get("content-type") || "";
    const responseText = expectedLocationIncludes && response.status === 200 && contentType.includes("text/html") ? response.body : null;
    const nextRedirectMatched =
        expectedLocationIncludes && responseText
            ? responseText.includes(`http-equiv="refresh" content="1;url=${expectedLocationIncludes}"`) ||
              responseText.includes(`NEXT_REDIRECT;replace;${expectedLocationIncludes};307`)
            : false;
    const ok =
        ((response.status === expectedStatus &&
            (expectedLocationIncludes ? Boolean(location?.includes(expectedLocationIncludes)) : true)) ||
            nextRedirectMatched) && !response.error;

    return {
        pathname,
        method,
        status: response.status,
        ok,
        location,
        nextRedirectMatched,
        expectedStatus,
        expectedLocationIncludes: expectedLocationIncludes ?? null,
        error: response.error,
    };
}

function probeAnonymousMvp(pathname, { expectGate = null } = {}) {
    const response = request(pathname, { method: "GET" });
    const location = response.headers.get("location");
    const contentType = response.headers.get("content-type") || "";
    const responseText = contentType.includes("text/html") ? response.body : "";
    const expectedLoginTarget = pathname === "/mvp/preview" ? "/auth/login?next=%2Fmvp%2Fpreview" : "/auth/login?next=%2Fmvp";
    const htmlRedirectTarget =
        responseText.match(/http-equiv="refresh" content="1;url=([^"]+)"/)?.[1] ||
        responseText.match(/NEXT_REDIRECT;replace;([^;]+);307/)?.[1] ||
        null;
    const resolvedRedirectTarget = location || htmlRedirectTarget;
    const authRedirectObserved =
        response.status === 307 || response.status === 308 || Boolean(resolvedRedirectTarget && resolvedRedirectTarget.includes(expectedLoginTarget));
    const observedMode = authRedirectObserved ? "auth_required" : response.status === 200 ? "open" : "unexpected";
    const expectedGate = expectGate;
    const ok =
        expectedGate === null
            ? observedMode === "auth_required" || observedMode === "open"
            : expectedGate
              ? observedMode === "auth_required"
              : observedMode === "open";

    return {
        pathname,
        method: "GET",
        status: response.status,
        ok: ok && !response.error,
        observedMode,
        location,
        htmlRedirectTarget,
        expectedGate,
        error: response.error,
    };
}

const checks = {
    mvp: await probeAnonymousMvp("/mvp", { expectGate: expectMvpGate }),
    mvpPreview: await probeAnonymousMvp("/mvp/preview", { expectGate: true }),
    teamPageAnonymous: await probe("/app/team", {
        expectedStatus: 307,
        expectedLocationIncludes: "/auth/login?next=%2Fapp%2Fteam",
    }),
    billingPageAnonymous: await probe("/app/billing", {
        expectedStatus: 307,
        expectedLocationIncludes: "/auth/login?next=%2Fapp%2Fbilling",
    }),
    securityPageAnonymous: await probe("/app/settings/security", {
        expectedStatus: 307,
        expectedLocationIncludes: "/auth/login?next=%2Fapp%2Fsettings%2Fsecurity",
    }),
    billingApiAnonymous: await probe("/api/billing/summary", { expectedStatus: 401 }),
    teamApiAnonymous: await probe("/api/team/roster", { expectedStatus: 401 }),
    sessionsApiAnonymous: await probe("/api/account/security/sessions", { expectedStatus: 401 }),
    billingPortalAnonymous: await probe("/api/billing/portal", {
        method: "POST",
        body: {},
        expectedStatus: 401,
    }),
    billingCheckoutAnonymous: await probe("/api/billing/checkout", {
        method: "POST",
        body: {
            planCode: "studio_monthly",
        },
        expectedStatus: 401,
    }),
    teamInvitationsCreateAnonymous: await probe("/api/team/invitations", {
        method: "POST",
        body: {
            email: "anon-platform-cert@example.com",
            role: "member",
        },
        expectedStatus: 401,
    }),
    teamInvitationsUpdateAnonymous: await probe("/api/team/invitations", {
        method: "PATCH",
        body: {
            invitationId: "00000000-0000-0000-0000-000000000000",
            action: "revoke",
        },
        expectedStatus: 401,
    }),
    sessionsRevokeOthersAnonymous: await probe("/api/account/security/revoke-others", {
        method: "POST",
        expectedStatus: 401,
    }),
    sessionDeleteAnonymous: await probe("/api/account/security/sessions/00000000-0000-0000-0000-000000000000", {
        method: "DELETE",
        expectedStatus: 401,
    }),
};

const failures = Object.values(checks)
    .filter((check) => !check.ok)
    .map((check) => `${check.pathname} returned ${check.status}${check.location ? ` -> ${check.location}` : ""}`);

const report = {
    baseUrl,
    expectMvpGate,
    observedMvpMode: checks.mvp.observedMode,
    executedAt: new Date().toISOString(),
    checks,
    failures,
    pass: failures.length === 0,
};

if (artifactPath) {
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
    process.exitCode = 1;
}
