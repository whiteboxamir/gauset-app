import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const SUPABASE_JWT_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

loadEnvConfig(process.cwd());

const baseUrl = (process.env.GAUSET_PLATFORM_E2E_BASE_URL || process.env.GAUSET_PLATFORM_BASE_URL || "https://gauset.com").trim();
const ownerEmail = (process.env.GAUSET_PLATFORM_E2E_OWNER_EMAIL || process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL || "").trim().toLowerCase();
const ownerPassword = (process.env.GAUSET_PLATFORM_E2E_OWNER_PASSWORD || process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD || "").trim();
const mailboxEmail = (process.env.GAUSET_PLATFORM_MAILBOX_EMAIL || ownerEmail).trim().toLowerCase();
const mailboxPassword = (process.env.GAUSET_PLATFORM_MAILBOX_PASSWORD || "").trim();
const autoOpenMagicLink = process.env.GAUSET_PLATFORM_AUTO_OPEN_MAGIC_LINK === "1";
const authMode = (process.env.GAUSET_PLATFORM_AUTH_MODE || "auto").trim().toLowerCase();
const skipAuthRequest = process.env.GAUSET_PLATFORM_SKIP_AUTH_REQUEST === "1";
const directSupabaseAuth = process.env.GAUSET_PLATFORM_DIRECT_SUPABASE_AUTH === "1";
const localCallbackPort = Number(process.env.GAUSET_PLATFORM_LOCAL_CALLBACK_PORT || "4477");
const allowPasswordBootstrap = authMode === "auto" || authMode === "password";
let authPreference = authMode === "register" ? "register" : "login";
const searchQuery =
    (
        process.env.GAUSET_PLATFORM_GMAIL_SEARCH_QUERY ||
        (authPreference === "register"
            ? 'newer_than:1d (from:noreply OR supabase OR "confirm your signup" OR "confirm your mail")'
            : skipAuthRequest
              ? 'newer_than:1d (from:noreply OR supabase OR "magic link" OR "secure link" OR "sign in" OR "log in") -"confirm your mail" -"confirm your signup"'
              : 'newer_than:1d (from:noreply OR supabase OR "magic link" OR "secure link" OR "sign in" OR "log in" OR "confirm your mail" OR "confirm your signup")')
    ).trim();
const mailboxDeliveryWaitMs = Number(process.env.GAUSET_PLATFORM_MAILBOX_DELIVERY_WAIT_MS || "15000");
const outputPath = path.resolve(
    process.env.GAUSET_PLATFORM_E2E_STORAGE_STATE ||
        `artifacts/platform-auth/platform-storage-state-${new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "")}.json`,
);
const existingStorageStatePath = existsSync(outputPath) ? outputPath : "";
const artifactDir = path.dirname(outputPath);
const headless = process.env.HEADLESS === "1";
const channel = process.env.PW_CHANNEL || "chrome";
const nextPath = (process.env.GAUSET_PLATFORM_CAPTURE_NEXT || "/app/team").trim();
const maxWaitMs = Number(process.env.GAUSET_PLATFORM_CAPTURE_TIMEOUT_MS || "300000");
const googleCheckpointTimeoutMs = Number(process.env.GAUSET_PLATFORM_GOOGLE_CHECKPOINT_TIMEOUT_MS || "180000");
const localCallbackBaseUrl = `http://127.0.0.1:${localCallbackPort}`;
const localCallbackUrl = `${localCallbackBaseUrl}/callback`;

await fs.mkdir(artifactDir, { recursive: true });

const report = {
    baseUrl,
    ownerEmail: ownerEmail || null,
    outputPath,
    existingStorageStatePath: existingStorageStatePath || null,
    existingStorageStateDetected: Boolean(existingStorageStatePath),
    startedAt: new Date().toISOString(),
    completedAt: null,
    success: false,
    currentUrl: null,
    sessionActive: false,
    activeStudioId: null,
    authMode,
    authStrategy: null,
    attemptedStrategies: [],
    authRequestMessage: null,
    instructions:
        "The script will first try an existing storage state, then an owner password session bootstrap, then email-link capture. Manual inbox interaction is only required if password auth is unavailable and mailbox automation is disabled or blocked.",
    error: null,
};

function parseHashParams(urlString) {
    try {
        const parsed = new URL(urlString);
        const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
        return new URLSearchParams(hash);
    } catch {
        return new URLSearchParams();
    }
}

function recordAttempt(strategy) {
    report.authStrategy = strategy;
    report.attemptedStrategies.push(strategy);
}

function isSupabaseJwtApiKey(apiKey) {
    return SUPABASE_JWT_KEY_PATTERN.test(apiKey.trim());
}

function getRequiredValue(name, value, reason) {
    if (value) {
        return value;
    }
    throw new Error(`${name} is required${reason ? ` ${reason}` : "."}`);
}

async function readPlatformSession(context) {
    const sessionResponse = await context.request.get(`${baseUrl}/api/auth/session`);
    const sessionPayload = await sessionResponse.json().catch(() => null);
    const session = sessionPayload?.session ?? null;
    report.sessionActive = sessionResponse.ok() && Boolean(session);
    report.activeStudioId = session?.activeStudioId ?? null;
    report.sessionStatusCode = sessionResponse.status();
    return {
        response: sessionResponse,
        payload: sessionPayload,
        session,
    };
}

async function getPasswordSessionTokens(request) {
    const supabaseUrl = getRequiredValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, "for password-session capture.");
    const supabaseAnonKey = getRequiredValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "for password-session capture.");
    const headers = {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
    };

    if (isSupabaseJwtApiKey(supabaseAnonKey)) {
        headers.Authorization = `Bearer ${supabaseAnonKey}`;
    }

    const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers,
        data: {
            email: getRequiredValue(
                "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL or GAUSET_PLATFORM_E2E_OWNER_EMAIL",
                ownerEmail,
                "for password-session capture.",
            ),
            password: getRequiredValue(
                "GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD or GAUSET_PLATFORM_E2E_OWNER_PASSWORD",
                ownerPassword,
                "for password-session capture.",
            ),
        },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok()) {
        throw new Error(payload?.error_description || payload?.msg || `Supabase password grant failed with ${response.status()}.`);
    }
    if (!payload?.access_token || !payload?.refresh_token) {
        throw new Error("Supabase password grant did not return both access_token and refresh_token.");
    }

    return payload;
}

async function establishPasswordSession(context) {
    const tokens = await getPasswordSessionTokens(context.request);
    const response = await context.request.put(`${baseUrl}/api/auth/session`, {
        data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            provider: "magic_link",
        },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok() || payload?.success !== true) {
        throw new Error(payload?.message || `Unable to establish the gauset-app owner session from password grant (${response.status()}).`);
    }
}

async function waitForAuthenticatedSession(context, page) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        const sessionResult = await readPlatformSession(context);
        if (sessionResult.response.ok() && sessionResult.session) {
            return sessionResult;
        }
        await page.waitForTimeout(5000);
    }

    throw new Error(`Timed out waiting for an authenticated platform session after ${maxWaitMs}ms.`);
}

async function startLocalCallbackServer() {
    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push({
            method: request.method || "GET",
            url: request.url || "/",
            at: new Date().toISOString(),
        });
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><html><head><meta charset="utf-8"><title>GAUSET Auth Capture</title></head><body><pre id="hash"></pre><script>document.getElementById("hash").textContent = window.location.href;</script></body></html>`);
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(localCallbackPort, "127.0.0.1", resolve);
    });

    return {
        server,
        requests,
        async close() {
            await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        },
    };
}

async function postAuthEndpoint(pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
}

async function requestSupabaseEmailLink({ createUser, redirectTo }) {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`, {
        method: "POST",
        headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: ownerEmail,
            create_user: createUser,
            email_redirect_to: redirectTo,
        }),
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
}

async function requestPlatformEmailLink() {
    if (directSupabaseAuth) {
        const redirectTo = `${localCallbackUrl}?next=${encodeURIComponent(nextPath)}`;
        if (authMode === "login") {
            const attempt = await requestSupabaseEmailLink({ createUser: false, redirectTo });
            if (!attempt.response.ok || attempt.payload?.msg || attempt.payload?.error_description) {
                throw new Error(attempt.payload?.msg || attempt.payload?.error_description || `Supabase login OTP failed with ${attempt.response.status}.`);
            }
            authPreference = "login";
            return { mode: "login", message: "Supabase login link requested." };
        }

        if (authMode === "register") {
            const attempt = await requestSupabaseEmailLink({ createUser: true, redirectTo });
            if (!attempt.response.ok || attempt.payload?.msg || attempt.payload?.error_description) {
                throw new Error(attempt.payload?.msg || attempt.payload?.error_description || `Supabase signup OTP failed with ${attempt.response.status}.`);
            }
            authPreference = "register";
            return { mode: "register", message: "Supabase signup link requested." };
        }

        const loginAttempt = await requestSupabaseEmailLink({ createUser: false, redirectTo });
        if (loginAttempt.response.ok && !loginAttempt.payload?.msg && !loginAttempt.payload?.error_description) {
            authPreference = "login";
            return { mode: "login", message: "Supabase login link requested." };
        }

        const registerAttempt = await requestSupabaseEmailLink({ createUser: true, redirectTo });
        if (!registerAttempt.response.ok || registerAttempt.payload?.msg || registerAttempt.payload?.error_description) {
            throw new Error(
                registerAttempt.payload?.msg ||
                    registerAttempt.payload?.error_description ||
                    `Supabase signup OTP failed with ${registerAttempt.response.status}.`,
            );
        }
        authPreference = "register";
        return { mode: "register", message: "Supabase signup link requested." };
    }

    const commonBody = {
        email: ownerEmail,
        next: nextPath,
    };

    if (authMode === "login") {
        const { response, payload } = await postAuthEndpoint("/api/auth/login", commonBody);
        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.message || `gauset-app login request failed with ${response.status}.`);
        }
        authPreference = "login";
        return { mode: "login", message: payload?.message || null };
    }

    if (authMode === "register") {
        const { response, payload } = await postAuthEndpoint("/api/auth/register", {
            ...commonBody,
            displayName: process.env.GAUSET_PLATFORM_OWNER_DISPLAY_NAME || "Amir",
        });
        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.message || `gauset-app register request failed with ${response.status}.`);
        }
        authPreference = "register";
        return { mode: "register", message: payload?.message || null };
    }

    const loginAttempt = await postAuthEndpoint("/api/auth/login", commonBody);
    if (loginAttempt.response.ok && loginAttempt.payload?.success !== false) {
        authPreference = "login";
        return { mode: "login", message: loginAttempt.payload?.message || null };
    }

    const loginMessage = loginAttempt.payload?.message || "";
    if (!/signups not allowed for otp/i.test(loginMessage)) {
        throw new Error(loginMessage || `gauset-app login request failed with ${loginAttempt.response.status}.`);
    }

    const registerAttempt = await postAuthEndpoint("/api/auth/register", {
        ...commonBody,
        displayName: process.env.GAUSET_PLATFORM_OWNER_DISPLAY_NAME || "Amir",
    });
    if (!registerAttempt.response.ok || registerAttempt.payload?.success === false) {
        if (/approved emails|request early access|access is limited/i.test(registerAttempt.payload?.message || "")) {
            throw new Error(
                "gauset-app registration is launch-gated. Use an approved email or a studio invite before running the storage-state capture.",
            );
        }
        throw new Error(registerAttempt.payload?.message || `gauset-app register request failed with ${registerAttempt.response.status}.`);
    }
    authPreference = "register";
    return { mode: "register", message: registerAttempt.payload?.message || null };
}

async function continueGoogleLogin(page) {
    const emailInput = page.locator('input[type="email"]').first();
    if ((await emailInput.count()) > 0) {
        await emailInput.fill(mailboxEmail);
        await page.getByRole("button", { name: /^next$/i }).first().click();
        await page.waitForTimeout(3000);
    }

    const passwordInput = page.locator('input[type="password"]').first();
    if ((await passwordInput.count()) > 0) {
        await passwordInput.fill(mailboxPassword);
        await page.getByRole("button", { name: /^next$/i }).first().click();
        await page.waitForTimeout(5000);
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/Wrong password|Couldn'?t find your Google Account|Enter a valid email/i.test(bodyText)) {
        throw new Error(`Google sign-in rejected the credentials: ${bodyText.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    if (/Verify it'?s you|2-Step Verification|Choose an account|Confirm recovery/i.test(bodyText)) {
        await page.screenshot({
            path: path.join(artifactDir, "gmail-google-checkpoint.png"),
            fullPage: true,
        });
        const checkpointSummary = bodyText.replace(/\s+/g, " ").slice(0, 300);
        const deadline = Date.now() + googleCheckpointTimeoutMs;
        while (Date.now() < deadline) {
            await page.waitForTimeout(5000);
            const refreshedBodyText = await page.locator("body").innerText().catch(() => "");
            if (!/Verify it'?s you|2-Step Verification|Choose an account|Confirm recovery/i.test(refreshedBodyText)) {
                return;
            }
        }
        throw new Error(`Google sign-in still needs manual checkpoint approval: ${checkpointSummary}`);
    }
}

function resolveMagicLinkHref(rawHref) {
    if (!rawHref) {
        return "";
    }

    try {
        const parsed = new URL(rawHref);
        if (directSupabaseAuth && parsed.pathname.includes("/auth/v1/verify")) {
            parsed.searchParams.set("redirect_to", `${localCallbackUrl}?next=${encodeURIComponent(nextPath)}`);
            return parsed.toString();
        }
        if (parsed.pathname.includes("/auth/v1/verify")) {
            parsed.searchParams.set("redirect_to", `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`);
            return parsed.toString();
        }
        const wrappedTarget = parsed.searchParams.get("q") || parsed.searchParams.get("url") || "";
        if (wrappedTarget) {
            return wrappedTarget;
        }
        return parsed.toString();
    } catch {
        return rawHref;
    }
}

async function openMagicLinkFromGmail(context) {
    if (!autoOpenMagicLink) {
        return null;
    }
    if (!mailboxPassword) {
        throw new Error("GAUSET_PLATFORM_MAILBOX_PASSWORD is required when GAUSET_PLATFORM_AUTO_OPEN_MAGIC_LINK=1.");
    }

    const mailboxPage = await context.newPage();
    await mailboxPage.goto("https://mail.google.com/mail/u/0/#inbox", {
        waitUntil: "domcontentloaded",
        timeout: 180000,
    });
    await mailboxPage.waitForTimeout(5000);
    await mailboxPage.screenshot({
        path: path.join(artifactDir, "gmail-entry.png"),
        fullPage: true,
    });

    if (mailboxPage.url().includes("accounts.google.com")) {
        await continueGoogleLogin(mailboxPage);
        await mailboxPage.waitForLoadState("domcontentloaded", { timeout: 180000 }).catch(() => undefined);
        await mailboxPage.waitForTimeout(8000);
        await mailboxPage.screenshot({
            path: path.join(artifactDir, "gmail-post-login.png"),
            fullPage: true,
        });
    }

    const searchBox = mailboxPage.locator('input[aria-label*="Search mail"], input[placeholder*="Search mail"]').first();
    try {
        await searchBox.waitFor({ state: "visible", timeout: 120000 });
    } catch {
        const bodyText = await mailboxPage.locator("body").innerText().catch(() => "");
        throw new Error(`Gmail inbox did not render a search box. url=${mailboxPage.url()} body=${bodyText.replace(/\s+/g, " ").slice(0, 300)}`);
    }
    await searchBox.fill(searchQuery);
    await searchBox.press("Enter");
    await mailboxPage.waitForTimeout(6000);
    await mailboxPage.screenshot({
        path: path.join(artifactDir, "gmail-search-results.png"),
        fullPage: true,
    });

    const rowLocator = mailboxPage.locator('tr[role="row"], div[role="main"] div[role="link"], div[role="main"] tr');
    const rowCandidates = await rowLocator.evaluateAll((nodes) =>
        nodes.map((node, index) => ({
            index,
            text: (node.textContent || "").replace(/\s+/g, " ").trim(),
            visible: Boolean(node instanceof HTMLElement && node.offsetParent !== null && node.getClientRects().length > 0),
        })),
    );
    const rowTexts = rowCandidates.map((entry) => entry.text);

    let messageRowIndex = -1;
    let messageRowScore = 0;
    for (const entry of rowCandidates) {
        if (!entry.visible) continue;
        const rawText = entry.text;
        if (!rawText) continue;
        const text = rawText.toLowerCase();
        let score = 0;
        if (text.includes("supabase")) score += 3;
        if (authPreference === "register" && text.includes("confirm your signup")) score += 7;
        if (authPreference === "register" && text.includes("confirm your mail")) score += 7;
        if (authPreference === "login" && text.includes("magic link")) score += 7;
        if (authPreference === "login" && text.includes("secure link")) score += 6;
        if (authPreference === "login" && text.includes("sign in")) score += 5;
        if (authPreference === "login" && text.includes("log in")) score += 5;
        if (text.includes("magic link")) score += 2;
        if (text.includes("secure link")) score += 2;
        if (text.includes("sign in")) score += 1;
        if (text.includes("log in")) score += 1;
        if (text.includes("confirm your signup")) score += 1;
        if (text.includes("confirm your mail")) score += 1;
        if (authPreference === "login" && skipAuthRequest && (text.includes("confirm your signup") || text.includes("confirm your mail"))) score -= 6;
        if (text.includes("noreply")) score += 2;
        if (text.includes("gauset")) score += 2;
        if (text.includes("supabase") || text.includes("noreply")) {
            score += Math.max(0, 20 - entry.index);
        }

        if (score > messageRowScore) {
            messageRowScore = score;
            messageRowIndex = entry.index;
        }
    }

    if (messageRowIndex < 0 || messageRowScore <= 0) {
        const bodyText = await mailboxPage.locator("body").innerText().catch(() => "");
        throw new Error(
            `Gmail search did not surface the auth email. query=${searchQuery} url=${mailboxPage.url()} rows=${JSON.stringify(rowTexts)} body=${bodyText.replace(/\s+/g, " ").slice(0, 500)}`,
        );
    }
    const chosenRow = rowLocator.nth(messageRowIndex);
    await chosenRow.scrollIntoViewIfNeeded().catch(() => undefined);
    await chosenRow.click({ force: true });
    await mailboxPage.waitForTimeout(5000);
    await mailboxPage.screenshot({
        path: path.join(artifactDir, "gmail-message-open.png"),
        fullPage: true,
    });

    const anchorCandidates = await mailboxPage.locator("a[href]").evaluateAll((nodes) =>
        nodes
            .map((node) => ({
                text: (node.textContent || "").replace(/\s+/g, " ").trim(),
                href: node.href || "",
            }))
            .filter((entry) => entry.href),
    );
    const matchingAnchors = anchorCandidates.filter((entry) => {
        const resolvedHref = entry.href;
        const isVerifyLink = /\/auth\/v1\/verify/i.test(resolvedHref);
        const verifyType = isVerifyLink ? new URL(resolvedHref).searchParams.get("type") || "" : "";
        if (authPreference === "login" && verifyType === "signup") {
            return false;
        }
        if (authPreference === "register" && verifyType && verifyType !== "signup") {
            return false;
        }
        return (
            /gauset-app\.vercel\.app/i.test(resolvedHref) ||
            isVerifyLink ||
            /token_hash=/i.test(resolvedHref) ||
            /auth\/callback/i.test(resolvedHref) ||
            /magic link|secure link|sign in|log in|confirm your mail|confirm your signup/i.test(entry.text)
        );
    });

    const matchedAnchor = matchingAnchors.length > 0 ? matchingAnchors[matchingAnchors.length - 1] : null;

    if (!matchedAnchor) {
        throw new Error(
            `Opened auth email but could not find a candidate link. anchors=${JSON.stringify(anchorCandidates.slice(0, 20))}`,
        );
    }

    const targetUrl = resolveMagicLinkHref(matchedAnchor.href);
    if (!targetUrl) {
        throw new Error(`Auth email link candidate could not be resolved: ${JSON.stringify(matchedAnchor)}`);
    }

    const authPage = await context.newPage();
    await authPage.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 180000,
    });
    await authPage.waitForURL(directSupabaseAuth ? /127\.0\.0\.1|gauset-app\.vercel\.app|\/auth\/callback|\/app\// : /gauset-app\.vercel\.app|\/auth\/callback|\/app\//, {
        timeout: 60000,
    }).catch(() => undefined);
    await authPage.waitForTimeout(8000);
    await authPage.screenshot({
        path: path.join(artifactDir, "platform-auth-link-opened.png"),
        fullPage: true,
    });
    const authBodyText = await authPage.locator("body").innerText().catch(() => "");
    return {
        page: authPage,
        targetUrl,
        finalUrl: authPage.url(),
        title: await authPage.title().catch(() => null),
        bodyExcerpt: authBodyText.replace(/\s+/g, " ").slice(0, 500),
    };
}

let browser;
let context;
let page;
let callbackServer = null;

try {
    if (!ownerEmail && !existingStorageStatePath) {
        throw new Error(
            "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL or GAUSET_PLATFORM_E2E_OWNER_EMAIL is required unless GAUSET_PLATFORM_E2E_STORAGE_STATE already points to a valid authenticated session file.",
        );
    }

    browser = await chromium.launch({ headless, channel });
    context = await browser.newContext({
        baseURL: baseUrl,
        ignoreHTTPSErrors: true,
        storageState: existingStorageStatePath || undefined,
        viewport: { width: 1440, height: 1080 },
    });
    page = await context.newPage();

    if (existingStorageStatePath) {
        recordAttempt("storage_state_reuse");
        report.authRequestMessage = `Loaded existing storage state from ${existingStorageStatePath}.`;
        const existingSession = await readPlatformSession(context);
        if (existingSession.response.ok() && existingSession.session) {
            report.instructions = "Existing GAUSET_PLATFORM_E2E_STORAGE_STATE already contains an authenticated gauset-app owner session.";
        }
    }

    if (!report.sessionActive && allowPasswordBootstrap && ownerPassword) {
        recordAttempt("password_grant");
        report.authMode = "password";
        report.authRequestMessage = "Establishing the gauset-app owner session from Supabase password grant.";
        report.instructions = "Using the configured owner password to mint a Supabase session and save a reusable gauset-app storage-state artifact without sending email.";

        await establishPasswordSession(context);
        await readPlatformSession(context);

        await page
            .goto(nextPath, {
                waitUntil: "domcontentloaded",
                timeout: 120000,
            })
            .catch(() => undefined);
    }

    if (!report.sessionActive) {
        getRequiredValue(
            "GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL or GAUSET_PLATFORM_E2E_OWNER_EMAIL",
            ownerEmail,
            "unless GAUSET_PLATFORM_E2E_STORAGE_STATE already points to a valid authenticated session.",
        );

        recordAttempt(autoOpenMagicLink ? "magic_link_mailbox_capture" : "magic_link_manual_capture");
        report.instructions = autoOpenMagicLink
            ? "Mailbox automation is enabled. The script will open the newest Supabase auth email and save storage state once the gauset-app session is active."
            : "Manual inbox interaction is required. Open the emailed gauset-app magic link in the launched browser window while the script is running; it will save storage state once the session becomes active.";

        if (directSupabaseAuth) {
            callbackServer = await startLocalCallbackServer();
        }

        if (!skipAuthRequest) {
            const requestedAuth = await requestPlatformEmailLink();
            report.authMode = requestedAuth.mode;
            report.authRequestMessage = requestedAuth.message;
        } else {
            report.authMode = "skipped";
            report.authRequestMessage = "Skipped auth request and attempted to reuse the latest inbox link.";
        }

        await page.goto(`/auth/login?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(ownerEmail)}`, {
            waitUntil: "domcontentloaded",
            timeout: 120000,
        });
        await page.screenshot({
            path: path.join(artifactDir, "platform-auth-email-requested.png"),
            fullPage: true,
        });
        if (!skipAuthRequest) {
            await page.waitForTimeout(mailboxDeliveryWaitMs);
        }
        const authLinkResult = await openMagicLinkFromGmail(context);
        if (authLinkResult) {
            report.authLinkTarget = authLinkResult.targetUrl;
            report.authLinkFinalUrl = authLinkResult.finalUrl;
            report.authLinkTitle = authLinkResult.title;
            report.authLinkBodyExcerpt = authLinkResult.bodyExcerpt;
        }

        if (directSupabaseAuth && authLinkResult?.finalUrl) {
            const hashParams = parseHashParams(authLinkResult.finalUrl);
            const accessToken = hashParams.get("access_token");
            const refreshToken = hashParams.get("refresh_token");
            const errorDescription = hashParams.get("error_description");

            if (errorDescription) {
                throw new Error(`Supabase redirect returned auth error: ${errorDescription}`);
            }

            if (accessToken) {
                const establishResponse = await context.request.put(`${baseUrl}/api/auth/session`, {
                    data: {
                        accessToken,
                        refreshToken: refreshToken || undefined,
                        provider: "magic_link",
                    },
                });
                const establishPayload = await establishResponse.json().catch(() => null);
                if (!establishResponse.ok() || establishPayload?.success !== true) {
                    throw new Error(
                        establishPayload?.message || `Unable to establish gauset-app session from captured Supabase tokens (${establishResponse.status()}).`,
                    );
                }
            }
        }
    }

    if (!report.sessionActive) {
        await waitForAuthenticatedSession(context, page);
    }

    if (page.url() === "about:blank") {
        await page
            .goto(nextPath, {
                waitUntil: "domcontentloaded",
                timeout: 120000,
            })
            .catch(() => undefined);
    }

    report.currentUrl = page.url();
    if (!report.sessionActive) {
        throw new Error("Authenticated platform session was not established.");
    }

    await context.storageState({ path: outputPath });
    await page.screenshot({
        path: path.join(artifactDir, "platform-auth-session-active.png"),
        fullPage: true,
    });
    report.success = true;
} catch (error) {
    report.currentUrl = page ? page.url() : null;
    report.error = error instanceof Error ? error.message : "Unable to capture platform storage state.";
    if (page) {
        await page
            .screenshot({
                path: path.join(artifactDir, "platform-auth-error.png"),
                fullPage: true,
            })
            .catch(() => undefined);
    }
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    if (callbackServer) {
        report.localCallbackRequests = callbackServer.requests;
        await callbackServer.close().catch(() => undefined);
    }
    await fs.writeFile(path.join(artifactDir, "capture-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (browser) {
        await browser.close();
    }
}
