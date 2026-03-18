import { requireAuthConfig } from "./config.ts";
import { buildSupabaseProjectApiHeaders } from "../../lib/supabaseApiHeaders.ts";

export interface SupabaseUser {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
}

export interface SupabaseSessionPayload {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user: SupabaseUser;
}

function buildAuthUrl(pathname: string) {
    const { supabaseUrl } = requireAuthConfig();
    return new URL(`/auth/v1/${pathname.replace(/^\//, "")}`, supabaseUrl);
}

function createAnonHeaders() {
    const { supabaseAnonKey } = requireAuthConfig();
    return buildSupabaseProjectApiHeaders({
        apiKey: supabaseAnonKey,
    });
}

async function parseAuthResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string } | null;
        throw new Error(payload?.msg || payload?.error_description || `Supabase auth request failed with ${response.status}.`);
    }
    if (response.status === 204) {
        return null as T;
    }
    return (await response.json()) as T;
}

export async function sendEmailOtp({
    email,
    createUser,
    redirectTo,
    data,
}: {
    email: string;
    createUser: boolean;
    redirectTo: string;
    data?: Record<string, unknown>;
}) {
    const response = await fetch(buildAuthUrl("otp"), {
        method: "POST",
        headers: createAnonHeaders(),
        body: JSON.stringify({
            email,
            create_user: createUser,
            email_redirect_to: redirectTo,
            data: data ?? {},
        }),
        cache: "no-store",
    });
    return parseAuthResponse<Record<string, never>>(response);
}

export async function getUserForAccessToken(accessToken: string) {
    const response = await fetch(buildAuthUrl("user"), {
        headers: new Headers({
            apikey: requireAuthConfig().supabaseAnonKey!,
            Authorization: `Bearer ${accessToken}`,
        }),
        cache: "no-store",
    });
    return parseAuthResponse<SupabaseUser>(response);
}

export function buildGoogleAuthorizeUrl(redirectTo: string) {
    const { googleAuthEnabled } = requireAuthConfig();
    if (!googleAuthEnabled) {
        throw new Error("Google auth is not enabled for this environment.");
    }
    const url = buildAuthUrl("authorize");
    url.searchParams.set("provider", "google");
    url.searchParams.set("redirect_to", redirectTo);
    return url.toString();
}
