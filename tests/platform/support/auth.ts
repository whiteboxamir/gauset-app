import { expect, type BrowserContext } from "@playwright/test";

import { platformE2EEnv } from "./env";

const SUPABASE_JWT_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

interface AuthTokenResponse {
    access_token: string;
    refresh_token: string;
}

interface AuthSessionEnvelope {
    session?: {
        activeStudioId: string | null;
        entitlements: {
            canAccessMvp: boolean;
        };
    } | null;
}

interface BillingSummaryEnvelope {
    summary?: {
        plan?: {
            code: string;
        } | null;
        entitlements: {
            canAccessMvp: boolean;
        };
    };
}

async function readExistingSession(context: BrowserContext) {
    const response = await context.request.get(`${platformE2EEnv.baseUrl}/api/auth/session`);
    const payload = (await response.json()) as AuthSessionEnvelope;
    return {
        ok: response.ok(),
        payload,
    };
}

function isSupabaseJwtApiKey(apiKey: string) {
    return SUPABASE_JWT_KEY_PATTERN.test(apiKey.trim());
}

async function getPasswordSessionTokens(email: string, password: string, request: BrowserContext["request"]) {
    const headers: Record<string, string> = {
        apikey: platformE2EEnv.supabaseAnonKey,
        "Content-Type": "application/json",
    };
    if (isSupabaseJwtApiKey(platformE2EEnv.supabaseAnonKey)) {
        headers.Authorization = `Bearer ${platformE2EEnv.supabaseAnonKey}`;
    }

    const response = await request.post(`${platformE2EEnv.supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers,
        data: {
            email,
            password,
        },
    });

    const payload = (await response.json()) as Partial<AuthTokenResponse> & { error_description?: string; msg?: string };
    expect(response.ok(), payload.error_description || payload.msg || "Unable to exchange Supabase password grant.").toBeTruthy();
    expect(payload.access_token).toBeTruthy();

    return payload as AuthTokenResponse;
}

export async function establishOwnerPlatformSession(context: BrowserContext) {
    const existingSession = await readExistingSession(context);
    if (existingSession.ok && existingSession.payload.session?.activeStudioId) {
        return;
    }

    expect(
        platformE2EEnv.ownerPassword,
        "No authenticated platform session was present and no owner password was provided. Supply GAUSET_PLATFORM_E2E_STORAGE_STATE or GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD.",
    ).toBeTruthy();

    const tokens = await getPasswordSessionTokens(platformE2EEnv.ownerEmail, platformE2EEnv.ownerPassword, context.request);
    const response = await context.request.put(`${platformE2EEnv.baseUrl}/api/auth/session`, {
        data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            provider: "magic_link",
        },
    });
    const payload = (await response.json()) as { success?: boolean; message?: string };
    expect(response.ok(), payload.message || "Unable to establish the platform session.").toBeTruthy();
    expect(payload.success).toBe(true);
}

export async function ensureSeededOwnerBaseline(context: BrowserContext) {
    const [sessionResponse, billingResponse] = await Promise.all([
        context.request.get(`${platformE2EEnv.baseUrl}/api/auth/session`),
        context.request.get(`${platformE2EEnv.baseUrl}/api/billing/summary`),
    ]);

    expect(sessionResponse.ok(), "Authenticated session lookup failed.").toBeTruthy();
    expect(billingResponse.ok(), "Billing summary lookup failed.").toBeTruthy();

    const sessionPayload = (await sessionResponse.json()) as AuthSessionEnvelope;
    const billingPayload = (await billingResponse.json()) as BillingSummaryEnvelope;

    expect(
        sessionPayload.session?.activeStudioId,
        "Active studio missing. Run `npm run seed:platform-staging` with the staging fixture env first.",
    ).toBeTruthy();
    expect(
        billingPayload.summary?.entitlements.canAccessMvp,
        "MVP entitlement missing from the seeded billing baseline. Re-run the staging fixture seed.",
    ).toBe(true);

    return {
        session: sessionPayload.session ?? null,
        billing: billingPayload.summary ?? null,
    };
}

export async function revokeOtherPlatformSessions(context: BrowserContext) {
    const response = await context.request.post(`${platformE2EEnv.baseUrl}/api/account/security/revoke-others`);
    const payload = (await response.json()) as { success?: boolean; message?: string };
    expect(response.ok(), payload.message || "Unable to revoke other sessions during test setup.").toBeTruthy();
}
